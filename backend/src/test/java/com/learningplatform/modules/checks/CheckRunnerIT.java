package com.learningplatform.modules.checks;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

import com.github.dockerjava.api.exception.NotFoundException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.testcontainers.DockerClientFactory;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// The two runner images must be built locally before enabling these tests.
@EnabledIfSystemProperty(named = "checks.it.runners", matches = "true")
class CheckRunnerIT {
    private static final String MYSQL_IMAGE = "lms-sql-check:1";
    private static final String WEB_IMAGE = "lms-web-check:1";
    private static final String SEED = """
            CREATE TABLE scores (id INT PRIMARY KEY, score INT NULL);
            INSERT INTO scores VALUES (1,80),(2,NULL);
            """;
    private static final String VERIFY = "SELECT id, score FROM scores ORDER BY id";
    private static final CheckRunner RUNNER = new CheckRunner(JsonMapper.builder().build(), WEB_IMAGE, MYSQL_IMAGE);

    @Test
    void queryComparesAnUnorderedMultisetIncludingNullAndDuplicates() {
        List<List<String>> expected = List.of(List.of("80"), Collections.singletonList(null), List.of("80"));
        Map<String, Object> policy = sqlPolicy("query", SEED, null, expected, false);
        assertPassed(run(RUNNER, policy, "SELECT score FROM scores UNION ALL SELECT 80 ORDER BY score"), 1);
        assertPassed(run(RUNNER, policy, "SELECT score FROM scores"), 0);
    }

    @Test
    void queryComparisonDistinguishesNulCarriageReturnAndOrdinaryWhitespace() {
        List<List<String>> expected = List.of(List.of("A\0B", "A\rB", "A\nB", "A B", ""));
        Map<String, Object> policy = sqlPolicy("query", SEED, null, expected, true);
        assertPassed(run(RUNNER, policy, """
                SELECT CONCAT('A', CHAR(0 USING utf8mb4), 'B'), CONCAT('A', CHAR(13 USING utf8mb4), 'B'),
                       CONCAT('A', CHAR(10 USING utf8mb4), 'B'), 'A B', ''
                """), 1);
        assertPassed(run(RUNNER, policy, """
                SELECT 'A B', CONCAT('A', CHAR(10 USING utf8mb4), 'B'),
                       CONCAT('A', CHAR(10 USING utf8mb4), 'B'), 'A B', ''
                """), 0);
    }

    @ParameterizedTest
    @MethodSource("encodingChanges")
    void learnerCannotChangeResultEncodingToMatchDifferentText(String query, String expected) {
        var policy = sqlPolicy("query", SEED, null, List.of(List.of(expected)), true);
        assertPassed(run(RUNNER, policy, """
                SET character_set_results=latin1;
                %s
                """.formatted(query)), 0);
    }

    static Stream<Arguments> encodingChanges() {
        return Stream.of(
                Arguments.of("SELECT CONVERT(0xC3A9 USING latin1);", "é"),
                Arguments.of("SELECT '中文';", "??"));
    }

    static Stream<Arguments> mutations() {
        return Stream.of(
                Arguments.of("INSERT INTO scores VALUES (3,90)",
                        List.of(List.of("1", "80"), Arrays.asList("2", null), List.of("3", "90"))),
                Arguments.of("UPDATE scores SET score = 95 WHERE id = 1",
                        List.of(List.of("1", "95"), Arrays.asList("2", null))),
                Arguments.of("DELETE FROM scores WHERE id = 1", List.of(Arrays.asList("2", null))));
    }

    @ParameterizedTest
    @MethodSource("mutations")
    void mutationUsesIndependentSeedAndVerifiesFinalState(String answer, List<List<String>> expected) {
        assertPassed(run(RUNNER, sqlPolicy("mutation", SEED, VERIFY, expected, true), answer), 1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"DROP TABLE scores", "CREATE TABLE forbidden (id INT)",
            "\\! touch /tmp/escape\nSELECT 1;"})
    void learnerDdlAndMysqlClientEscapeFailAsStudentSql(String answer) {
        var unchanged = List.of(List.of("1", "80"), Arrays.asList("2", null));
        assertPassed(run(RUNNER, sqlPolicy("mutation", SEED, VERIFY, unchanged, true), answer), 0);
    }

    @Test
    void validSqlOutputAbove256KiBIsStillCompared() {
        String cell = "x&".repeat(800);
        List<List<String>> expected = Collections.nCopies(50, Collections.nCopies(6, cell));
        String expression = "REPEAT('x&', 800)";
        String answer = """
                WITH RECURSIVE nums (n) AS (SELECT 1 UNION ALL SELECT n+1 FROM nums WHERE n<50)
                SELECT %s FROM nums ORDER BY n
                """.formatted(String.join(", ", Collections.nCopies(6, expression)));
        assertPassed(run(RUNNER, sqlPolicy("query", SEED, null, expected, true), answer), 1);
    }

    @Test
    void longRunningSqlTimesOutAndRemovesContainer() {
        assertSqlQueryError("SELECT SLEEP(10)", "EXECUTION_TIMEOUT");
    }

    @ParameterizedTest
    @MethodSource("oversizedQueryResults")
    void oversizedSqlResultsReachResourceLimitAndRemoveContainer(String query) {
        assertSqlQueryError(query, "RESOURCE_LIMIT");
    }

    static Stream<String> oversizedQueryResults() {
        return Stream.of(
                """
                WITH RECURSIVE nums (n) AS (SELECT 1 UNION ALL SELECT n+1 FROM nums WHERE n<101)
                SELECT n FROM nums
                """,
                "SELECT " + String.join(", ", Collections.nCopies(31, "1")),
                "SELECT REPEAT('界', 2001)");
    }

    private static void assertSqlQueryError(String query, String code) {
        var policy = sqlPolicy("query", SEED, null, List.of(), true);
        assertThatThrownBy(() -> run(RUNNER, policy, query))
                .isInstanceOfSatisfying(CheckRunner.RunnerFailure.class, failure -> assertThat(failure.code).isEqualTo(code));
    }

    @Test
    void missingRunnerImageIsInfrastructureFailure() {
        var unavailable = new CheckRunner(JsonMapper.builder().build(), WEB_IMAGE, "lms-missing-check:" + UUID.randomUUID());
        assertThatThrownBy(() -> run(unavailable, sqlPolicy("query", SEED, null, List.of(), true), "SELECT 1"))
                .isInstanceOfSatisfying(CheckRunner.RunnerFailure.class,
                        e -> assertThat(e.code).isEqualTo("RUNNER_UNAVAILABLE"));
    }

    @Test
    void webChecksTextAndViewportStylesAndReportsFailedRule() {
        var rule = Map.of("id", "heading", "selector", "h1", "check", "text", "expected", "Hello", "width", 390);
        var mobile = Map.of("id", "mobile", "selector", "h1", "check", "css", "expected", "16px",
                "property", "font-size", "width", 390);
        var desktop = Map.of("id", "desktop", "selector", "h1", "check", "css", "expected", "16px",
                "property", "font-size", "width", 1280);
        // The workspace file fits its byte limit even when JSON escapes it past the old runner input limit.
        String script = "document.querySelector('h1').textContent = 'Changed'; /*" + "\1".repeat(75_000) + "*/";
        Map<String, Object> result = run(RUNNER, Map.of("kind", "web_lab", "rules", List.of(rule, mobile, desktop)),
                Map.of("index.html", "<link rel='stylesheet' href='style.css'><h1>Hello</h1><script src='script.js'></script>",
                        "style.css", "h1 { font-size: 32px } @media (max-width: 400px) { h1 { font-size: 16px } }",
                        "script.js", script));
        assertThat(result).containsEntry("passed", 2).containsEntry("total", 3);
        assertThat((List<?>) result.get("items")).hasSize(3);
        var failed = (Map<?, ?>) ((List<?>) result.get("items")).get(2);
        assertThat(failed.get("ruleId")).isEqualTo("desktop");
        assertThat(failed.get("status")).isEqualTo("fail");
    }

    private static Map<String, Object> sqlPolicy(String mode, String seed, String verification,
                                                  List<List<String>> expected, boolean ordered) {
        Map<String, Object> policy = new HashMap<>(Map.of("kind", "sql_text", "mode", mode,
                "seedSql", seed, "expectedRows", expected, "ordered", ordered));
        policy.put("verificationSql", verification);
        return policy;
    }

    private static Map<String, Object> run(CheckRunner runner, Map<String, Object> policy, String answer) {
        return run(runner, policy, Map.of("answer.sql", answer));
    }

    private static Map<String, Object> run(CheckRunner runner, Map<String, Object> policy, Map<String, String> files) {
        String id = UUID.randomUUID().toString();
        try {
            return runner.run(id, policy, files);
        } finally {
            assertThatThrownBy(() -> DockerClientFactory.instance().client()
                    .inspectContainerCmd("lms-check-" + id).exec()).isInstanceOf(NotFoundException.class);
        }
    }

    private static void assertPassed(Map<String, Object> result, int passed) {
        assertThat(result).containsEntry("passed", passed).containsEntry("total", 1).containsEntry("truncated", false);
    }
}
