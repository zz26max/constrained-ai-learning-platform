package com.learningplatform.common.api;

import java.sql.Connection;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import com.learningplatform.LearningPlatformApplication;
import com.learningplatform.common.audit.AuditLog;
import com.learningplatform.common.audit.AuditLogMapper;
import com.learningplatform.modules.auth.mapper.AuthSessionMapper;
import com.learningplatform.modules.auth.mapper.UserMapper;
import com.learningplatform.modules.auth.model.AuthSession;
import com.learningplatform.modules.auth.model.User;
import com.learningplatform.modules.auth.security.LoginRateLimiter;
import com.learningplatform.modules.courses.mapper.TermMapper;
import com.learningplatform.modules.courses.model.Term;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import javax.sql.DataSource;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * P0-A 端点的 HTTP 契约验证：Cookie、CSRF/Origin、统一错误信封、限流与审计。
 * 数据库以替身隔离，Mapper 用内存替身模拟会话生命周期；不启动真实 MySQL。
 */
@SpringBootTest(classes = LearningPlatformApplication.class, properties = {
        "spring.flyway.enabled=false", "spring.sql.init.mode=never",
        "DB_URL=jdbc:mysql://127.0.0.1:1/unused", "DB_USERNAME=unused", "DB_PASSWORD=unused",
        "auth.http.pre-login-signing-key=test-signing-key",
        "auth.http.allowed-origins=http://127.0.0.1:4173"
})
@AutoConfigureMockMvc
class AuthHttpContractTest {

    private static final String PASSWORD = "Correct-test-password";
    private static final String USER_ID = "00000000-0000-4000-8000-000000000001";
    private static final String ORIGIN = "http://127.0.0.1:4173";
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private PasswordEncoder passwordEncoder;

    @MockitoBean
    private DataSource dataSource;
    @MockitoBean
    private UserMapper userMapper;
    @MockitoBean
    private AuthSessionMapper sessionMapper;
    @MockitoBean
    private AuditLogMapper auditLogMapper;
    @MockitoBean
    private TermMapper termMapper;

    @Autowired
    private LoginRateLimiter loginRateLimiter;

    private final Map<String, AuthSession> byHash = new ConcurrentHashMap<>();
    private final Map<String, AuthSession> byId = new ConcurrentHashMap<>();
    // @Transactional 服务方法需要真实连接开启事务；mapper 全部被 mock，事务空转，不连接真实数据库。
    private final Connection connection = mock(Connection.class);

    @BeforeEach
    void setUp() throws SQLException {
        byHash.clear();
        byId.clear();
        when(dataSource.getConnection()).thenReturn(connection);
        // 限流器是单例，跨测试共享；每个用例前清空固定账号+本机 IP 的失败计数，避免互相污染。
        loginRateLimiter.onSuccess(loginRateLimiter.key("student.demo", "127.0.0.1"));

        when(auditLogMapper.insert(any())).thenReturn(1);
        when(termMapper.findAllOrdered()).thenReturn(List.of());

        User student = new User(USER_ID, "student.demo", "演示学生",
                passwordEncoder.encode(PASSWORD), List.of("student"), "active",
                Instant.parse("2026-10-01T00:00:00Z"), Instant.parse("2026-10-01T00:00:00Z"));
        when(userMapper.findByUsername(anyString())).thenAnswer(invocation ->
                "student.demo".equals(invocation.getArgument(0)) ? Optional.of(student) : Optional.empty());
        when(userMapper.findByIdForShare(anyString())).thenAnswer(invocation ->
                USER_ID.equals(invocation.getArgument(0)) ? Optional.of(student) : Optional.empty());

        when(sessionMapper.insert(any())).thenAnswer(invocation -> {
            AuthSession session = invocation.getArgument(0);
            byHash.put(session.tokenHash(), session);
            byId.put(session.id(), session);
            return 1;
        });
        when(sessionMapper.findByTokenHash(anyString())).thenAnswer(invocation ->
                Optional.ofNullable(byHash.get(invocation.getArgument(0))));
        when(sessionMapper.findByTokenHashForUpdate(anyString())).thenAnswer(invocation ->
                Optional.ofNullable(byHash.get(invocation.getArgument(0))));
        when(sessionMapper.touch(any(), any(), any())).thenReturn(1);
        when(sessionMapper.revoke(any(), any())).thenAnswer(invocation -> {
            AuthSession session = byId.get(invocation.getArgument(0));
            if (session != null) {
                byHash.remove(session.tokenHash());
            }
            return 1;
        });
    }

    @Test
    @DisplayName("匿名取 CSRF 时返回令牌并设置签名预登录 Cookie")
    void anonymousCsrfTokenSetsPreAuthCookie() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/auth/csrf-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.csrfToken").isNotEmpty())
                .andExpect(jsonPath("$.requestId").isNotEmpty())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andReturn();
        String token = read(result, "data.csrfToken");
        assertThat(token).matches("[0-9a-f]{64}");
        String cookie = cookieValue(result, "lp_pre_auth");
        assertThat(cookie).isNotNull();
        assertThat(result.getResponse().getHeader("Set-Cookie"))
                .contains("HttpOnly", "SameSite=Lax", "Path=/");
    }

    @Test
    @DisplayName("登录缺少 CSRF/Origin 或 Origin 不被允许时返回 403 CSRF_INVALID")
    void loginRequiresValidCsrfAndOrigin() throws Exception {
        PreAuth preAuth = preAuth();
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Origin", ORIGIN)
                        .content(loginBody("student.demo", PASSWORD)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("CSRF_INVALID"));

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Origin", "https://evil.example")
                        .header("X-CSRF-Token", preAuth.token())
                        .content(loginBody("student.demo", PASSWORD)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("CSRF_INVALID"));
    }

    @Test
    @DisplayName("完整登录：轮换会话 Cookie、清除预登录 Cookie、返回会话绑定 CSRF、写成功审计")
    void loginFullFlow() throws Exception {
        PreAuth preAuth = preAuth();
        MvcResult result = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Origin", ORIGIN)
                        .header("X-CSRF-Token", preAuth.token())
                        .cookie(new Cookie("lp_pre_auth", preAuth.cookie()))
                        .content(loginBody("student.demo", PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.user.username").value("student.demo"))
                .andExpect(jsonPath("$.data.user.roles[0]").value("student"))
                .andExpect(jsonPath("$.data.csrfToken").isNotEmpty())
                .andExpect(jsonPath("$.requestId").isNotEmpty())
                .andReturn();

        String sessionCookie = cookieValue(result, "lp_session");
        assertThat(sessionCookie).matches("[0-9a-f]{64}");
        assertThat(cookieValue(result, "lp_pre_auth")).isEmpty();
        assertThat(result.getResponse().getHeaders("Set-Cookie"))
                .anyMatch(value -> value.startsWith("lp_pre_auth=") && value.contains("Max-Age=0"));

        verify(auditLogMapper).insert(any(AuditLog.class));
        assertThat(read(result, "data.user.id")).isEqualTo(USER_ID);

        // 已登录身份可用
        mockMvc.perform(get("/api/v1/me").cookie(new Cookie("lp_session", sessionCookie)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.username").value("student.demo"));
    }

    @Test
    @DisplayName("未携带会话访问受保护路径返回统一 401 信封")
    void protectedPathWithoutSessionReturns401Envelope() throws Exception {
        mockMvc.perform(get("/api/v1/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("UNAUTHENTICATED"))
                .andExpect(jsonPath("$.requestId").isNotEmpty())
                .andExpect(header().string("Cache-Control", "no-store"));
    }

    @Test
    @DisplayName("退出撤销会话并清除 Cookie，随后旧会话失效")
    void logoutRevokesSessionAndClearsCookie() throws Exception {
        MvcResult login = login("student.demo", PASSWORD);
        String sessionCookie = cookieValue(login, "lp_session");
        String csrf = read(login, "data.csrfToken");

        mockMvc.perform(post("/api/v1/auth/logout")
                        .header("Origin", ORIGIN)
                        .header("X-CSRF-Token", csrf)
                        .cookie(new Cookie("lp_session", sessionCookie)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.loggedOut").value(true));

        mockMvc.perform(get("/api/v1/me").cookie(new Cookie("lp_session", sessionCookie)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("UNAUTHENTICATED"));
    }

    @Test
    @DisplayName("错误密码统一 401，连续失败达到上限后 429 并带 Retry-After")
    void wrongPasswordAndRateLimit() throws Exception {
        PreAuth preAuth = preAuth();
        for (int i = 0; i < 5; i++) {
            mockMvc.perform(post("/api/v1/auth/login")
                            .contentType(MediaType.APPLICATION_JSON)
                            .header("Origin", ORIGIN)
                            .header("X-CSRF-Token", preAuth.token())
                            .cookie(new Cookie("lp_pre_auth", preAuth.cookie()))
                            .content(loginBody("student.demo", "Wrong-test-password")))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.error.code").value("INVALID_CREDENTIALS"));
        }
        verify(auditLogMapper, times(5)).insert(any(AuditLog.class)); // 五次失败各写一条审计

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Origin", ORIGIN)
                        .header("X-CSRF-Token", preAuth.token())
                        .cookie(new Cookie("lp_pre_auth", preAuth.cookie()))
                        .content(loginBody("student.demo", PASSWORD)))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error.code").value("RATE_LIMITED"))
                .andExpect(header().string("Retry-After", org.hamcrest.Matchers.matchesPattern("[0-9]+")));
    }

    @Test
    @DisplayName("空密码返回 422 VALIDATION_ERROR 并带字段详情")
    void emptyPasswordReturnsValidationError() throws Exception {
        PreAuth preAuth = preAuth();
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Origin", ORIGIN)
                        .header("X-CSRF-Token", preAuth.token())
                        .cookie(new Cookie("lp_pre_auth", preAuth.cookie()))
                        .content("{\"username\":\"student.demo\",\"password\":\"\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    @DisplayName("零学期时 /me/config 返回 null 当前学期、空学期列表与全 false 能力")
    void configWithoutTerms() throws Exception {
        MvcResult login = login("student.demo", PASSWORD);
        mockMvc.perform(get("/api/v1/me/config")
                        .cookie(new Cookie("lp_session", cookieValue(login, "lp_session"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.apiVersion").value("v1"))
                .andExpect(jsonPath("$.data.timezone").value("Asia/Shanghai"))
                .andExpect(jsonPath("$.data.currentTermId").isEmpty())
                .andExpect(jsonPath("$.data.terms").isEmpty())
                .andExpect(jsonPath("$.data.features.aiTutoring").value(false))
                .andExpect(jsonPath("$.data.features.learningAnalytics").value(false))
                .andExpect(jsonPath("$.data.features.serverChecks").value(false));
    }

    @Test
    @DisplayName("存在当前学期时 /me/config 返回该学期 ID 与学期列表")
    void configWithCurrentTerm() throws Exception {
        Term current = new Term("11111111-1111-4111-8111-111111111111", "2026 秋季学期",
                Instant.parse("2026-09-01T00:00:00Z"), Instant.parse("2027-01-31T00:00:00Z"),
                true, Instant.parse("2026-09-01T00:00:00Z"), Instant.parse("2026-09-01T00:00:00Z"));
        when(termMapper.findAllOrdered()).thenReturn(List.of(current));
        MvcResult login = login("student.demo", PASSWORD);
        mockMvc.perform(get("/api/v1/me/config")
                        .cookie(new Cookie("lp_session", cookieValue(login, "lp_session"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.currentTermId").value("11111111-1111-4111-8111-111111111111"))
                .andExpect(jsonPath("$.data.terms[0].label").value("2026 秋季学期"));
    }

    private PreAuth preAuth() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/auth/csrf-token"))
                .andExpect(status().isOk())
                .andReturn();
        return new PreAuth(read(result, "data.csrfToken"), cookieValue(result, "lp_pre_auth"));
    }

    private MvcResult login(String username, String password) throws Exception {
        PreAuth preAuth = preAuth();
        return mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Origin", ORIGIN)
                        .header("X-CSRF-Token", preAuth.token())
                        .cookie(new Cookie("lp_pre_auth", preAuth.cookie()))
                        .content(loginBody(username, password)))
                .andExpect(status().isOk())
                .andReturn();
    }

    private String loginBody(String username, String password) {
        return "{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}";
    }

    private String read(MvcResult result, String pointer) throws Exception {
        JsonNode root = JSON.readTree(result.getResponse().getContentAsString());
        for (String part : pointer.split("\\.")) {
            root = root.path(part);
        }
        return root.isMissingNode() || root.isNull() ? null : root.asText();
    }

    private String cookieValue(MvcResult result, String name) {
        for (String value : result.getResponse().getHeaders("Set-Cookie")) {
            if (value.startsWith(name + "=")) {
                String remainder = value.substring(name.length() + 1);
                int semi = remainder.indexOf(';');
                return semi >= 0 ? remainder.substring(0, semi) : remainder;
            }
        }
        return null;
    }

    private record PreAuth(String token, String cookie) {
    }
}
