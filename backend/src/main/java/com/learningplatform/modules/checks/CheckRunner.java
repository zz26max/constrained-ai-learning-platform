package com.learningplatform.modules.checks;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
public class CheckRunner {
    // 100 x 30 x 2000 expected characters, JSON-escaped up to sixfold, plus delimiters.
    private static final int MAX_SQL_OUTPUT = 40 * 1024 * 1024;
    private final ObjectMapper json;
    private final String webImage;
    private final String mysqlImage;

    public CheckRunner(ObjectMapper json, @Value("${checks.web-image:lms-web-check:1}") String webImage,
                       @Value("${checks.mysql-image:lms-sql-check:1}") String mysqlImage) {
        this.json = json;
        this.webImage = trustedImage(webImage);
        this.mysqlImage = trustedImage(mysqlImage);
    }

    @SuppressWarnings("unchecked")
    Map<String, Object> run(String id, Map<String, Object> policy, Map<String, String> files) {
        String name = "lms-check-" + id;
        try {
            if ("web_lab".equals(policy.get("kind"))) {
                var arguments = container(name, "768m", "128");
                arguments.addAll(List.of("--shm-size", "96m", "-i", webImage));
                var response = command(arguments, json.writeValueAsString(Map.of(
                        "rules", policy.get("rules"), "files", files)), Duration.ofSeconds(35));
                if (response.exit() == 124 || response.exit() == 137) throw timeout();
                if (response.exit() == 125) throw unavailable();
                if (response.exit() != 0) throw internal();
                return json.readValue(response.output(), Map.class);
            }
            return sql(name, policy, files.get("answer.sql"));
        } finally {
            try {
                command(List.of("docker", "container", "rm", "-f", name), "", Duration.ofSeconds(5));
            } catch (RunnerFailure ignored) {
                // Container entrypoints also enforce a lifetime if Docker is temporarily unavailable.
            }
        }
    }

    private Map<String, Object> sql(String name, Map<String, Object> policy, String answer) {
        var arguments = container(name, "768m", "96");
        arguments.addAll(List.of(
                "--user", "999:999", "--tmpfs", "/var/lib/mysql:rw,noexec,nosuid,size=256m,uid=999,gid=999",
                "--tmpfs", "/var/run/mysqld:rw,noexec,nosuid,size=4m,uid=999,gid=999",
                "-e", "MYSQL_ALLOW_EMPTY_PASSWORD=yes", "--entrypoint", "timeout", "-d", mysqlImage,
                "--kill-after=2s", "90s", "/usr/local/bin/docker-entrypoint.sh", "mysqld",
                "--skip-networking", "--secure-file-priv=NULL", "--local-infile=0",
                "--innodb-buffer-pool-size=64M", "--performance-schema=OFF", "--max-connections=10"));
        if (command(arguments, "", Duration.ofSeconds(8)).exit() != 0) throw unavailable();
        waitForMysql(name);

        boolean mutation = "mutation".equals(policy.get("mode"));
        String setup = "CREATE DATABASE exercise; CREATE USER 'seed'@'localhost'; " +
                "CREATE USER 'learner'@'localhost'; CREATE USER 'verifier'@'localhost'; " +
                "GRANT CREATE, INSERT ON exercise.* TO 'seed'@'localhost'; " +
                "GRANT SELECT ON exercise.* TO 'learner'@'localhost', 'verifier'@'localhost'; " +
                (mutation ? "GRANT INSERT, UPDATE, DELETE ON exercise.* TO 'learner'@'localhost';" : "");
        requireSuccess(mysql(name, "root", false, false, setup));
        requireSuccess(mysql(name, "seed", true, false, (String) policy.get("seedSql")));

        if (answer == null || answer.isBlank()) return result(false, "请先编写 SQL。");
        String actual = mysql(name, "learner", true, !mutation, answer);
        if (actual.equals("SQL_ERROR")) return result(false, "SQL 未能执行，请检查语法和本题允许的操作。");
        if (mutation) {
            requireSuccess(actual);
            actual = mysql(name, "verifier", true, true, (String) policy.get("verificationSql"));
        }
        if (!mutation && actual.equals("INVALID_RESULT")) {
            return result(false, "请返回单个查询结果集。");
        }
        if (!mutation && actual.equals("NON_TEXT_RESULT")) {
            return result(false, "结果包含无法作为 UTF-8 文本比较的二进制值。");
        }
        if (!actual.startsWith("[")) throw internal();
        List<?> rows;
        try {
            rows = json.readValue(actual, List.class);
        } catch (Exception e) {
            throw internal();
        }
        List<?> expected = (List<?>) policy.get("expectedRows");
        boolean matches = Boolean.TRUE.equals(policy.get("ordered"))
                ? expected.equals(rows) : frequencies(expected).equals(frequencies(rows));
        return result(matches, matches ? "结果符合要求。" : "结果与预期不同，请检查行、列及排序要求。");
    }

    private void waitForMysql(String name) {
        long end = System.nanoTime() + Duration.ofSeconds(25).toNanos();
        while (System.nanoTime() < end) {
            // The temporary --daemonize server can also be a child of the PID 1 timeout.
            // Wait for the foreground server that survives initialization.
            var result = command(List.of("docker", "exec", name, "sh", "-c",
                    "for pid in $(cat /proc/1/task/1/children); do " +
                    "if grep -qx mysqld /proc/$pid/comm; then " +
                    "grep -zqx -- --daemonize /proc/$pid/cmdline; " +
                    "if test $? -eq 1 && grep -zq . /proc/$pid/cmdline; then " +
                    "exec mysqladmin --user=root --socket=/var/run/mysqld/mysqld.sock ping; fi; " +
                    "fi; done; exit 1"),
                    "", Duration.ofSeconds(3));
            if (result.exit() == 0) return;
            try {
                Thread.sleep(300);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw unavailable();
            }
        }
        throw unavailable();
    }

    private String mysql(String container, String user, boolean database, boolean rows, String sql) {
        // Only the trusted helper handles the socket protocol. SQL is passed on stdin as data.
        var args = List.of("docker", "exec", "-i", container,
                "/usr/lib/mysqlsh/bin/python3.13", "-I", "-B", "/usr/local/libexec/lms-sql-check.py");
        var input = json.writeValueAsString(Map.of("user", user, "database", database, "rows", rows, "sql", sql));
        var response = command(args, input, Duration.ofSeconds(6), rows ? MAX_SQL_OUTPUT : 1024);
        if (response.exit() != 0) throw unavailable();
        return switch (response.output()) {
            case "UNAVAILABLE" -> throw unavailable();
            case "INTERNAL" -> throw internal();
            case "RESOURCE_LIMIT" -> throw outputLimit();
            default -> response.output();
        };
    }

    private static Map<Object, Integer> frequencies(List<?> values) {
        var counts = new HashMap<Object, Integer>();
        for (Object value : values) counts.merge(value, 1, Integer::sum);
        return counts;
    }

    private static Map<String, Object> result(boolean pass, String message) {
        return Map.of("passed", pass ? 1 : 0, "total", 1, "output", "", "truncated", false,
                "items", List.of(Map.of("ruleId", "sql.result", "status", pass ? "pass" : "fail", "message", message)));
    }

    private static ArrayList<String> container(String name, String memory, String pids) {
        return new ArrayList<>(List.of("docker", "run", "--rm", "--pull", "never", "--name", name,
                "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
                "--cpus", "1", "--memory", memory, "--memory-swap", memory, "--pids-limit", pids,
                "--log-driver", "none", "--tmpfs", "/tmp:rw,noexec,nosuid,size=128m"));
    }

    private static CommandResult command(List<String> args, String input, Duration timeout) {
        return command(args, input, timeout, 256 * 1024);
    }

    private static CommandResult command(List<String> args, String input, Duration timeout, int maxOutput) {
        Process process;
        try {
            process = new ProcessBuilder(args).redirectError(ProcessBuilder.Redirect.DISCARD).start();
        } catch (IOException e) {
            throw unavailable();
        }
        var output = new FutureTask<>(() -> process.getInputStream().readNBytes(maxOutput + 1));
        Thread.startVirtualThread(output);
        var writer = new FutureTask<Void>(() -> {
            try (var stream = process.getOutputStream()) {
                stream.write(input.getBytes(StandardCharsets.UTF_8));
            }
            return null;
        });
        Thread.startVirtualThread(writer);
        try {
            byte[] bytes = output.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
            if (bytes.length > maxOutput) throw outputLimit();
            if (!process.waitFor(500, TimeUnit.MILLISECONDS)) throw timeout();
            // A failing process may close its input before the writer completes.
            if (process.exitValue() == 0) writer.get(500, TimeUnit.MILLISECONDS);
            return new CommandResult(process.exitValue(), new String(bytes, StandardCharsets.UTF_8));
        } catch (TimeoutException e) {
            throw timeout();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw unavailable();
        } catch (ExecutionException e) {
            throw internal();
        } finally {
            if (process.isAlive()) process.destroyForcibly();
        }
    }

    private static String trustedImage(String value) {
        if (!value.matches("[a-zA-Z0-9][a-zA-Z0-9./:@_-]*")) throw new IllegalArgumentException("Invalid runner image");
        return value;
    }

    private static void requireSuccess(String result) {
        if (!result.equals("OK")) throw internal();
    }

    private record CommandResult(int exit, String output) {}

    static RunnerFailure unavailable() { return new RunnerFailure("RUNNER_UNAVAILABLE", "检查环境不可用。"); }
    static RunnerFailure timeout() { return new RunnerFailure("EXECUTION_TIMEOUT", "检查运行超时。"); }
    static RunnerFailure internal() { return new RunnerFailure("RUNNER_INTERNAL_ERROR", "检查环境运行失败。"); }
    private static RunnerFailure outputLimit() { return new RunnerFailure("RESOURCE_LIMIT", "检查输出超过限制。"); }

    static final class RunnerFailure extends RuntimeException {
        final String code;
        RunnerFailure(String code, String message) {
            super(message);
            this.code = code;
        }
    }
}
