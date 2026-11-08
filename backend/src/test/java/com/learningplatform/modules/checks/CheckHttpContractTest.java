package com.learningplatform.modules.checks;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import javax.sql.DataSource;
import jakarta.servlet.http.Cookie;

import com.learningplatform.LearningPlatformApplication;
import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.auth.model.SessionIdentity;
import com.learningplatform.modules.auth.security.CsrfTokenService;
import com.learningplatform.modules.auth.service.DatabaseSessionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.hamcrest.Matchers.nullValue;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(classes = LearningPlatformApplication.class, properties = {
        "spring.flyway.enabled=false", "spring.sql.init.mode=never",
        "DB_URL=jdbc:mysql://127.0.0.1:1/unused", "DB_USERNAME=unused", "DB_PASSWORD=unused",
        "auth.http.pre-login-signing-key=test-signing-key",
        "auth.http.allowed-origins=http://127.0.0.1:4173",
        "AUTH_INVITE_SIGNING_KEY=test-only-invite-signing-key-at-least-32-characters"
})
@AutoConfigureMockMvc
class CheckHttpContractTest {
    private static final String ASSIGNMENT = "00000000-0000-4000-8000-000000000091";
    private static final String CHECK = "00000000-0000-4000-8000-000000000092";
    private static final UserDTO TEACHER = new UserDTO("00000000-0000-4000-8000-000000000093",
            "teacher.test", "教师", List.of("teacher"));
    private static final UserDTO STUDENT = new UserDTO("00000000-0000-4000-8000-000000000094",
            "student.test", "学生", List.of("student"));
    private static final String TEACHER_TOKEN = "t".repeat(64);
    private static final String STUDENT_TOKEN = "s".repeat(64);
    private static final String SECRET = "x".repeat(64);
    private static final String ORIGIN = "http://127.0.0.1:4173";
    private static final String REQUEST_ID = "req-automatic-check-test";
    private static final Instant FUTURE = Instant.parse("2099-01-01T00:00:00Z");

    private static final String POLICY_PATH = "/api/v1/teacher/assignments/" + ASSIGNMENT + "/check-policy";
    private static final String CHECKS_PATH = "/api/v1/assignments/" + ASSIGNMENT + "/checks";
    private static final Operation GET_POLICY = new Operation(HttpMethod.GET, POLICY_PATH, null);
    private static final Operation SAVE_POLICY = new Operation(HttpMethod.PUT, POLICY_PATH,
            "{\"baseVersion\":0,\"config\":null}");
    private static final Operation GET_AVAILABILITY = new Operation(HttpMethod.GET,
            CHECKS_PATH + "?workspaceRevision=1", null);
    private static final Operation CREATE = new Operation(HttpMethod.POST, CHECKS_PATH, "{\"workspaceRevision\":1}");
    private static final Operation GET_CHECK = new Operation(HttpMethod.GET, "/api/v1/checks/" + CHECK, null);

    @Autowired private MockMvc mvc;
    @Autowired private CsrfTokenService csrf;
    @MockitoBean private DataSource dataSource;
    @MockitoBean private DatabaseSessionService sessions;
    @MockitoBean private CheckService checks;

    record Operation(HttpMethod method, String path, String body) {
        MockHttpServletRequestBuilder requestBuilder() {
            var builder = request(method, path).header("X-Request-ID", REQUEST_ID).accept(MediaType.APPLICATION_JSON);
            return body == null ? builder : builder.contentType(MediaType.APPLICATION_JSON).content(body);
        }
    }

    static Stream<Operation> operations() {
        return Stream.of(GET_POLICY, SAVE_POLICY, GET_AVAILABILITY, CREATE, GET_CHECK);
    }

    @BeforeEach
    void arrangeSessionIdentities() {
        when(sessions.resolve(TEACHER_TOKEN)).thenReturn(new SessionIdentity(TEACHER_TOKEN, TEACHER, SECRET, FUTURE, FUTURE));
        when(sessions.resolve(STUDENT_TOKEN)).thenReturn(new SessionIdentity(STUDENT_TOKEN, STUDENT, SECRET, FUTURE, FUTURE));
    }

    @ParameterizedTest
    @MethodSource("operations")
    void everyOperationRequiresAuthentication(Operation operation) throws Exception {
        var builder = operation.requestBuilder();
        if (operation.body() != null) {
            var ticket = csrf.issuePreAuth();
            builder.cookie(new Cookie("lp_pre_auth", ticket.cookieValue()))
                    .header("Origin", ORIGIN).header("X-CSRF-Token", ticket.token());
        }
        mvc.perform(builder).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("UNAUTHENTICATED"));
        verifyNoInteractions(checks);
    }

    @Test
    void writesRequireCsrfAndStudentCannotAccessTeacherPolicy() throws Exception {
        mvc.perform(authenticated(SAVE_POLICY, TEACHER_TOKEN, false)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("CSRF_INVALID"));
        mvc.perform(authenticated(CREATE, STUDENT_TOKEN, false)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("CSRF_INVALID"));
        mvc.perform(authenticated(GET_POLICY, STUDENT_TOKEN, false)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
        mvc.perform(authenticated(SAVE_POLICY, STUDENT_TOKEN, true)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
        verifyNoInteractions(checks);
    }

    @Test
    void policyReadsAndWritesPreserveVersionAndNullableConfig() throws Exception {
        when(checks.policy(TEACHER, ASSIGNMENT)).thenReturn(new CheckStore.Policy(0, null));
        Map<String, Object> write = new java.util.HashMap<>();
        write.put("baseVersion", 0);
        write.put("config", null);
        when(checks.savePolicy(TEACHER, ASSIGNMENT, write)).thenReturn(new CheckStore.Policy(1, null));
        mvc.perform(authenticated(GET_POLICY, TEACHER_TOKEN, false)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("X-Request-ID", REQUEST_ID))
                .andExpect(jsonPath("$.requestId").value(REQUEST_ID))
                .andExpect(jsonPath("$.data.version").value(0))
                .andExpect(jsonPath("$.data.config").value(nullValue()));
        mvc.perform(authenticated(SAVE_POLICY, TEACHER_TOKEN, true)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.version").value(1))
                .andExpect(jsonPath("$.data.config").value(nullValue()));

        when(checks.savePolicy(TEACHER, ASSIGNMENT, write)).thenThrow(new BusinessException(
                HttpStatus.CONFLICT, "CHECK_POLICY_CONFLICT", "配置已更新。", Map.of("currentVersion", 1)));
        mvc.perform(authenticated(SAVE_POLICY, TEACHER_TOKEN, true)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("CHECK_POLICY_CONFLICT"))
                .andExpect(jsonPath("$.error.details.currentVersion").value(1));
    }

    @Test
    void studentOperationsSerializeOnlyPublicState() throws Exception {
        when(checks.availability(STUDENT, ASSIGNMENT, 1)).thenReturn(new CheckService.Availability(true, null));
        when(checks.create(STUDENT, ASSIGNMENT, Map.of("workspaceRevision", 1)))
                .thenReturn(new CheckService.Accepted(CHECK, "queued"));
        when(checks.get(STUDENT, CHECK)).thenReturn(new CheckStore.CheckView(CHECK, ASSIGNMENT, 1,
                "course-check-v1", "queued", null, null, FUTURE, null));

        mvc.perform(authenticated(GET_AVAILABILITY, STUDENT_TOKEN, false)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.configured").value(true))
                .andExpect(jsonPath("$.data.check").value(nullValue()))
                .andExpect(jsonPath("$.data.config").doesNotHaveJsonPath());
        mvc.perform(authenticated(CREATE, STUDENT_TOKEN, true)).andExpect(status().isAccepted())
                .andExpect(jsonPath("$.data.checkId").value(CHECK))
                .andExpect(jsonPath("$.data.status").value("queued"));
        mvc.perform(authenticated(GET_CHECK, STUDENT_TOKEN, false)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(CHECK))
                .andExpect(jsonPath("$.data.assignmentId").value(ASSIGNMENT))
                .andExpect(jsonPath("$.data.workspaceRevision").value(1))
                .andExpect(jsonPath("$.data.checkerVersion").value("course-check-v1"))
                .andExpect(jsonPath("$.data.status").value("queued"))
                .andExpect(jsonPath("$.data.createdAt").value(FUTURE.toString()))
                .andExpect(jsonPath("$.data.result").value(nullValue()))
                .andExpect(jsonPath("$.data.error").value(nullValue()))
                .andExpect(jsonPath("$.data.completedAt").value(nullValue()))
                .andExpect(jsonPath("$.data.policySnapshot").doesNotHaveJsonPath())
                .andExpect(jsonPath("$.data.fileSnapshot").doesNotHaveJsonPath());

        when(checks.get(STUDENT, CHECK)).thenThrow(new BusinessException(HttpStatus.NOT_FOUND, "NOT_FOUND", "未找到。"));
        mvc.perform(authenticated(GET_CHECK, STUDENT_TOKEN, false)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
    }

    private MockHttpServletRequestBuilder authenticated(Operation operation, String token, boolean validCsrf) {
        var builder = operation.requestBuilder().cookie(new Cookie("lp_session", token));
        if (operation.body() != null) {
            builder.header("Origin", ORIGIN);
            if (validCsrf) builder.header("X-CSRF-Token", csrf.sessionToken(token, SECRET));
        }
        return builder;
    }
}
