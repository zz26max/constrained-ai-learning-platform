package com.learningplatform.common.api;

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
import com.learningplatform.modules.courses.dto.CourseDTOs.*;
import com.learningplatform.modules.courses.service.CourseService;
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

/** P1-A 前 11 个端点：通过正式认证、CSRF 与 Controller，Service 替身只隔离数据库。 */
@SpringBootTest(classes = LearningPlatformApplication.class, properties = {
        "spring.flyway.enabled=false", "spring.sql.init.mode=never",
        "DB_URL=jdbc:mysql://127.0.0.1:1/unused", "DB_USERNAME=unused", "DB_PASSWORD=unused",
        "auth.http.pre-login-signing-key=test-signing-key",
        "auth.http.allowed-origins=http://127.0.0.1:4173",
        "AUTH_INVITE_SIGNING_KEY=test-only-invite-signing-key-at-least-32-characters"
})
@AutoConfigureMockMvc
class CourseHttpContractTest {

    private static final String ID = "00000000-0000-4000-8000-000000000021";
    private static final String COURSE = "00000000-0000-4000-8000-000000000022";
    private static final String TERM = "00000000-0000-4000-8000-000000000023";
    private static final String ORIGIN = "http://127.0.0.1:4173";
    private static final String TEACHER_TOKEN = "a".repeat(64);
    private static final String STUDENT_TOKEN = "b".repeat(64);
    private static final String ADMIN_TOKEN = "c".repeat(64);
    private static final String SECRET = "d".repeat(64);
    private static final String REQUEST_ID = "req-p1a-course-test";
    private static final Instant FUTURE = Instant.parse("2099-01-01T00:00:00Z");
    private static final JsonMapper JSON = JsonMapper.builder().findAndAddModules().build();

    @Autowired private MockMvc mvc;
    @Autowired private CsrfTokenService csrf;
    @MockitoBean private DataSource dataSource;
    @MockitoBean private DatabaseSessionService sessions;
    @MockitoBean private CourseService courses;

    record Operation(String id, String method, String path, boolean teacher, String body,
                     int success, boolean paginated) {
        boolean writes() { return !"GET".equals(method); }
    }

    static Stream<Operation> operations() {
        Stream<Operation> base = Stream.of(
                new Operation("listBaseCourses", "GET", "/api/v1/teacher/courses", true, null, 200, true),
                new Operation("listTeacherOfferings", "GET", "/api/v1/teacher/offerings", true, null, 200, true),
                new Operation("createOffering", "POST", "/api/v1/teacher/offerings", true,
                        "{\"courseId\":\"" + COURSE + "\",\"title\":\"虚构教学班\",\"groupName\":\"演示班\",\"termId\":\"" + TERM + "\",\"progressUnit\":\"chapter\"}", 201, false),
                new Operation("getOffering", "GET", "/api/v1/offerings/" + ID, false, null, 200, false),
                new Operation("archiveOffering", "POST", "/api/v1/teacher/offerings/" + ID + "/archive", true, "{}", 200, false),
                new Operation("listMembers", "GET", "/api/v1/teacher/offerings/" + ID + "/members", true, null, 200, true),
                new Operation("listMyCourses", "GET", "/api/v1/me/courses", false, null, 200, true),
                new Operation("createInvite", "POST", "/api/v1/teacher/offerings/" + ID + "/invites", true,
                        "{\"expiresAt\":\"2099-01-01T00:00:00Z\",\"maxUses\":2}", 201, false),
                new Operation("listInvites", "GET", "/api/v1/teacher/offerings/" + ID + "/invites", true, null, 200, true),
                new Operation("revokeInvite", "POST", "/api/v1/teacher/invites/" + ID + "/revoke", true, "{}", 200, false),
                new Operation("enroll", "POST", "/api/v1/me/enrollments", false, "{\"inviteCode\":\"test-one-time-code\"}", 201, false));
        return Stream.concat(base, contentOperations());
    }


    static Stream<Operation> writes() { return operations().filter(Operation::writes); }
    static Stream<Operation> teacherOperations() { return operations().filter(Operation::teacher); }
    static Stream<Operation> studentOperations() {
        return operations().filter(o -> List.of("listMyCourses", "enroll").contains(o.id()));
    }
    static Stream<Operation> paginated() { return operations().filter(Operation::paginated); }
    static Stream<Operation> bodyRequiredFields() {
        return operations().filter(o -> List.of("createOffering", "createInvite", "enroll").contains(o.id()));
    }
    static Stream<Operation> emptyBodies() {
        return operations().filter(o -> List.of("archiveOffering", "revokeInvite").contains(o.id()));
    }
    static Stream<Operation> objectOperations() {
        return operations().filter(o -> List.of("getOffering", "archiveOffering", "listMembers", "createInvite", "listInvites", "revokeInvite",
                "listChapters", "getChapter", "getResource", "updateChapterProgress", "recordLearningPosition",
                "listTeacherChapters", "createChapter", "getTeacherChapter", "patchChapter", "publishChapter",
                "createKnowledgePoint", "listKnowledgePoints", "patchKnowledgePoint", "createResource", "patchResource",
                "archiveResource").contains(o.id()));
    }

    @BeforeEach
    void arrangeNormalServiceResults() throws Exception {
        when(sessions.resolve(TEACHER_TOKEN)).thenReturn(identity(TEACHER_TOKEN, "teacher"));
        when(sessions.resolve(STUDENT_TOKEN)).thenReturn(identity(STUDENT_TOKEN, "student"));
        when(sessions.resolve(ADMIN_TOKEN)).thenReturn(identity(ADMIN_TOKEN, "admin"));
        OfferingDTO offering = JSON.readValue("""
                {"id":"%s","courseId":"%s","title":"虚构教学班","mark":"DEMO","groupName":"演示班",
                "termId":"%s","termLabel":"虚构学期","status":"active","progressUnit":"chapter",
                "teachers":[{"id":"%s","displayName":"虚构教师"}]}
                """.formatted(ID, COURSE, TERM, ID), OfferingDTO.class);
        InviteDTO invite = JSON.readValue("""
                {"id":"%s","expiresAt":"2099-01-01T00:00:00Z","maxUses":2,"usedCount":0,"revokedAt":null,"createdAt":"2026-10-14T00:00:00Z"}
                """.formatted(ID), InviteDTO.class);
        InviteCreatedDTO createdInvite = JSON.readValue("""
                {"id":"%s","expiresAt":"2099-01-01T00:00:00Z","maxUses":2,"usedCount":0,"revokedAt":null,"createdAt":"2026-10-14T00:00:00Z","inviteCode":"test-one-time-code"}
                """.formatted(ID), InviteCreatedDTO.class);
        when(courses.listBaseCourses(any(), anyInt(), anyInt())).thenReturn(new Page<>(List.of(new BaseCourseDTO(COURSE, "虚构基础课程", "DEMO")), 1, 20, 1));
        when(courses.listTeacherOfferings(any(), nullable(String.class), anyInt(), anyInt())).thenReturn(new Page<>(List.of(offering), 1, 20, 1));
        when(courses.createOffering(any(), anyMap(), anyString())).thenReturn(offering);
        when(courses.getOffering(any(), anyString())).thenReturn(offering);
        when(courses.archiveOffering(any(), anyString(), anyString())).thenReturn(offering);
        when(courses.listMembers(any(), anyString(), anyInt(), anyInt())).thenReturn(new Page<>(List.of(new MemberDTO(ID, "虚构教师", "teacher.test", "teacher", Instant.parse("2026-10-14T00:00:00Z"))), 1, 20, 1));
        when(courses.listMyCourses(any(), nullable(String.class), nullable(String.class), anyInt(), anyInt())).thenReturn(new Page<>(List.of(), 1, 20, 0));
        when(courses.createInvite(any(), anyString(), anyMap(), anyString())).thenReturn(createdInvite);
        when(courses.listInvites(any(), anyString(), anyInt(), anyInt())).thenReturn(new Page<>(List.of(invite), 1, 20, 1));
        when(courses.revokeInvite(any(), anyString(), anyString())).thenReturn(new InviteRevokedDTO(ID, Instant.parse("2026-10-14T00:00:00Z")));
        when(courses.enroll(any(), anyMap(), anyString())).thenReturn(new EnrollmentDTO(ID, Instant.parse("2026-10-14T00:00:00Z"), true));

        ChapterProgress chapterProgress = new ChapterProgress("completed", Instant.parse("2026-10-14T00:00:00Z"));
        ProgressDTO progress = new ProgressDTO("chapter", 1, 1, 100, false, Instant.parse("2026-10-14T00:00:00Z"));
        ChapterSummaryDTO chapterSummary = new ChapterSummaryDTO(ID, ID, 1, "第一章", "摘要", true,
                "published", chapterProgress, 1, 1, 0);
        ResourceDTO resource = new ResourceDTO(ID, ID, ID, null, "资料", "markdown", "正文", null, 1, false);
        KnowledgePointDTO knowledgePoint = new KnowledgePointDTO(ID, ID, ID, "知识点", "说明", 1);
        when(courses.listChapters(any(), anyString())).thenReturn(new ChapterListDTO(ID, List.of(chapterSummary)));
        when(courses.getChapter(any(), anyString())).thenReturn(new ChapterDetailDTO(ID, ID, 1, "第一章", "摘要", true,
                "published", chapterProgress, 1, 1, 0, List.of(resource), List.of(knowledgePoint), List.of()));
        when(courses.getResource(any(), anyString())).thenReturn(resource);
        when(courses.updateChapterProgress(any(), anyString(), anyMap(), anyString()))
                .thenReturn(new ChapterProgressDTO(ID, chapterProgress, progress));
        when(courses.recordLearningPosition(any(), anyMap(), anyString()))
                .thenReturn(new LearningPositionDTO(ID, ID, Instant.parse("2026-10-14T00:00:00Z")));
        TeacherChapterSummaryDTO teacherSummary = new TeacherChapterSummaryDTO(ID, ID, 1, "第一章", "摘要", true,
                "published", null, 1, 1, 0);
        when(courses.listTeacherChapters(any(), anyString())).thenReturn(new TeacherChapterListDTO(ID, List.of(teacherSummary)));
        when(courses.createChapter(any(), anyString(), anyMap(), anyString())).thenReturn(teacherSummary);
        when(courses.getTeacherChapter(any(), anyString())).thenReturn(new TeacherChapterDetailDTO(ID, ID, 1, "第一章", "摘要", true,
                "published", null, 1, 1, 0, List.of(resource), List.of(knowledgePoint), List.of()));
        when(courses.patchChapter(any(), anyString(), anyMap(), anyString())).thenReturn(teacherSummary);
        when(courses.publishChapter(any(), anyString(), anyString())).thenReturn(teacherSummary);
        when(courses.createKnowledgePoint(any(), anyString(), anyMap(), anyString())).thenReturn(knowledgePoint);
        when(courses.listKnowledgePoints(any(), anyString())).thenReturn(new KnowledgePointListDTO(ID, List.of(knowledgePoint)));
        when(courses.patchKnowledgePoint(any(), anyString(), anyMap(), anyString())).thenReturn(knowledgePoint);
        when(courses.createResource(any(), anyString(), anyMap(), anyString())).thenReturn(resource);
        when(courses.patchResource(any(), anyString(), anyMap(), anyString())).thenReturn(resource);
        when(courses.archiveResource(any(), anyString(), anyString())).thenReturn(new ResourceArchiveDTO(ID, true));
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
            // 匿名写请求先提供有效的预登录 CSRF，确保这里验证的是 401，而不是提前触发 403。
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

    @ParameterizedTest(name = "{0}") @MethodSource("studentOperations")
    void teacherCannotUseStudentOperationWithoutStudentRole(Operation op) throws Exception {
        mvc.perform(authenticated(op, TEACHER_TOKEN, true)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
    }

    @ParameterizedTest(name = "{0}") @MethodSource("objectOperations")
    void privateObjectRejectionRemainsNotFound(Operation op) throws Exception {
        BusinessException hidden = new BusinessException(HttpStatus.NOT_FOUND, "NOT_FOUND", "对象不存在。");
        switch (op.id()) {
            case "getOffering" -> when(courses.getOffering(any(), anyString())).thenThrow(hidden);
            case "archiveOffering" -> when(courses.archiveOffering(any(), anyString(), anyString())).thenThrow(hidden);
            case "listMembers" -> when(courses.listMembers(any(), anyString(), anyInt(), anyInt())).thenThrow(hidden);
            case "createInvite" -> when(courses.createInvite(any(), anyString(), anyMap(), anyString())).thenThrow(hidden);
            case "listInvites" -> when(courses.listInvites(any(), anyString(), anyInt(), anyInt())).thenThrow(hidden);
            case "revokeInvite" -> when(courses.revokeInvite(any(), anyString(), anyString())).thenThrow(hidden);
            case "listChapters" -> when(courses.listChapters(any(), anyString())).thenThrow(hidden);
            case "getChapter" -> when(courses.getChapter(any(), anyString())).thenThrow(hidden);
            case "getResource" -> when(courses.getResource(any(), anyString())).thenThrow(hidden);
            case "updateChapterProgress" -> when(courses.updateChapterProgress(any(), anyString(), anyMap(), anyString())).thenThrow(hidden);
            case "recordLearningPosition" -> when(courses.recordLearningPosition(any(), anyMap(), anyString())).thenThrow(hidden);
            case "listTeacherChapters" -> when(courses.listTeacherChapters(any(), anyString())).thenThrow(hidden);
            case "createChapter" -> when(courses.createChapter(any(), anyString(), anyMap(), anyString())).thenThrow(hidden);
            case "getTeacherChapter" -> when(courses.getTeacherChapter(any(), anyString())).thenThrow(hidden);
            case "patchChapter" -> when(courses.patchChapter(any(), anyString(), anyMap(), anyString())).thenThrow(hidden);
            case "publishChapter" -> when(courses.publishChapter(any(), anyString(), anyString())).thenThrow(hidden);
            case "createKnowledgePoint" -> when(courses.createKnowledgePoint(any(), anyString(), anyMap(), anyString())).thenThrow(hidden);
            case "listKnowledgePoints" -> when(courses.listKnowledgePoints(any(), anyString())).thenThrow(hidden);
            case "patchKnowledgePoint" -> when(courses.patchKnowledgePoint(any(), anyString(), anyMap(), anyString())).thenThrow(hidden);
            case "createResource" -> when(courses.createResource(any(), anyString(), anyMap(), anyString())).thenThrow(hidden);
            case "patchResource" -> when(courses.patchResource(any(), anyString(), anyMap(), anyString())).thenThrow(hidden);
            case "archiveResource" -> when(courses.archiveResource(any(), anyString(), anyString())).thenThrow(hidden);
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

    @ParameterizedTest(name = "{0}") @MethodSource("malformedWrites")
    void malformedWriteBodyIsRejected(Operation op) throws Exception {
        mvc.perform(authenticated(op, op.teacher() ? TEACHER_TOKEN : STUDENT_TOKEN, true).content("{"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("INVALID_REQUEST"));
    }

    static Stream<Operation> malformedWrites() {
        return writes().filter(o -> o.body() != null && !"DELETE".equals(o.method()));
    }

    @ParameterizedTest(name = "{0}") @MethodSource("bodyRequiredFields")
    void missingRequiredWriteFieldsAreRejected(Operation op) throws Exception {
        mvc.perform(authenticated(op, op.teacher() ? TEACHER_TOKEN : STUDENT_TOKEN, true).content("{}"))
                .andExpect(status().is(422)).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @ParameterizedTest(name = "{0}") @MethodSource("emptyBodies")
    void emptyOnlyBodyRejectsUnknownFields(Operation op) throws Exception {
        mvc.perform(authenticated(op, TEACHER_TOKEN, true).content("{\"unexpected\":true}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("INVALID_REQUEST"));
    }

    @ParameterizedTest(name = "{0}") @MethodSource("paginated")
    void invalidPageIsRejected(Operation op) throws Exception {
        mvc.perform(authenticated(op, op.teacher() ? TEACHER_TOKEN : STUDENT_TOKEN, true).queryParam("page", "0"))
                .andExpect(status().is(422)).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    void existingEnrollmentReturns200WithoutCreatingAnotherMembership() throws Exception {
        when(courses.enroll(any(), anyMap(), anyString())).thenReturn(new EnrollmentDTO(ID, Instant.parse("2026-10-14T00:00:00Z"), false));
        Operation enroll = operations().filter(o -> "enroll".equals(o.id())).findFirst().orElseThrow();
        mvc.perform(authenticated(enroll, STUDENT_TOKEN, true)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.created").value(false));
    }


    @ParameterizedTest(name = "{0}")
    @MethodSource("invalidContentBodies")
    void invalidContentBodyReturnsValidationError(Operation op) throws Exception {
        BusinessException invalid = new BusinessException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", "请求字段无效。");
        switch (op.id()) {
            case "updateChapterProgress" -> when(courses.updateChapterProgress(any(), anyString(), anyMap(), anyString())).thenThrow(invalid);
            case "recordLearningPosition" -> when(courses.recordLearningPosition(any(), anyMap(), anyString())).thenThrow(invalid);
            case "createChapter" -> when(courses.createChapter(any(), anyString(), anyMap(), anyString())).thenThrow(invalid);
            case "patchChapter" -> when(courses.patchChapter(any(), anyString(), anyMap(), anyString())).thenThrow(invalid);
            case "createKnowledgePoint" -> when(courses.createKnowledgePoint(any(), anyString(), anyMap(), anyString())).thenThrow(invalid);
            case "patchKnowledgePoint" -> when(courses.patchKnowledgePoint(any(), anyString(), anyMap(), anyString())).thenThrow(invalid);
            case "createResource" -> when(courses.createResource(any(), anyString(), anyMap(), anyString())).thenThrow(invalid);
            case "patchResource" -> when(courses.patchResource(any(), anyString(), anyMap(), anyString())).thenThrow(invalid);
            default -> throw new AssertionError(op.id());
        }
        mvc.perform(authenticated(op, op.teacher() ? TEACHER_TOKEN : STUDENT_TOKEN, true).content("{}"))
                .andExpect(status().is(422)).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    static Stream<Operation> invalidContentBodies() {
        return contentOperations().filter(o -> o.writes() && List.of("updateChapterProgress", "recordLearningPosition", "createChapter",
                "patchChapter", "createKnowledgePoint", "patchKnowledgePoint", "createResource", "patchResource").contains(o.id()));
    }

    private static Stream<Operation> contentOperations() {
        return Stream.of(
                new Operation("listChapters", "GET", "/api/v1/offerings/" + ID + "/chapters", false, null, 200, false),
                new Operation("getChapter", "GET", "/api/v1/chapters/" + ID, false, null, 200, false),
                new Operation("getResource", "GET", "/api/v1/resources/" + ID, false, null, 200, false),
                new Operation("updateChapterProgress", "PUT", "/api/v1/chapters/" + ID + "/progress", false, "{\"status\":\"completed\"}", 200, false),
                new Operation("recordLearningPosition", "POST", "/api/v1/me/learning-position", false, "{\"offeringId\":\"" + ID + "\",\"chapterId\":\"" + TERM + "\"}", 200, false),
                new Operation("listTeacherChapters", "GET", "/api/v1/teacher/offerings/" + ID + "/chapters", true, null, 200, false),
                new Operation("createChapter", "POST", "/api/v1/teacher/offerings/" + ID + "/chapters", true, "{\"number\":1,\"title\":\"一\",\"summary\":\"一\",\"isRequired\":true}", 201, false),
                new Operation("getTeacherChapter", "GET", "/api/v1/teacher/chapters/" + ID, true, null, 200, false),
                new Operation("patchChapter", "PATCH", "/api/v1/teacher/chapters/" + ID, true, "{\"title\":\"二\"}", 200, false),
                new Operation("publishChapter", "POST", "/api/v1/teacher/chapters/" + ID + "/publish", true, "{}", 200, false),
                new Operation("createKnowledgePoint", "POST", "/api/v1/teacher/offerings/" + ID + "/knowledge-points", true, "{\"title\":\"点\",\"description\":\"点\",\"order\":1}", 201, false),
                new Operation("listKnowledgePoints", "GET", "/api/v1/teacher/offerings/" + ID + "/knowledge-points", true, null, 200, false),
                new Operation("patchKnowledgePoint", "PATCH", "/api/v1/teacher/knowledge-points/" + ID, true, "{\"title\":\"点2\"}", 200, false),
                new Operation("createResource", "POST", "/api/v1/teacher/chapters/" + ID + "/resources", true, "{\"title\":\"资料\",\"type\":\"markdown\",\"content\":\"正文\",\"url\":null,\"order\":1}", 201, false),
                new Operation("patchResource", "PATCH", "/api/v1/teacher/resources/" + ID, true, "{\"title\":\"资料2\"}", 200, false),
                new Operation("archiveResource", "DELETE", "/api/v1/teacher/resources/" + ID, true, "{}", 200, false));
    }

    @Test
    void malformedOfferingIdIsRejected() throws Exception {
        Operation op = new Operation("getOffering", "GET", "/api/v1/offerings/not-a-uuid", false, null, 200, false);
        mvc.perform(authenticated(op, STUDENT_TOKEN, true)).andExpect(status().is(422))
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
        UserDTO user = new UserDTO(ID, role + ".test", "虚构用户", List.of(role));
        return new SessionIdentity(id, user, SECRET, FUTURE, FUTURE);
    }
}
