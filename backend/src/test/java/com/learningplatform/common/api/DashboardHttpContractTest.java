package com.learningplatform.common.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import javax.sql.DataSource;

import com.learningplatform.LearningPlatformApplication;
import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.auth.model.SessionIdentity;
import com.learningplatform.modules.auth.security.CsrfTokenService;
import com.learningplatform.modules.auth.service.DatabaseSessionService;
import com.learningplatform.modules.courses.dto.AssignmentDTOs.*;
import com.learningplatform.modules.courses.dto.CourseDTOs;
import com.learningplatform.modules.courses.service.DashboardService;
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
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** P1-D 学生聚合：getDashboard / getMyLearningRecords / markMessagesAsRead 的 HTTP 契约测试。 */
@SpringBootTest(classes = LearningPlatformApplication.class, properties = {
        "spring.flyway.enabled=false", "spring.sql.init.mode=never",
        "DB_URL=jdbc:mysql://127.0.0.1:1/unused", "DB_USERNAME=unused", "DB_PASSWORD=unused",
        "auth.http.pre-login-signing-key=test-signing-key",
        "auth.http.allowed-origins=http://127.0.0.1:4173",
        "AUTH_INVITE_SIGNING_KEY=test-only-invite-signing-key-at-least-32-characters"
})
@AutoConfigureMockMvc
class DashboardHttpContractTest {

    private static final String ID = "00000000-0000-4000-8000-000000000091";
    private static final String OFFERING = "00000000-0000-4000-8000-000000000092";
    private static final String CHAPTER = "00000000-0000-4000-8000-000000000093";
    private static final String TERM = "00000000-0000-4000-8000-000000000094";
    private static final String TEACHER_ID = "00000000-0000-4000-8000-000000000096";
    private static final String ORIGIN = "http://127.0.0.1:4173";
    private static final String STUDENT_TOKEN = "s".repeat(64);
    private static final String TEACHER_TOKEN = "t".repeat(64);
    private static final String SECRET = "x".repeat(64);
    private static final String REQUEST_ID = "req-p1d-dashboard-test";
    private static final Instant FUTURE = Instant.parse("2099-01-01T00:00:00Z");
    private static final Instant T = Instant.parse("2026-10-14T00:00:00Z");

    @Autowired private MockMvc mvc;
    @Autowired private CsrfTokenService csrf;
    @MockitoBean private DataSource dataSource;
    @MockitoBean private DatabaseSessionService sessions;
    @MockitoBean private DashboardService service;

    private static final CourseDTOs.TeacherBrief TEACHER = new CourseDTOs.TeacherBrief(TEACHER_ID, "教师");

    @BeforeEach
    void arrange() throws Exception {
        when(sessions.resolve(STUDENT_TOKEN)).thenReturn(identity("student"));
        when(sessions.resolve(TEACHER_TOKEN)).thenReturn(identity("teacher"));
        when(service.getDashboard(any(), nullable(String.class))).thenReturn(dashboard());
        when(service.getLearningRecords(any(), anyString(), anyInt(), anyInt())).thenReturn(records());
        when(service.markMessagesRead(any(), anyString(), nullable(String.class))).thenReturn(new MarkedReadDTO(T));
    }

    private static StudentFeedbackViewDTO feedback() {
        return new StudentFeedbackViewDTO(ID, ID, OFFERING, ID, "作业一", 2, "published", new BigDecimal("85.00"),
                new BigDecimal("100.00"), List.of(new RubricResultDTO("layout", new BigDecimal("85.00"), "ok")),
                "整体不错", List.of(), List.of(), null, TEACHER, T, ID);
    }

    private static DashboardDTO dashboard() {
        AssignmentSummaryDTO other = new AssignmentSummaryDTO(ID, OFFERING, "active", CHAPTER, "作业二", "sql_text", true,
                "published", "说明", FUTURE, "NOT_STARTED", false, null, null, false);
        CurrentAssignment current = new CurrentAssignment("assignment", OFFERING, CHAPTER, ID, "作业一", "说明", "web_lab",
                "IN_PROGRESS", FUTURE, false, new ResumeDTO("style.css", T, 2));
        CourseDTOs.CourseSummaryDTO course = new CourseDTOs.CourseSummaryDTO(OFFERING, ID, "Web 前端开发技术", "WEB", "一班",
                TERM, "2026 秋季学期", "active", List.of(TEACHER), new CourseDTOs.CurrentChapter(CHAPTER, 3, "布局"),
                new CourseDTOs.ProgressDTO("chapter", 3, 5, 60, false, T), T, 2, 1);
        NotificationDTO notice = new NotificationDTO(ID, OFFERING, "course_notice", "公告", "内容", null, T, null, null);
        return new DashboardDTO(TERM, "2026 秋季学期", T, 1, 2, 3, current, List.of(other), feedback(), List.of(course), notice);
    }

    private static LearningRecordsDTO records() {
        return new LearningRecordsDTO(OFFERING, new LearningSummary(1, 2, null), feedback(),
                new FeedbackPage(List.of(feedback()), 1, 20, 2), List.of(), null);
    }

    @Test
    void getDashboardHasContractShape() throws Exception {
        mvc.perform(get("/api/v1/me/dashboard", STUDENT_TOKEN)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("X-Request-ID", REQUEST_ID))
                .andExpect(jsonPath("$.requestId").value(REQUEST_ID))
                .andExpect(jsonPath("$.data.length()").value(11))
                .andExpect(jsonPath("$.data.termId").value(TERM))
                .andExpect(jsonPath("$.data.termLabel").value("2026 秋季学期"))
                .andExpect(jsonPath("$.data.serverTime").value("2026-10-14T00:00:00Z"))
                .andExpect(jsonPath("$.data.courseCount").value(1))
                .andExpect(jsonPath("$.data.pendingAssignmentCount").value(2))
                .andExpect(jsonPath("$.data.unreadMessageCount").value(3))
                .andExpect(jsonPath("$.data.currentLearning.type").value("assignment"))
                .andExpect(jsonPath("$.data.currentLearning.length()").value(11))
                .andExpect(jsonPath("$.data.currentLearning.assignmentId").value(ID))
                .andExpect(jsonPath("$.data.currentLearning.assignmentType").value("web_lab"))
                .andExpect(jsonPath("$.data.currentLearning.assignmentState").value("IN_PROGRESS"))
                .andExpect(jsonPath("$.data.currentLearning.overdue").value(false))
                .andExpect(jsonPath("$.data.currentLearning.resume.activeFile").value("style.css"))
                .andExpect(jsonPath("$.data.currentLearning.resume.savedAt").value("2026-10-14T00:00:00Z"))
                .andExpect(jsonPath("$.data.currentLearning.resume.workspaceRevision").value(2))
                .andExpect(jsonPath("$.data.otherPendingAssignments", hasSize(1)))
                .andExpect(jsonPath("$.data.otherPendingAssignments[0].assignmentState").value("NOT_STARTED"))
                .andExpect(jsonPath("$.data.otherPendingAssignments[0].type").value("sql_text"))
                .andExpect(jsonPath("$.data.otherPendingAssignments[0].latestSubmissionId").value(nullValue()))
                .andExpect(jsonPath("$.data.recentFeedback.status").value("published"))
                .andExpect(jsonPath("$.data.recentFeedback.messageId").value(ID))
                .andExpect(jsonPath("$.data.courses", hasSize(1)))
                .andExpect(jsonPath("$.data.courses[0].length()").value(14))
                .andExpect(jsonPath("$.data.courses[0].title").value("Web 前端开发技术"))
                .andExpect(jsonPath("$.data.courses[0].mark").value("WEB"))
                .andExpect(jsonPath("$.data.courses[0].progress.unit").value("chapter"))
                .andExpect(jsonPath("$.data.courses[0].progress.percent").value(60))
                .andExpect(jsonPath("$.data.courses[0].progress.notConfigured").value(false))
                .andExpect(jsonPath("$.data.courses[0].currentChapter.number").value(3))
                .andExpect(jsonPath("$.data.courses[0].pendingAssignmentCount").value(2))
                .andExpect(jsonPath("$.data.courses[0].unreadFeedbackCount").value(1))
                .andExpect(jsonPath("$.data.courses[0].courseName").doesNotExist())
                .andExpect(jsonPath("$.data.recentNotice.type").value("course_notice"))
                .andExpect(jsonPath("$.data.recentNotice.offeringId").value(OFFERING))
                .andExpect(jsonPath("$.data.recentNotice.sender").value(nullValue()))
                .andExpect(jsonPath("$.data.recentNotice.readAt").value(nullValue()))
                .andExpect(jsonPath("$.data.recentNotice.target").value(nullValue()));
    }

    @Test
    void getDashboardChapterCurrentLearningAndEmptyTermShape() throws Exception {
        when(service.getDashboard(any(), nullable(String.class))).thenReturn(new DashboardDTO(TERM, "2026 秋季学期", T, 1, 0, 0,
                new CurrentLearningChapter("chapter", OFFERING, CHAPTER, "布局", "章节简介"), List.of(), null, List.of(), null));
        mvc.perform(get("/api/v1/me/dashboard", STUDENT_TOKEN)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.currentLearning.type").value("chapter"))
                .andExpect(jsonPath("$.data.currentLearning.length()").value(5))
                .andExpect(jsonPath("$.data.currentLearning.chapterId").value(CHAPTER))
                .andExpect(jsonPath("$.data.currentLearning.title").value("布局"))
                .andExpect(jsonPath("$.data.currentLearning.description").value("章节简介"))
                .andExpect(jsonPath("$.data.otherPendingAssignments", hasSize(0)))
                .andExpect(jsonPath("$.data.recentFeedback").value(nullValue()))
                .andExpect(jsonPath("$.data.recentNotice").value(nullValue()));

        when(service.getDashboard(any(), nullable(String.class)))
                .thenReturn(new DashboardDTO(null, null, T, 0, 0, 0, null, List.of(), null, List.of(), null));
        mvc.perform(get("/api/v1/me/dashboard", STUDENT_TOKEN)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.termId").value(nullValue()))
                .andExpect(jsonPath("$.data.termLabel").value(nullValue()))
                .andExpect(jsonPath("$.data.currentLearning").value(nullValue()))
                .andExpect(jsonPath("$.data.courses", hasSize(0)));
    }

    @Test
    void getDashboardPassesTermIdAndRejectsMalformedOrUnknownTerm() throws Exception {
        mvc.perform(get("/api/v1/me/dashboard", STUDENT_TOKEN).queryParam("termId", TERM)).andExpect(status().isOk());
        verify(service).getDashboard(any(), org.mockito.ArgumentMatchers.eq(TERM));

        when(service.getDashboard(any(), eq("not-a-uuid"))).thenThrow(new BusinessException(
                HttpStatus.UNPROCESSABLE_CONTENT, "VALIDATION_ERROR", "请求参数不符合要求。"));
        mvc.perform(get("/api/v1/me/dashboard", STUDENT_TOKEN).queryParam("termId", "not-a-uuid"))
                .andExpect(status().is(422)).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));

        when(service.getDashboard(any(), eq(TERM))).thenThrow(new BusinessException(
                HttpStatus.NOT_FOUND, "NOT_FOUND", "请求的资源不存在。"));
        mvc.perform(get("/api/v1/me/dashboard", STUDENT_TOKEN).queryParam("termId", TERM))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
    }

    @Test
    void teacherAndAnonymousCannotReadDashboardOrRecords() throws Exception {
        when(service.getDashboard(any(), nullable(String.class))).thenThrow(new BusinessException(
                HttpStatus.FORBIDDEN, "FORBIDDEN", "权限不足。"));
        mvc.perform(get("/api/v1/me/dashboard", TEACHER_TOKEN)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
        mvc.perform(request(HttpMethod.GET, "/api/v1/me/dashboard").accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.error.code").value("UNAUTHENTICATED"));
        mvc.perform(request(HttpMethod.GET, "/api/v1/me/offerings/" + OFFERING + "/learning-records")
                .accept(MediaType.APPLICATION_JSON)).andExpect(status().isUnauthorized());
    }

    @Test
    void getMyLearningRecordsHasContractShape() throws Exception {
        mvc.perform(get("/api/v1/me/offerings/" + OFFERING + "/learning-records", STUDENT_TOKEN)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.data.length()").value(6))
                .andExpect(jsonPath("$.data.offeringId").value(OFFERING))
                .andExpect(jsonPath("$.data.summary.length()").value(3))
                .andExpect(jsonPath("$.data.summary.completedLabCount").value(1))
                .andExpect(jsonPath("$.data.summary.publishedFeedbackCount").value(2))
                .andExpect(jsonPath("$.data.summary.needsPracticeCount").value(nullValue()))
                .andExpect(jsonPath("$.data.recentFeedback.id").value(ID))
                .andExpect(jsonPath("$.data.recentFeedback.status").value("published"))
                .andExpect(jsonPath("$.data.recentFeedback.length()").value(17))
                .andExpect(jsonPath("$.data.feedbackPage.page").value(1))
                .andExpect(jsonPath("$.data.feedbackPage.pageSize").value(20))
                .andExpect(jsonPath("$.data.feedbackPage.total").value(2))
                .andExpect(jsonPath("$.data.feedbackPage.items", hasSize(1)))
                .andExpect(jsonPath("$.data.knowledgeEvidence", hasSize(0)))
                .andExpect(jsonPath("$.data.nextRecommendation").value(nullValue()))
                .andExpect(jsonPath("$.data.completedChapterCount").doesNotExist());
    }

    @Test
    void getMyLearningRecordsPassesRequestedPageAndSize() throws Exception {
        when(service.getLearningRecords(any(), eq(OFFERING), eq(3), eq(10))).thenReturn(new LearningRecordsDTO(
                OFFERING, new LearningSummary(23, 23, null), feedback(),
                new FeedbackPage(List.of(feedback()), 3, 10, 23), List.of(), null));
        mvc.perform(get("/api/v1/me/offerings/" + OFFERING + "/learning-records", STUDENT_TOKEN)
                .queryParam("page", "3").queryParam("pageSize", "10"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.feedbackPage.page").value(3))
                .andExpect(jsonPath("$.data.feedbackPage.pageSize").value(10))
                .andExpect(jsonPath("$.data.feedbackPage.total").value(23));
        verify(service).getLearningRecords(any(), eq(OFFERING), eq(3), eq(10));
        mvc.perform(get("/api/v1/me/offerings/" + OFFERING + "/learning-records", STUDENT_TOKEN)
                .queryParam("pageSize", "101")).andExpect(status().is(422));
    }

    @Test
    void getMyLearningRecordsRecentFeedbackIsNullWhenNone() throws Exception {
        when(service.getLearningRecords(any(), anyString(), anyInt(), anyInt())).thenReturn(new LearningRecordsDTO(OFFERING,
                new LearningSummary(0, 0, null), null, new FeedbackPage(List.of(), 1, 20, 0), List.of(), null));
        mvc.perform(get("/api/v1/me/offerings/" + OFFERING + "/learning-records", STUDENT_TOKEN)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.recentFeedback").value(nullValue()))
                .andExpect(jsonPath("$.data.feedbackPage.items", hasSize(0)));
    }

    @Test
    void getMyLearningRecordsRejectsNonMemberAndMalformedId() throws Exception {
        doThrow(new BusinessException(HttpStatus.NOT_FOUND, "NOT_FOUND", "请求的资源不存在。"))
                .when(service).getLearningRecords(any(), anyString(), anyInt(), anyInt());
        mvc.perform(get("/api/v1/me/offerings/" + OFFERING + "/learning-records", STUDENT_TOKEN))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
        doThrow(new BusinessException(HttpStatus.FORBIDDEN, "FORBIDDEN", "权限不足。"))
                .when(service).getLearningRecords(any(), anyString(), anyInt(), anyInt());
        mvc.perform(get("/api/v1/me/offerings/" + OFFERING + "/learning-records", TEACHER_TOKEN))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
        mvc.perform(get("/api/v1/me/offerings/not-a-uuid/learning-records", STUDENT_TOKEN))
                .andExpect(status().is(422)).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    void getMyLearningRecordsValidatesPagingParameters() throws Exception {
        // 分页边界在控制器校验，不能被 service mock 绕过。
        mvc.perform(get("/api/v1/me/offerings/" + OFFERING + "/learning-records", STUDENT_TOKEN).queryParam("page", "0"))
                .andExpect(status().is(422)).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    void markMessagesAsReadReturnsMarkedAtOnly() throws Exception {
        mvc.perform(put(OFFERING, null, STUDENT_TOKEN, "{}", true)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("X-Request-ID", REQUEST_ID))
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data.markedAt").value("2026-10-14T00:00:00Z"));
        mvc.perform(put(OFFERING, "feedback", STUDENT_TOKEN, "{}", true)).andExpect(status().isOk());
        verify(service).markMessagesRead(any(), org.mockito.ArgumentMatchers.eq(OFFERING), org.mockito.ArgumentMatchers.eq("feedback"));
    }

    @Test
    void markMessagesAsReadRequiresCsrfAndAuthentication() throws Exception {
        mvc.perform(put(OFFERING, null, STUDENT_TOKEN, "{}", false)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("CSRF_INVALID"));
        CsrfTokenService.PreAuthTicket ticket = csrf.issuePreAuth();
        mvc.perform(request(HttpMethod.PUT, "/api/v1/me/offerings/" + OFFERING + "/messages/mark-read")
                        .cookie(new Cookie("lp_pre_auth", ticket.cookieValue())).header("Origin", ORIGIN)
                        .header("X-CSRF-Token", ticket.token()).header("X-Request-ID", REQUEST_ID)
                        .contentType(MediaType.APPLICATION_JSON).content("{}").accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.error.code").value("UNAUTHENTICATED"));
    }

    @Test
    void markMessagesAsReadValidatesBodyIdAndType() throws Exception {
        mvc.perform(put(OFFERING, null, STUDENT_TOKEN, "{\"x\":1}", true)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("INVALID_REQUEST"));
        mvc.perform(put("not-a-uuid", null, STUDENT_TOKEN, "{}", true)).andExpect(status().is(422))
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        when(service.markMessagesRead(any(), anyString(), eq("bogus"))).thenThrow(new BusinessException(
                HttpStatus.UNPROCESSABLE_CONTENT, "VALIDATION_ERROR", "请求参数不符合要求。"));
        mvc.perform(put(OFFERING, "bogus", STUDENT_TOKEN, "{}", true)).andExpect(status().is(422))
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    void markMessagesAsReadRejectsTeacherAndNonMember() throws Exception {
        doThrow(new BusinessException(HttpStatus.FORBIDDEN, "FORBIDDEN", "权限不足。"))
                .when(service).markMessagesRead(any(), anyString(), nullable(String.class));
        mvc.perform(put(OFFERING, null, TEACHER_TOKEN, "{}", true)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
        doThrow(new BusinessException(HttpStatus.NOT_FOUND, "NOT_FOUND", "请求的资源不存在。"))
                .when(service).markMessagesRead(any(), anyString(), nullable(String.class));
        mvc.perform(put(OFFERING, null, STUDENT_TOKEN, "{}", true)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
    }

    private MockHttpServletRequestBuilder get(String path, String token) {
        return request(HttpMethod.GET, path).header("X-Request-ID", REQUEST_ID).accept(MediaType.APPLICATION_JSON)
                .cookie(new Cookie("lp_session", token));
    }

    private MockHttpServletRequestBuilder put(String offeringId, String type, String token, String body, boolean validCsrf) {
        MockHttpServletRequestBuilder b = request(HttpMethod.PUT, "/api/v1/me/offerings/" + offeringId + "/messages/mark-read")
                .header("X-Request-ID", REQUEST_ID).accept(MediaType.APPLICATION_JSON).contentType(MediaType.APPLICATION_JSON)
                .content(body).cookie(new Cookie("lp_session", token)).header("Origin", ORIGIN);
        if (type != null) b.queryParam("type", type);
        if (validCsrf) b.header("X-CSRF-Token", csrf.sessionToken(token, SECRET));
        return b;
    }

    private SessionIdentity identity(String role) {
        UserDTO user = new UserDTO(ID, role + ".test", "测试用户", List.of(role));
        return new SessionIdentity(role.equals("student") ? STUDENT_TOKEN : TEACHER_TOKEN, user, SECRET, FUTURE, FUTURE);
    }
}
