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
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** P1-B/C 作业、工作区与评价：12 个端点的 HTTP 契约测试，验证认证、CSRF、参数校验与错误码。 */
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
    private static final String FEEDBACK_BODY = "{\"baseVersion\":0,\"score\":85,\"rubricResults\":[{\"criterionId\":\"layout\",\"score\":85,\"comment\":\"ok\"}],"
            + "\"comment\":\"整体不错\",\"knowledgeEvaluations\":[]}";

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
                new Operation("listTeacherSubmissions", "GET", "/api/v1/teacher/assignments/" + ID + "/submissions", true, null, 200, true),
                new Operation("getFeedbackDraft", "GET", "/api/v1/teacher/submissions/" + ID + "/feedback", true, null, 200, false),
                new Operation("saveFeedback", "POST", "/api/v1/teacher/submissions/" + ID + "/feedback", true, FEEDBACK_BODY, 201, false),
                new Operation("publishFeedback", "POST", "/api/v1/teacher/submissions/" + ID + "/feedback/publish", true, "{\"baseVersion\":1}", 200, false),
                new Operation("getFeedback", "GET", "/api/v1/me/feedback/" + ID, false, null, 200, false),
                new Operation("listMessages", "GET", "/api/v1/me/messages", false, null, 200, true),
                new Operation("readMessage", "PUT", "/api/v1/me/messages/" + MESSAGE_ID + "/read", false, "{}", 200, false));
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
        // readMessage 的 404 在 readMessageOfOthersAndNonEmptyBodyAreRejected 中单独覆盖。
    }

    @BeforeEach
    void arrangeNormalServiceResults() throws Exception {
        when(sessions.resolve(TEACHER_TOKEN)).thenReturn(identity(TEACHER_TOKEN, "teacher"));
        when(sessions.resolve(STUDENT_TOKEN)).thenReturn(identity(STUDENT_TOKEN, "student"));

        AssignmentSummaryDTO assignmentSummary = new AssignmentSummaryDTO(ID, OFFERING, "active", CHAPTER, "作业一",
                "web_lab", true, "published", "说明", FUTURE, "NOT_STARTED", false, null, null, false);
        AssignmentDetailDTO assignmentDetail = new AssignmentDetailDTO(ID, OFFERING, "active", CHAPTER, "作业一",
                "web_lab", true, "published", "说明", FUTURE, "NOT_STARTED", false, null, null, false,
                List.of("完成功能"), 30, new BigDecimal("100.00"), List.of(), List.of(), null, true, 3, 0, true, null, null);
        WorkspaceDTO workspace = new WorkspaceDTO(ID, 1,
                List.of(new FileDTO("index.html", "<h1>Test</h1>")), "index.html",
                Instant.parse("2026-10-14T00:00:00Z"), true, null);
        SubmissionSummaryDTO submissionSummary = new SubmissionSummaryDTO(ID, ID, OFFERING, 1, 1,
                Instant.parse("2026-10-14T00:00:00Z"), false, false, "none");
        SubmissionDetailDTO submissionDetail = new SubmissionDetailDTO(ID, ID, OFFERING, 1, 1,
                Instant.parse("2026-10-14T00:00:00Z"), false, false, "none",
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
        when(service.listTeacherAssignments(any(), anyString(), nullable(String.class), anyInt(), anyInt()))
                .thenReturn(new AssignmentListResponse(List.of(teacherAssignment), 1, 20, 1, null));
        when(service.createAssignment(any(), anyString(), anyMap(), anyString())).thenReturn(teacherAssignment);
        when(service.getTeacherAssignment(any(), anyString())).thenReturn(teacherAssignment);
        when(service.patchAssignment(any(), anyString(), anyMap(), anyString())).thenReturn(teacherAssignment);
        when(service.publishAssignment(any(), anyString(), anyString())).thenReturn(teacherAssignment);
        when(service.archiveAssignment(any(), anyString(), anyString())).thenReturn(teacherAssignment);
        when(service.listTeacherSubmissions(any(), anyString(), nullable(String.class), anyBoolean(), anyInt(), anyInt()))
                .thenReturn(new SubmissionListResponse(List.of(), 1, 20, 0));
        when(service.getFeedbackDraft(any(), anyString()))
                .thenReturn(new FeedbackDraftDTO(teacherFeedback(1, "draft"), 1));
        when(service.listMessages(any(), nullable(String.class), nullable(String.class), nullable(String.class), anyInt(), anyInt()))
                .thenReturn(new NotificationListResponse(List.of(notification()), 1, 20, 1, 1));
        when(service.readMessage(any(), anyString(), anyString()))
                .thenReturn(new MessageReadDTO(MESSAGE_ID, Instant.parse("2026-10-14T01:00:00Z")));
        when(service.saveFeedback(any(), anyString(), anyMap(), anyString()))
                .thenReturn(new FeedbackSaveResult(teacherFeedback(1, "draft"), true));
        when(service.publishFeedback(any(), anyString(), anyMap(), anyString())).thenReturn(teacherFeedback(2, "published"));
        when(service.getFeedback(any(), anyString())).thenReturn(studentFeedback());
    }

    private static final String MESSAGE_ID = "00000000-0000-4000-8000-000000000095";
    private static final String TEACHER_ID = "00000000-0000-4000-8000-000000000096";

    private static TeacherFeedbackDTO teacherFeedback(int version, String status) {
        return new TeacherFeedbackDTO(ID, ID, OFFERING, ID, "作业一", version, status, new BigDecimal("85.00"), new BigDecimal("100.00"),
                List.of(new RubricResultDTO("layout", new BigDecimal("85.00"), "ok")), "整体不错", List.of(), List.of(), null,
                new com.learningplatform.modules.courses.dto.CourseDTOs.TeacherBrief(TEACHER_ID, "教师"),
                "published".equals(status) ? Instant.parse("2026-10-14T00:00:00Z") : null, null);
    }

    private static NotificationDTO notification() {
        return new NotificationDTO(MESSAGE_ID, OFFERING, "feedback", "作业已获批阅", "请查看反馈",
                new com.learningplatform.modules.courses.dto.CourseDTOs.TeacherBrief(TEACHER_ID, "教师"),
                Instant.parse("2026-10-14T00:00:00Z"), null, new TargetDTO("feedback", ID, OFFERING));
    }

    private static StudentFeedbackViewDTO studentFeedback() {
        return new StudentFeedbackViewDTO(ID, ID, OFFERING, ID, "作业一", 2, "published", new BigDecimal("85.00"), new BigDecimal("100.00"),
                List.of(new RubricResultDTO("layout", new BigDecimal("85.00"), "ok")), "整体不错", List.of(), List.of(), null,
                new com.learningplatform.modules.courses.dto.CourseDTOs.TeacherBrief(TEACHER_ID, "教师"),
                Instant.parse("2026-10-14T00:00:00Z"), MESSAGE_ID);
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
                Instant.parse("2026-10-14T00:00:00Z"), false, false, "none");
        when(service.submitAssignment(any(), anyString(), anyMap(), anyString()))
                .thenReturn(new SubmissionCreatedResponse(existing, false));
        Operation submit = operations().filter(o -> "submitAssignment".equals(o.id())).findFirst().orElseThrow();
        mvc.perform(authenticated(submit, STUDENT_TOKEN, true)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(ID));
    }

    @Test
    void workspaceConflictReturns409WithCurrentRevision() throws Exception {
        BusinessException conflict = new BusinessException(HttpStatus.CONFLICT, "WORKSPACE_CONFLICT",
                "工作区版本冲突，请刷新后重试。", Map.of("currentRevision", 5));
        when(service.saveWorkspace(any(), anyString(), anyMap(), anyString())).thenThrow(conflict);
        Operation save = operations().filter(o -> "saveWorkspace".equals(o.id())).findFirst().orElseThrow();
        mvc.perform(authenticated(save, STUDENT_TOKEN, true)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("WORKSPACE_CONFLICT"))
                .andExpect(jsonPath("$.error.details.currentRevision").value(5));
    }

    @Test
    void saveBlockedByArchiveReturns409WithRegisteredCode() throws Exception {
        for (String code : List.of("OFFERING_ARCHIVED", "ASSIGNMENT_ARCHIVED")) {
            org.mockito.Mockito.doThrow(new BusinessException(HttpStatus.CONFLICT, code, "已归档。"))
                    .when(service).saveWorkspace(any(), anyString(), anyMap(), anyString());
            Operation save = operations().filter(o -> "saveWorkspace".equals(o.id())).findFirst().orElseThrow();
            mvc.perform(authenticated(save, STUDENT_TOKEN, true)).andExpect(status().isConflict())
                    .andExpect(jsonPath("$.error.code").value(code));
        }
    }

    @Test
    void saveWithUnsupportedFilePathReturns400() throws Exception {
        when(service.saveWorkspace(any(), anyString(), anyMap(), anyString()))
                .thenThrow(new BusinessException(HttpStatus.BAD_REQUEST, "INVALID_FILE_PATH", "文件名不在该作业类型允许的范围内。"));
        Operation save = operations().filter(o -> "saveWorkspace".equals(o.id())).findFirst().orElseThrow();
        mvc.perform(authenticated(save, STUDENT_TOKEN, true)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("INVALID_FILE_PATH"));
    }

    @Test
    void attemptLimitReturns409() throws Exception {
        BusinessException duplicate = new BusinessException(HttpStatus.CONFLICT, "ATTEMPT_LIMIT_REACHED", "已达到最大提交次数。");
        when(service.submitAssignment(any(), anyString(), anyMap(), anyString())).thenThrow(duplicate);
        Operation submit = operations().filter(o -> "submitAssignment".equals(o.id())).findFirst().orElseThrow();
        mvc.perform(authenticated(submit, STUDENT_TOKEN, true)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("ATTEMPT_LIMIT_REACHED"));
    }

    // ---- 五个阶段1操作的强形状断言 ----

    @Test
    void listMyAssignmentsHasContractShape() throws Exception {
        Operation op = operations().filter(o -> "listMyAssignments".equals(o.id())).findFirst().orElseThrow();
        mvc.perform(authenticated(op, STUDENT_TOKEN, true))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.page").value(1))
                .andExpect(jsonPath("$.data.pageSize").value(20))
                .andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.summary.allCount").value(1))
                .andExpect(jsonPath("$.data.summary.todoCount").value(1))
                .andExpect(jsonPath("$.data.summary.doneCount").value(0))
                .andExpect(jsonPath("$.data.summary.archivedIncompleteCount").value(0))
                .andExpect(jsonPath("$.data.items[0].id").value(ID))
                .andExpect(jsonPath("$.data.items[0].offeringId").value(OFFERING))
                .andExpect(jsonPath("$.data.items[0].offeringStatus").value("active"))
                .andExpect(jsonPath("$.data.items[0].publicationState").value("published"))
                .andExpect(jsonPath("$.data.items[0].assignmentState").value("NOT_STARTED"))
                .andExpect(jsonPath("$.data.items[0].overdue").value(false))
                .andExpect(jsonPath("$.data.items[0].isRequired").value(true))
                .andExpect(jsonPath("$.data.items[0].latestSubmissionId").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data.items[0].publishedFeedbackId").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data.items[0].unreadFeedback").value(false))
                .andExpect(jsonPath("$.data.items[0].dueAt").value("2099-01-01T00:00:00Z"));
    }

    @Test
    void listMyAssignmentsPassesFilterParameters() throws Exception {
        Operation op = operations().filter(o -> "listMyAssignments".equals(o.id())).findFirst().orElseThrow();
        mvc.perform(authenticated(op, STUDENT_TOKEN, true).queryParam("filter", "done")
                        .queryParam("offeringId", OFFERING))
                .andExpect(status().isOk());
        org.mockito.Mockito.verify(service).listMyAssignments(any(), org.mockito.ArgumentMatchers.eq(OFFERING),
                nullable(String.class), org.mockito.ArgumentMatchers.eq("done"), anyInt(), anyInt());
    }

    @Test
    void listTeacherAssignmentsHasContractShapeAndNoDefaultStatusFilter() throws Exception {
        Operation op = operations().filter(o -> "listTeacherAssignments".equals(o.id())).findFirst().orElseThrow();
        mvc.perform(authenticated(op, TEACHER_TOKEN, true))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.page").value(1))
                .andExpect(jsonPath("$.data.pageSize").value(20))
                .andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.items[0].id").value(ID))
                .andExpect(jsonPath("$.data.items[0].offeringId").value(OFFERING))
                .andExpect(jsonPath("$.data.items[0].publicationState").value("draft"))
                .andExpect(jsonPath("$.data.items[0].submittedStudentCount").value(0))
                .andExpect(jsonPath("$.data.items[0].pendingReviewCount").value(0))
                .andExpect(jsonPath("$.data.items[0].maxScore").value(100.0))
                .andExpect(jsonPath("$.data.items[0].isRequired").value(true));
        // 未传 publicationState 时控制器必须原样传 null（不得替换为默认状态）。
        org.mockito.Mockito.verify(service).listTeacherAssignments(any(), org.mockito.ArgumentMatchers.eq(OFFERING),
                org.mockito.ArgumentMatchers.isNull(), anyInt(), anyInt());
    }

    @Test
    void getAssignmentStudentViewHasContractShape() throws Exception {
        Operation op = operations().filter(o -> "getAssignment".equals(o.id())).findFirst().orElseThrow();
        mvc.perform(authenticated(op, STUDENT_TOKEN, true))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.assignmentState").value("NOT_STARTED"))
                .andExpect(jsonPath("$.data.offeringStatus").value("active"))
                .andExpect(jsonPath("$.data.attemptsUsed").value(0))
                .andExpect(jsonPath("$.data.canSubmit").value(true))
                .andExpect(jsonPath("$.data.submissionBlockedReason").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data.maxAttempts").value(3))
                .andExpect(jsonPath("$.data.allowResubmit").value(true))
                .andExpect(jsonPath("$.data.requirements[0]").value("完成功能"))
                .andExpect(jsonPath("$.data.estimatedMinutes").value(30));
    }

    @Test
    void getAssignmentTeacherViewHasNullStudentFields() throws Exception {
        TeacherAssignmentViewDTO view = new TeacherAssignmentViewDTO(ID, OFFERING, "active", CHAPTER, "作业一",
                "web_lab", true, "published", "说明", FUTURE, null, null, null, null, null,
                List.of("完成功能"), 30, new BigDecimal("100.00"), List.of(), List.of(), null, true, 3,
                null, null, null, null);
        when(service.getAssignment(any(), anyString())).thenReturn(view);
        Operation op = operations().filter(o -> "getAssignment".equals(o.id())).findFirst().orElseThrow();
        mvc.perform(authenticated(op, TEACHER_TOKEN, true))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.publicationState").value("published"))
                .andExpect(jsonPath("$.data.offeringStatus").value("active"))
                .andExpect(jsonPath("$.data.assignmentState").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data.overdue").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data.unreadFeedback").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data.attemptsUsed").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data.canSubmit").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data.submissionBlockedReason").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void getAssignmentForbiddenWhenUserHasNoRole() throws Exception {
        when(service.getAssignment(any(), anyString()))
                .thenThrow(new BusinessException(HttpStatus.FORBIDDEN, "FORBIDDEN", "无权访问。"));
        Operation op = operations().filter(o -> "getAssignment".equals(o.id())).findFirst().orElseThrow();
        mvc.perform(authenticated(op, STUDENT_TOKEN, true)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
    }

    @Test
    void getWorkspaceHasContractShape() throws Exception {
        Operation op = operations().filter(o -> "getWorkspace".equals(o.id())).findFirst().orElseThrow();
        mvc.perform(authenticated(op, STUDENT_TOKEN, true))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.assignmentId").value(ID))
                .andExpect(jsonPath("$.data.revision").value(1))
                .andExpect(jsonPath("$.data.files[0].path").value("index.html"))
                .andExpect(jsonPath("$.data.files[0].content").value("<h1>Test</h1>"))
                .andExpect(jsonPath("$.data.activeFile").value("index.html"))
                .andExpect(jsonPath("$.data.savedAt").value("2026-10-14T00:00:00Z"))
                .andExpect(jsonPath("$.data.canSave").value(true))
                .andExpect(jsonPath("$.data.saveBlockedReason").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void getWorkspaceReportsSaveBlockedReasonEnum() throws Exception {
        when(service.getWorkspace(any(), anyString())).thenReturn(new WorkspaceDTO(ID, 2,
                List.of(new FileDTO("index.html", "x")), "index.html",
                Instant.parse("2026-10-14T00:00:00Z"), false, "OFFERING_ARCHIVED"));
        Operation op = operations().filter(o -> "getWorkspace".equals(o.id())).findFirst().orElseThrow();
        mvc.perform(authenticated(op, STUDENT_TOKEN, true)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.canSave").value(false))
                .andExpect(jsonPath("$.data.saveBlockedReason").value("OFFERING_ARCHIVED"));
    }

    @Test
    void saveWorkspaceSuccessReturnsWorkspaceShape() throws Exception {
        Operation op = operations().filter(o -> "saveWorkspace".equals(o.id())).findFirst().orElseThrow();
        mvc.perform(authenticated(op, STUDENT_TOKEN, true))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.revision").value(1))
                .andExpect(jsonPath("$.data.assignmentId").value(ID))
                .andExpect(jsonPath("$.data.canSave").value(true));
    }

    @Test
    void archiveWithPendingReviewsReturns409() throws Exception {
        BusinessException pending = new BusinessException(HttpStatus.CONFLICT, "ARCHIVE_PENDING_REVIEWS", "存在未批阅的当前提交，无法归档作业。");
        when(service.archiveAssignment(any(), anyString(), anyString())).thenThrow(pending);
        Operation archive = operations().filter(o -> "archiveAssignment".equals(o.id())).findFirst().orElseThrow();
        mvc.perform(authenticated(archive, TEACHER_TOKEN, true)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("ARCHIVE_PENDING_REVIEWS"));
    }

    // ---- 阶段2：五个教师端作业操作的强形状与错误码断言 ----

    private void assertTeacherAssignmentShape(org.springframework.test.web.servlet.ResultActions result) throws Exception {
        result.andExpect(jsonPath("$.data.id").value(ID))
                .andExpect(jsonPath("$.data.offeringId").value(OFFERING))
                .andExpect(jsonPath("$.data.chapterId").value(CHAPTER))
                .andExpect(jsonPath("$.data.title").value("作业一"))
                .andExpect(jsonPath("$.data.type").value("web_lab"))
                .andExpect(jsonPath("$.data.isRequired").value(true))
                .andExpect(jsonPath("$.data.description").value("说明"))
                .andExpect(jsonPath("$.data.requirements[0]").value("完成功能"))
                .andExpect(jsonPath("$.data.estimatedMinutes").value(30))
                .andExpect(jsonPath("$.data.knowledgePointIds").isArray())
                .andExpect(jsonPath("$.data.dueAt").value("2099-01-01T00:00:00Z"))
                .andExpect(jsonPath("$.data.lateUntil").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data.allowResubmit").value(true))
                .andExpect(jsonPath("$.data.maxAttempts").value(3))
                .andExpect(jsonPath("$.data.maxScore").value(100.0))
                .andExpect(jsonPath("$.data.rubric").isArray())
                .andExpect(jsonPath("$.data.initialFiles").isArray())
                .andExpect(jsonPath("$.data.aiPolicyVersion").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data.publicationState").value("draft"))
                .andExpect(jsonPath("$.data.publishedAt").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data.submittedStudentCount").value(0))
                .andExpect(jsonPath("$.data.pendingReviewCount").value(0))
                // 教师 DTO 不得混入学生视图字段
                .andExpect(jsonPath("$.data.attemptsUsed").doesNotExist())
                .andExpect(jsonPath("$.data.canSubmit").doesNotExist())
                .andExpect(jsonPath("$.data.assignmentState").doesNotExist());
    }

    @Test
    void createAssignmentReturns201TeacherAssignmentShape() throws Exception {
        Operation op = operations().filter(o -> "createAssignment".equals(o.id())).findFirst().orElseThrow();
        assertTeacherAssignmentShape(mvc.perform(authenticated(op, TEACHER_TOKEN, true)).andExpect(status().isCreated()));
    }

    @Test
    void getTeacherAssignmentReturnsFullTeacherDtoWithInitialFiles() throws Exception {
        TeacherAssignmentDTO full = new TeacherAssignmentDTO(null, "作业一", "web_lab", true, "说明",
                List.of("完成功能"), 30, List.of(CHAPTER), FUTURE, FUTURE.plusSeconds(3600), true, 3,
                new BigDecimal("100.00"), List.of(new RubricCriterion("c1", "布局", "说明", new BigDecimal("100.00"))),
                List.of(new FileDTO("index.html", "<h1>x</h1>")), null, ID, OFFERING, "published",
                Instant.parse("2026-10-14T00:00:00Z"), 2, 1);
        when(service.getTeacherAssignment(any(), anyString())).thenReturn(full);
        Operation op = operations().filter(o -> "getTeacherAssignment".equals(o.id())).findFirst().orElseThrow();
        mvc.perform(authenticated(op, TEACHER_TOKEN, true)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.chapterId").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data.publicationState").value("published"))
                .andExpect(jsonPath("$.data.publishedAt").value("2026-10-14T00:00:00Z"))
                .andExpect(jsonPath("$.data.lateUntil").value("2099-01-01T01:00:00Z"))
                .andExpect(jsonPath("$.data.rubric[0].criterionId").value("c1"))
                .andExpect(jsonPath("$.data.rubric[0].title").value("布局"))
                .andExpect(jsonPath("$.data.rubric[0].maxScore").value(100.0))
                .andExpect(jsonPath("$.data.initialFiles[0].path").value("index.html"))
                .andExpect(jsonPath("$.data.initialFiles[0].content").value("<h1>x</h1>"))
                .andExpect(jsonPath("$.data.submittedStudentCount").value(2))
                .andExpect(jsonPath("$.data.pendingReviewCount").value(1));
    }

    @Test
    void patchAssignmentReturns200TeacherAssignmentShape() throws Exception {
        Operation op = operations().filter(o -> "patchAssignment".equals(o.id())).findFirst().orElseThrow();
        assertTeacherAssignmentShape(mvc.perform(authenticated(op, TEACHER_TOKEN, true)).andExpect(status().isOk()));
    }

    @Test
    void publishAssignmentReturns200TeacherAssignmentShape() throws Exception {
        Operation op = operations().filter(o -> "publishAssignment".equals(o.id())).findFirst().orElseThrow();
        assertTeacherAssignmentShape(mvc.perform(authenticated(op, TEACHER_TOKEN, true)).andExpect(status().isOk()));
    }

    @Test
    void archiveAssignmentReturns200TeacherAssignmentShape() throws Exception {
        Operation op = operations().filter(o -> "archiveAssignment".equals(o.id())).findFirst().orElseThrow();
        assertTeacherAssignmentShape(mvc.perform(authenticated(op, TEACHER_TOKEN, true)).andExpect(status().isOk()));
    }

    @Test
    void patchAfterPublishReturns409AssignmentAlreadyPublished() throws Exception {
        when(service.patchAssignment(any(), anyString(), anyMap(), anyString())).thenThrow(
                new BusinessException(HttpStatus.CONFLICT, "ASSIGNMENT_ALREADY_PUBLISHED", "已发布作业不能修改核心字段或缩短提交窗口。"));
        Operation op = operations().filter(o -> "patchAssignment".equals(o.id())).findFirst().orElseThrow();
        mvc.perform(authenticated(op, TEACHER_TOKEN, true)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("ASSIGNMENT_ALREADY_PUBLISHED"));
    }

    @Test
    void publishAndPatchOnArchivedAssignmentReturn409AssignmentArchived() throws Exception {
        BusinessException archived = new BusinessException(HttpStatus.CONFLICT, "ASSIGNMENT_ARCHIVED", "归档作业拒绝继续教学写入。");
        when(service.publishAssignment(any(), anyString(), anyString())).thenThrow(archived);
        when(service.patchAssignment(any(), anyString(), anyMap(), anyString())).thenThrow(archived);
        for (String id : List.of("publishAssignment", "patchAssignment")) {
            Operation op = operations().filter(o -> id.equals(o.id())).findFirst().orElseThrow();
            mvc.perform(authenticated(op, TEACHER_TOKEN, true)).andExpect(status().isConflict())
                    .andExpect(jsonPath("$.error.code").value("ASSIGNMENT_ARCHIVED"));
        }
    }

    @Test
    void archiveDraftReturns409AssignmentNotPublished() throws Exception {
        when(service.archiveAssignment(any(), anyString(), anyString())).thenThrow(
                new BusinessException(HttpStatus.CONFLICT, "ASSIGNMENT_NOT_PUBLISHED", "草稿作业不能归档。"));
        Operation op = operations().filter(o -> "archiveAssignment".equals(o.id())).findFirst().orElseThrow();
        mvc.perform(authenticated(op, TEACHER_TOKEN, true)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("ASSIGNMENT_NOT_PUBLISHED"));
    }

    @Test
    void invalidAssignmentContentReturns422AndUnknownFieldReturns400() throws Exception {
        Operation op = operations().filter(o -> "createAssignment".equals(o.id())).findFirst().orElseThrow();
        org.mockito.Mockito.doThrow(new BusinessException(HttpStatus.UNPROCESSABLE_CONTENT, "VALIDATION_ERROR", "请求参数不符合要求。"))
                .when(service).createAssignment(any(), anyString(), anyMap(), anyString());
        mvc.perform(authenticated(op, TEACHER_TOKEN, true)).andExpect(status().is(422))
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        org.mockito.Mockito.doThrow(new BusinessException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "请求体包含未知字段。"))
                .when(service).createAssignment(any(), anyString(), anyMap(), anyString());
        mvc.perform(authenticated(op, TEACHER_TOKEN, true)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("INVALID_REQUEST"));
    }

    @Test
    void publishAndArchiveRejectNonEmptyBody() throws Exception {
        for (String id : List.of("publishAssignment", "archiveAssignment")) {
            Operation base = operations().filter(o -> id.equals(o.id())).findFirst().orElseThrow();
            Operation op = new Operation(id, base.method(), base.path(), true, "{\"x\":1}", 200, false);
            mvc.perform(authenticated(op, TEACHER_TOKEN, true)).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error.code").value("INVALID_REQUEST"));
        }
    }

    // ---- P1-C 反馈三操作：契约形状、状态码与错误码 ----

    private Operation op(String id) { return operations().filter(o -> id.equals(o.id())).findFirst().orElseThrow(); }

    private void assertTeacherFeedbackShape(org.springframework.test.web.servlet.ResultActions r, int version, String status) throws Exception {
        r.andExpect(jsonPath("$.data.id").value(ID))
                .andExpect(jsonPath("$.data.submissionId").value(ID))
                .andExpect(jsonPath("$.data.offeringId").value(OFFERING))
                .andExpect(jsonPath("$.data.assignmentId").value(ID))
                .andExpect(jsonPath("$.data.assignmentTitle").value("作业一"))
                .andExpect(jsonPath("$.data.version").value(version))
                .andExpect(jsonPath("$.data.status").value(status))
                .andExpect(jsonPath("$.data.score").value(85.0))
                .andExpect(jsonPath("$.data.maxScore").value(100.0))
                .andExpect(jsonPath("$.data.rubricResults[0].criterionId").value("layout"))
                .andExpect(jsonPath("$.data.rubricResults[0].score").value(85.0))
                .andExpect(jsonPath("$.data.rubricResults[0].comment").value("ok"))
                .andExpect(jsonPath("$.data.comment").value("整体不错"))
                .andExpect(jsonPath("$.data.knowledgeEvaluations").isArray())
                .andExpect(jsonPath("$.data.issueTags").isArray())
                .andExpect(jsonPath("$.data.issueTagVersion").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data.teacher.id").value(TEACHER_ID))
                .andExpect(jsonPath("$.data.teacher.displayName").value("教师"))
                .andExpect(jsonPath("$.data.messageId").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data", org.hamcrest.Matchers.hasKey("messageId")))
                .andExpect(jsonPath("$.data", org.hamcrest.Matchers.hasKey("issueTagVersion")))
                .andExpect(jsonPath("$.data.baseVersion").doesNotExist())
                .andExpect(jsonPath("$.data.overallComment").doesNotExist())
                .andExpect(jsonPath("$.data.finalScore").doesNotExist());
        if ("published".equals(status)) r.andExpect(jsonPath("$.data.publishedAt").value("2026-10-14T00:00:00Z"));
        else r.andExpect(jsonPath("$.data.publishedAt").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void saveFeedbackCreatedReturns201AndUpdatedReturns200WithTeacherShape() throws Exception {
        assertTeacherFeedbackShape(mvc.perform(authenticated(op("saveFeedback"), TEACHER_TOKEN, true))
                .andExpect(status().isCreated()), 1, "draft");
        when(service.saveFeedback(any(), anyString(), anyMap(), anyString()))
                .thenReturn(new FeedbackSaveResult(teacherFeedback(2, "draft"), false));
        assertTeacherFeedbackShape(mvc.perform(authenticated(op("saveFeedback"), TEACHER_TOKEN, true))
                .andExpect(status().isOk()), 2, "draft");
    }

    @Test
    void publishFeedbackReturns200WithPublishedTeacherShape() throws Exception {
        assertTeacherFeedbackShape(mvc.perform(authenticated(op("publishFeedback"), TEACHER_TOKEN, true))
                .andExpect(status().isOk()), 2, "published");
    }

    @Test
    void getFeedbackDraftReturnsTeacherFeedbackAndBaseVersion() throws Exception {
        mvc.perform(authenticated(op("getFeedbackDraft"), TEACHER_TOKEN, true)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.baseVersion").value(1))
                .andExpect(jsonPath("$.data.feedback.status").value("draft"))
                .andExpect(jsonPath("$.data.feedback.version").value(1))
                .andExpect(jsonPath("$.data.feedback.messageId").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void getFeedbackReturnsStudentShapeWithMessageId() throws Exception {
        mvc.perform(authenticated(op("getFeedback"), STUDENT_TOKEN, true)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(ID))
                .andExpect(jsonPath("$.data.submissionId").value(ID))
                .andExpect(jsonPath("$.data.offeringId").value(OFFERING))
                .andExpect(jsonPath("$.data.assignmentId").value(ID))
                .andExpect(jsonPath("$.data.assignmentTitle").value("作业一"))
                .andExpect(jsonPath("$.data.version").value(2))
                .andExpect(jsonPath("$.data.status").value("published"))
                .andExpect(jsonPath("$.data.score").value(85.0))
                .andExpect(jsonPath("$.data.maxScore").value(100.0))
                .andExpect(jsonPath("$.data.rubricResults[0].criterionId").value("layout"))
                .andExpect(jsonPath("$.data.comment").value("整体不错"))
                .andExpect(jsonPath("$.data.knowledgeEvaluations").isArray())
                .andExpect(jsonPath("$.data.issueTags").isArray())
                .andExpect(jsonPath("$.data.teacher.displayName").value("教师"))
                .andExpect(jsonPath("$.data.publishedAt").value("2026-10-14T00:00:00Z"))
                .andExpect(jsonPath("$.data.messageId").value(MESSAGE_ID))
                .andExpect(jsonPath("$.data.feedbackId").doesNotExist())
                .andExpect(jsonPath("$.data.finalScore").doesNotExist());
    }

    @Test
    void getFeedbackHidesDraftOtherAndMissingAs404AndRejectsMalformedId() throws Exception {
        when(service.getFeedback(any(), anyString()))
                .thenThrow(new BusinessException(HttpStatus.NOT_FOUND, "NOT_FOUND", "请求的资源不存在。"));
        mvc.perform(authenticated(op("getFeedback"), STUDENT_TOKEN, true)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
        Operation bad = new Operation("getFeedback", "GET", "/api/v1/me/feedback/not-a-uuid", false, null, 200, false);
        mvc.perform(authenticated(bad, STUDENT_TOKEN, true)).andExpect(status().is(422))
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    void feedbackVersionConflictCarriesCurrentVersion() throws Exception {
        BusinessException conflict = new BusinessException(HttpStatus.CONFLICT, "FEEDBACK_VERSION_CONFLICT",
                "评价版本已过期，请刷新后重试。", Map.of("currentVersion", 7));
        when(service.saveFeedback(any(), anyString(), anyMap(), anyString())).thenThrow(conflict);
        when(service.publishFeedback(any(), anyString(), anyMap(), anyString())).thenThrow(conflict);
        for (String id : List.of("saveFeedback", "publishFeedback")) {
            mvc.perform(authenticated(op(id), TEACHER_TOKEN, true)).andExpect(status().isConflict())
                    .andExpect(jsonPath("$.error.code").value("FEEDBACK_VERSION_CONFLICT"))
                    .andExpect(jsonPath("$.error.details.currentVersion").value(7));
        }
    }

    @Test
    void feedbackWriteConflictCodesUseRegisteredNamesAndStatus409() throws Exception {
        for (String code : List.of("SUBMISSION_SUPERSEDED", "ASSIGNMENT_ARCHIVED", "OFFERING_ARCHIVED", "FEEDBACK_ALREADY_PUBLISHED")) {
            org.mockito.Mockito.doThrow(new BusinessException(HttpStatus.CONFLICT, code, "冲突。"))
                    .when(service).saveFeedback(any(), anyString(), anyMap(), anyString());
            mvc.perform(authenticated(op("saveFeedback"), TEACHER_TOKEN, true)).andExpect(status().isConflict())
                    .andExpect(jsonPath("$.error.code").value(code));
        }
        for (String code : List.of("SUBMISSION_SUPERSEDED", "ASSIGNMENT_ARCHIVED", "OFFERING_ARCHIVED")) {
            org.mockito.Mockito.doThrow(new BusinessException(HttpStatus.CONFLICT, code, "冲突。"))
                    .when(service).publishFeedback(any(), anyString(), anyMap(), anyString());
            mvc.perform(authenticated(op("publishFeedback"), TEACHER_TOKEN, true)).andExpect(status().isConflict())
                    .andExpect(jsonPath("$.error.code").value(code));
        }
    }

    @Test
    void feedbackValidationAndUnknownFieldAndHiddenSubmission() throws Exception {
        when(service.saveFeedback(any(), anyString(), anyMap(), anyString())).thenThrow(new BusinessException(
                HttpStatus.UNPROCESSABLE_CONTENT, "VALIDATION_ERROR", "请求参数不符合要求。",
                Map.of("fields", List.of(Map.of("field", "score", "message", "不能超过作业满分。")))));
        mvc.perform(authenticated(op("saveFeedback"), TEACHER_TOKEN, true)).andExpect(status().is(422))
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.error.details.fields[0].field").value("score"));
        org.mockito.Mockito.doThrow(new BusinessException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "请求体包含未知字段。"))
                .when(service).publishFeedback(any(), anyString(), anyMap(), anyString());
        mvc.perform(authenticated(op("publishFeedback"), TEACHER_TOKEN, true)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("INVALID_REQUEST"));
        org.mockito.Mockito.doThrow(new BusinessException(HttpStatus.NOT_FOUND, "NOT_FOUND", "请求的资源不存在。"))
                .when(service).publishFeedback(any(), anyString(), anyMap(), anyString());
        mvc.perform(authenticated(op("publishFeedback"), TEACHER_TOKEN, true)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
    }

    // ---- P1-C 提交与消息：强形状断言 ----

    @Test
    void submitAssignmentCreatedHasSummaryShape() throws Exception {
        mvc.perform(authenticated(op("submitAssignment"), STUDENT_TOKEN, true)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.id").value(ID))
                .andExpect(jsonPath("$.data.attemptNumber").value(1))
                .andExpect(jsonPath("$.data.workspaceRevision").value(1))
                .andExpect(jsonPath("$.data.late").value(false))
                .andExpect(jsonPath("$.data.superseded").value(false))
                .andExpect(jsonPath("$.data.feedbackStatus").value("none"))
                .andExpect(jsonPath("$.data.submittedAt").value("2026-10-14T00:00:00Z"));
    }

    @Test
    void submitAssignmentBlockedCodesAreRegisteredAnd409() throws Exception {
        for (String code : List.of("OFFERING_ARCHIVED", "ASSIGNMENT_ARCHIVED", "SUBMISSION_CLOSED", "RESUBMIT_NOT_ALLOWED",
                "ATTEMPT_LIMIT_REACHED", "RESUBMIT_AFTER_REVIEW")) {
            doThrow(new BusinessException(HttpStatus.CONFLICT, code, "不可提交。"))
                    .when(service).submitAssignment(any(), anyString(), anyMap(), anyString());
            mvc.perform(authenticated(op("submitAssignment"), STUDENT_TOKEN, true)).andExpect(status().isConflict())
                    .andExpect(jsonPath("$.error.code").value(code));
        }
        doThrow(new BusinessException(HttpStatus.CONFLICT, "WORKSPACE_CONFLICT", "工作区版本冲突。", Map.of("currentRevision", 4)))
                .when(service).submitAssignment(any(), anyString(), anyMap(), anyString());
        mvc.perform(authenticated(op("submitAssignment"), STUDENT_TOKEN, true)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("WORKSPACE_CONFLICT"))
                .andExpect(jsonPath("$.error.details.currentRevision").value(4));
    }

    @Test
    void listMySubmissionsHasPageShapeAndEnumFeedbackStatus() throws Exception {
        mvc.perform(authenticated(op("listMySubmissions"), STUDENT_TOKEN, true))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.page").value(1))
                .andExpect(jsonPath("$.data.pageSize").value(20))
                .andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.items[0].attemptNumber").value(1))
                .andExpect(jsonPath("$.data.items[0].feedbackStatus").value(org.hamcrest.Matchers.isOneOf("none", "published")))
                .andExpect(jsonPath("$.data.items[0].student").doesNotExist());
    }

    @Test
    void getSubmissionStudentViewHasContractShape() throws Exception {
        mvc.perform(authenticated(op("getSubmission"), STUDENT_TOKEN, true)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.feedbackStatus").value("none"))
                .andExpect(jsonPath("$.data.files[0].path").value("index.html"))
                .andExpect(jsonPath("$.data.reflection").value("完成"))
                .andExpect(jsonPath("$.data.assignmentSnapshot.title").value("作业一"))
                .andExpect(jsonPath("$.data.assignmentSnapshot.aiPolicyVersion").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data.assignmentSnapshot.knowledgePoints").isArray())
                .andExpect(jsonPath("$.data.publishedFeedback").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data.student").doesNotExist())
                .andExpect(jsonPath("$.data.draftFeedback").doesNotExist());
    }

    @Test
    void getSubmissionTeacherViewHasStudentAndDraftFeedback() throws Exception {
        TeacherSubmissionDetailDTO detail = new TeacherSubmissionDetailDTO(ID, ID, OFFERING, 1, 1,
                Instant.parse("2026-10-14T00:00:00Z"), false, false, "draft",
                new StudentBrief(TEACHER_ID, "student.demo", "张同学"),
                List.of(new FileDTO("index.html", "<h1>Test</h1>")), "完成",
                new AssignmentSnapshot("作业一", List.of("完成功能"), List.of(), new BigDecimal("100.00"),
                        List.of(new KnowledgeSnapshot(CHAPTER, "Flex 布局", "主轴")), 1, FUTURE, null),
                null, teacherFeedback(1, "draft"));
        when(service.getSubmission(any(), anyString())).thenReturn(detail);
        mvc.perform(authenticated(op("getSubmission"), TEACHER_TOKEN, true)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.feedbackStatus").value("draft"))
                .andExpect(jsonPath("$.data.student.id").value(TEACHER_ID))
                .andExpect(jsonPath("$.data.student.username").value("student.demo"))
                .andExpect(jsonPath("$.data.student.displayName").value("张同学"))
                .andExpect(jsonPath("$.data.publishedFeedback").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data.draftFeedback.status").value("draft"))
                .andExpect(jsonPath("$.data.draftFeedback.publishedAt").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data.draftFeedback.messageId").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data.assignmentSnapshot.knowledgePoints[0].title").value("Flex 布局"));
    }

    @Test
    void listTeacherSubmissionsHasNestedStudentAndPassesFilters() throws Exception {
        TeacherSubmissionSummaryDTO row = new TeacherSubmissionSummaryDTO(ID, ID, OFFERING, 2, 3,
                Instant.parse("2026-10-14T00:00:00Z"), true, false, "published",
                new StudentBrief(TEACHER_ID, "student.demo", "张同学"));
        when(service.listTeacherSubmissions(any(), anyString(), nullable(String.class), anyBoolean(), anyInt(), anyInt()))
                .thenReturn(new SubmissionListResponse(List.of(row), 1, 20, 1));
        mvc.perform(authenticated(op("listTeacherSubmissions"), TEACHER_TOKEN, true)
                        .queryParam("feedbackStatus", "published").queryParam("latestOnly", "false"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.items[0].feedbackStatus").value("published"))
                .andExpect(jsonPath("$.data.items[0].late").value(true))
                .andExpect(jsonPath("$.data.items[0].student.id").value(TEACHER_ID))
                .andExpect(jsonPath("$.data.items[0].student.username").value("student.demo"))
                .andExpect(jsonPath("$.data.items[0].student.displayName").value("张同学"));
        org.mockito.Mockito.verify(service).listTeacherSubmissions(any(), eq(ID), eq("published"), eq(false), eq(1), eq(20));
    }

    @Test
    void listTeacherSubmissionsDefaultsLatestOnlyToTrue() throws Exception {
        mvc.perform(authenticated(op("listTeacherSubmissions"), TEACHER_TOKEN, true)).andExpect(status().isOk());
        org.mockito.Mockito.verify(service).listTeacherSubmissions(any(), eq(ID), isNull(), eq(true), eq(1), eq(20));
    }

    @Test
    void listMessagesHasSummaryUnreadCountAndNotificationShape() throws Exception {
        mvc.perform(authenticated(op("listMessages"), STUDENT_TOKEN, true)
                        .queryParam("offeringId", OFFERING).queryParam("type", "feedback").queryParam("read", "unread"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.summary.unreadCount").value(1))
                .andExpect(jsonPath("$.data.unreadCount").doesNotExist())
                .andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.items[0].id").value(MESSAGE_ID))
                .andExpect(jsonPath("$.data.items[0].offeringId").value(OFFERING))
                .andExpect(jsonPath("$.data.items[0].type").value("feedback"))
                .andExpect(jsonPath("$.data.items[0].title").value("作业已获批阅"))
                .andExpect(jsonPath("$.data.items[0].sender.id").value(TEACHER_ID))
                .andExpect(jsonPath("$.data.items[0].readAt").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data.items[0].target.type").value("feedback"))
                .andExpect(jsonPath("$.data.items[0].target.id").value(ID))
                .andExpect(jsonPath("$.data.items[0].target.offeringId").value(OFFERING))
                .andExpect(jsonPath("$.data.items[0].isRead").doesNotExist())
                .andExpect(jsonPath("$.data.items[0].relatedOfferingId").doesNotExist())
                .andExpect(jsonPath("$.data.items[0].relatedAssignmentId").doesNotExist())
                .andExpect(jsonPath("$.data.items[0].relatedFeedbackId").doesNotExist());
        org.mockito.Mockito.verify(service).listMessages(any(), eq(OFFERING), eq("feedback"), eq("unread"), eq(1), eq(20));
    }

    @Test
    void listMessagesInvalidFilterIsValidationError422() throws Exception {
        when(service.listMessages(any(), nullable(String.class), nullable(String.class), nullable(String.class), anyInt(), anyInt()))
                .thenThrow(new BusinessException(HttpStatus.UNPROCESSABLE_CONTENT, "VALIDATION_ERROR", "请求参数不符合要求。",
                        Map.of("fields", List.of(Map.of("field", "type", "message", "不是受支持的消息类型。")))));
        mvc.perform(authenticated(op("listMessages"), STUDENT_TOKEN, true).queryParam("type", "bogus"))
                .andExpect(status().is(422))
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.error.details.fields[0].field").value("type"));
    }

    @Test
    void readMessageReturnsIdAndReadAtOnly() throws Exception {
        mvc.perform(authenticated(op("readMessage"), STUDENT_TOKEN, true)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(MESSAGE_ID))
                .andExpect(jsonPath("$.data.readAt").value("2026-10-14T01:00:00Z"))
                .andExpect(jsonPath("$.data.length()").value(2));
    }

    @Test
    void readMessageOfOthersAndNonEmptyBodyAreRejected() throws Exception {
        when(service.readMessage(any(), anyString(), anyString()))
                .thenThrow(new BusinessException(HttpStatus.NOT_FOUND, "NOT_FOUND", "请求的资源不存在。"));
        mvc.perform(authenticated(op("readMessage"), STUDENT_TOKEN, true)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
        Operation withBody = new Operation("readMessage", "PUT", "/api/v1/me/messages/" + MESSAGE_ID + "/read", false,
                "{\"x\":1}", 200, false);
        mvc.perform(authenticated(withBody, STUDENT_TOKEN, true)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("INVALID_REQUEST"));
        Operation badId = new Operation("readMessage", "PUT", "/api/v1/me/messages/not-a-uuid/read", false, "{}", 200, false);
        mvc.perform(authenticated(badId, STUDENT_TOKEN, true)).andExpect(status().is(422))
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
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
