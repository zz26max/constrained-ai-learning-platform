package com.learningplatform.modules.courses.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.courses.dto.AssignmentDTOs.*;
import com.learningplatform.modules.courses.dto.CourseDTOs.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mysql.MySQLContainer;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** P1-D 学生聚合（getDashboard / getMyLearningRecords / markMessagesAsRead）真实 MySQL 集成测试。 */
@SpringBootTest(properties = "AUTH_INVITE_SIGNING_KEY=test-only-invite-signing-key-at-least-32-characters")
@Testcontainers
@Import(DashboardIntegrationIT.FixedClockConfiguration.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class DashboardIntegrationIT {
    private static final Instant NOW = Instant.parse("2026-10-15T08:00:00.123456Z");
    private static final String COURSE = "00000000-0000-4000-8000-0000000000b1";
    private static final String TERM = "00000000-0000-4000-8000-0000000000b2";
    private static final String OLD_TERM = "00000000-0000-4000-8000-0000000000b7";
    private static final UserDTO TEACHER = user("b3", "dash.teacher", "teacher");
    private static final UserDTO STUDENT = user("b4", "dash.student", "student");
    private static final UserDTO OTHER_STUDENT = user("b5", "dash.other", "student");
    private static final UserDTO OUTSIDER = user("b6", "dash.outsider", "student");
    private static final JsonMapper JSON = JsonMapper.builder().findAndAddModules().build();

    @Container
    static final MySQLContainer mysql = new MySQLContainer("mysql:8.4.11")
            .withDatabaseName("learning_platform_dashboard_test")
            .withUsername("dashboard_test").withPassword(UUID.randomUUID().toString())
            .withCommand("--character-set-server=utf8mb4", "--collation-server=utf8mb4_0900_ai_ci",
                    "--default-time-zone=+00:00", "--transaction-isolation=READ-COMMITTED");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", mysql::getJdbcUrl);
        r.add("spring.datasource.username", mysql::getUsername);
        r.add("spring.datasource.password", mysql::getPassword);
    }

    @Autowired private CourseService courseService;
    @Autowired private AssignmentService assignmentService;
    @Autowired private DashboardService dashboard;
    @Autowired private JdbcTemplate jdbc;

    @BeforeEach
    void reset() {
        // P2 子记录先于课程、作品与评价清理，保留外键验证。
        for (String table : List.of("knowledge_evidence", "feedback_knowledge_evaluations", "feedback_issue_tags",
                "submission_knowledge_snapshot", "learning_events")) {
            jdbc.update("DELETE FROM " + table);
        }
        for (String table : List.of("notifications", "notices", "feedback_rubric_scores", "feedback",
                "submission_rubric_snapshot", "submission_requirements_snapshot", "submission_files", "submissions",
                "workspace_files", "workspaces", "assignment_knowledge_points", "assignment_initial_files",
                "assignment_rubric_criteria", "assignment_requirements", "assignments", "chapter_progress")) {
            jdbc.update("DELETE FROM " + table);
        }
        jdbc.update("UPDATE offering_members SET last_chapter_id=NULL");
        for (String table : List.of("resources", "knowledge_points", "chapters", "course_invites", "offering_members",
                "course_offerings", "courses", "terms", "audit_logs", "auth_sessions", "users")) {
            jdbc.update("DELETE FROM " + table);
        }
        for (UserDTO u : List.of(TEACHER, STUDENT, OTHER_STUDENT, OUTSIDER)) {
            jdbc.update("INSERT INTO users(id,username,display_name,password_hash,roles,status,created_at,updated_at) VALUES(?,?,?,?,CAST(? AS JSON),'active',?,?)",
                    u.id(), u.username(), u.displayName(), "TEST_ONLY_NOT_A_REAL_HASH", JSON.writeValueAsString(u.roles()), ts(NOW), ts(NOW));
        }
        jdbc.update("INSERT INTO terms(id,label,starts_at,ends_at,is_current,created_at,updated_at) VALUES(?,?,?,?,1,?,?)",
                TERM, "当前学期", ts(NOW.minus(Duration.ofDays(30))), ts(NOW.plus(Duration.ofDays(100))), ts(NOW), ts(NOW));
        jdbc.update("INSERT INTO terms(id,label,starts_at,ends_at,is_current,created_at,updated_at) VALUES(?,?,?,?,0,?,?)",
                OLD_TERM, "历史学期", ts(NOW.minus(Duration.ofDays(300))), ts(NOW.minus(Duration.ofDays(100))), ts(NOW), ts(NOW));
        jdbc.update("INSERT INTO courses(id,code,mark,title,description,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,'active',?,?,?)",
                COURSE, "dash-course", "DSH", "看板测试课程", "测试", TEACHER.id(), ts(NOW), ts(NOW));
    }

    // ---------- getDashboard ----------

    @Test
    void noCurrentTermReturnsEmptyDashboardWithNullTerm() {
        jdbc.update("UPDATE terms SET is_current=0");
        DashboardDTO d = dashboard.getDashboard(STUDENT, null);
        assertThat(d.termId()).isNull();
        assertThat(d.termLabel()).isNull();
        assertThat(d.serverTime()).isEqualTo(NOW.truncatedTo(java.time.temporal.ChronoUnit.MICROS));
        assertThat(d.courseCount()).isZero();
        assertThat(d.pendingAssignmentCount()).isZero();
        assertThat(d.unreadMessageCount()).isZero();
        assertThat(d.currentLearning()).isNull();
        assertThat(d.otherPendingAssignments()).isEmpty();
        assertThat(d.recentFeedback()).isNull();
        assertThat(d.courses()).isEmpty();
        assertThat(d.recentNotice()).isNull();
    }

    @Test
    void studentWithoutOfferingsGetsCurrentTermAndEmptyCollections() {
        DashboardDTO d = dashboard.getDashboard(STUDENT, null);
        assertThat(d.termId()).isEqualTo(TERM);
        assertThat(d.termLabel()).isEqualTo("当前学期");
        assertThat(d.courseCount()).isZero();
        assertThat(d.currentLearning()).isNull();
        assertThat(d.courses()).isEmpty();
    }

    @Test
    void termIdIsValidated() {
        assertThatThrownBy(() -> dashboard.getDashboard(STUDENT, "not-a-uuid")).satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
        assertThatThrownBy(() -> dashboard.getDashboard(STUDENT, UUID.randomUUID().toString())).satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
        assertThatThrownBy(() -> dashboard.getDashboard(TEACHER, null)).satisfies(t -> assertCode(t, 403, "FORBIDDEN"));
    }

    @Test
    void defaultTermAndExplicitTermSelectDifferentOfferings() {
        OfferingDTO current = createOffering(TERM, "当前班", "chapter");
        OfferingDTO old = createOffering(OLD_TERM, "历史班", "chapter");
        enrollStudent(current.id(), STUDENT);
        enrollStudent(old.id(), STUDENT);

        DashboardDTO byDefault = dashboard.getDashboard(STUDENT, null);
        assertThat(byDefault.termId()).isEqualTo(TERM);
        assertThat(byDefault.courseCount()).isEqualTo(1);
        assertThat(byDefault.courses()).extracting(CourseSummaryDTO::offeringId).containsExactly(current.id());

        DashboardDTO explicit = dashboard.getDashboard(STUDENT, OLD_TERM);
        assertThat(explicit.termId()).isEqualTo(OLD_TERM);
        assertThat(explicit.termLabel()).isEqualTo("历史学期");
        assertThat(explicit.courseCount()).isEqualTo(1);
        assertThat(explicit.courses()).extracting(CourseSummaryDTO::offeringId).containsExactly(old.id());
    }

    @Test
    void courseCardFieldsAndChapterProgressPercent() {
        OfferingDTO offering = createOffering(TERM, "进度班", "chapter");
        enrollStudent(offering.id(), STUDENT);
        String c1 = insertChapter(offering.id(), 1, "published", true);
        String c2 = insertChapter(offering.id(), 2, "published", true);
        String c3 = insertChapter(offering.id(), 3, "published", true);
        insertChapter(offering.id(), 4, "draft", true);
        insertChapter(offering.id(), 5, "published", false);

        // 无进度：total=3（草稿与选修不计），completed=0，percent=0，notConfigured=false
        CourseSummaryDTO none = dashboard.getDashboard(STUDENT, null).courses().get(0);
        assertThat(none.progress().unit()).isEqualTo("chapter");
        assertThat(none.progress().total()).isEqualTo(3);
        assertThat(none.progress().completed()).isZero();
        assertThat(none.progress().percent()).isZero();
        assertThat(none.progress().notConfigured()).isFalse();
        assertThat(none.title()).isEqualTo("进度班");
        assertThat(none.mark()).isEqualTo("DSH");
        assertThat(none.courseId()).isEqualTo(COURSE);
        assertThat(none.groupName()).isEqualTo("一班");
        assertThat(none.status()).isEqualTo("active");
        assertThat(none.termLabel()).isEqualTo("当前学期");
        assertThat(none.teachers()).extracting(TeacherBrief::id).containsExactly(TEACHER.id());

        completeChapter(offering.id(), STUDENT, c1);
        CourseSummaryDTO one = dashboard.getDashboard(STUDENT, null).courses().get(0);
        assertThat(one.progress().completed()).isEqualTo(1);
        assertThat(one.progress().percent()).isEqualTo(33);
        completeChapter(offering.id(), STUDENT, c2);
        assertThat(dashboard.getDashboard(STUDENT, null).courses().get(0).progress().percent()).isEqualTo(67);
        // 其他学生的进度不影响本人
        enrollStudent(offering.id(), OTHER_STUDENT);
        completeChapter(offering.id(), OTHER_STUDENT, c3);
        assertThat(dashboard.getDashboard(STUDENT, null).courses().get(0).progress().completed()).isEqualTo(2);
    }

    @Test
    void courseWithoutRequiredChapterIsNotConfigured() {
        OfferingDTO offering = createOffering(TERM, "空班", "chapter");
        enrollStudent(offering.id(), STUDENT);
        ProgressDTO p = dashboard.getDashboard(STUDENT, null).courses().get(0).progress();
        assertThat(p.total()).isZero();
        assertThat(p.percent()).isZero();
        assertThat(p.notConfigured()).isTrue();
    }

    @Test
    void assignmentUnitProgressCountsRequiredPublishedAssignmentsWithSubmission() {
        OfferingDTO offering = createOffering(TERM, "作业进度班", "assignment");
        enrollStudent(offering.id(), STUDENT);
        TeacherAssignmentDTO a1 = publishAssignment(offering.id(), "A1", 3, "web_lab", true);
        publishAssignment(offering.id(), "A2", 4, "web_lab", true);
        publishAssignment(offering.id(), "A3", 5, "web_lab", false);
        createDraft(offering.id(), "草稿", 6);

        ProgressDTO before = dashboard.getDashboard(STUDENT, null).courses().get(0).progress();
        assertThat(before.unit()).isEqualTo("assignment");
        assertThat(before.total()).isEqualTo(2);
        assertThat(before.completed()).isZero();
        assertThat(before.notConfigured()).isFalse();

        saveAndSubmit(STUDENT, a1.id());
        ProgressDTO after = dashboard.getDashboard(STUDENT, null).courses().get(0).progress();
        assertThat(after.completed()).isEqualTo(1);
        assertThat(after.percent()).isEqualTo(50);
    }

    @Test
    void pendingCountsCurrentLearningOrderAndOtherPendingLimit() {
        OfferingDTO offering = createOffering(TERM, "待办班", "chapter");
        enrollStudent(offering.id(), STUDENT);
        TeacherAssignmentDTO late = publishAssignment(offering.id(), "最晚", 9, "text", true);
        TeacherAssignmentDTO first = publishAssignment(offering.id(), "最早", 2, "web_lab", true);
        TeacherAssignmentDTO second = publishAssignment(offering.id(), "第二", 4, "sql_text", true);
        TeacherAssignmentDTO third = publishAssignment(offering.id(), "第三", 6, "text", true);
        createDraft(offering.id(), "草稿不计", 1);

        DashboardDTO d = dashboard.getDashboard(STUDENT, null);
        assertThat(d.pendingAssignmentCount()).isEqualTo(4);
        assertThat(d.courses().get(0).pendingAssignmentCount()).isEqualTo(4);
        assertThat(d.currentLearning()).isInstanceOf(CurrentAssignment.class);
        CurrentAssignment current = (CurrentAssignment) d.currentLearning();
        assertThat(current.type()).isEqualTo("assignment");
        assertThat(current.assignmentId()).isEqualTo(first.id());
        assertThat(current.offeringId()).isEqualTo(offering.id());
        assertThat(current.title()).isEqualTo("最早");
        assertThat(current.assignmentType()).isEqualTo("web_lab");
        assertThat(current.assignmentState()).isEqualTo("NOT_STARTED");
        assertThat(current.overdue()).isFalse();
        assertThat(current.resume()).isNull();
        // 其他待办最多两项、排除当前任务、按截止时间升序
        assertThat(d.otherPendingAssignments()).extracting(AssignmentSummaryDTO::id).containsExactly(second.id(), third.id());
        assertThat(d.otherPendingAssignments().get(0).assignmentState()).isEqualTo("NOT_STARTED");
        assertThat(d.otherPendingAssignments().get(0).offeringStatus()).isEqualTo("active");

        // 保存工作区后：IN_PROGRESS 且带 resume
        Map<String, Object> save = new HashMap<>();
        save.put("baseRevision", 0);
        save.put("files", List.of(Map.of("path", "index.html", "content", "V1")));
        save.put("activeFile", "index.html");
        assignmentService.saveWorkspace(STUDENT, first.id(), save, "save");
        CurrentAssignment resumed = (CurrentAssignment) dashboard.getDashboard(STUDENT, null).currentLearning();
        assertThat(resumed.assignmentState()).isEqualTo("IN_PROGRESS");
        assertThat(resumed.resume()).isNotNull();
        assertThat(resumed.resume().activeFile()).isEqualTo("index.html");
        assertThat(resumed.resume().workspaceRevision()).isEqualTo(1);

        // 提交后：不再是待办，当前任务顺延，其他待办排除当前任务
        assignmentService.submitAssignment(STUDENT, first.id(),
                new HashMap<>(Map.of("workspaceRevision", 1, "reflection", "完成")), "submit");
        DashboardDTO afterSubmit = dashboard.getDashboard(STUDENT, null);
        assertThat(afterSubmit.pendingAssignmentCount()).isEqualTo(3);
        assertThat(((CurrentAssignment) afterSubmit.currentLearning()).assignmentId()).isEqualTo(second.id());
        assertThat(afterSubmit.otherPendingAssignments()).extracting(AssignmentSummaryDTO::id).containsExactly(third.id(), late.id());
    }

    @Test
    void overdueAssignmentIsFlagged() {
        OfferingDTO offering = createOffering(TERM, "逾期班", "chapter");
        enrollStudent(offering.id(), STUDENT);
        TeacherAssignmentDTO a = publishAssignment(offering.id(), "逾期作业", 2, "text", true);
        jdbc.update("UPDATE assignments SET due_at=?,late_until=? WHERE id=?",
                ts(NOW.minus(Duration.ofDays(1))), ts(NOW.plus(Duration.ofDays(2))), a.id());
        CurrentAssignment current = (CurrentAssignment) dashboard.getDashboard(STUDENT, null).currentLearning();
        assertThat(current.overdue()).isTrue();
    }

    @Test
    void withoutPendingAssignmentsCurrentLearningFallsBackToLastStudiedChapterThenNull() {
        OfferingDTO first = createOffering(TERM, "班一", "chapter");
        OfferingDTO second = createOffering(TERM, "班二", "chapter");
        enrollStudent(first.id(), STUDENT);
        enrollStudent(second.id(), STUDENT);
        // 没有任何已发布章节：null
        assertThat(dashboard.getDashboard(STUDENT, null).currentLearning()).isNull();

        String firstChapter = insertChapter(first.id(), 1, "published", true);
        String secondChapter = insertChapter(second.id(), 1, "published", true);
        // 无学习位置时 last_studied_at 为空，按创建时间新者在前
        assertThat(dashboard.getDashboard(STUDENT, null).currentLearning()).isInstanceOf(CurrentLearningChapter.class);

        // 最近学习的班级优先
        jdbc.update("UPDATE offering_members SET last_studied_at=?,last_chapter_id=? WHERE offering_id=? AND user_id=?",
                ts(NOW.minusSeconds(10)), firstChapter, first.id(), STUDENT.id());
        jdbc.update("UPDATE offering_members SET last_studied_at=?,last_chapter_id=? WHERE offering_id=? AND user_id=?",
                ts(NOW.minusSeconds(100)), secondChapter, second.id(), STUDENT.id());
        CurrentLearningChapter chapter = (CurrentLearningChapter) dashboard.getDashboard(STUDENT, null).currentLearning();
        assertThat(chapter.type()).isEqualTo("chapter");
        assertThat(chapter.offeringId()).isEqualTo(first.id());
        assertThat(chapter.chapterId()).isEqualTo(firstChapter);
        assertThat(chapter.title()).isEqualTo("章节1");
        assertThat(chapter.description()).isEqualTo("章节1简介");

        // 有待办作业时作业优先于章节
        publishAssignment(second.id(), "优先作业", 3, "text", true);
        assertThat(dashboard.getDashboard(STUDENT, null).currentLearning()).isInstanceOf(CurrentAssignment.class);
    }

    @Test
    void courseListIsCappedAtSixAndCountsAllOfferings() {
        for (int i = 0; i < 7; i++) {
            enrollStudent(createOffering(TERM, "班" + i, "chapter").id(), STUDENT);
        }
        DashboardDTO d = dashboard.getDashboard(STUDENT, null);
        assertThat(d.courseCount()).isEqualTo(7);
        assertThat(d.courses()).hasSize(6);
    }

    @Test
    void archivedOfferingIsExcludedFromCoursesAndPending() {
        OfferingDTO offering = createOffering(TERM, "归档班", "chapter");
        enrollStudent(offering.id(), STUDENT);
        publishAssignment(offering.id(), "作业", 3, "text", true);
        jdbc.update("UPDATE course_offerings SET status='archived' WHERE id=?", offering.id());
        DashboardDTO d = dashboard.getDashboard(STUDENT, null);
        assertThat(d.courseCount()).isZero();
        assertThat(d.pendingAssignmentCount()).isZero();
        assertThat(d.currentLearning()).isNull();
        assertThat(d.courses()).isEmpty();
    }

    @Test
    void otherStudentsDataDoesNotLeak() {
        OfferingDTO offering = createOffering(TERM, "共享班", "chapter");
        enrollStudent(offering.id(), STUDENT);
        enrollStudent(offering.id(), OTHER_STUDENT);
        TeacherAssignmentDTO a = publishAssignment(offering.id(), "作业", 3, "text", true);
        saveAndSubmit(OTHER_STUDENT, a.id(), "answer.md");
        // 另一名学生已提交，不影响本人的待办
        assertThat(dashboard.getDashboard(STUDENT, null).pendingAssignmentCount()).isEqualTo(1);
        assertThat(dashboard.getDashboard(OTHER_STUDENT, null).pendingAssignmentCount()).isZero();
    }

    @Test
    void unreadCountRecentNoticeAndRecentFeedback() {
        OfferingDTO offering = createOffering(TERM, "消息班", "chapter");
        OfferingDTO oldOffering = createOffering(OLD_TERM, "历史消息班", "chapter");
        enrollStudent(offering.id(), STUDENT);
        enrollStudent(oldOffering.id(), STUDENT);
        // 没有消息
        DashboardDTO empty = dashboard.getDashboard(STUDENT, null);
        assertThat(empty.unreadMessageCount()).isZero();
        assertThat(empty.recentNotice()).isNull();
        assertThat(empty.recentFeedback()).isNull();

        String older = insertNotification(STUDENT, "notice_published", "旧公告", offering.id(), NOW.minusSeconds(100), false);
        String newer = insertNotification(STUDENT, "notice_published", "新公告", offering.id(), NOW.minusSeconds(10), false);
        insertNotification(STUDENT, "assignment_published", "作业发布", offering.id(), NOW.minusSeconds(1), false);
        insertNotification(STUDENT, "notice_published", "历史学期公告", oldOffering.id(), NOW, false);
        insertNotification(STUDENT, "notice_published", "已读公告", offering.id(), NOW.minusSeconds(5), true);
        insertNotification(OTHER_STUDENT, "notice_published", "别人的", offering.id(), NOW, false);

        DashboardDTO d = dashboard.getDashboard(STUDENT, null);
        // 当前学期未读：旧公告、新公告、作业发布（历史学期的、已读的、别人的都不计）
        assertThat(d.unreadMessageCount()).isEqualTo(3);
        // 最近公告只取公告类、当前学期，已读与否都可以（最新一条为已读公告）
        assertThat(d.recentNotice()).isNotNull();
        assertThat(d.recentNotice().type()).isEqualTo("course_notice");
        assertThat(d.recentNotice().title()).isEqualTo("新公告".equals(d.recentNotice().title()) ? "新公告" : "已读公告");
        assertThat(d.recentNotice().id()).isIn(newer, jdbc.queryForObject(
                "SELECT id FROM notifications WHERE title='已读公告'", String.class));
        assertThat(d.recentNotice().id()).isNotEqualTo(older);

        DashboardDTO historical = dashboard.getDashboard(STUDENT, OLD_TERM);
        assertThat(historical.unreadMessageCount()).isEqualTo(1);
        assertThat(historical.recentNotice().title()).isEqualTo("历史学期公告");
    }

    @Test
    void recentFeedbackAndUnreadFeedbackCountComeFromPublishedFeedback() {
        Fixture f = submitted();
        // 草稿评价不外露
        assignmentService.saveFeedback(TEACHER, f.submissionId(), feedbackBody(0), "draft");
        DashboardDTO draftOnly = dashboard.getDashboard(STUDENT, null);
        assertThat(draftOnly.recentFeedback()).isNull();
        assertThat(draftOnly.courses().get(0).unreadFeedbackCount()).isZero();
        assertThat(draftOnly.currentLearning()).isNull();

        assignmentService.publishFeedback(TEACHER, f.submissionId(), new HashMap<>(Map.of("baseVersion", 1)), "publish");
        DashboardDTO d = dashboard.getDashboard(STUDENT, null);
        assertThat(d.recentFeedback()).isNotNull();
        assertThat(d.recentFeedback().status()).isEqualTo("published");
        assertThat(d.recentFeedback().assignmentId()).isEqualTo(f.assignmentId());
        assertThat(d.recentFeedback().messageId()).isNotNull();
        assertThat(d.recentFeedback().score()).isEqualByComparingTo(new BigDecimal("80"));
        assertThat(d.courses().get(0).unreadFeedbackCount()).isEqualTo(1);
        // 作业消息 + 反馈消息均未读
        assertThat(d.unreadMessageCount()).isGreaterThanOrEqualTo(1);

        assignmentService.readMessage(STUDENT, d.recentFeedback().messageId(), "read");
        assertThat(dashboard.getDashboard(STUDENT, null).courses().get(0).unreadFeedbackCount()).isZero();
        // 他人不可见
        assertThat(dashboard.getDashboard(OTHER_STUDENT, null).recentFeedback()).isNull();
    }

    // ---------- getMyLearningRecords ----------

    @Test
    void learningRecordsRejectNonMemberTeacherAndMalformedId() {
        OfferingDTO offering = createOffering(TERM, "记录班", "chapter");
        enrollStudent(offering.id(), STUDENT);
        assertThatThrownBy(() -> dashboard.getLearningRecords(OUTSIDER, offering.id())).satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
        assertThatThrownBy(() -> dashboard.getLearningRecords(STUDENT, UUID.randomUUID().toString())).satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
        assertThatThrownBy(() -> dashboard.getLearningRecords(TEACHER, offering.id())).satisfies(t -> assertCode(t, 403, "FORBIDDEN"));
        assertThatThrownBy(() -> dashboard.getLearningRecords(STUDENT, "bad")).satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
    }

    @Test
    void learningRecordsEmptyStateHasContractDefaults() {
        OfferingDTO offering = createOffering(TERM, "空记录班", "chapter");
        enrollStudent(offering.id(), STUDENT);
        LearningRecordsDTO r = dashboard.getLearningRecords(STUDENT, offering.id());
        assertThat(r.offeringId()).isEqualTo(offering.id());
        assertThat(r.summary().completedLabCount()).isZero();
        assertThat(r.summary().publishedFeedbackCount()).isZero();
        assertThat(r.summary().needsPracticeCount()).isZero();
        assertThat(r.recentFeedback()).isNull();
        assertThat(r.feedbackPage().items()).isEmpty();
        assertThat(r.feedbackPage().page()).isEqualTo(1);
        assertThat(r.feedbackPage().pageSize()).isEqualTo(20);
        assertThat(r.feedbackPage().total()).isZero();
        assertThat(r.knowledgeEvidence()).isNotNull().isEmpty();
        assertThat(r.nextRecommendation()).isNull();
    }

    @Test
    void learningRecordsCountOnlyWebLabSubmissionsAndPublishedFeedback() {
        Fixture f = submitted();   // web_lab 已提交
        TeacherAssignmentDTO sql = publishAssignment(f.offeringId(), "SQL 作业", 5, "sql_text", true);
        saveAndSubmit(STUDENT, sql.id(), "answer.sql");
        LearningRecordsDTO beforeFeedback = dashboard.getLearningRecords(STUDENT, f.offeringId());
        // SQL/文字作业不混入实验计数
        assertThat(beforeFeedback.summary().completedLabCount()).isEqualTo(1);
        assertThat(beforeFeedback.summary().publishedFeedbackCount()).isZero();
        assertThat(beforeFeedback.recentFeedback()).isNull();

        assignmentService.saveFeedback(TEACHER, f.submissionId(), feedbackBody(0), "draft");
        assertThat(dashboard.getLearningRecords(STUDENT, f.offeringId()).summary().publishedFeedbackCount()).isZero();
        assignmentService.publishFeedback(TEACHER, f.submissionId(), new HashMap<>(Map.of("baseVersion", 1)), "publish");

        LearningRecordsDTO r = dashboard.getLearningRecords(STUDENT, f.offeringId());
        assertThat(r.summary().publishedFeedbackCount()).isEqualTo(1);
        assertThat(r.recentFeedback()).isNotNull();
        assertThat(r.recentFeedback().assignmentId()).isEqualTo(f.assignmentId());
        assertThat(r.recentFeedback().status()).isEqualTo("published");
        assertThat(r.feedbackPage().total()).isEqualTo(1);
        assertThat(r.feedbackPage().items()).hasSize(1);
        assertThat(r.feedbackPage().items().get(0).id()).isEqualTo(r.recentFeedback().id());
    }

    @Test
    void learningRecordsPagesBeyondTwentyWithoutDuplicatesAndKeepsGlobalSummary() {
        OfferingDTO offering = createOffering(TERM, "分页记录班", "chapter");
        enrollStudent(offering.id(), STUDENT);
        for (int i = 0; i < 23; i++) {
            TeacherAssignmentDTO assignment = publishAssignment(offering.id(), "分页作业" + i, 5, "web_lab", true);
            String submission = saveAndSubmit(STUDENT, assignment.id());
            assignmentService.saveFeedback(TEACHER, submission, feedbackBody(0), "draft");
            assignmentService.publishFeedback(TEACHER, submission, new HashMap<>(Map.of("baseVersion", 1)), "publish");
        }
        LearningRecordsDTO first = dashboard.getLearningRecords(STUDENT, offering.id(), 1, 10);
        List<String> ids = new java.util.ArrayList<>();
        for (int page = 1; page <= 3; page++) {
            LearningRecordsDTO result = dashboard.getLearningRecords(STUDENT, offering.id(), page, 10);
            assertThat(result.feedbackPage().page()).isEqualTo(page);
            assertThat(result.feedbackPage().pageSize()).isEqualTo(10);
            assertThat(result.feedbackPage().total()).isEqualTo(23);
            assertThat(result.feedbackPage().items()).hasSize(page == 3 ? 3 : 10);
            assertThat(result.summary()).isEqualTo(first.summary());
            assertThat(result.recentFeedback()).isEqualTo(first.recentFeedback());
            ids.addAll(result.feedbackPage().items().stream().map(StudentFeedbackViewDTO::id).toList());
        }
        assertThat(first.summary().publishedFeedbackCount()).isEqualTo(23);
        assertThat(ids).doesNotHaveDuplicates().isSortedAccordingTo(java.util.Comparator.reverseOrder());
        assertThat(first.recentFeedback().id()).isEqualTo(ids.get(0));
        assertThat(dashboard.getLearningRecords(STUDENT, offering.id(), 4, 10).feedbackPage().items()).isEmpty();
        assertThat(dashboard.getLearningRecords(STUDENT, offering.id()).feedbackPage().items()).hasSize(20);
    }

    @Test
    void learningRecordsAreScopedToOfferingAndStudent() {
        Fixture f = submitted();
        assignmentService.saveFeedback(TEACHER, f.submissionId(), feedbackBody(0), "draft");
        assignmentService.publishFeedback(TEACHER, f.submissionId(), new HashMap<>(Map.of("baseVersion", 1)), "publish");
        OfferingDTO other = createOffering(TERM, "另一个班", "chapter");
        enrollStudent(other.id(), STUDENT);
        enrollStudent(f.offeringId(), OTHER_STUDENT);
        LearningRecordsDTO otherOffering = dashboard.getLearningRecords(STUDENT, other.id());
        assertThat(otherOffering.summary().publishedFeedbackCount()).isZero();
        assertThat(otherOffering.summary().completedLabCount()).isZero();
        assertThat(otherOffering.recentFeedback()).isNull();
        LearningRecordsDTO otherStudent = dashboard.getLearningRecords(OTHER_STUDENT, f.offeringId());
        assertThat(otherStudent.summary().publishedFeedbackCount()).isZero();
        assertThat(otherStudent.recentFeedback()).isNull();
    }

    // ---------- markMessagesAsRead ----------

    @Test
    void markReadOnlyAffectsOwnMessagesInThatOfferingAndIsIdempotent() {
        OfferingDTO a = createOffering(TERM, "班A", "chapter");
        OfferingDTO b = createOffering(TERM, "班B", "chapter");
        enrollStudent(a.id(), STUDENT);
        enrollStudent(b.id(), STUDENT);
        enrollStudent(a.id(), OTHER_STUDENT);
        String a1 = insertNotification(STUDENT, "notice_published", "A公告", a.id(), NOW.minusSeconds(30), false);
        String a2 = insertNotification(STUDENT, "assignment_published", "A作业", a.id(), NOW.minusSeconds(20), false);
        String b1 = insertNotification(STUDENT, "notice_published", "B公告", b.id(), NOW.minusSeconds(10), false);
        String noOffering = insertNotification(STUDENT, "offering_archived", "无班级", null, NOW.minusSeconds(5), false);
        String others = insertNotification(OTHER_STUDENT, "notice_published", "别人的A公告", a.id(), NOW.minusSeconds(8), false);
        String alreadyRead = insertNotification(STUDENT, "notice_published", "已读", a.id(), NOW.minusSeconds(60), true);
        Instant firstReadAt = jdbc.queryForObject("SELECT read_at FROM notifications WHERE id=?", java.sql.Timestamp.class, alreadyRead).toInstant();

        MarkedReadDTO marked = dashboard.markMessagesRead(STUDENT, a.id(), null);
        assertThat(marked.markedAt()).isEqualTo(NOW.truncatedTo(java.time.temporal.ChronoUnit.MICROS));
        assertThat(isRead(a1)).isTrue();
        assertThat(isRead(a2)).isTrue();
        assertThat(isRead(b1)).isFalse();
        assertThat(isRead(noOffering)).isFalse();
        assertThat(isRead(others)).isFalse();
        // 已读行保留首次 readAt
        assertThat(jdbc.queryForObject("SELECT read_at FROM notifications WHERE id=?", java.sql.Timestamp.class, alreadyRead).toInstant())
                .isEqualTo(firstReadAt);

        // 幂等：重复调用不报错、不改变状态
        MarkedReadDTO again = dashboard.markMessagesRead(STUDENT, a.id(), null);
        assertThat(again.markedAt()).isNotNull();
        assertThat(isRead(a1)).isTrue();
        assertThat(isRead(b1)).isFalse();
        assertThat(isRead(others)).isFalse();
    }

    @Test
    void markReadFiltersByTypeAndMapsContractNames() {
        OfferingDTO a = createOffering(TERM, "类型班", "chapter");
        enrollStudent(a.id(), STUDENT);
        String notice = insertNotification(STUDENT, "notice_published", "公告", a.id(), NOW.minusSeconds(30), false);
        String assignment = insertNotification(STUDENT, "assignment_published", "作业", a.id(), NOW.minusSeconds(20), false);
        String feedback = insertNotification(STUDENT, "feedback_published", "反馈", a.id(), NOW.minusSeconds(10), false);
        String system = insertNotification(STUDENT, "offering_archived", "系统", a.id(), NOW.minusSeconds(5), false);

        dashboard.markMessagesRead(STUDENT, a.id(), "feedback");
        assertThat(isRead(feedback)).isTrue();
        assertThat(isRead(notice) || isRead(assignment) || isRead(system)).isFalse();

        dashboard.markMessagesRead(STUDENT, a.id(), "course_notice");
        assertThat(isRead(notice)).isTrue();
        assertThat(isRead(assignment) || isRead(system)).isFalse();

        dashboard.markMessagesRead(STUDENT, a.id(), "system");
        assertThat(isRead(system)).isTrue();
        assertThat(isRead(assignment)).isFalse();

        // help_reply 在 P1 没有对应消息：不更新任何行但仍成功
        assertThat(dashboard.markMessagesRead(STUDENT, a.id(), "help_reply").markedAt()).isNotNull();
        assertThat(isRead(assignment)).isFalse();

        dashboard.markMessagesRead(STUDENT, a.id(), "assignment_published");
        assertThat(isRead(assignment)).isTrue();
    }

    @Test
    void markReadValidatesTypeAndRole() {
        OfferingDTO a = createOffering(TERM, "校验班", "chapter");
        enrollStudent(a.id(), STUDENT);
        String id = insertNotification(STUDENT, "notice_published", "公告", a.id(), NOW.minusSeconds(30), false);
        assertThatThrownBy(() -> dashboard.markMessagesRead(STUDENT, a.id(), "bogus")).satisfies(t -> {
            assertCode(t, 422, "VALIDATION_ERROR");
            assertThat(((BusinessException) t).getDetails()).containsKey("fields");
        });
        assertThat(isRead(id)).isFalse();
        // 教师：403；非本班学生与不存在的班：404；坏 UUID：422
        assertThatThrownBy(() -> dashboard.markMessagesRead(TEACHER, a.id(), null)).satisfies(t -> assertCode(t, 403, "FORBIDDEN"));
        assertThatThrownBy(() -> dashboard.markMessagesRead(OUTSIDER, a.id(), null)).satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
        assertThatThrownBy(() -> dashboard.markMessagesRead(STUDENT, UUID.randomUUID().toString(), null)).satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
        assertThatThrownBy(() -> dashboard.markMessagesRead(STUDENT, "bad", null)).satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
        assertThat(isRead(id)).isFalse();
    }

    // ---------- helpers ----------

    private record Fixture(String offeringId, String assignmentId, String submissionId) {}

    /** 创建班级、发布一个 web_lab 作业、学生保存并提交。 */
    private Fixture submitted() {
        OfferingDTO offering = createOffering(TERM, "反馈班", "chapter");
        enrollStudent(offering.id(), STUDENT);
        TeacherAssignmentDTO a = publishAssignment(offering.id(), "作业一", 3, "web_lab", true);
        String submissionId = saveAndSubmit(STUDENT, a.id());
        return new Fixture(offering.id(), a.id(), submissionId);
    }

    private String saveAndSubmit(UserDTO student, String assignmentId) { return saveAndSubmit(student, assignmentId, "index.html"); }

    private String saveAndSubmit(UserDTO student, String assignmentId, String path) {
        Map<String, Object> save = new HashMap<>();
        save.put("baseRevision", 0);
        save.put("files", List.of(Map.of("path", path, "content", "V1")));
        save.put("activeFile", path);
        assignmentService.saveWorkspace(student, assignmentId, save, "save");
        return assignmentService.submitAssignment(student, assignmentId,
                new HashMap<>(Map.of("workspaceRevision", 1, "reflection", "完成")), "submit").submission().id();
    }

    private String saveAndSubmit(String assignmentId) { return saveAndSubmit(STUDENT, assignmentId); }

    private Map<String, Object> feedbackBody(int baseVersion) {
        Map<String, Object> body = new HashMap<>();
        body.put("baseVersion", baseVersion);
        body.put("score", new BigDecimal("80"));
        body.put("rubricResults", List.of(
                Map.of("criterionId", "layout", "score", new BigDecimal("50"), "comment", "布局"),
                Map.of("criterionId", "quality", "score", new BigDecimal("30"), "comment", "质量")));
        body.put("comment", "整体不错");
        body.put("knowledgeEvaluations", List.of());
        return body;
    }

    private TeacherAssignmentDTO publishAssignment(String offeringId, String title, int dueInDays, String type, boolean required) {
        TeacherAssignmentDTO a = createDraft(offeringId, title, dueInDays, type, required);
        return assignmentService.publishAssignment(TEACHER, a.id(), "publish");
    }

    private static String filePathFor(String type) {
        return switch (type) {
            case "web_lab" -> "index.html";
            case "sql_text" -> "answer.sql";
            default -> "answer.md";
        };
    }

    private TeacherAssignmentDTO createDraft(String offeringId, String title, int dueInDays) {
        return createDraft(offeringId, title, dueInDays, "text", true);
    }

    private TeacherAssignmentDTO createDraft(String offeringId, String title, int dueInDays, String type, boolean required) {
        Map<String, Object> body = new HashMap<>();
        body.put("chapterId", null);
        body.put("title", title);
        body.put("description", title + "说明");
        body.put("estimatedMinutes", 30);
        body.put("type", type);
        body.put("isRequired", required);
        body.put("dueAt", NOW.plus(Duration.ofDays(dueInDays)).toString());
        body.put("lateUntil", NOW.plus(Duration.ofDays(dueInDays + 3)).toString());
        body.put("allowResubmit", true);
        body.put("maxAttempts", 3);
        body.put("maxScore", new BigDecimal("100.00"));
        body.put("requirements", List.of("完成"));
        body.put("rubric", List.of(
                Map.of("criterionId", "layout", "title", "布局", "description", "布局", "maxScore", new BigDecimal("60.00")),
                Map.of("criterionId", "quality", "title", "质量", "description", "质量", "maxScore", new BigDecimal("40.00"))));
        body.put("initialFiles", List.of(Map.of("path", filePathFor(type), "content", "初始内容")));
        body.put("knowledgePointIds", List.of());
        return assignmentService.createAssignment(TEACHER, offeringId, body, "create");
    }

    private OfferingDTO createOffering(String termId, String title, String unit) {
        return courseService.createOffering(TEACHER, Map.of("courseId", COURSE, "termId", termId,
                "title", title, "groupName", "一班", "progressUnit", unit), "offering");
    }

    private void enrollStudent(String offeringId, UserDTO student) {
        InviteCreatedDTO invite = courseService.createInvite(TEACHER, offeringId,
                Map.of("expiresAt", NOW.plusSeconds(3600).toString(), "maxUses", 10), "invite");
        courseService.enroll(student, Map.of("inviteCode", invite.inviteCode()), "enroll");
    }

    private String insertChapter(String offeringId, int position, String status, boolean required) {
        String id = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO chapters(id,offering_id,position,title,summary,status,is_required,content_version,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,?,?,?)",
                id, offeringId, position, "章节" + position, "章节" + position + "简介", status, required ? 1 : 0,
                "draft".equals(status) ? null : ts(NOW), ts(NOW), ts(NOW));
        return id;
    }

    private void completeChapter(String offeringId, UserDTO student, String chapterId) {
        String memberId = jdbc.queryForObject("SELECT id FROM offering_members WHERE offering_id=? AND user_id=?",
                String.class, offeringId, student.id());
        jdbc.update("INSERT INTO chapter_progress(id,offering_id,member_id,chapter_id,status,completed_at,last_opened_at,created_at,updated_at) VALUES(?,?,?,?,'completed',?,?,?,?)",
                UUID.randomUUID().toString(), offeringId, memberId, chapterId, ts(NOW), ts(NOW), ts(NOW), ts(NOW));
    }

    private String insertNotification(UserDTO recipient, String type, String title, String offeringId, Instant createdAt, boolean read) {
        String id = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO notifications(id,recipient_id,type,title,content,related_offering_id,is_read,read_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                id, recipient.id(), type, title, title + "内容", offeringId, read ? 1 : 0, read ? ts(createdAt) : null, ts(createdAt));
        return id;
    }

    private boolean isRead(String notificationId) {
        return jdbc.queryForObject("SELECT is_read FROM notifications WHERE id=?", Integer.class, notificationId) == 1;
    }

    private static void assertCode(Throwable t, int status, String code) {
        assertThat(t).isInstanceOfSatisfying(BusinessException.class, e -> {
            assertThat(e.getCode()).isEqualTo(code);
            assertThat(e.getStatus().value()).isEqualTo(status);
        });
    }

    private static java.sql.Timestamp ts(Instant i) { return java.sql.Timestamp.from(i); }

    private static UserDTO user(String suffix, String username, String role) {
        return new UserDTO("00000000-0000-4000-8000-0000000000" + suffix, username, "看板测试用户", List.of(role));
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FixedClockConfiguration {
        @Bean @Primary Clock clock() { return Clock.fixed(NOW, ZoneOffset.UTC); }
    }
}
