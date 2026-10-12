package com.learningplatform.common.api;

import com.learningplatform.LearningPlatformApplication;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;
import org.yaml.snakeyaml.Yaml;

import javax.sql.DataSource;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 将契约状态与应用实际注册的生产路由双向核对。数据库替身仅用于启动上下文，
 * 不执行业务请求；响应、授权及事务仍由各接口测试和集成测试证明。
 */
@SpringBootTest(classes = LearningPlatformApplication.class, properties = {
        "spring.flyway.enabled=false", "spring.sql.init.mode=never",
        "DB_URL=jdbc:mysql://127.0.0.1:1/unused", "DB_USERNAME=unused", "DB_PASSWORD=unused"
})
class ImplementationStatusContractTest {

    @MockitoBean
    private DataSource dataSource;

    @Autowired
    private RequestMappingHandlerMapping handlerMapping;

    @Test
    void productionRoutesMatchDeclaredImplementationStates() throws IOException {
        Map<String, String> declared = contractStates();
        Set<String> actual = new HashSet<>();
        var productionLocation = LearningPlatformApplication.class.getProtectionDomain().getCodeSource().getLocation();
        handlerMapping.getHandlerMethods().forEach((mapping, handler) -> {
            Class<?> type = handler.getBeanType();
            // 排除框架 /error 与测试专用 Controller；不手工维护生产 Controller 白名单。
            if (!type.getPackageName().startsWith("com.learningplatform.")
                    || !productionLocation.equals(type.getProtectionDomain().getCodeSource().getLocation())) {
                return;
            }
            assertThat(mapping.getMethodsCondition().getMethods())
                    .as("生产接口必须显式声明 HTTP method: %s", mapping).isNotEmpty();
            for (var method : mapping.getMethodsCondition().getMethods()) {
                for (String path : mapping.getPatternValues()) {
                    actual.add(key(method.name(), path));
                }
            }
        });
        assertThat(actual).as("必须发现生产路由，避免空扫描误通过").isNotEmpty();
        assertThat(mismatches(declared, actual)).isEmpty();
    }

    @Test
    void catchesImplementedRouteStillMarkedPlanned() {
        assertThat(mismatches(Map.of("POST /api/v1/auth/login", "planned"),
                Set.of("POST /api/v1/auth/login"))).containsExactly("route still planned: POST /api/v1/auth/login");
    }

    @Test
    void catchesClaimedImplementationWithoutRoute() {
        for (String state : Set.of("implemented", "verified")) {
            assertThat(mismatches(Map.of("POST /api/v1/auth/login", state), Set.of()))
                    .containsExactly("missing production route: POST /api/v1/auth/login");
        }
    }

    @Test
    void catchesUndocumentedRouteAndWrongHttpMethod() {
        assertThat(mismatches(Map.of("GET /health/live", "implemented"), Set.of("POST /health/live")))
                .containsExactlyInAnyOrder("undocumented route: POST /health/live", "missing production route: GET /health/live");
    }

    @Test
    void matchesVariableNamesButPreservesRouteConstraints() {
        assertThat(key("GET", "/api/v1/assignments/{id}"))
                .isEqualTo(key("GET", "/api/v1/assignments/{assignmentId}"));
        assertThat(key("GET", "/api/v1/assignments/{id:[0-9]+}"))
                .isNotEqualTo(key("GET", "/api/v1/assignments/{id}"));
    }

    private static Set<String> mismatches(Map<String, String> declared, Set<String> actual) {
        Set<String> issues = new HashSet<>();
        actual.forEach(route -> {
            String state = declared.get(route);
            if (state == null) issues.add("undocumented route: " + route);
            else if (state.equals("planned")) issues.add("route still planned: " + route);
        });
        declared.forEach((route, state) -> {
            if (!Set.of("planned", "implemented", "verified").contains(state)) issues.add("invalid status: " + route);
            else if (!state.equals("planned") && !actual.contains(route)) issues.add("missing production route: " + route);
        });
        return issues;
    }

    private static String key(String method, String path) {
        // 仅忽略变量名称；带正则约束的路由不自动视为与任意变量等价。
        return method.toUpperCase(java.util.Locale.ROOT) + " " + path.replaceAll("\\{[A-Za-z_][A-Za-z0-9_]*}", "{}");
    }

    private static Map<String, String> contractStates() throws IOException {
        Path root = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        while (root != null && !Files.isRegularFile(root.resolve("docs/openapi.yaml"))) root = root.getParent();
        if (root == null) throw new IOException("Cannot locate docs/openapi.yaml from test working directory");
        Map<String, String> states = new HashMap<>();
        try (var reader = Files.newBufferedReader(root.resolve("docs/openapi.yaml"))) {
            Map<?, ?> spec = new Yaml().load(reader);
            Map<?, ?> paths = (Map<?, ?>) spec.get("paths");
            paths.forEach((path, item) -> ((Map<?, ?>) item).forEach((method, value) -> {
                if (Set.of("get", "post", "put", "patch", "delete", "head", "options", "trace").contains(method)) {
                    Map<?, ?> op = (Map<?, ?>) value;
                    String route = key(method.toString(), path.toString());
                    assertThat(states.put(route, String.valueOf(op.get("x-implementation-status"))))
                            .as("契约中不能存在语义相同的重复路由: %s", route).isNull();
                }
            }));
        }
        return states;
    }
}
