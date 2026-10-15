package com.learningplatform.common.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import javax.sql.DataSource;

import com.learningplatform.LearningPlatformApplication;
import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.auth.model.SessionIdentity;
import com.learningplatform.modules.auth.security.CsrfTokenService;
import com.learningplatform.modules.auth.service.DatabaseSessionService;
import com.learningplatform.modules.courses.dto.AssignmentDTOs.*;
import com.learningplatform.modules.courses.service.AssignmentService;
import com.learningplatform.modules.courses.service.AssignmentService.*;
import jakarta.servlet.http.Cookie;
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
import tools.jackson.databind.json.JsonMapper;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** P1-B 作业与工作区：11 个端点的 HTTP 契约测试，验证认证、CSRF、参数校验与错误码。 */
@SpringBootTest(classes = LearningPlatformApplication.class, properties = {
        "spring.flyway.enabled=false", "spring.sql.init.mode=never",
        "DB_URL=jdbc:mysql://127.0.0.1:1/unused", "DB_USERNAME=unused", "DB_PASSWORD=unused",
        "auth.http.pre-login-signing-key=test-signing-key",
        "auth.http.allowed-origins=http://127.0.0.1:4173",
        "AUTH_INVITE_SIGNING_KEY=test-only-invite-signing-key-at-least-32-characters"
})
@AutoConfigureMockMvc
class AssignmentHttpContractTest {

    private static final String ID = "00000000-0000-4000-8000-000000000091";
    private static final String OFFERING = "00000000-0000-4000-8000-000000000092";
    private static final String CHAPTER = "00000000-0000-4000-8000-000000000093";
    private static final String TERM = "00000000-0000-4000-8000-000000000094";
    private static final String ORIGIN = "http://127.0.0.1:4173";
    private static final String TEACHER_TOKEN = "t".repeat(64);
    private static final String STUDENT_TOKEN = "s".repeat(64);
    private static final String SECRET = "x".repeat(64);
    private static final String REQUEST_ID = "req-p1b-assignment-test";
    private static final Instant FUTURE = Instant.parse("2099-01-01T00:00:00Z");
    private static final JsonMapper JSON = JsonMapper.builder().findAndAddModules().build();

    @Autowired private MockMvc mvc;
    @Autowired private CsrfTokenService csrf;
    @MockitoBean private DataSource dataSource;
    @MockitoBean private DatabaseSessionService sessions;
    @MockitoBean private AssignmentService service;

    record Operation(String id, String method, String path, boolean teacher, String body,
                     int success, boolean paginated) {
        boolean writes() { return !"GET".equals(method); }
    }

    static Stream<Operation> operations() {
        return Stream.of(
                new Operation("listMyAssignments", "GET", "/api/v1/me/assignments", false, null, 200, true),
                new Operation("getAssignment", "GET", "/api/v1/assignments/" + ID, false, null, 200, false),
                new Operation("getWorkspace", "GET", "/api/v1/assignments/" + ID + "/workspace", false, null, 200, false),
                new Operation("saveWorkspace", "PUT", "/api/v1/assignments/" + ID + "/workspace", false,
                        "{\"baseRevision\":0,\"files\":[{\"path\":\"index.html\",\"content\":\"<h1>Test</h1>\"}],\"activeFile\":\"index.html\"}", 200, false),
                new Operation("submitAssignment", "POST", "/api/v1/assignments/" + ID + "/submissions", false,
                        "{\"workspaceRevision\":1,\"reflection\":\"完成\"}", 201, false),
                new Operation("listMySubmissions", "GET", "/api/v1/assignments/" + ID + "/submissions", false, null, 200, true),
                new Operation("getSubmission", "GET", "/api/v1/submissions/" + ID, false, null, 200, false),
                new Operation("listTeacherAssignments", "GET", "/api/v1/teacher/offerings/" + OFFERING + "/assignments", true, null, 200, true),
                new Operation("createAssignment", "POST", "/api/v1/teacher/offerings/" + OFFERING + "/assignments", true,
                        "{\"chapterId\":\"" + CHAPTER + "\",\"title\":\"作业一\",\"description\":\"说明\",\"estimatedMinutes\":30,\"type\":\"web_lab\",\"isRequired\":true,\"dueAt\":\"2099-01-01T00:00:00Z\",\"lateUntil\":null,\"allowResubmit\":true,\"maxAttempts\":3,\"maxScore\":100,\"requirements\":[\"完成功能\"],\"rubric\":[],\"initialFiles\":[],\"knowledgePointIds\":[]}", 201, false),
                new Operation("getTeacherAssignment", "GET", "/api/v1/teacher/assignments/" + ID, true, null, 200, false),
                new Operation("patchAssignment", "PATCH", "/api/v1/teacher/assignments/" + ID, true, "{\"description\":\"更新说明\"}", 200, false),
                new Operation("publishAssignment", "POST", "/api/v1/teacher/assignments/" + ID + "/publish", true, "{}", 200, false),
                new Operation("archiveAssignment", "POST", "/api/v1/teacher/assignments/" + ID + "/archive", true, "{}", 200, false),
                new Operation("listTeacherSubmissions", "GET", "/api/v1/teacher/assignments/" + ID + "/submissions", true, null, 200, true));
    }

    static Stream<Operation> writes() { return operations().filter(Operation::writes); }
    static Stream<Operation> teacherOperations() { return operations().filter(Operation::teacher); }
    static Stream<Operation> studentOperations() {
        return operations().filter(o -> List.of("listMyAssignments", "getAssignment", "getWorkspace",
                "saveWorkspace", "submitAssignment", "listMySubmissions", "getSubmission").contains(o.id()));
    }
    static Stream<Operation> paginated() { return operations().filter(Operation::paginated); }
    static Stream<Operation> objectOperations() {
        return operations().filter(o -> List.of("getAssignment", "getWorkspace", "saveWorkspace", "getSubmission",
                "getTeacherAssignment", "patchAssignment", "publishAssignment", "archiveAssignment").contains(o.id()));
    }

    @BeforeEach
    void arrangeNormalServiceResults() throws Exception {
        when(sessions.resolve(TEACHER_TOKEN)).thenReturn(identity(TEACHER_TOKEN, "teacher"));
        when(sessions.resolve(STUDENT_TOKEN)).thenReturn(identity(STUDENT_TOKEN, "student"));

        AssignmentSummaryDTO assignmentSummary = new AssignmentSummaryDTO(ID, OFFERING, "active", CHAPTER, "作业一",
                "web_lab", true, "published", "说明", FUTURE, "not_started", false, null, null, false);
        AssignmentDetailDTO assignmentDetail = new AssignmentDetailDTO(ID, OFFERING, "active", CHAPTER, "作业一",
                "web_lab", true, "published", "说明", FUTURE, "not_started", false, null, null, false,
                List.of("完成功能"), 30, new BigDecimal("100.00"), List.of(), List.of(), null, true, 3, 0, true, null, null);
        WorkspaceDTO workspace = new WorkspaceDTO(ID, 1,
                List.of(new FileDTO("index.html", "<h1>Test</h1>")), "index.html",
                Instant.parse("2026-10-14T00:00:00Z"), true, null);
        SubmissionSummaryDTO submissionSummary = new SubmissionSummaryDTO(ID, ID, OFFERING, 1, 1,
                Instant.parse("2026-10-14T00:00:00Z"), false, false, "pending");
        SubmissionDetailDTO submissionDetail = new SubmissionDetailDTO(ID, ID, OFFERING, 1, 1,
                Instant.parse("2026-10-14T00:00:00Z"), false, false, "pending",
                List.of(new FileDTO("index.html", "<h1>Test</h1>")), "完成",
                new AssignmentSnapshot("作业一", List.of("完成功能"), List.of(), new BigDecimal("100.00"),
                        List.of(), 1, FUTURE, null), null);
        TeacherAssignmentDTO teacherAssignment = new TeacherAssignmentDTO(CHAPTER, "作业一", "web_lab", true, "说明",
                List.of("完成功能"), 30, List.of(), FUTURE, null, true, 3, new BigDecimal("100.00"), List.of(),
                List.of(), null, ID, OFFERING, "draft", null, 0, 0);

        when(service.listMyAssignments(any(), nullable(String.class), nullable(String.class), anyString(), anyInt(), anyInt()))
                .thenReturn(new AssignmentListResponse(List.of(assignmentSummary), 1, 20, 1, Map.of("allCount", 1, "todoCount", 1, "doneCount", 0, "archivedIncompleteCount", 0)));
        when(service.getAssignment(any(), anyString())).thenReturn(assignmentDetail);
        when(service.getWorkspace(any(), anyString())).thenReturn(workspace);
        when(service.saveWorkspace(any(), anyString(), anyMap(), anyString())).thenReturn(workspace);
        when(service.submitAssignment(any(), anyString(), anyMap(), anyString()))
                .thenReturn(new SubmissionCreatedResponse(submissionSummary, true));
        when(service.listMySubmissions(any(), anyString(), anyInt(), anyInt()))
                .thenReturn(new SubmissionListResponse(List.of(submissionSummary), 1, 20, 1));
        when(service.getSubmission(any(), anyString())).thenReturn(submissionDetail);
        when(service.listTeacherAssignments(any(), anyString(), anyString(), anyInt(), anyInt()))
                .thenReturn(new AssignmentListResponse(List.of(teacherAssignment), 1, 20, 1, null));
        when(service.createAssignment(any(), anyString(), anyMap(), anyString())).thenReturn(teacherAssignment);
        when(service.getTeacherAssignment(any(), anyString())).thenReturn(teacherAssignment);
        when(service.patchAssignment(any(), anyString(), anyMap(), anyString())).thenReturn(teacherAssignment);
        when(service.publishAssignment(any(), anyString(), anyString())).thenReturn(teacherAssignment);
        when(service.archiveAssignment(any(), anyString(), anyString())).thenReturn(teacherAssignment);
        when(service.listTeacherSubmissions(any(), anyString(), anyInt(), anyInt()))
                .thenReturn(new SubmissionListResponse(List.of(), 1, 20, 0));
    }

    @ParameterizedTest(name = "{0}") @MethodSource("operations")
    void normalResponseMatchesOperation(Operation op) throws Exception {
        mvc.perform(authenticated(op, op.teacher() ? TEACHER_TOKEN : STUDENT_TOKEN, true))
                .andExpect(status().is(op.success()))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("X-Request-ID", REQUEST_ID))
                .andExpect(jsonPath("$.requestId").value(REQUEST_ID))
                .andExpect(jsonPath("$.data").exists());
    }

    @ParameterizedTest(name = "{0}") @MethodSource("operations")
    void anonymousRequestIsRejected(Operation op) throws Exception {
        MockHttpServletRequestBuilder builder = base(op);
        if (op.writes()) {
            CsrfTokenService.PreAuthTicket ticket = csrf.issuePreAuth();
            builder.cookie(new Cookie("lp_pre_auth", ticket.cookieValue()))
                    .header("Origin", ORIGIN).header("X-CSRF-Token", ticket.token());
        }
        mvc.perform(builder).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("UNAUTHENTICATED"));
    }

    @ParameterizedTest(name = "{0}") @MethodSource("teacherOperations")
    void studentCannotUseTeacherOperation(Operation op) throws Exception {
        mvc.perform(authenticated(op, STUDENT_TOKEN, true)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
    }

    @ParameterizedTest(name = "{0}") @MethodSource("objectOperations")
    void privateObjectRejectionRemainsNotFound(Operation op) throws Exception {
        BusinessException hidden = new BusinessException(HttpStatus.NOT_FOUND, "NOT_FOUND", "对象不存在。");
        switch (op.id()) {
            case "getAssignment" -> when(service.getAssignment(any(), anyString())).thenThrow(hidden);
            case "getWorkspace" -> when(service.getWorkspace(any(), anyString())).thenThrow(hidden);
            case "saveWorkspace" -> when(service.saveWorkspace(any(), anyString(), anyMap(), anyString())).thenThrow(hidden);
            case "getSubmission" -> when(service.getSubmission(any(), anyString())).thenThrow(hidden);
            case "getTeacherAssignment" -> when(service.getTeacherAssignment(any(), anyString())).thenThrow(hidden);
            case "patchAssignment" -> when(service.patchAssignment(any(), anyString(), anyMap(), anyString())).thenThrow(hidden);
            case "publishAssignment" -> when(service.publishAssignment(any(), anyString(), anyString())).thenThrow(hidden);
            case "archiveAssignment" -> when(service.archiveAssignment(any(), anyString(), anyString())).thenThrow(hidden);
            default -> throw new AssertionError(op.id());
        }
        mvc.perform(authenticated(op, op.teacher() ? TEACHER_TOKEN : STUDENT_TOKEN, true))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
    }

    @ParameterizedTest(name = "{0}") @MethodSource("writes")
    void writeRequiresCsrf(Operation op) throws Exception {
        mvc.perform(authenticated(op, op.teacher() ? TEACHER_TOKEN : STUDENT_TOKEN, false))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("CSRF_INVALID"));
    }

    @ParameterizedTest(name = "{0}") @MethodSource("paginated")
    void invalidPageIsRejected(Operation op) throws Exception {
        mvc.perform(authenticated(op, op.teacher() ? TEACHER_TOKEN : STUDENT_TOKEN, true).queryParam("page", "0"))
                .andExpect(status().is(422)).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    void malformedAssignmentIdIsRejected() throws Exception {
        Operation op = new Operation("getAssignment", "GET", "/api/v1/assignments/not-a-uuid", false, null, 200, false);
        mvc.perform(authenticated(op, STUDENT_TOKEN, true)).andExpect(status().is(422))
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    void existingSubmissionReturns200WithoutCreatingAnother() throws Exception {
        SubmissionSummaryDTO existing = new SubmissionSummaryDTO(ID, ID, OFFERING, 1, 1,
                Instant.parse("2026-10-14T00:00:00Z"), false, false, "pending");
        when(service.submitAssignment(any(), anyString(), anyMap(), anyString()))
                .thenReturn(new SubmissionCreatedResponse(existing, false));
        Operation submit = operations().filter(o -> "submitAssignment".equals(o.id())).findFirst().orElseThrow();
        mvc.perform(authenticated(submit, STUDENT_TOKEN, true)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(ID));
    }

    @Test
    void versionConflictReturns409() throws Exception {
        BusinessException conflict = new BusinessException(HttpStatus.CONFLICT, "VERSION_CONFLICT", "工作区版本冲突，请刷新后重试。");
        when(service.saveWorkspace(any(), anyString(), anyMap(), anyString())).thenThrow(conflict);
        Operation save = operations().filter(o -> "saveWorkspace".equals(o.id())).findFirst().orElseThrow();
        mvc.perform(authenticated(save, STUDENT_TOKEN, true)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));
    }

    @Test
    void duplicateSubmissionReturns409() throws Exception {
        BusinessException duplicate = new BusinessException(HttpStatus.CONFLICT, "SUBMISSION_BLOCKED", "已达到最大提交次数。");
        when(service.submitAssignment(any(), anyString(), anyMap(), anyString())).thenThrow(duplicate);
        Operation submit = operations().filter(o -> "submitAssignment".equals(o.id())).findFirst().orElseThrow();
        mvc.perform(authenticated(submit, STUDENT_TOKEN, true)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("SUBMISSION_BLOCKED"));
    }

    @Test
    void archiveWithPendingReviewsReturns409() throws Exception {
        BusinessException pending = new BusinessException(HttpStatus.CONFLICT, "PENDING_REVIEWS_EXIST", "存在待评阅提交，无法归档作业。");
        when(service.archiveAssignment(any(), anyString(), anyString())).thenThrow(pending);
        Operation archive = operations().filter(o -> "archiveAssignment".equals(o.id())).findFirst().orElseThrow();
        mvc.perform(authenticated(archive, TEACHER_TOKEN, true)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("PENDING_REVIEWS_EXIST"));
    }

    private MockHttpServletRequestBuilder authenticated(Operation op, String token, boolean validCsrf) {
        MockHttpServletRequestBuilder builder = base(op).cookie(new Cookie("lp_session", token));
        if (op.writes()) {
            builder.header("Origin", ORIGIN);
            if (validCsrf) builder.header("X-CSRF-Token", csrf.sessionToken(token, SECRET));
        }
        return builder;
    }

    private MockHttpServletRequestBuilder base(Operation op) {
        MockHttpServletRequestBuilder builder = request(HttpMethod.valueOf(op.method()), op.path())
                .header("X-Request-ID", REQUEST_ID).accept(MediaType.APPLICATION_JSON);
        if (op.writes()) builder.contentType(MediaType.APPLICATION_JSON).content(op.body());
        return builder;
    }

    private SessionIdentity identity(String id, String role) {
        UserDTO user = new UserDTO(ID, role + ".test", "测试用户", List.of(role));
        return new SessionIdentity(id, user, SECRET, FUTURE, FUTURE);
    }
}
