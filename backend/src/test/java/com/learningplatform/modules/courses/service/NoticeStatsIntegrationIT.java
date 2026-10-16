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

/** P1-D 公告与教师统计（listNotices/getNotice/createNotice/getOfferingStats/getAssignmentStats/getStudentLearningRecords）真实 MySQL 集成测试。 */
@SpringBootTest(properties = "AUTH_INVITE_SIGNING_KEY=test-only-invite-signing-key-at-least-32-characters")
@Testcontainers
@Import(NoticeStatsIntegrationIT.FixedClockConfiguration.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class NoticeStatsIntegrationIT {
    private static final Instant NOW = Instant.parse("2026-10-15T08:00:00.123456Z");
    private static final String COURSE = "00000000-0000-4000-8000-0000000000c1";
    private static final String TERM = "00000000-0000-4000-8000-0000000000c2";
    private static final UserDTO TEACHER = user("c3", "ns.teacher", "teacher");
    private static final UserDTO STUDENT = user("c4", "ns.student", "student");
    private static final UserDTO OTHER_STUDENT = user("c5", "ns.other", "student");
    private static final UserDTO OUTSIDER = user("c6", "ns.outsider", "student");
    private static final UserDTO OTHER_TEACHER = user("c7", "ns.teacher2", "teacher");
    private static final JsonMapper JSON = JsonMapper.builder().findAndAddModules().build();

    @Container
    static final MySQLContainer mysql = new MySQLContainer("mysql:8.4.11")
            .withDatabaseName("learning_platform_notice_stats_test")
            .withUsername("ns_test").withPassword(UUID.randomUUID().toString())
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
    @Autowired private NoticeService notices;
    @Autowired private TeacherStatsService stats;
    @Autowired private JdbcTemplate jdbc;

    @BeforeEach
    void reset() {
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
        for (UserDTO u : List.of(TEACHER, STUDENT, OTHER_STUDENT, OUTSIDER, OTHER_TEACHER)) {
            jdbc.update("INSERT INTO users(id,username,display_name,password_hash,roles,status,created_at,updated_at) VALUES(?,?,?,?,CAST(? AS JSON),'active',?,?)",
                    u.id(), u.username(), u.displayName(), "TEST_ONLY_NOT_A_REAL_HASH", JSON.writeValueAsString(u.roles()), ts(NOW), ts(NOW));
        }
        jdbc.update("INSERT INTO terms(id,label,starts_at,ends_at,is_current,created_at,updated_at) VALUES(?,?,?,?,1,?,?)",
                TERM, "当前学期", ts(NOW.minus(Duration.ofDays(30))), ts(NOW.plus(Duration.ofDays(100))), ts(NOW), ts(NOW));
        jdbc.update("INSERT INTO courses(id,code,mark,title,description,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,'active',?,?,?)",
                COURSE, "ns-course", "NSC", "公告统计测试课程", "测试", TEACHER.id(), ts(NOW), ts(NOW));
    }

    // ---------- createNotice / listNotices / getNotice ----------

    @Test
    void wholeClassNoticeIsVisibleToEveryMemberAndNotifiesEveryActiveStudent() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        enrollStudent(offering.id(), OTHER_STUDENT);
        NoticeDTO created = notices.createNotice(offering.id(), TEACHER, body("全班公告", "内容"), "notice-1");
        assertThat(created.offeringId()).isEqualTo(offering.id());
        assertThat(created.title()).isEqualTo("全班公告");
        assertThat(created.target()).isNull();
        assertThat(created.recipientCount()).isEqualTo(2);
        assertThat(created.createdAt()).isEqualTo(NOW);
        for (UserDTO viewer : List.of(STUDENT, OTHER_STUDENT, TEACHER)) {
            NoticePage page = notices.listNotices(offering.id(), viewer, 1, 20);
            assertThat(page.total()).isEqualTo(1);
            assertThat(page.page()).isEqualTo(1);
            assertThat(page.pageSize()).isEqualTo(20);
            assertThat(page.items()).extracting(NoticeDTO::id).containsExactly(created.id());
            assertThat(page.items().get(0).recipientCount()).isEqualTo(2);
            assertThat(notices.getNotice(created.id(), viewer).content()).isEqualTo("内容");
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notifications WHERE type='notice_published' AND related_offering_id=?",
                Integer.class, offering.id())).isEqualTo(2);
        assertThat(jdbc.queryForList("SELECT recipient_id FROM notifications WHERE type='notice_published'", String.class))
                .containsExactlyInAnyOrder(STUDENT.id(), OTHER_STUDENT.id());
        // 本次发布写入审计
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_logs WHERE action='NOTICE_CREATED' AND target_id=?",
                Integer.class, created.id())).isEqualTo(1);
    }

    @Test
    void noticeNotificationsOnlyGoToActiveStudents() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        enrollStudent(offering.id(), OTHER_STUDENT);
        jdbc.update("UPDATE offering_members SET status='inactive' WHERE offering_id=? AND user_id=?", offering.id(), OTHER_STUDENT.id());
        NoticeDTO created = notices.createNotice(offering.id(), TEACHER, body("t", "c"), "notice-2");
        assertThat(created.recipientCount()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notifications WHERE type='notice_published'", Integer.class)).isEqualTo(1);
        // 已退出的成员不再是本班成员，不能读取公告
        assertThatThrownBy(() -> notices.listNotices(offering.id(), OTHER_STUDENT, 1, 20)).satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
        assertThatThrownBy(() -> notices.getNotice(created.id(), OTHER_STUDENT)).satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
    }

    @Test
    void emptyClassNoticeHasZeroRecipients() {
        OfferingDTO offering = createOffering();
        NoticeDTO created = notices.createNotice(offering.id(), TEACHER, body("空班", "内容"), "notice-3");
        assertThat(created.recipientCount()).isZero();
        assertThat(notices.listNotices(offering.id(), TEACHER, 1, 20).total()).isEqualTo(1);
    }

    @Test
    void targetedNoticeIsOnlyVisibleToItsStudentAndTeachers() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        enrollStudent(offering.id(), OTHER_STUDENT);
        // createNotice 契约的 target 是跳转对象而非收件人，定向公告只能由库内数据产生（notices.target_student_id）。
        String personal = insertNotice(offering.id(), STUDENT.id(), "个人公告", NOW.minusSeconds(10));
        String whole = insertNotice(offering.id(), null, "全班公告", NOW.minusSeconds(20));
        NoticePage mine = notices.listNotices(offering.id(), STUDENT, 1, 20);
        assertThat(mine.total()).isEqualTo(2);
        assertThat(mine.items()).extracting(NoticeDTO::id).containsExactly(personal, whole);
        assertThat(mine.items().get(0).recipientCount()).isEqualTo(1);
        NoticePage others = notices.listNotices(offering.id(), OTHER_STUDENT, 1, 20);
        assertThat(others.total()).isEqualTo(1);
        assertThat(others.items()).extracting(NoticeDTO::id).containsExactly(whole);
        assertThat(notices.listNotices(offering.id(), TEACHER, 1, 20).total()).isEqualTo(2);
        assertThat(notices.getNotice(personal, STUDENT).id()).isEqualTo(personal);
        assertThat(notices.getNotice(personal, TEACHER).id()).isEqualTo(personal);
        assertThat(notices.getNotice(whole, OTHER_STUDENT).id()).isEqualTo(whole);
        assertThatThrownBy(() -> notices.getNotice(personal, OTHER_STUDENT)).satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
    }

    @Test
    void noticesAreInvisibleOutsideTheOffering() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        NoticeDTO created = notices.createNotice(offering.id(), TEACHER, body("t", "c"), "notice-4");
        for (UserDTO outsider : List.of(OUTSIDER, OTHER_TEACHER)) {
            assertThatThrownBy(() -> notices.listNotices(offering.id(), outsider, 1, 20)).satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
            assertThatThrownBy(() -> notices.getNotice(created.id(), outsider)).satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
        }
        assertThatThrownBy(() -> notices.getNotice(UUID.randomUUID().toString(), STUDENT)).satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
        assertThatThrownBy(() -> notices.getNotice("not-a-uuid", STUDENT)).satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
    }

    @Test
    void listNoticesPagesByCreatedAtDescWithRealTotal() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        String oldest = insertNotice(offering.id(), null, "最早", NOW.minusSeconds(300));
        String middle = insertNotice(offering.id(), null, "中间", NOW.minusSeconds(200));
        String newest = insertNotice(offering.id(), null, "最新", NOW.minusSeconds(100));
        NoticePage first = notices.listNotices(offering.id(), STUDENT, 1, 2);
        assertThat(first.items()).extracting(NoticeDTO::id).containsExactly(newest, middle);
        assertThat(first.total()).isEqualTo(3);
        NoticePage second = notices.listNotices(offering.id(), STUDENT, 2, 2);
        assertThat(second.items()).extracting(NoticeDTO::id).containsExactly(oldest);
        NoticePage beyond = notices.listNotices(offering.id(), STUDENT, 9, 2);
        assertThat(beyond.items()).isEmpty();
        assertThat(beyond.total()).isEqualTo(3);
        assertThatThrownBy(() -> notices.listNotices(offering.id(), STUDENT, 0, 20)).satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
        assertThatThrownBy(() -> notices.listNotices(offering.id(), STUDENT, 1, 101)).satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
    }

    @Test
    void createNoticeValidatesFieldsAndPermissions() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        assertThatThrownBy(() -> notices.createNotice(offering.id(), TEACHER, body("", "c"), "v1")).satisfies(t -> assertField(t, "title"));
        assertThatThrownBy(() -> notices.createNotice(offering.id(), TEACHER, body("a".repeat(201), "c"), "v2")).satisfies(t -> assertField(t, "title"));
        assertThatThrownBy(() -> notices.createNotice(offering.id(), TEACHER, body("t", "c".repeat(8001)), "v3")).satisfies(t -> assertField(t, "content"));
        Map<String, Object> noContent = new HashMap<>(Map.of("title", "t"));
        assertThatThrownBy(() -> notices.createNotice(offering.id(), TEACHER, noContent, "v4")).satisfies(t -> assertField(t, "content"));
        Map<String, Object> badType = new HashMap<>(Map.of("title", 5, "content", "c"));
        assertThatThrownBy(() -> notices.createNotice(offering.id(), TEACHER, badType, "v5")).satisfies(t -> assertField(t, "title"));
        Map<String, Object> unknown = body("t", "c");
        unknown.put("targetStudentId", STUDENT.id());
        assertThatThrownBy(() -> notices.createNotice(offering.id(), TEACHER, unknown, "v6")).satisfies(t -> assertCode(t, 400, "INVALID_REQUEST"));
        Map<String, Object> withTarget = body("t", "c");
        withTarget.put("target", Map.of("type", "assignment", "id", UUID.randomUUID().toString(), "offeringId", offering.id()));
        // 非 null target 不再无条件拒绝：不存在的目标 id 为 422 target.id（成功路径见 createNoticeWithTarget*）
        assertThatThrownBy(() -> notices.createNotice(offering.id(), TEACHER, withTarget, "v7")).satisfies(t -> assertField(t, "target.id"));
        assertThatThrownBy(() -> notices.createNotice("not-a-uuid", TEACHER, body("t", "c"), "v8")).satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
        // 校验失败不产生任何公告与通知
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notices", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notifications", Integer.class)).isZero();
        // 学生角色 403；非本班教师与班外学生 404
        assertThatThrownBy(() -> notices.createNotice(offering.id(), STUDENT, body("t", "c"), "p1")).satisfies(t -> assertCode(t, 403, "FORBIDDEN"));
        assertThatThrownBy(() -> notices.createNotice(offering.id(), OTHER_TEACHER, body("t", "c"), "p2")).satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
        // 显式 target:null 与空正文合法
        Map<String, Object> nullTarget = body("t", "");
        nullTarget.put("target", null);
        assertThat(notices.createNotice(offering.id(), TEACHER, nullTarget, "ok").content()).isEmpty();
    }

    // ---------- 公告跳转目标（V9 target_type/target_id） ----------

    private static Map<String, Object> targetBody(String type, String id, String offeringId) {
        Map<String, Object> m = body("带目标公告", "内容");
        Map<String, Object> target = new HashMap<>();
        target.put("type", type);
        target.put("id", id);
        target.put("offeringId", offeringId);
        m.put("target", target);
        return m;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> targetOf(Map<String, Object> bodyWithTarget) {
        return (Map<String, Object>) bodyWithTarget.get("target");
    }

    private String insertChapter(String offeringId) {
        String id = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO chapters(id,offering_id,position,title,summary,status,is_required,content_version,published_at,created_at,updated_at) VALUES(?,?,1,'章','','draft',1,1,NULL,?,?)",
                id, offeringId, ts(NOW), ts(NOW));
        return id;
    }

    private String insertResource(String offeringId, String chapterId) {
        String id = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO resources(id,offering_id,chapter_id,title,content_markdown,position,created_at,updated_at) VALUES(?,?,?,'资料','原文',1,?,?)",
                id, offeringId, chapterId, ts(NOW), ts(NOW));
        return id;
    }

    private static void assertTarget(NoticeDTO dto, String type, String id, String offeringId) {
        assertThat(dto.target()).isNotNull();
        assertThat(dto.target().type()).isEqualTo(type);
        assertThat(dto.target().id()).isEqualTo(id);
        assertThat(dto.target().offeringId()).isEqualTo(offeringId);
    }

    @Test
    void createNoticeWithTargetPersistsAndReadsBackIdenticallyInDetailAndList() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        String assignmentId = publishAssignment(offering.id(), "目标作业").id();
        String chapterId = insertChapter(offering.id());
        String resourceId = insertResource(offering.id(), chapterId);
        String feedbackSubmission = saveAndSubmit(STUDENT, publishAssignment(offering.id(), "评价作业").id());
        publishReview(feedbackSubmission);
        String feedbackId = jdbc.queryForObject("SELECT id FROM feedback WHERE submission_id=?", String.class, feedbackSubmission);
        List<String[]> targets = List.of(
                new String[]{"assignment", assignmentId}, new String[]{"chapter", chapterId},
                new String[]{"resource", resourceId}, new String[]{"feedback", feedbackId},
                new String[]{"offering", offering.id()});
        int i = 0;
        for (String[] t : targets) {
            NoticeDTO created = notices.createNotice(offering.id(), TEACHER, targetBody(t[0], t[1], offering.id()), "tg-" + (i++));
            assertTarget(created, t[0], t[1], offering.id());
            assertThat(jdbc.queryForMap("SELECT target_type, target_id FROM notices WHERE id=?", created.id()))
                    .containsEntry("target_type", t[0]).containsEntry("target_id", t[1]);
            for (UserDTO viewer : List.of(STUDENT, TEACHER)) {
                assertThat(notices.getNotice(created.id(), viewer).target()).isEqualTo(created.target());
                NoticeDTO listed = notices.listNotices(offering.id(), viewer, 1, 50).items().stream()
                        .filter(n -> n.id().equals(created.id())).findFirst().orElseThrow();
                assertThat(listed.target()).isEqualTo(created.target());
            }
        }
        NoticeDTO plain = notices.createNotice(offering.id(), TEACHER, body("无目标", "c"), "tg-plain");
        assertThat(plain.target()).isNull();
        assertThat(notices.getNotice(plain.id(), STUDENT).target()).isNull();
    }

    @Test
    void noticesTargetColumnsAreCheckedByDatabase() {
        OfferingDTO offering = createOffering();
        String id = UUID.randomUUID().toString();
        String sql = "INSERT INTO notices(id,offering_id,author_id,target_type,target_id,title,content,created_at) VALUES(?,?,?,?,?,'t','c',?)";
        // MySQL 8 的 CHECK 违反（错误码 3819）被 Spring 归为 UncategorizedSQLException，按约束名断言。
        // 只写一列
        assertThatThrownBy(() -> jdbc.update(sql, id, offering.id(), TEACHER.id(), "chapter", null, ts(NOW)))
                .hasMessageContaining("ck_notices_target_pair");
        assertThatThrownBy(() -> jdbc.update(sql, id, offering.id(), TEACHER.id(), null, UUID.randomUUID().toString(), ts(NOW)))
                .hasMessageContaining("ck_notices_target_pair");
        // 类型不在枚举内（含大小写不同）
        assertThatThrownBy(() -> jdbc.update(sql, id, offering.id(), TEACHER.id(), "bogus", UUID.randomUUID().toString(), ts(NOW)))
                .hasMessageContaining("ck_notices_target_type");
        assertThatThrownBy(() -> jdbc.update(sql, id, offering.id(), TEACHER.id(), "Chapter", UUID.randomUUID().toString(), ts(NOW)))
                .hasMessageContaining("ck_notices_target_type");
        // 两列同为 NULL 与同非 NULL 合法
        assertThat(jdbc.update(sql, id, offering.id(), TEACHER.id(), null, null, ts(NOW))).isEqualTo(1);
        assertThat(jdbc.update(sql, UUID.randomUUID().toString(), offering.id(), TEACHER.id(), "help_request", UUID.randomUUID().toString(), ts(NOW))).isEqualTo(1);
    }

    @Test
    void createNoticeRejectsInvalidTargetsWith422AndWritesNothing() {
        OfferingDTO offering = createOffering();
        OfferingDTO other = createOffering();
        enrollStudent(offering.id(), STUDENT);
        String otherChapter = insertChapter(other.id());
        String otherResource = insertResource(other.id(), otherChapter);
        String otherAssignment = publishAssignment(other.id(), "他班作业").id();
        String draftSubmission = saveAndSubmit(STUDENT, publishAssignment(offering.id(), "草稿评价作业").id());
        assignmentService.saveFeedback(TEACHER, draftSubmission, feedbackBody(0), "draft-only");
        String draftFeedbackId = jdbc.queryForObject("SELECT id FROM feedback WHERE submission_id=?", String.class, draftSubmission);
        String uuid = UUID.randomUUID().toString();
        String mine = offering.id();

        assertThatThrownBy(() -> notices.createNotice(mine, TEACHER, targetBody("assignment", otherAssignment, other.id()), "r1"))
                .satisfies(t -> assertField(t, "target.offeringId"));
        assertThatThrownBy(() -> notices.createNotice(mine, TEACHER, targetBody("chapter", otherChapter, mine), "r2"))
                .satisfies(t -> assertField(t, "target.id"));
        assertThatThrownBy(() -> notices.createNotice(mine, TEACHER, targetBody("assignment", otherAssignment, mine), "r3"))
                .satisfies(t -> assertField(t, "target.id"));
        assertThatThrownBy(() -> notices.createNotice(mine, TEACHER, targetBody("resource", otherResource, mine), "r4"))
                .satisfies(t -> assertField(t, "target.id"));
        assertThatThrownBy(() -> notices.createNotice(mine, TEACHER, targetBody("offering", other.id(), mine), "r5"))
                .satisfies(t -> assertField(t, "target.id"));
        for (String type : List.of("chapter", "resource", "assignment", "feedback", "offering")) {
            assertThatThrownBy(() -> notices.createNotice(mine, TEACHER, targetBody(type, uuid, mine), "r6-" + type))
                    .satisfies(t -> assertField(t, "target.id"));
        }
        // 草稿评价不可作为目标
        assertThatThrownBy(() -> notices.createNotice(mine, TEACHER, targetBody("feedback", draftFeedbackId, mine), "r7"))
                .satisfies(t -> assertField(t, "target.id"));
        // help_request：P1 不支持
        assertThatThrownBy(() -> notices.createNotice(mine, TEACHER, targetBody("help_request", uuid, mine), "r8"))
                .satisfies(t -> assertField(t, "target.type"));
        assertThatThrownBy(() -> notices.createNotice(mine, TEACHER, targetBody("bogus", uuid, mine), "r9"))
                .satisfies(t -> assertField(t, "target.type"));
        assertThatThrownBy(() -> notices.createNotice(mine, TEACHER, targetBody("chapter", "not-a-uuid", mine), "r10"))
                .satisfies(t -> assertField(t, "target.id"));
        assertThatThrownBy(() -> notices.createNotice(mine, TEACHER, targetBody("chapter", uuid, "not-a-uuid"), "r11"))
                .satisfies(t -> assertField(t, "target.offeringId"));
        Map<String, Object> notObject = body("t", "c");
        notObject.put("target", "assignment");
        assertThatThrownBy(() -> notices.createNotice(mine, TEACHER, notObject, "r12")).satisfies(t -> assertField(t, "target"));
        // 键不完整或多余
        for (String missing : List.of("type", "id", "offeringId")) {
            Map<String, Object> partial = targetBody("chapter", uuid, mine);
            targetOf(partial).remove(missing);
            assertThatThrownBy(() -> notices.createNotice(mine, TEACHER, partial, "r13-" + missing)).satisfies(t -> assertField(t, "target"));
        }
        Map<String, Object> extra = targetBody("chapter", uuid, mine);
        targetOf(extra).put("extra", "x");
        assertThatThrownBy(() -> notices.createNotice(mine, TEACHER, extra, "r14")).satisfies(t -> assertField(t, "target"));
        // 校验失败不产生公告与公告通知
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notices", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notifications WHERE type='notice_published'", Integer.class)).isZero();
    }

    @Test
    void createNoticeBoundaryLengthsAndOverlongNotificationContentDoNot500() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        NoticeDTO maxTitle = notices.createNotice(offering.id(), TEACHER, body("题".repeat(200), "c"), "b1");
        assertThat(maxTitle.title()).hasSize(200);
        NoticeDTO maxContent = notices.createNotice(offering.id(), TEACHER, body("长公告", "文".repeat(8000)), "b2");
        assertThat(maxContent.content().codePointCount(0, maxContent.content().length())).isEqualTo(8000);
        assertThat(notices.getNotice(maxContent.id(), STUDENT).content()).hasSize(8000);
        // 通知正文截断到 2000 字符，公告全文仍完整
        assertThat(jdbc.queryForObject("SELECT CHAR_LENGTH(content) FROM notifications WHERE title='长公告'", Integer.class)).isEqualTo(2000);
        assertThat(jdbc.queryForObject("SELECT CHAR_LENGTH(content) FROM notices WHERE id=?", Integer.class, maxContent.id())).isEqualTo(8000);
        // 增补字符（代理对）不会在截断处被劈开
        NoticeDTO emoji = notices.createNotice(offering.id(), TEACHER, body("表情", "😀".repeat(3000)), "b3");
        assertThat(emoji.recipientCount()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT CHAR_LENGTH(content) FROM notifications WHERE title='表情'", Integer.class)).isEqualTo(2000);
        // 同标题的两次发布各自计数，recipientCount 互不干扰
        OfferingDTO second = createOffering();
        enrollStudent(second.id(), STUDENT);
        enrollStudent(second.id(), OTHER_STUDENT);
        assertThat(notices.createNotice(second.id(), TEACHER, body("表情", "x"), "b4").recipientCount()).isEqualTo(2);
        assertThat(notices.getNotice(emoji.id(), TEACHER).recipientCount()).isEqualTo(1);
    }

    @Test
    void createNoticeOnArchivedOfferingIsRejectedButReadable() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        NoticeDTO before = notices.createNotice(offering.id(), TEACHER, body("t", "c"), "a1");
        jdbc.update("UPDATE course_offerings SET status='archived' WHERE id=?", offering.id());
        assertThatThrownBy(() -> notices.createNotice(offering.id(), TEACHER, body("t2", "c"), "a2")).satisfies(t -> assertCode(t, 409, "OFFERING_ARCHIVED"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notices", Integer.class)).isEqualTo(1);
        assertThat(notices.listNotices(offering.id(), STUDENT, 1, 20).total()).isEqualTo(1);
        assertThat(notices.getNotice(before.id(), TEACHER).id()).isEqualTo(before.id());
    }

    @Test
    void noticeAndNotificationsRollBackTogether() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        // 审计 requestId 不合法会在通知写入之后抛错，整个事务必须回滚，公告与通知都不留下。
        assertThatThrownBy(() -> notices.createNotice(offering.id(), TEACHER, body("t", "c"), "bad request id!"))
                .isInstanceOf(RuntimeException.class);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notices", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notifications", Integer.class)).isZero();
    }

    // ---------- getOfferingStats ----------

    @Test
    void offeringStatsAreZeroWithoutData() {
        OfferingDTO offering = createOffering();
        OfferingStatsDTO s = stats.getOfferingStats(offering.id(), TEACHER);
        assertThat(s.studentCount()).isZero();
        assertThat(s.activeAssignmentCount()).isZero();
        assertThat(s.pendingReviewCount()).isZero();
        assertThat(s.pendingHelpCount()).isZero();
    }

    @Test
    void offeringStatsCountRealData() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        enrollStudent(offering.id(), OTHER_STUDENT);
        TeacherAssignmentDTO a1 = publishAssignment(offering.id(), "作业一");
        TeacherAssignmentDTO a2 = publishAssignment(offering.id(), "作业二");
        createDraft(offering.id(), "草稿");
        String archived = publishAssignment(offering.id(), "归档").id();
        assignmentService.archiveAssignment(TEACHER, archived, "archive");
        String s1 = saveAndSubmit(STUDENT, a1.id());
        saveAndSubmit(OTHER_STUDENT, a1.id());
        saveAndSubmit(STUDENT, a2.id());
        publishReview(s1);
        OfferingStatsDTO s = stats.getOfferingStats(offering.id(), TEACHER);
        assertThat(s.studentCount()).isEqualTo(2);
        assertThat(s.activeAssignmentCount()).isEqualTo(2);
        assertThat(s.pendingReviewCount()).isEqualTo(2);
        assertThat(s.pendingHelpCount()).isZero();
        jdbc.update("UPDATE offering_members SET status='inactive' WHERE offering_id=? AND user_id=?", offering.id(), OTHER_STUDENT.id());
        assertThat(stats.getOfferingStats(offering.id(), TEACHER).studentCount()).isEqualTo(1);
    }

    @Test
    void offeringStatsAreScopedToTheOffering() {
        OfferingDTO one = createOffering();
        OfferingDTO two = createOffering();
        enrollStudent(one.id(), STUDENT);
        enrollStudent(two.id(), STUDENT);
        enrollStudent(two.id(), OTHER_STUDENT);
        publishAssignment(two.id(), "他班作业");
        assertThat(stats.getOfferingStats(one.id(), TEACHER).studentCount()).isEqualTo(1);
        assertThat(stats.getOfferingStats(one.id(), TEACHER).activeAssignmentCount()).isZero();
        assertThat(stats.getOfferingStats(two.id(), TEACHER).studentCount()).isEqualTo(2);
    }

    @Test
    void offeringStatsRejectNonTeachers() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        assertThatThrownBy(() -> stats.getOfferingStats(offering.id(), OTHER_TEACHER)).satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
        assertThatThrownBy(() -> stats.getOfferingStats(offering.id(), STUDENT)).satisfies(t -> assertCode(t, 403, "FORBIDDEN"));
        assertThatThrownBy(() -> stats.getOfferingStats(UUID.randomUUID().toString(), TEACHER)).satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
        assertThatThrownBy(() -> stats.getOfferingStats("not-a-uuid", TEACHER)).satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
    }

    // ---------- getAssignmentStats ----------

    @Test
    void assignmentStatsWithoutSubmissionsCountsOnlyStudents() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        enrollStudent(offering.id(), OTHER_STUDENT);
        TeacherAssignmentDTO a = publishAssignment(offering.id(), "无提交");
        AssignmentStatsDTO s = stats.getAssignmentStats(a.id(), TEACHER);
        assertThat(s.studentCount()).isEqualTo(2);
        assertThat(s.submittedStudentCount()).isZero();
        assertThat(s.pendingReviewCount()).isZero();
        assertThat(s.reviewedStudentCount()).isZero();
        assertThat(s.commonIssues()).isEmpty();
    }

    @Test
    void assignmentStatsCountRealSubmissionsAndReviews() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        enrollStudent(offering.id(), OTHER_STUDENT);
        TeacherAssignmentDTO a = publishAssignment(offering.id(), "有数据");
        TeacherAssignmentDTO other = publishAssignment(offering.id(), "另一份作业");
        String s1 = saveAndSubmit(STUDENT, a.id());
        saveAndSubmit(OTHER_STUDENT, a.id());
        saveAndSubmit(STUDENT, other.id());
        AssignmentStatsDTO before = stats.getAssignmentStats(a.id(), TEACHER);
        assertThat(before.studentCount()).isEqualTo(2);
        assertThat(before.submittedStudentCount()).isEqualTo(2);
        assertThat(before.pendingReviewCount()).isEqualTo(2);
        assertThat(before.reviewedStudentCount()).isZero();
        publishReview(s1);
        AssignmentStatsDTO after = stats.getAssignmentStats(a.id(), TEACHER);
        assertThat(after.submittedStudentCount()).isEqualTo(2);
        assertThat(after.pendingReviewCount()).isEqualTo(1);
        assertThat(after.reviewedStudentCount()).isEqualTo(1);
        assertThat(after.commonIssues()).isEmpty();
        // 另一份作业的数据互不影响
        assertThat(stats.getAssignmentStats(other.id(), TEACHER).submittedStudentCount()).isEqualTo(1);
    }

    @Test
    void assignmentStatsRejectNonOwningTeacherStudentAndUnknownAssignment() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        TeacherAssignmentDTO a = publishAssignment(offering.id(), "作业");
        assertThatThrownBy(() -> stats.getAssignmentStats(a.id(), OTHER_TEACHER)).satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
        assertThatThrownBy(() -> stats.getAssignmentStats(a.id(), STUDENT)).satisfies(t -> assertCode(t, 403, "FORBIDDEN"));
        assertThatThrownBy(() -> stats.getAssignmentStats(UUID.randomUUID().toString(), TEACHER)).satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
        assertThatThrownBy(() -> stats.getAssignmentStats("not-a-uuid", TEACHER)).satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
    }

    // ---------- getStudentLearningRecords ----------

    @Test
    void studentLearningRecordsWithoutDataAreEmptyButNotAnError() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        TeacherLearningRecordsDTO r = stats.getStudentLearningRecords(offering.id(), STUDENT.id(), TEACHER, 1, 20);
        assertThat(r.offeringId()).isEqualTo(offering.id());
        assertThat(r.student().id()).isEqualTo(STUDENT.id());
        assertThat(r.student().username()).isEqualTo(STUDENT.username());
        assertThat(r.student().displayName()).isEqualTo(STUDENT.displayName());
        assertThat(r.summary().completedLabCount()).isZero();
        assertThat(r.summary().publishedFeedbackCount()).isZero();
        assertThat(r.summary().needsPracticeCount()).isNull();
        assertThat(r.recentFeedback()).isNull();
        assertThat(r.feedbackPage().items()).isEmpty();
        assertThat(r.feedbackPage().total()).isZero();
        assertThat(r.knowledgeEvidence()).isEmpty();
        assertThat(r.nextRecommendation()).isNull();
    }

    @Test
    void studentLearningRecordsUseTheSameDataAsTheStudentView() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        enrollStudent(offering.id(), OTHER_STUDENT);
        TeacherAssignmentDTO lab = publishLab(offering.id(), "实验一");
        TeacherAssignmentDTO text = publishAssignment(offering.id(), "文字作业");
        String labSubmission = saveAndSubmit(STUDENT, lab.id());
        String textSubmission = saveAndSubmit(STUDENT, text.id());
        saveAndSubmit(OTHER_STUDENT, lab.id());
        String otherSubmission = jdbc.queryForObject("SELECT id FROM submissions WHERE student_id=?", String.class, OTHER_STUDENT.id());
        publishReview(labSubmission);
        publishReview(otherSubmission);
        TeacherLearningRecordsDTO r = stats.getStudentLearningRecords(offering.id(), STUDENT.id(), TEACHER, 1, 20);
        assertThat(r.summary().completedLabCount()).isEqualTo(1);
        assertThat(r.summary().publishedFeedbackCount()).isEqualTo(1);
        assertThat(r.feedbackPage().total()).isEqualTo(1);
        assertThat(r.feedbackPage().page()).isEqualTo(1);
        assertThat(r.feedbackPage().pageSize()).isEqualTo(20);
        assertThat(r.feedbackPage().items()).hasSize(1);
        TeacherFeedbackDTO fb = r.feedbackPage().items().get(0);
        assertThat(fb.status()).isEqualTo("published");
        assertThat(fb.submissionId()).isEqualTo(labSubmission);
        assertThat(fb.messageId()).isNull();
        assertThat(fb.score()).isEqualByComparingTo(new BigDecimal("80"));
        assertThat(r.recentFeedback().id()).isEqualTo(fb.id());
        // 另一名学生的评价不出现；未发布的草稿评价也不出现
        assertThat(fb.id()).isNotEqualTo(jdbc.queryForObject("SELECT id FROM feedback WHERE student_id=?", String.class, OTHER_STUDENT.id()));
        assignmentService.saveFeedback(TEACHER, textSubmission, feedbackBody(0), "draft-only");
        assertThat(stats.getStudentLearningRecords(offering.id(), STUDENT.id(), TEACHER, 1, 20).feedbackPage().total()).isEqualTo(1);
    }

    @Test
    void studentLearningRecordsPageFeedbackNewestFirst() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        String first = saveAndSubmit(STUDENT, publishAssignment(offering.id(), "一").id());
        String second = saveAndSubmit(STUDENT, publishAssignment(offering.id(), "二").id());
        publishReview(first);
        publishReview(second);
        jdbc.update("UPDATE feedback SET published_at=? WHERE submission_id=?", ts(NOW.minusSeconds(100)), first);
        jdbc.update("UPDATE feedback SET published_at=? WHERE submission_id=?", ts(NOW.minusSeconds(10)), second);
        TeacherLearningRecordsDTO p1 = stats.getStudentLearningRecords(offering.id(), STUDENT.id(), TEACHER, 1, 1);
        assertThat(p1.feedbackPage().total()).isEqualTo(2);
        assertThat(p1.feedbackPage().items()).extracting(TeacherFeedbackDTO::submissionId).containsExactly(second);
        assertThat(p1.recentFeedback().submissionId()).isEqualTo(second);
        TeacherLearningRecordsDTO p2 = stats.getStudentLearningRecords(offering.id(), STUDENT.id(), TEACHER, 2, 1);
        assertThat(p2.feedbackPage().items()).extracting(TeacherFeedbackDTO::submissionId).containsExactly(first);
        assertThat(p2.feedbackPage().page()).isEqualTo(2);
        // recentFeedback 始终是最新一条，不随页码变化
        assertThat(p2.recentFeedback().submissionId()).isEqualTo(second);
        TeacherLearningRecordsDTO beyond = stats.getStudentLearningRecords(offering.id(), STUDENT.id(), TEACHER, 9, 1);
        assertThat(beyond.feedbackPage().items()).isEmpty();
        assertThat(beyond.feedbackPage().total()).isEqualTo(2);
        assertThatThrownBy(() -> stats.getStudentLearningRecords(offering.id(), STUDENT.id(), TEACHER, 0, 20)).satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
        assertThatThrownBy(() -> stats.getStudentLearningRecords(offering.id(), STUDENT.id(), TEACHER, 1, 101)).satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
    }

    @Test
    void studentLearningRecordsRejectNonClassStudentsAndOtherTeachers() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        enrollStudent(offering.id(), OTHER_STUDENT);
        // 非本班学生、不存在的用户、教师自己、已退出的学生都是 404
        assertThatThrownBy(() -> stats.getStudentLearningRecords(offering.id(), OUTSIDER.id(), TEACHER, 1, 20)).satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
        assertThatThrownBy(() -> stats.getStudentLearningRecords(offering.id(), UUID.randomUUID().toString(), TEACHER, 1, 20)).satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
        assertThatThrownBy(() -> stats.getStudentLearningRecords(offering.id(), TEACHER.id(), TEACHER, 1, 20)).satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
        jdbc.update("UPDATE offering_members SET status='inactive' WHERE offering_id=? AND user_id=?", offering.id(), OTHER_STUDENT.id());
        assertThatThrownBy(() -> stats.getStudentLearningRecords(offering.id(), OTHER_STUDENT.id(), TEACHER, 1, 20)).satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
        // 非本班教师 404、学生角色 403、非法 ID 422
        assertThatThrownBy(() -> stats.getStudentLearningRecords(offering.id(), STUDENT.id(), OTHER_TEACHER, 1, 20)).satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
        assertThatThrownBy(() -> stats.getStudentLearningRecords(offering.id(), STUDENT.id(), STUDENT, 1, 20)).satisfies(t -> assertCode(t, 403, "FORBIDDEN"));
        assertThatThrownBy(() -> stats.getStudentLearningRecords(offering.id(), "not-a-uuid", TEACHER, 1, 20)).satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
        assertThatThrownBy(() -> stats.getStudentLearningRecords("not-a-uuid", STUDENT.id(), TEACHER, 1, 20)).satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
    }

    @Test
    void studentLearningRecordsOnlyShowEvidenceFromThisOffering() {
        OfferingDTO one = createOffering();
        OfferingDTO two = createOffering();
        enrollStudent(one.id(), STUDENT);
        enrollStudent(two.id(), STUDENT);
        publishReview(saveAndSubmit(STUDENT, publishAssignment(two.id(), "他班作业").id()));
        assertThat(stats.getStudentLearningRecords(one.id(), STUDENT.id(), TEACHER, 1, 20).feedbackPage().total()).isZero();
        assertThat(stats.getStudentLearningRecords(two.id(), STUDENT.id(), TEACHER, 1, 20).feedbackPage().total()).isEqualTo(1);
    }

    // ---------- helpers ----------

    private int offeringSeq = 0;

    private OfferingDTO createOffering() {
        return courseService.createOffering(TEACHER, Map.of("courseId", COURSE, "termId", TERM,
                "title", "公告统计班" + (++offeringSeq), "groupName", "一班", "progressUnit", "chapter"), "offering");
    }

    private void enrollStudent(String offeringId, UserDTO student) {
        InviteCreatedDTO invite = courseService.createInvite(TEACHER, offeringId,
                Map.of("expiresAt", NOW.plusSeconds(3600).toString(), "maxUses", 10), "invite");
        courseService.enroll(student, Map.of("inviteCode", invite.inviteCode()), "enroll");
    }

    private static Map<String, Object> body(String title, String content) {
        Map<String, Object> m = new HashMap<>();
        m.put("title", title);
        m.put("content", content);
        return m;
    }

    /** 直接写库：createNotice 契约无收件人字段，定向公告只能这样构造。 */
    private String insertNotice(String offeringId, String targetStudentId, String title, Instant createdAt) {
        String id = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO notices(id,offering_id,author_id,target_student_id,title,content,created_at) VALUES(?,?,?,?,?,?,?)",
                id, offeringId, TEACHER.id(), targetStudentId, title, title + "内容", ts(createdAt));
        return id;
    }

    private TeacherAssignmentDTO publishAssignment(String offeringId, String title) {
        return assignmentService.publishAssignment(TEACHER, createDraft(offeringId, title, "text").id(), "publish");
    }

    private TeacherAssignmentDTO publishLab(String offeringId, String title) {
        return assignmentService.publishAssignment(TEACHER, createDraft(offeringId, title, "web_lab").id(), "publish");
    }

    private TeacherAssignmentDTO createDraft(String offeringId, String title) {
        return createDraft(offeringId, title, "text");
    }

    private TeacherAssignmentDTO createDraft(String offeringId, String title, String type) {
        Map<String, Object> body = new HashMap<>();
        body.put("chapterId", null);
        body.put("title", title);
        body.put("description", title + "说明");
        body.put("estimatedMinutes", 30);
        body.put("type", type);
        body.put("isRequired", true);
        body.put("dueAt", NOW.plus(Duration.ofDays(3)).toString());
        body.put("lateUntil", NOW.plus(Duration.ofDays(6)).toString());
        body.put("allowResubmit", true);
        body.put("maxAttempts", 3);
        body.put("maxScore", new BigDecimal("100.00"));
        body.put("requirements", List.of("完成"));
        body.put("rubric", List.of(
                Map.of("criterionId", "layout", "title", "布局", "description", "布局", "maxScore", new BigDecimal("60.00")),
                Map.of("criterionId", "quality", "title", "质量", "description", "质量", "maxScore", new BigDecimal("40.00"))));
        body.put("initialFiles", List.of(Map.of("path", "web_lab".equals(type) ? "index.html" : "answer.md", "content", "初始内容")));
        body.put("knowledgePointIds", List.of());
        return assignmentService.createAssignment(TEACHER, offeringId, body, "create");
    }

    /** 学生保存并提交；文件路径按作业类型选择。 */
    private String saveAndSubmit(UserDTO student, String assignmentId) {
        String type = jdbc.queryForObject("SELECT type FROM assignments WHERE id=?", String.class, assignmentId);
        String path = "web_lab".equals(type) ? "index.html" : "answer.md";
        Map<String, Object> save = new HashMap<>();
        save.put("baseRevision", 0);
        save.put("files", List.of(Map.of("path", path, "content", "V1")));
        save.put("activeFile", path);
        assignmentService.saveWorkspace(student, assignmentId, save, "save");
        return assignmentService.submitAssignment(student, assignmentId,
                new HashMap<>(Map.of("workspaceRevision", 1, "reflection", "完成")), "submit").submission().id();
    }

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

    /** 保存草稿并发布评价（得分 80）。 */
    private void publishReview(String submissionId) {
        assignmentService.saveFeedback(TEACHER, submissionId, feedbackBody(0), "draft");
        assignmentService.publishFeedback(TEACHER, submissionId, new HashMap<>(Map.of("baseVersion", 1)), "publish");
    }

    private static void assertCode(Throwable t, int status, String code) {
        assertThat(t).isInstanceOfSatisfying(BusinessException.class, e -> {
            assertThat(e.getCode()).isEqualTo(code);
            assertThat(e.getStatus().value()).isEqualTo(status);
        });
    }

    /** 422 VALIDATION_ERROR 且 details.fields 含指定字段。 */
    private static void assertField(Throwable t, String field) {
        assertCode(t, 422, "VALIDATION_ERROR");
        assertThat(t.toString() + ((BusinessException) t).getDetails()).contains(field);
    }

    private static java.sql.Timestamp ts(Instant i) { return java.sql.Timestamp.from(i); }

    private static UserDTO user(String suffix, String username, String role) {
        return new UserDTO("00000000-0000-4000-8000-0000000000" + suffix, username, "公告测试用户", List.of(role));
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FixedClockConfiguration {
        @Bean @Primary Clock clock() { return Clock.fixed(NOW, ZoneOffset.UTC); }
    }
}
