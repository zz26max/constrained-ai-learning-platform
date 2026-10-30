package com.learningplatform.common.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;

import com.learningplatform.LearningPlatformApplication;
import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.auth.model.SessionIdentity;
import com.learningplatform.modules.auth.security.CsrfTokenService;
import com.learningplatform.modules.auth.service.DatabaseSessionService;
import com.learningplatform.modules.courses.dto.AssignmentDTOs.*;
import com.learningplatform.modules.courses.dto.CourseDTOs;
import com.learningplatform.modules.analytics.dto.OfferingAnalyticsDTOs.*;
import com.learningplatform.modules.analytics.service.OfferingAnalyticsService;
import com.learningplatform.modules.courses.service.NoticeService;
import com.learningplatform.modules.courses.service.TeacherStatsService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** P1-D 公告与教师统计：listNotices / getNotice / createNotice / getOfferingStats / getAssignmentStats / getStudentLearningRecords / P2 教师分析。 */
@SpringBootTest(classes = LearningPlatformApplication.class, properties = {
        "spring.flyway.enabled=false", "spring.sql.init.mode=never",
        "DB_URL=jdbc:mysql://127.0.0.1:1/unused", "DB_USERNAME=unused", "DB_PASSWORD=unused",
        "auth.http.pre-login-signing-key=test-signing-key",
        "auth.http.allowed-origins=http://127.0.0.1:4173",
        "AUTH_INVITE_SIGNING_KEY=test-only-invite-signing-key-at-least-32-characters"
})
@AutoConfigureMockMvc
class NoticeStatsHttpContractTest {

    private static final String ID = "00000000-0000-4000-8000-0000000000a1";
    private static final String OFFERING = "00000000-0000-4000-8000-0000000000a2";
    private static final String STUDENT_ID = "00000000-0000-4000-8000-0000000000a3";
    private static final String ORIGIN = "http://127.0.0.1:4173";
    private static final String STUDENT_TOKEN = "s".repeat(64);
    private static final String TEACHER_TOKEN = "t".repeat(64);
    private static final String SECRET = "x".repeat(64);
    private static final String REQUEST_ID = "req-p1d-notice-test";
    private static final Instant FUTURE = Instant.parse("2099-01-01T00:00:00Z");
    private static final Instant T = Instant.parse("2026-10-14T00:00:00Z");

    @Autowired private MockMvc mvc;
    @Autowired private CsrfTokenService csrf;
    @MockitoBean private DataSource dataSource;
    @MockitoBean private DatabaseSessionService sessions;
    @MockitoBean private NoticeService notices;
    @MockitoBean private TeacherStatsService stats;
    @MockitoBean private OfferingAnalyticsService analytics;

    private static final NoticeDTO NOTICE = new NoticeDTO(ID, OFFERING, "公告标题", "公告内容", null, T, 3);

    @BeforeEach
    void arrange() throws Exception {
        when(sessions.resolve(STUDENT_TOKEN)).thenReturn(identity("student"));
        when(sessions.resolve(TEACHER_TOKEN)).thenReturn(identity("teacher"));
        when(notices.createNotice(any(), any(), any(), any())).thenReturn(NOTICE);
        when(notices.listNotices(anyString(), any(), anyInt(), anyInt())).thenReturn(new NoticePage(List.of(NOTICE), 1, 20, 1));
        when(notices.getNotice(anyString(), any())).thenReturn(NOTICE);
        when(stats.getOfferingStats(anyString(), any())).thenReturn(new OfferingStatsDTO(30, 4, 7, 0));
        when(stats.getAssignmentStats(anyString(), any())).thenReturn(new AssignmentStatsDTO(30, 20, 5, 15, List.of()));
        when(stats.getStudentLearningRecords(anyString(), anyString(), any(), anyInt(), anyInt())).thenReturn(teacherRecords());
        when(analytics.activity(anyString(), any())).thenReturn(activity());
        when(analytics.mastery(anyString(), any())).thenReturn(mastery());
    }

    private static TeacherFeedbackDTO teacherFeedback() {
        return new TeacherFeedbackDTO(ID, ID, OFFERING, ID, "作业一", 2, "published", new BigDecimal("85.00"),
                new BigDecimal("100.00"), List.of(new RubricResultDTO("layout", new BigDecimal("85.00"), "ok")),
                "整体不错", List.of(), List.of(), null, new CourseDTOs.TeacherBrief(ID, "教师"), T, null);
    }

    private static TeacherLearningRecordsDTO teacherRecords() {
        TeacherFeedbackDTO fb = teacherFeedback();
        return new TeacherLearningRecordsDTO(OFFERING, new LearningSummary(1, 1, null), fb,
                new TeacherFeedbackPage(List.of(fb), 1, 20, 1), List.of(), null,
                new StudentBrief(STUDENT_ID, "stu", "学生"));
    }

    private static OfferingActivityDTO activity() {
        return new OfferingActivityDTO(OFFERING, "2026-10-01", "2026-10-14",
                List.of(new ActivityDayDTO("2026-10-14", 2, 3, 1, 2, 1, 2, 1, 1, 1)),
                new ActivityTotalsDTO(2, 3, 1, 2, 1, 2, 1, 1, 1));
    }

    private static OfferingKnowledgeMasteryDTO mastery() {
        KnowledgeStateDistributionDTO distribution = new KnowledgeStateDistributionDTO(1, 0, 0, 1);
        return new OfferingKnowledgeMasteryDTO(OFFERING, "knowledge-v2", T, 2, 1, 1,
                new KnowledgeMasterySummaryDTO(2, distribution, new BigDecimal("0.5")),
                List.of(new KnowledgeMasteryItemDTO(ID, "事件绑定", null, 2, 1, distribution, new BigDecimal("0.5"))));
    }

    // ---------- NoticeDTO / NoticePage ----------

    @Test
    void createNoticeReturns201WithContractNoticeDto() throws Exception {
        mvc.perform(post("{\"title\":\"公告标题\",\"content\":\"公告内容\"}", TEACHER_TOKEN, true)).andExpect(status().isCreated())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("X-Request-ID", REQUEST_ID))
                .andExpect(jsonPath("$.requestId").value(REQUEST_ID))
                .andExpect(jsonPath("$.data.length()").value(7))
                .andExpect(jsonPath("$.data.id").value(ID))
                .andExpect(jsonPath("$.data.offeringId").value(OFFERING))
                .andExpect(jsonPath("$.data.title").value("公告标题"))
                .andExpect(jsonPath("$.data.content").value("公告内容"))
                .andExpect(jsonPath("$.data.target").value(nullValue()))
                .andExpect(jsonPath("$.data.createdAt").value("2026-10-14T00:00:00Z"))
                .andExpect(jsonPath("$.data.recipientCount").value(3))
                .andExpect(jsonPath("$.data.authorId").doesNotExist())
                .andExpect(jsonPath("$.data.authorName").doesNotExist())
                .andExpect(jsonPath("$.data.targetStudentId").doesNotExist());
    }

    @Test
    void listNoticesReturnsNoticePageWithoutTotalPages() throws Exception {
        mvc.perform(get("/api/v1/offerings/" + OFFERING + "/notices", STUDENT_TOKEN)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.data.length()").value(4))
                .andExpect(jsonPath("$.data.page").value(1))
                .andExpect(jsonPath("$.data.pageSize").value(20))
                .andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.totalPages").doesNotExist())
                .andExpect(jsonPath("$.data.items", hasSize(1)))
                .andExpect(jsonPath("$.data.items[0].length()").value(7))
                .andExpect(jsonPath("$.data.items[0].recipientCount").value(3))
                .andExpect(jsonPath("$.data.items[0].target").value(nullValue()));
    }

    @Test
    void getNoticeReturnsNoticeDto() throws Exception {
        mvc.perform(get("/api/v1/notices/" + ID, STUDENT_TOKEN)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(7))
                .andExpect(jsonPath("$.data.id").value(ID))
                .andExpect(jsonPath("$.data.recipientCount").value(3));
    }

    @Test
    void noticeEndpointsMapServiceErrorsAndValidateIds() throws Exception {
        when(notices.getNotice(anyString(), any())).thenThrow(new BusinessException(HttpStatus.NOT_FOUND, "NOT_FOUND", "请求的资源不存在。"));
        mvc.perform(get("/api/v1/notices/" + ID, STUDENT_TOKEN)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
        mvc.perform(get("/api/v1/notices/not-a-uuid", STUDENT_TOKEN)).andExpect(status().is(422))
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        mvc.perform(get("/api/v1/offerings/not-a-uuid/notices", STUDENT_TOKEN)).andExpect(status().is(422))
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        mvc.perform(get("/api/v1/offerings/" + OFFERING + "/notices", STUDENT_TOKEN).queryParam("pageSize", "101"))
                .andExpect(status().is(422)).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        mvc.perform(get("/api/v1/offerings/" + OFFERING + "/notices", STUDENT_TOKEN).queryParam("page", "0"))
                .andExpect(status().is(422)).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    void createNoticeMapsForbiddenArchivedAndValidationErrors() throws Exception {
        doThrow(new BusinessException(HttpStatus.FORBIDDEN, "FORBIDDEN", "权限不足。"))
                .when(notices).createNotice(any(), any(), any(), any());
        mvc.perform(post("{\"title\":\"a\",\"content\":\"b\"}", STUDENT_TOKEN, true)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
        doThrow(new BusinessException(HttpStatus.CONFLICT, "OFFERING_ARCHIVED", "教学班已归档。"))
                .when(notices).createNotice(any(), any(), any(), any());
        mvc.perform(post("{\"title\":\"a\",\"content\":\"b\"}", TEACHER_TOKEN, true)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("OFFERING_ARCHIVED"));
        doThrow(new BusinessException(HttpStatus.UNPROCESSABLE_CONTENT,
                "VALIDATION_ERROR", "请求参数不符合要求。", Map.of("fields", List.of(Map.of("field", "title", "message", "长度")))))
                .when(notices).createNotice(any(), any(), any(), any());
        mvc.perform(post("{\"title\":\"\",\"content\":\"b\"}", TEACHER_TOKEN, true)).andExpect(status().is(422))
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.error.details.fields[0].field").value("title"));
    }

    @Test
    void createNoticeRequiresCsrfAuthenticationAndJson() throws Exception {
        mvc.perform(post("{\"title\":\"a\",\"content\":\"b\"}", TEACHER_TOKEN, false)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("CSRF_INVALID"));
        CsrfTokenService.PreAuthTicket ticket = csrf.issuePreAuth();
        mvc.perform(request(HttpMethod.POST, "/api/v1/teacher/offerings/" + OFFERING + "/notices")
                        .cookie(new Cookie("lp_pre_auth", ticket.cookieValue())).header("Origin", ORIGIN)
                        .header("X-CSRF-Token", ticket.token()).header("X-Request-ID", REQUEST_ID)
                        .contentType(MediaType.APPLICATION_JSON).content("{}").accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.error.code").value("UNAUTHENTICATED"));
        mvc.perform(post("{broken", TEACHER_TOKEN, true)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("INVALID_REQUEST"));
    }

    // ---------- Stats ----------

    @Test
    void getOfferingStatsHasContractShape() throws Exception {
        mvc.perform(get("/api/v1/teacher/offerings/" + OFFERING + "/stats", TEACHER_TOKEN)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.data.length()").value(4))
                .andExpect(jsonPath("$.data.studentCount").value(30))
                .andExpect(jsonPath("$.data.activeAssignmentCount").value(4))
                .andExpect(jsonPath("$.data.pendingReviewCount").value(7))
                .andExpect(jsonPath("$.data.pendingHelpCount").value(0));
    }

    @Test
    void getAssignmentStatsHasContractShape() throws Exception {
        mvc.perform(get("/api/v1/teacher/assignments/" + ID + "/stats", TEACHER_TOKEN)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(5))
                .andExpect(jsonPath("$.data.studentCount").value(30))
                .andExpect(jsonPath("$.data.submittedStudentCount").value(20))
                .andExpect(jsonPath("$.data.pendingReviewCount").value(5))
                .andExpect(jsonPath("$.data.reviewedStudentCount").value(15))
                .andExpect(jsonPath("$.data.commonIssues", hasSize(0)))
                .andExpect(jsonPath("$.data.avgScore").doesNotExist());
    }

    @Test
    void statsRejectNonMembersAndMalformedIds() throws Exception {
        when(stats.getOfferingStats(anyString(), any())).thenThrow(new BusinessException(HttpStatus.NOT_FOUND, "NOT_FOUND", "请求的资源不存在。"));
        mvc.perform(get("/api/v1/teacher/offerings/" + OFFERING + "/stats", TEACHER_TOKEN)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
        when(stats.getAssignmentStats(anyString(), any())).thenThrow(new BusinessException(HttpStatus.FORBIDDEN, "FORBIDDEN", "权限不足。"));
        mvc.perform(get("/api/v1/teacher/assignments/" + ID + "/stats", STUDENT_TOKEN)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
        mvc.perform(get("/api/v1/teacher/offerings/not-a-uuid/stats", TEACHER_TOKEN)).andExpect(status().is(422))
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        mvc.perform(get("/api/v1/teacher/assignments/not-a-uuid/stats", TEACHER_TOKEN)).andExpect(status().is(422))
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    // ---------- P2 offering analytics ----------

    @Test
    void getOfferingActivityHasContractShape() throws Exception {
        mvc.perform(get("/api/v1/teacher/offerings/" + OFFERING + "/activity", TEACHER_TOKEN))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("X-Request-ID", REQUEST_ID))
                .andExpect(jsonPath("$.requestId").value(REQUEST_ID))
                .andExpect(jsonPath("$.data.length()").value(5))
                .andExpect(jsonPath("$.data.offeringId").value(OFFERING))
                .andExpect(jsonPath("$.data.from").value("2026-10-01"))
                .andExpect(jsonPath("$.data.to").value("2026-10-14"))
                .andExpect(jsonPath("$.data.days", hasSize(1)))
                .andExpect(jsonPath("$.data.days[0].length()").value(10))
                .andExpect(jsonPath("$.data.days[0].date").value("2026-10-14"))
                .andExpect(jsonPath("$.data.days[0].activeStudentCount").value(2))
                .andExpect(jsonPath("$.data.days[0].workspaceSavedCount").value(2))
                .andExpect(jsonPath("$.data.days[0].tutoringCompletedCount").value(1))
                .andExpect(jsonPath("$.data.totals.length()").value(9))
                .andExpect(jsonPath("$.data.totals.activeStudentCount").value(2))
                .andExpect(jsonPath("$.data.totals.helpRequestCreatedCount").value(1));
    }

    @Test
    void getOfferingKnowledgeMasteryHasContractShape() throws Exception {
        mvc.perform(get("/api/v1/teacher/offerings/" + OFFERING + "/knowledge-mastery", TEACHER_TOKEN))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("X-Request-ID", REQUEST_ID))
                .andExpect(jsonPath("$.data.length()").value(8))
                .andExpect(jsonPath("$.data.offeringId").value(OFFERING))
                .andExpect(jsonPath("$.data.ruleVersion").value("knowledge-v2"))
                .andExpect(jsonPath("$.data.asOf").value("2026-10-14T00:00:00Z"))
                .andExpect(jsonPath("$.data.studentCount").value(2))
                .andExpect(jsonPath("$.data.assessedStudentCount").value(1))
                .andExpect(jsonPath("$.data.knowledgePointCount").value(1))
                .andExpect(jsonPath("$.data.summary.length()").value(3))
                .andExpect(jsonPath("$.data.summary.assessmentCount").value(2))
                .andExpect(jsonPath("$.data.summary.distribution.length()").value(4))
                .andExpect(jsonPath("$.data.summary.distribution.basicallyMastered").value(1))
                .andExpect(jsonPath("$.data.summary.distribution.insufficientEvidence").value(1))
                .andExpect(jsonPath("$.data.summary.masteryRate").value(0.5))
                .andExpect(jsonPath("$.data.items", hasSize(1)))
                .andExpect(jsonPath("$.data.items[0].length()").value(7))
                .andExpect(jsonPath("$.data.items[0].title").value("事件绑定"))
                .andExpect(jsonPath("$.data.items[0].chapterId").value(nullValue()))
                .andExpect(jsonPath("$.data.items[0].masteryRate").value(0.5));
    }

    @Test
    void offeringAnalyticsMapServiceErrors() throws Exception {
        when(analytics.activity(anyString(), any()))
                .thenThrow(new BusinessException(HttpStatus.FORBIDDEN, "FORBIDDEN", "权限不足。"));
        mvc.perform(get("/api/v1/teacher/offerings/" + OFFERING + "/activity", STUDENT_TOKEN))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
        when(analytics.mastery(anyString(), any()))
                .thenThrow(new BusinessException(HttpStatus.NOT_FOUND, "NOT_FOUND", "请求的资源不存在。"));
        mvc.perform(get("/api/v1/teacher/offerings/" + OFFERING + "/knowledge-mastery", TEACHER_TOKEN))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
    }

    // ---------- getStudentLearningRecords ----------

    @Test
    void getStudentLearningRecordsHasTeacherContractShape() throws Exception {
        mvc.perform(get(recordsPath(STUDENT_ID), TEACHER_TOKEN)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.data.length()").value(7))
                .andExpect(jsonPath("$.data.offeringId").value(OFFERING))
                .andExpect(jsonPath("$.data.summary.length()").value(3))
                .andExpect(jsonPath("$.data.summary.completedLabCount").value(1))
                .andExpect(jsonPath("$.data.summary.publishedFeedbackCount").value(1))
                .andExpect(jsonPath("$.data.summary.needsPracticeCount").value(nullValue()))
                .andExpect(jsonPath("$.data.recentFeedback.status").value("published"))
                .andExpect(jsonPath("$.data.recentFeedback.messageId").value(nullValue()))
                .andExpect(jsonPath("$.data.recentFeedback.length()").value(17))
                .andExpect(jsonPath("$.data.feedbackPage.length()").value(4))
                .andExpect(jsonPath("$.data.feedbackPage.items", hasSize(1)))
                .andExpect(jsonPath("$.data.feedbackPage.page").value(1))
                .andExpect(jsonPath("$.data.feedbackPage.pageSize").value(20))
                .andExpect(jsonPath("$.data.feedbackPage.total").value(1))
                .andExpect(jsonPath("$.data.knowledgeEvidence", hasSize(0)))
                .andExpect(jsonPath("$.data.nextRecommendation").value(nullValue()))
                .andExpect(jsonPath("$.data.student.length()").value(3))
                .andExpect(jsonPath("$.data.student.id").value(STUDENT_ID))
                .andExpect(jsonPath("$.data.student.username").value("stu"))
                .andExpect(jsonPath("$.data.student.displayName").value("学生"))
                .andExpect(jsonPath("$.data.feedbackPage.totalPages").doesNotExist())
                .andExpect(jsonPath("$.data.completedChapterCount").doesNotExist());
    }

    @Test
    void getStudentLearningRecordsErrorsAndPaging() throws Exception {
        when(stats.getStudentLearningRecords(anyString(), anyString(), any(), anyInt(), anyInt()))
                .thenThrow(new BusinessException(HttpStatus.NOT_FOUND, "NOT_FOUND", "请求的资源不存在。"));
        mvc.perform(get(recordsPath(STUDENT_ID), TEACHER_TOKEN)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
        mvc.perform(get(recordsPath("not-a-uuid"), TEACHER_TOKEN)).andExpect(status().is(422))
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        mvc.perform(get(recordsPath(STUDENT_ID), TEACHER_TOKEN).queryParam("pageSize", "0")).andExpect(status().is(422))
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        mvc.perform(get("/api/v1/teacher/offerings/not-a-uuid/students/" + STUDENT_ID + "/learning-records", TEACHER_TOKEN))
                .andExpect(status().is(422)).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    private static String recordsPath(String studentId) {
        return "/api/v1/teacher/offerings/" + OFFERING + "/students/" + studentId + "/learning-records";
    }

    private MockHttpServletRequestBuilder get(String path, String token) {
        return request(HttpMethod.GET, path).header("X-Request-ID", REQUEST_ID).accept(MediaType.APPLICATION_JSON)
                .cookie(new Cookie("lp_session", token));
    }

    private MockHttpServletRequestBuilder post(String body, String token, boolean validCsrf) {
        MockHttpServletRequestBuilder b = request(HttpMethod.POST, "/api/v1/teacher/offerings/" + OFFERING + "/notices")
                .header("X-Request-ID", REQUEST_ID).accept(MediaType.APPLICATION_JSON).contentType(MediaType.APPLICATION_JSON)
                .content(body).cookie(new Cookie("lp_session", token)).header("Origin", ORIGIN);
        if (validCsrf) b.header("X-CSRF-Token", csrf.sessionToken(token, SECRET));
        return b;
    }

    private SessionIdentity identity(String role) {
        UserDTO user = new UserDTO(ID, role + ".test", "测试用户", List.of(role));
        return new SessionIdentity(role.equals("student") ? STUDENT_TOKEN : TEACHER_TOKEN, user, SECRET, FUTURE, FUTURE);
    }
}
