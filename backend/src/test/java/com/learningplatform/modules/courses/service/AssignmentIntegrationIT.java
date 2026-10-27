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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.courses.dto.AssignmentDTOs.*;
import com.learningplatform.modules.courses.dto.CourseDTOs.*;
import com.learningplatform.modules.courses.security.InviteCodeCodec;
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

@SpringBootTest(properties = "AUTH_INVITE_SIGNING_KEY=test-only-invite-signing-key-at-least-32-characters")
@Testcontainers
@Import(AssignmentIntegrationIT.FixedClockConfiguration.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class AssignmentIntegrationIT {
    private static final Instant NOW = Instant.parse("2026-10-15T08:00:00.123456Z");
    private static final String COURSE = "00000000-0000-4000-8000-0000000000a1";
    private static final String TERM = "00000000-0000-4000-8000-0000000000a2";
    private static final UserDTO TEACHER = user("a3", "assignment.teacher", "teacher");
    private static final UserDTO STUDENT = user("a4", "assignment.student", "student");
    private static final UserDTO OTHER_STUDENT = user("a5", "assignment.other", "student");
    private static final UserDTO OTHER_TEACHER = user("a6", "assignment.otherteacher", "teacher");
    private static final JsonMapper JSON = JsonMapper.builder().findAndAddModules().build();

    @Container
    static final MySQLContainer mysql = new MySQLContainer("mysql:8.4.11")
            .withDatabaseName("learning_platform_assignment_test")
            .withUsername("assignment_test").withPassword(UUID.randomUUID().toString())
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
    @Autowired private JdbcTemplate jdbc;
    @Autowired private InviteCodeCodec codes;

    @BeforeEach
    void reset() {
        // P2 子记录先于课程、作品与评价清理，保留外键验证。
        for (String table : List.of("knowledge_evidence", "feedback_knowledge_evaluations", "feedback_issue_tags",
                "submission_knowledge_snapshot", "learning_events")) {
            jdbc.update("DELETE FROM " + table);
        }
        jdbc.update("DELETE FROM notifications");
        jdbc.update("DELETE FROM notices");
        jdbc.update("DELETE FROM feedback_rubric_scores");
        jdbc.update("DELETE FROM feedback");
        jdbc.update("DELETE FROM submission_rubric_snapshot");
        jdbc.update("DELETE FROM submission_requirements_snapshot");
        jdbc.update("DELETE FROM submission_files");
        jdbc.update("DELETE FROM submissions");
        jdbc.update("DELETE FROM workspace_files");
        jdbc.update("DELETE FROM workspaces");
        jdbc.update("DELETE FROM assignment_knowledge_points");
        jdbc.update("DELETE FROM assignment_initial_files");
        jdbc.update("DELETE FROM assignment_rubric_criteria");
        jdbc.update("DELETE FROM assignment_requirements");
        jdbc.update("DELETE FROM assignments");
        jdbc.update("DELETE FROM chapter_progress");
        jdbc.update("UPDATE offering_members SET last_chapter_id=NULL");
        jdbc.update("DELETE FROM resources");
        jdbc.update("DELETE FROM knowledge_points");
        jdbc.update("DELETE FROM chapters");
        jdbc.update("DELETE FROM course_invites");
        jdbc.update("DELETE FROM offering_members");
        jdbc.update("DELETE FROM course_offerings");
        jdbc.update("DELETE FROM courses");
        jdbc.update("DELETE FROM terms");
        jdbc.update("DELETE FROM audit_logs");
        jdbc.update("DELETE FROM auth_sessions");
        jdbc.update("DELETE FROM users");
        for (UserDTO u : List.of(TEACHER, STUDENT, OTHER_STUDENT, OTHER_TEACHER)) {
            jdbc.update("INSERT INTO users(id,username,display_name,password_hash,roles,status,created_at,updated_at) VALUES(?,?,?,?,CAST(? AS JSON),'active',?,?)",
                    u.id(), u.username(), u.displayName(), "TEST_ONLY_NOT_A_REAL_HASH", JSON.writeValueAsString(u.roles()), ts(NOW), ts(NOW));
        }
        jdbc.update("INSERT INTO terms(id,label,starts_at,ends_at,is_current,created_at,updated_at) VALUES(?,?,?,?,1,?,?)",
                TERM, "作业测试学期", ts(NOW.minus(Duration.ofDays(30))), ts(NOW.plus(Duration.ofDays(100))), ts(NOW), ts(NOW));
        jdbc.update("INSERT INTO courses(id,code,mark,title,description,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,'active',?,?,?)",
                COURSE, "assignment-course", "ASG", "作业测试课程", "测试", TEACHER.id(), ts(NOW), ts(NOW));
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"作", "😀"})
    void maximumLengthAssignmentTitlePublishesBothNotificationTypes(String character) {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        String title = character.repeat(200);
        Map<String, Object> body = assignmentBody();
        body.put("title", title);
        TeacherAssignmentDTO assignment = assignmentService.createAssignment(TEACHER, offering.id(), body, "create");
        assertThat(assignmentService.publishAssignment(TEACHER, assignment.id(), "publish").publicationState())
                .isEqualTo("published");
        var submission = saveAndSubmit(assignment.id(), 0, "V1", "完成").submission();
        assignmentService.saveFeedback(TEACHER, submission.id(), feedbackBody(0, "50", "30"), "save-feedback");
        assertThat(assignmentService.publishFeedback(TEACHER, submission.id(), Map.of("baseVersion", 1), "publish-feedback").status())
                .isEqualTo("published");
        List<String> titles = jdbc.queryForList("SELECT title FROM notifications WHERE related_assignment_id=? ORDER BY type", String.class, assignment.id());
        assertThat(titles).hasSize(2);
        String publishedTitle = "新作业：" + title;
        String feedbackTitle = "作业《" + title + "》已获批阅";
        assertThat(titles).containsExactly(publishedTitle.substring(0, publishedTitle.offsetByCodePoints(0, 200)),
                feedbackTitle.substring(0, feedbackTitle.offsetByCodePoints(0, 200)));
        assertThat(jdbc.queryForList("SELECT CHAR_LENGTH(title) FROM notifications WHERE related_assignment_id=?", Integer.class, assignment.id()))
                .containsExactly(200, 200);
        assertThat(submission.assignmentId()).isEqualTo(assignment.id());
        assertThat(assignmentService.getTeacherAssignment(TEACHER, assignment.id()).title()).isEqualTo(title);
        assertThat(jdbc.queryForObject("SELECT assignment_title_snapshot FROM submissions WHERE id=?", String.class, submission.id())).isEqualTo(title);
    }

    @Test
    void unknownSubmissionFieldIsRejectedEvenForAnIdempotentRetry() {
        Ctx c = submittedAssignment();
        assertThatThrownBy(() -> assignmentService.submitAssignment(STUDENT, c.assignment().id(),
                Map.of("workspaceRevision", 1, "reflection", "完成", "unexpected", true), "unknown"))
                .isInstanceOfSatisfying(BusinessException.class, e -> {
                    assertThat(e.getCode()).isEqualTo("INVALID_REQUEST");
                    assertThat(e.getStatus().value()).isEqualTo(400);
                });
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM submissions WHERE assignment_id=?", Integer.class, c.assignment().id())).isEqualTo(1);
    }

    @Test
    void completeLifecycleCreatePublishSaveSubmitArchive() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);

        // 创建草稿作业
        TeacherAssignmentDTO draft = assignmentService.createAssignment(TEACHER, offering.id(), assignmentBody(), "create");
        assertThat(draft.publicationState()).isEqualTo("draft");
        assertThat(draft.submittedStudentCount()).isEqualTo(0);

        // 学生看不到草稿
        assertThatThrownBy(() -> assignmentService.getAssignment(STUDENT, draft.id()))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getCode()).isEqualTo("NOT_FOUND"));

        // 发布作业
        TeacherAssignmentDTO published = assignmentService.publishAssignment(TEACHER, draft.id(), "publish");
        assertThat(published.publicationState()).isEqualTo("published");
        assertThat(published.publishedAt()).isNotNull();

        // 学生可以看到并获取工作区
        AssignmentDetailDTO studentView = (AssignmentDetailDTO) assignmentService.getAssignment(STUDENT, published.id());
        assertThat(studentView.publicationState()).isEqualTo("published");
        assertThat(studentView.assignmentState()).isEqualTo("NOT_STARTED");
        assertThat(studentView.offeringStatus()).isEqualTo("active");
        assertThat(studentView.canSubmit()).isTrue();
        assertThat(studentView.submissionBlockedReason()).isNull();

        // 教师（本班教师）得到 TeacherAssignmentViewDTO：学生个人字段为 null
        Object teacherObj = assignmentService.getAssignment(TEACHER, published.id());
        assertThat(teacherObj).isInstanceOf(TeacherAssignmentViewDTO.class);
        TeacherAssignmentViewDTO teacherView = (TeacherAssignmentViewDTO) teacherObj;
        assertThat(teacherView.publicationState()).isEqualTo("published");
        assertThat(teacherView.assignmentState()).isNull();
        assertThat(teacherView.canSubmit()).isNull();
        assertThat(teacherView.attemptsUsed()).isNull();
        assertThat(teacherView.submissionBlockedReason()).isNull();

        WorkspaceDTO workspace = assignmentService.getWorkspace(STUDENT, published.id());
        assertThat(workspace.revision()).isEqualTo(0);
        assertThat(workspace.files()).hasSize(1);
        assertThat(workspace.canSave()).isTrue();

        // 保存工作区
        Map<String, Object> saveBody = new HashMap<>();
        saveBody.put("baseRevision", 0);
        saveBody.put("files", List.of(Map.of("path", "index.html", "content", "<h1>Updated</h1>")));
        saveBody.put("activeFile", "index.html");
        WorkspaceDTO saved = assignmentService.saveWorkspace(STUDENT, published.id(), saveBody, "save");
        assertThat(saved.revision()).isEqualTo(1);
        assertThat(saved.files()).hasSize(1);
        assertThat(saved.files().get(0).content()).isEqualTo("<h1>Updated</h1>");

        // 提交作业
        Map<String, Object> submitBody = new HashMap<>();
        submitBody.put("workspaceRevision", 1);
        submitBody.put("reflection", "已完成所有功能");
        AssignmentService.SubmissionCreatedResponse submission = assignmentService.submitAssignment(STUDENT, published.id(), submitBody, "submit");
        assertThat(submission.created()).isTrue();
        assertThat(submission.submission().attemptNumber()).isEqualTo(1);
        assertThat(submission.submission().late()).isFalse();

        // 验证提交快照
        SubmissionDetailDTO detail = (SubmissionDetailDTO) assignmentService.getSubmission(STUDENT, submission.submission().id());
        assertThat(detail.files()).hasSize(1);
        assertThat(detail.files().get(0).content()).isEqualTo("<h1>Updated</h1>");
        assertThat(detail.reflection()).isEqualTo("已完成所有功能");
        assertThat(detail.assignmentSnapshot().title()).isEqualTo("作业一");

        // 归档作业（有待评阅提交时拒绝）
        assertThatThrownBy(() -> assignmentService.archiveAssignment(TEACHER, published.id(), "archive-fail"))
                .isInstanceOfSatisfying(BusinessException.class, e -> {
                    assertThat(e.getCode()).isEqualTo("ARCHIVE_PENDING_REVIEWS");
                    assertThat(e.getStatus().value()).isEqualTo(409);
                });

        // 模拟评阅完成（更新 feedbacks 表，这里简化跳过）
        // 归档成功
        jdbc.update("UPDATE submissions SET is_current=0 WHERE id=?", submission.submission().id());
        TeacherAssignmentDTO archived = assignmentService.archiveAssignment(TEACHER, published.id(), "archive");
        assertThat(archived.publicationState()).isEqualTo("archived");
    }

    @Test
    void workspaceOptimisticLockPreventsConflict() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        TeacherAssignmentDTO assignment = assignmentService.createAssignment(TEACHER, offering.id(), assignmentBody(), "create");
        assignmentService.publishAssignment(TEACHER, assignment.id(), "publish");

        // 首次保存
        Map<String, Object> body1 = new HashMap<>();
        body1.put("baseRevision", 0);
        body1.put("files", List.of(Map.of("path", "index.html", "content", "V1")));
        body1.put("activeFile", "index.html");
        WorkspaceDTO saved1 = assignmentService.saveWorkspace(STUDENT, assignment.id(), body1, "save1");
        assertThat(saved1.revision()).isEqualTo(1);

        // 第二次保存
        Map<String, Object> body2 = new HashMap<>();
        body2.put("baseRevision", 1);
        body2.put("files", List.of(Map.of("path", "index.html", "content", "V2")));
        body2.put("activeFile", "index.html");
        WorkspaceDTO saved2 = assignmentService.saveWorkspace(STUDENT, assignment.id(), body2, "save2");
        assertThat(saved2.revision()).isEqualTo(2);

        // 尝试基于旧版本保存（冲突）
        Map<String, Object> bodyConflict = new HashMap<>();
        bodyConflict.put("baseRevision", 1);
        bodyConflict.put("files", List.of(Map.of("path", "index.html", "content", "Conflict")));
        bodyConflict.put("activeFile", "index.html");
        assertThatThrownBy(() -> assignmentService.saveWorkspace(STUDENT, assignment.id(), bodyConflict, "conflict"))
                .isInstanceOfSatisfying(BusinessException.class, e -> {
                    assertThat(e.getCode()).isEqualTo("WORKSPACE_CONFLICT");
                    assertThat(e.getStatus().value()).isEqualTo(409);
                    assertThat(e.getDetails()).containsEntry("currentRevision", 2);
                });

        // 数据库版本未变
        assertThat(jdbc.queryForObject("SELECT revision FROM workspaces WHERE assignment_id=? AND student_id=?",
                Integer.class, assignment.id(), STUDENT.id())).isEqualTo(2);
    }

    @Test
    void submissionIdempotencyPreventsDuplicates() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        TeacherAssignmentDTO assignment = assignmentService.createAssignment(TEACHER, offering.id(), assignmentBody(), "create");
        assignmentService.publishAssignment(TEACHER, assignment.id(), "publish");

        // 保存工作区
        Map<String, Object> saveBody = new HashMap<>();
        saveBody.put("baseRevision", 0);
        saveBody.put("files", List.of(Map.of("path", "index.html", "content", "V1")));
        saveBody.put("activeFile", "index.html");
        assignmentService.saveWorkspace(STUDENT, assignment.id(), saveBody, "save");

        // 首次提交
        Map<String, Object> submitBody = new HashMap<>();
        submitBody.put("workspaceRevision", 1);
        submitBody.put("reflection", "第一次提交");
        AssignmentService.SubmissionCreatedResponse first = assignmentService.submitAssignment(STUDENT, assignment.id(), submitBody, "submit1");
        assertThat(first.created()).isTrue();
        String submissionId = first.submission().id();

        // 相同 workspaceRevision 再次提交（幂等）
        Map<String, Object> submitBody2 = new HashMap<>();
        submitBody2.put("workspaceRevision", 1);
        submitBody2.put("reflection", "第二次提交（不应创建）");
        AssignmentService.SubmissionCreatedResponse second = assignmentService.submitAssignment(STUDENT, assignment.id(), submitBody2, "submit2");
        assertThat(second.created()).isFalse();
        assertThat(second.submission().id()).isEqualTo(submissionId);

        // 验证数据库只有一条记录
        int count = jdbc.queryForObject("SELECT COUNT(*) FROM submissions WHERE assignment_id=? AND student_id=?",
                Integer.class, assignment.id(), STUDENT.id());
        assertThat(count).isEqualTo(1);

        // reflection 保持首次值
        String reflection = jdbc.queryForObject("SELECT reflection FROM submissions WHERE id=?", String.class, submissionId);
        assertThat(reflection).isEqualTo("第一次提交");
    }

    @Test
    void concurrentWorkspaceSaveRespectOptimisticLock() throws Exception {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        TeacherAssignmentDTO assignment = assignmentService.createAssignment(TEACHER, offering.id(), assignmentBody(), "create");
        assignmentService.publishAssignment(TEACHER, assignment.id(), "publish");

        var pool = Executors.newFixedThreadPool(2);
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try {
            var task1 = pool.submit(() -> {
                ready.countDown();
                start.await(10, TimeUnit.SECONDS);
                Map<String, Object> body = new HashMap<>();
                body.put("baseRevision", 0);
                body.put("files", List.of(Map.of("path", "index.html", "content", "Thread1")));
                body.put("activeFile", "index.html");
                try {
                    assignmentService.saveWorkspace(STUDENT, assignment.id(), body, "t1");
                    return "success";
                } catch (BusinessException e) {
                    return e.getCode();
                }
            });
            var task2 = pool.submit(() -> {
                ready.countDown();
                start.await(10, TimeUnit.SECONDS);
                Map<String, Object> body = new HashMap<>();
                body.put("baseRevision", 0);
                body.put("files", List.of(Map.of("path", "index.html", "content", "Thread2")));
                body.put("activeFile", "index.html");
                try {
                    assignmentService.saveWorkspace(STUDENT, assignment.id(), body, "t2");
                    return "success";
                } catch (BusinessException e) {
                    return e.getCode();
                }
            });

            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            String result1 = task1.get(20, TimeUnit.SECONDS);
            String result2 = task2.get(20, TimeUnit.SECONDS);

            // 一个成功，一个冲突
            assertThat(List.of(result1, result2)).containsExactlyInAnyOrder("success", "WORKSPACE_CONFLICT");
        } finally {
            start.countDown();
            pool.shutdownNow();
        }

        // 最终版本为 1
        assertThat(jdbc.queryForObject("SELECT revision FROM workspaces WHERE assignment_id=? AND student_id=?",
                Integer.class, assignment.id(), STUDENT.id())).isEqualTo(1);
    }

    @Test
    void archivedAssignmentBlocksSaveAndSubmit() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        TeacherAssignmentDTO assignment = assignmentService.createAssignment(TEACHER, offering.id(), assignmentBody(), "create");
        assignmentService.publishAssignment(TEACHER, assignment.id(), "publish");

        // 模拟归档（绕过检查）
        jdbc.update("UPDATE assignments SET status='archived' WHERE id=?", assignment.id());

        // 保存工作区被阻止
        Map<String, Object> saveBody = new HashMap<>();
        saveBody.put("baseRevision", 0);
        saveBody.put("files", List.of(Map.of("path", "index.html", "content", "Test")));
        saveBody.put("activeFile", "index.html");
        assertThatThrownBy(() -> assignmentService.saveWorkspace(STUDENT, assignment.id(), saveBody, "save"))
                .isInstanceOfSatisfying(BusinessException.class, e -> {
                    assertThat(e.getCode()).isEqualTo("ASSIGNMENT_ARCHIVED");
                    assertThat(e.getStatus().value()).isEqualTo(409);
                });

        // 工作区与详情的阻断原因同样是契约枚举
        assertThat(assignmentService.getWorkspace(STUDENT, assignment.id()).saveBlockedReason()).isEqualTo("ASSIGNMENT_ARCHIVED");
        AssignmentDetailDTO archivedView = (AssignmentDetailDTO) assignmentService.getAssignment(STUDENT, assignment.id());
        assertThat(archivedView.canSubmit()).isFalse();
        assertThat(archivedView.submissionBlockedReason()).isEqualTo("ASSIGNMENT_ARCHIVED");

        // 提交被阻止
        Map<String, Object> submitBody = new HashMap<>();
        submitBody.put("workspaceRevision", 1);
        submitBody.put("reflection", "Test");
        assertThatThrownBy(() -> assignmentService.submitAssignment(STUDENT, assignment.id(), submitBody, "submit"))
                .isInstanceOfSatisfying(BusinessException.class, e -> {
                    assertThat(e.getCode()).isEqualTo("ASSIGNMENT_ARCHIVED");
                    assertThat(e.getStatus().value()).isEqualTo(409);
                });
    }

    @Test
    void maxAttemptsBlocksSubmission() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        Map<String, Object> body = assignmentBody();
        body.put("maxAttempts", 2);
        TeacherAssignmentDTO assignment = assignmentService.createAssignment(TEACHER, offering.id(), body, "create");
        assignmentService.publishAssignment(TEACHER, assignment.id(), "publish");

        // 第一次提交
        Map<String, Object> saveBody1 = new HashMap<>();
        saveBody1.put("baseRevision", 0);
        saveBody1.put("files", List.of(Map.of("path", "index.html", "content", "V1")));
        saveBody1.put("activeFile", "index.html");
        assignmentService.saveWorkspace(STUDENT, assignment.id(), saveBody1, "save1");
        Map<String, Object> submitBody1 = new HashMap<>();
        submitBody1.put("workspaceRevision", 1);
        submitBody1.put("reflection", "第一次");
        assignmentService.submitAssignment(STUDENT, assignment.id(), submitBody1, "submit1");

        // 第二次提交
        Map<String, Object> saveBody2 = new HashMap<>();
        saveBody2.put("baseRevision", 1);
        saveBody2.put("files", List.of(Map.of("path", "index.html", "content", "V2")));
        saveBody2.put("activeFile", "index.html");
        assignmentService.saveWorkspace(STUDENT, assignment.id(), saveBody2, "save2");
        Map<String, Object> submitBody2 = new HashMap<>();
        submitBody2.put("workspaceRevision", 2);
        submitBody2.put("reflection", "第二次");
        assignmentService.submitAssignment(STUDENT, assignment.id(), submitBody2, "submit2");

        // 第三次提交被阻止
        Map<String, Object> saveBody3 = new HashMap<>();
        saveBody3.put("baseRevision", 2);
        saveBody3.put("files", List.of(Map.of("path", "index.html", "content", "V3")));
        saveBody3.put("activeFile", "index.html");
        assignmentService.saveWorkspace(STUDENT, assignment.id(), saveBody3, "save3");
        Map<String, Object> submitBody3 = new HashMap<>();
        submitBody3.put("workspaceRevision", 3);
        submitBody3.put("reflection", "第三次");
        assertThatThrownBy(() -> assignmentService.submitAssignment(STUDENT, assignment.id(), submitBody3, "submit3"))
                .isInstanceOfSatisfying(BusinessException.class, e -> {
                    assertThat(e.getCode()).isEqualTo("ATTEMPT_LIMIT_REACHED");
                    assertThat(e.getMessage()).contains("最大提交次数");
                });
    }

    private static void assertCode(Throwable t, int status, String code) {
        assertThat(t).isInstanceOfSatisfying(BusinessException.class, e -> {
            assertThat(e.getCode()).isEqualTo(code);
            assertThat(e.getStatus().value()).isEqualTo(status);
        });
    }

    @Test
    void publishCreatesAssignmentPublishedNotificationsForActiveStudentsOnly() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        enrollStudent(offering.id(), OTHER_STUDENT);
        TeacherAssignmentDTO draft = assignmentService.createAssignment(TEACHER, offering.id(), assignmentBody(), "create");
        // 草稿阶段不产生通知
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notifications WHERE related_assignment_id=?", Integer.class, draft.id())).isZero();

        TeacherAssignmentDTO published = assignmentService.publishAssignment(TEACHER, draft.id(), "publish");
        assertThat(published.aiPolicyVersion()).isNull();
        assertThat(jdbc.queryForObject("SELECT content_version FROM assignments WHERE id=?", Integer.class, draft.id())).isEqualTo(1);

        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT recipient_id,type,related_offering_id,related_assignment_id,is_read FROM notifications WHERE related_assignment_id=? ORDER BY recipient_id",
                draft.id());
        assertThat(rows).hasSize(2);
        assertThat(rows).extracting(r -> r.get("recipient_id")).containsExactlyInAnyOrder(STUDENT.id(), OTHER_STUDENT.id());
        assertThat(rows).allSatisfy(r -> {
            assertThat(r.get("type")).isEqualTo("assignment_published");
            assertThat(r.get("related_offering_id")).isEqualTo(offering.id());
            assertThat(((Number) r.get("is_read")).intValue()).isZero();
        });
        // 教师不收到通知；学生可经通知接口读到该类型
        assertThat(assignmentService.listMessages(STUDENT, null, null, null, 1, 20).items())
                .extracting(NotificationDTO::type).containsExactly("assignment_published");

        // 重复发布不重复提醒
        assignmentService.publishAssignment(TEACHER, draft.id(), "publish-again");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notifications WHERE related_assignment_id=?", Integer.class, draft.id())).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT content_version FROM assignments WHERE id=?", Integer.class, draft.id())).isEqualTo(1);
    }

    @Test
    void publishRejectsIncompleteOrInconsistentDraftAndArchivedAssignment() {
        OfferingDTO offering = createOffering();
        TeacherAssignmentDTO draft = assignmentService.createAssignment(TEACHER, offering.id(), assignmentBody(), "create");
        // 绕过校验写入量规总分不一致的数据，发布时必须再次校验
        jdbc.update("UPDATE assignment_rubric_criteria SET max_score=10 WHERE assignment_id=? AND criterion_id='layout'", draft.id());
        assertThatThrownBy(() -> assignmentService.publishAssignment(TEACHER, draft.id(), "publish"))
                .satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
        assertThat(jdbc.queryForObject("SELECT status FROM assignments WHERE id=?", String.class, draft.id())).isEqualTo("draft");

        // 关联章节未发布 -> 不能发布
        TeacherAssignmentDTO chapterDraft = assignmentService.createAssignment(TEACHER, offering.id(), assignmentBody(), "create2");
        String chapterId = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO chapters(id,offering_id,position,title,summary,status,is_required,content_version,published_at,created_at,updated_at) VALUES(?,?,1,'章','','draft',1,1,NULL,?,?)",
                chapterId, offering.id(), ts(NOW), ts(NOW));
        jdbc.update("UPDATE assignments SET chapter_id=? WHERE id=?", chapterId, chapterDraft.id());
        assertThatThrownBy(() -> assignmentService.publishAssignment(TEACHER, chapterDraft.id(), "publish2"))
                .satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));

        // 归档作业再发布 -> 409 ASSIGNMENT_ARCHIVED
        TeacherAssignmentDTO ok = assignmentService.createAssignment(TEACHER, offering.id(), assignmentBody(), "create3");
        assignmentService.publishAssignment(TEACHER, ok.id(), "publish3");
        assignmentService.archiveAssignment(TEACHER, ok.id(), "archive3");
        assertThatThrownBy(() -> assignmentService.publishAssignment(TEACHER, ok.id(), "publish4"))
                .satisfies(t -> assertCode(t, 409, "ASSIGNMENT_ARCHIVED"));
    }

    @Test
    void archiveDraftReturns409AssignmentNotPublishedAndIsIdempotentWhenArchived() {
        OfferingDTO offering = createOffering();
        TeacherAssignmentDTO draft = assignmentService.createAssignment(TEACHER, offering.id(), assignmentBody(), "create");
        assertThatThrownBy(() -> assignmentService.archiveAssignment(TEACHER, draft.id(), "archive"))
                .satisfies(t -> assertCode(t, 409, "ASSIGNMENT_NOT_PUBLISHED"));
        assertThat(jdbc.queryForObject("SELECT status FROM assignments WHERE id=?", String.class, draft.id())).isEqualTo("draft");

        assignmentService.publishAssignment(TEACHER, draft.id(), "publish");
        assertThat(assignmentService.archiveAssignment(TEACHER, draft.id(), "archive").publicationState()).isEqualTo("archived");
        // 幂等归档：再次归档返回原结果
        assertThat(assignmentService.archiveAssignment(TEACHER, draft.id(), "archive-again").publicationState()).isEqualTo("archived");
    }

    @Test
    void archiveWithPendingReviewReturns409ThenSucceedsAfterFeedbackPublished() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        TeacherAssignmentDTO assignment = assignmentService.createAssignment(TEACHER, offering.id(), assignmentBody(), "create");
        assignmentService.publishAssignment(TEACHER, assignment.id(), "publish");
        Map<String, Object> save = new HashMap<>();
        save.put("baseRevision", 0);
        save.put("files", List.of(Map.of("path", "index.html", "content", "V1")));
        save.put("activeFile", "index.html");
        assignmentService.saveWorkspace(STUDENT, assignment.id(), save, "save");
        Map<String, Object> submit = new HashMap<>();
        submit.put("workspaceRevision", 1);
        submit.put("reflection", "完成");
        var created = assignmentService.submitAssignment(STUDENT, assignment.id(), submit, "submit");

        assertThatThrownBy(() -> assignmentService.archiveAssignment(TEACHER, assignment.id(), "archive"))
                .satisfies(t -> assertCode(t, 409, "ARCHIVE_PENDING_REVIEWS"));
        assertThat(assignmentService.getTeacherAssignment(TEACHER, assignment.id()).pendingReviewCount()).isEqualTo(1);

        // 走真实的 saveFeedback -> publishFeedback，不再绕过服务直接写已发布评价行。
        assignmentService.saveFeedback(TEACHER, created.submission().id(), feedbackBody(0, "55", "35"), "fb-save");
        assignmentService.publishFeedback(TEACHER, created.submission().id(), Map.of("baseVersion", 1), "fb-publish");

        assertThat(assignmentService.getTeacherAssignment(TEACHER, assignment.id()).pendingReviewCount()).isZero();
        assertThat(assignmentService.archiveAssignment(TEACHER, assignment.id(), "archive").publicationState()).isEqualTo("archived");
    }

    @Test
    void patchPublishedCoreFieldReturns409AndDeadlineRulesFollowContract() {
        OfferingDTO offering = createOffering();
        TeacherAssignmentDTO draft = assignmentService.createAssignment(TEACHER, offering.id(), assignmentBody(), "create");
        assignmentService.publishAssignment(TEACHER, draft.id(), "publish");

        for (Map<String, Object> core : List.of(Map.<String, Object>of("title", "新标题"), Map.<String, Object>of("maxScore", 50),
                Map.<String, Object>of("requirements", List.of("x")), Map.<String, Object>of("maxAttempts", 9))) {
            assertThatThrownBy(() -> assignmentService.patchAssignment(TEACHER, draft.id(), core, "patch"))
                    .satisfies(t -> assertCode(t, 409, "ASSIGNMENT_ALREADY_PUBLISHED"));
        }
        assertThat(jdbc.queryForObject("SELECT title FROM assignments WHERE id=?", String.class, draft.id())).isEqualTo("作业一");

        // 缩短 dueAt / 清空既有补交窗口 / 提前 lateUntil -> 409 ASSIGNMENT_ALREADY_PUBLISHED
        Instant due = NOW.plus(Duration.ofDays(7));
        Instant late = NOW.plus(Duration.ofDays(10));
        Map<String, Object> shorten = new HashMap<>();
        shorten.put("dueAt", due.minusSeconds(60).toString());
        assertThatThrownBy(() -> assignmentService.patchAssignment(TEACHER, draft.id(), shorten, "p1"))
                .satisfies(t -> assertCode(t, 409, "ASSIGNMENT_ALREADY_PUBLISHED"));
        Map<String, Object> clear = new HashMap<>();
        clear.put("lateUntil", null);
        assertThatThrownBy(() -> assignmentService.patchAssignment(TEACHER, draft.id(), clear, "p2"))
                .satisfies(t -> assertCode(t, 409, "ASSIGNMENT_ALREADY_PUBLISHED"));
        assertThatThrownBy(() -> assignmentService.patchAssignment(TEACHER, draft.id(), Map.of("lateUntil", late.minusSeconds(60).toString()), "p3"))
                .satisfies(t -> assertCode(t, 409, "ASSIGNMENT_ALREADY_PUBLISHED"));

        // 延长窗口与澄清 description 允许
        TeacherAssignmentDTO updated = assignmentService.patchAssignment(TEACHER, draft.id(),
                Map.of("description", "补充说明", "dueAt", due.plus(Duration.ofDays(1)).toString(),
                        "lateUntil", late.plus(Duration.ofDays(1)).toString()), "p4");
        assertThat(updated.description()).isEqualTo("补充说明");
        assertThat(updated.dueAt()).isEqualTo(due.plus(Duration.ofDays(1)));
        assertThat(updated.publicationState()).isEqualTo("published");

        // 归档后修改 -> ASSIGNMENT_ARCHIVED
        assignmentService.archiveAssignment(TEACHER, draft.id(), "archive");
        assertThatThrownBy(() -> assignmentService.patchAssignment(TEACHER, draft.id(), Map.of("description", "x"), "p5"))
                .satisfies(t -> assertCode(t, 409, "ASSIGNMENT_ARCHIVED"));
    }

    @Test
    void patchDraftAppliesPartialUpdateAndRevalidatesMergedContent() {
        OfferingDTO offering = createOffering();
        TeacherAssignmentDTO draft = assignmentService.createAssignment(TEACHER, offering.id(), assignmentBody(), "create");

        TeacherAssignmentDTO renamed = assignmentService.patchAssignment(TEACHER, draft.id(), Map.of("title", "改名"), "p1");
        assertThat(renamed.title()).isEqualTo("改名");
        assertThat(renamed.rubric()).hasSize(2);
        assertThat(renamed.requirements()).containsExactly("实现响应式布局", "通过所有测试");
        assertThat(renamed.initialFiles()).hasSize(1);

        // null 仅清空可空字段
        Map<String, Object> clearLate = new HashMap<>();
        clearLate.put("lateUntil", null);
        assertThat(assignmentService.patchAssignment(TEACHER, draft.id(), clearLate, "p2").lateUntil()).isNull();

        // 合并后量规总分与 maxScore 不一致 -> 422，且不落库
        assertThatThrownBy(() -> assignmentService.patchAssignment(TEACHER, draft.id(), Map.of("maxScore", 80), "p3"))
                .satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
        assertThat(jdbc.queryForObject("SELECT max_score FROM assignments WHERE id=?", BigDecimal.class, draft.id()))
                .isEqualByComparingTo("100");
        // 同时改 maxScore 与量规 -> 通过
        TeacherAssignmentDTO rescored = assignmentService.patchAssignment(TEACHER, draft.id(), Map.of("maxScore", 50,
                "rubric", List.of(Map.of("criterionId", "all", "title", "整体", "description", "d", "maxScore", 50))), "p4");
        assertThat(rescored.maxScore()).isEqualByComparingTo("50");
        assertThat(rescored.rubric()).extracting(RubricCriterion::criterionId).containsExactly("all");
        // 改 type 但文件不匹配 -> 400 INVALID_FILE_PATH
        assertThatThrownBy(() -> assignmentService.patchAssignment(TEACHER, draft.id(), Map.of("type", "sql_text"), "p5"))
                .satisfies(t -> assertCode(t, 400, "INVALID_FILE_PATH"));
        // 未知字段 400；空对象 422
        assertThatThrownBy(() -> assignmentService.patchAssignment(TEACHER, draft.id(), Map.of("bogus", 1), "p6"))
                .satisfies(t -> assertCode(t, 400, "INVALID_REQUEST"));
        assertThatThrownBy(() -> assignmentService.patchAssignment(TEACHER, draft.id(), Map.of(), "p7"))
                .satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
    }

    @Test
    void createAssignmentValidatesContractRulesAndDefaultsOptionalFields() {
        OfferingDTO offering = createOffering();
        // chapterId / lateUntil 可省略，默认 null；响应为教师 DTO
        Map<String, Object> minimal = assignmentBody();
        minimal.remove("chapterId");
        minimal.remove("lateUntil");
        TeacherAssignmentDTO created = assignmentService.createAssignment(TEACHER, offering.id(), minimal, "create");
        assertThat(created.chapterId()).isNull();
        assertThat(created.lateUntil()).isNull();
        assertThat(created.publicationState()).isEqualTo("draft");
        assertThat(created.publishedAt()).isNull();
        assertThat(created.aiPolicyVersion()).isNull();
        assertThat(created.initialFiles()).hasSize(1);
        assertThat(created.rubric()).hasSize(2);

        // 量规总分 != maxScore
        Map<String, Object> badSum = assignmentBody();
        badSum.put("maxScore", new BigDecimal("90.00"));
        assertThatThrownBy(() -> assignmentService.createAssignment(TEACHER, offering.id(), badSum, "c1"))
                .satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
        // criterionId 重复
        Map<String, Object> dup = assignmentBody();
        dup.put("rubric", List.of(
                Map.of("criterionId", "a", "title", "t", "description", "d", "maxScore", new BigDecimal("50.00")),
                Map.of("criterionId", "a", "title", "t", "description", "d", "maxScore", new BigDecimal("50.00"))));
        assertThatThrownBy(() -> assignmentService.createAssignment(TEACHER, offering.id(), dup, "c2"))
                .satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
        // 文件与 type 不匹配
        Map<String, Object> badFile = assignmentBody();
        badFile.put("initialFiles", List.of(Map.of("path", "answer.sql", "content", "SELECT 1")));
        assertThatThrownBy(() -> assignmentService.createAssignment(TEACHER, offering.id(), badFile, "c3"))
                .satisfies(t -> assertCode(t, 400, "INVALID_FILE_PATH"));
        // lateUntil <= dueAt
        Map<String, Object> badLate = assignmentBody();
        badLate.put("lateUntil", badLate.get("dueAt"));
        assertThatThrownBy(() -> assignmentService.createAssignment(TEACHER, offering.id(), badLate, "c4"))
                .satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
        // aiPolicyVersion 非 null / 缺必填 / 未知字段
        Map<String, Object> ai = assignmentBody();
        ai.put("aiPolicyVersion", 1);
        assertThatThrownBy(() -> assignmentService.createAssignment(TEACHER, offering.id(), ai, "c5"))
                .satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
        Map<String, Object> missing = assignmentBody();
        missing.remove("requirements");
        assertThatThrownBy(() -> assignmentService.createAssignment(TEACHER, offering.id(), missing, "c6"))
                .satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
        Map<String, Object> unknown = assignmentBody();
        unknown.put("bogus", true);
        assertThatThrownBy(() -> assignmentService.createAssignment(TEACHER, offering.id(), unknown, "c7"))
                .satisfies(t -> assertCode(t, 400, "INVALID_REQUEST"));
        // 章节 / 知识点不属于本班
        Map<String, Object> foreignChapter = assignmentBody();
        foreignChapter.put("chapterId", UUID.randomUUID().toString());
        assertThatThrownBy(() -> assignmentService.createAssignment(TEACHER, offering.id(), foreignChapter, "c8"))
                .satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
        Map<String, Object> foreignKp = assignmentBody();
        foreignKp.put("knowledgePointIds", List.of(UUID.randomUUID().toString()));
        assertThatThrownBy(() -> assignmentService.createAssignment(TEACHER, offering.id(), foreignKp, "c9"))
                .satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
        // 校验失败不留脏数据
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM assignments", Integer.class)).isEqualTo(1);
    }

    @Test
    void teacherAssignmentAccessHidesOtherTeachersAndStudents() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        TeacherAssignmentDTO draft = assignmentService.createAssignment(TEACHER, offering.id(), assignmentBody(), "create");
        TeacherAssignmentDTO fetched = assignmentService.getTeacherAssignment(TEACHER, draft.id());
        assertThat(fetched.id()).isEqualTo(draft.id());
        assertThat(fetched.initialFiles()).hasSize(1);
        assertThat(fetched.submittedStudentCount()).isZero();
        // 学生角色 -> 403；
        assertThatThrownBy(() -> assignmentService.getTeacherAssignment(STUDENT, draft.id()))
                .satisfies(t -> assertCode(t, 403, "FORBIDDEN"));
    }

    /** 契约 FeedbackWrite：量规 layout 上限 60、quality 上限 40；总分为两项之和。 */
    private Map<String, Object> feedbackBody(int baseVersion, String layout, String quality) {
        BigDecimal l = new BigDecimal(layout), q = new BigDecimal(quality);
        Map<String, Object> body = new HashMap<>();
        body.put("baseVersion", baseVersion);
        body.put("score", l.add(q));
        body.put("rubricResults", List.of(
                Map.of("criterionId", "layout", "score", l, "comment", "布局"),
                Map.of("criterionId", "quality", "score", q, "comment", "质量")));
        body.put("comment", "整体不错");
        body.put("knowledgeEvaluations", List.of());
        return body;
    }

    private record Ctx(OfferingDTO offering, TeacherAssignmentDTO assignment, String submissionId) {}

    /** 创建班级、发布作业、学生保存并提交一次；返回第一次提交。 */
    private Ctx submittedAssignment() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        TeacherAssignmentDTO assignment = assignmentService.createAssignment(TEACHER, offering.id(), assignmentBody(), "create");
        assignmentService.publishAssignment(TEACHER, assignment.id(), "publish");
        Map<String, Object> save = new HashMap<>();
        save.put("baseRevision", 0);
        save.put("files", List.of(Map.of("path", "index.html", "content", "V1")));
        save.put("activeFile", "index.html");
        assignmentService.saveWorkspace(STUDENT, assignment.id(), save, "save");
        Map<String, Object> submit = new HashMap<>();
        submit.put("workspaceRevision", 1);
        submit.put("reflection", "完成");
        var created = assignmentService.submitAssignment(STUDENT, assignment.id(), submit, "submit");
        return new Ctx(offering, assignment, created.submission().id());
    }

    private String feedbackIdOf(String submissionId) {
        return jdbc.queryForObject("SELECT id FROM feedback WHERE submission_id=?", String.class, submissionId);
    }

    @Test
    void saveFeedbackCreatesThenUpdatesWithVersionIncrementAndContractShape() {
        Ctx c = submittedAssignment();
        var first = assignmentService.saveFeedback(TEACHER, c.submissionId(), feedbackBody(0, "50", "30"), "s1");
        assertThat(first.created()).isTrue();
        TeacherFeedbackDTO dto = first.feedback();
        assertThat(dto.version()).isEqualTo(1);
        assertThat(dto.status()).isEqualTo("draft");
        assertThat(dto.score()).isEqualByComparingTo("80");
        assertThat(dto.maxScore()).isEqualByComparingTo("100");
        assertThat(dto.rubricResults()).hasSize(2);
        assertThat(dto.publishedAt()).isNull();
        assertThat(dto.messageId()).isNull();
        assertThat(dto.teacher().id()).isEqualTo(TEACHER.id());
        assertThat(dto.assignmentId()).isEqualTo(c.assignment().id());
        assertThat(dto.offeringId()).isEqualTo(c.offering().id());

        var second = assignmentService.saveFeedback(TEACHER, c.submissionId(), feedbackBody(1, "60", "40"), "s2");
        assertThat(second.created()).isFalse();
        assertThat(second.feedback().version()).isEqualTo(2);
        assertThat(second.feedback().id()).isEqualTo(dto.id());
        assertThat(second.feedback().score()).isEqualByComparingTo("100");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM feedback_rubric_scores", Integer.class)).isEqualTo(2);
    }

    @Test
    void getFeedbackDraftReturnsEmptyThenCurrentTeacherFeedback() {
        Ctx c = submittedAssignment();

        AssignmentService.FeedbackDraftDTO empty = assignmentService.getFeedbackDraft(TEACHER, c.submissionId());
        assertThat(empty.feedback()).isNull();
        assertThat(empty.baseVersion()).isZero();

        assignmentService.saveFeedback(TEACHER, c.submissionId(), feedbackBody(0, "50", "30"), "draft-read-save");
        AssignmentService.FeedbackDraftDTO draft = assignmentService.getFeedbackDraft(TEACHER, c.submissionId());
        assertThat(draft.feedback()).isNotNull();
        assertThat(draft.feedback().status()).isEqualTo("draft");
        assertThat(draft.feedback().version()).isEqualTo(1);
        assertThat(draft.baseVersion()).isEqualTo(1);

        assignmentService.publishFeedback(TEACHER, c.submissionId(), Map.of("baseVersion", 1), "draft-read-publish");
        AssignmentService.FeedbackDraftDTO published = assignmentService.getFeedbackDraft(TEACHER, c.submissionId());
        assertThat(published.feedback().status()).isEqualTo("published");
        assertThat(published.baseVersion()).isEqualTo(2);

        assertThatThrownBy(() -> assignmentService.getFeedbackDraft(OTHER_TEACHER, c.submissionId()))
                .satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
    }

    @Test
    void staleBaseVersionReturnsConflictWithLatestCurrentVersion() {
        Ctx c = submittedAssignment();
        assignmentService.saveFeedback(TEACHER, c.submissionId(), feedbackBody(0, "50", "30"), "s1");
        assignmentService.saveFeedback(TEACHER, c.submissionId(), feedbackBody(1, "51", "30"), "s2");
        assignmentService.saveFeedback(TEACHER, c.submissionId(), feedbackBody(2, "52", "30"), "s3");

        assertThatThrownBy(() -> assignmentService.saveFeedback(TEACHER, c.submissionId(), feedbackBody(1, "53", "30"), "stale"))
                .isInstanceOfSatisfying(BusinessException.class, e -> {
                    assertThat(e.getStatus().value()).isEqualTo(409);
                    assertThat(e.getCode()).isEqualTo("FEEDBACK_VERSION_CONFLICT");
                    assertThat(e.getDetails()).containsEntry("currentVersion", 3);
                });
        assertThatThrownBy(() -> assignmentService.publishFeedback(TEACHER, c.submissionId(), Map.of("baseVersion", 1), "stale-pub"))
                .isInstanceOfSatisfying(BusinessException.class, e -> {
                    assertThat(e.getCode()).isEqualTo("FEEDBACK_VERSION_CONFLICT");
                    assertThat(e.getDetails()).containsEntry("currentVersion", 3);
                });
        // 首次创建时 baseVersion 必须为 0
        Ctx fresh = submittedAssignment();
        assertThatThrownBy(() -> assignmentService.saveFeedback(TEACHER, fresh.submissionId(), feedbackBody(5, "50", "30"), "bad"))
                .isInstanceOfSatisfying(BusinessException.class, e -> {
                    assertThat(e.getCode()).isEqualTo("FEEDBACK_VERSION_CONFLICT");
                    assertThat(e.getDetails()).containsEntry("currentVersion", 0);
                });
    }

    @Test
    void publishFeedbackWritesFeedbackPublishedNotificationOnceAndStudentReadsIt() {
        Ctx c = submittedAssignment();
        assignmentService.saveFeedback(TEACHER, c.submissionId(), feedbackBody(0, "50", "30"), "s1");
        String feedbackId = feedbackIdOf(c.submissionId());

        TeacherFeedbackDTO published = assignmentService.publishFeedback(TEACHER, c.submissionId(), Map.of("baseVersion", 1), "p1");
        assertThat(published.status()).isEqualTo("published");
        assertThat(published.version()).isEqualTo(2);
        assertThat(published.publishedAt()).isNotNull();
        assertThat(published.messageId()).isNull();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notifications WHERE type='feedback_published' AND recipient_id=? AND related_feedback_id=?",
                Integer.class, STUDENT.id(), feedbackId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notifications WHERE type='feedback'", Integer.class)).isZero();

        // 重复发布（旧版本号或当前版本号）原样返回，不增加版本和通知
        TeacherFeedbackDTO again = assignmentService.publishFeedback(TEACHER, c.submissionId(), Map.of("baseVersion", 1), "p2");
        TeacherFeedbackDTO again2 = assignmentService.publishFeedback(TEACHER, c.submissionId(), Map.of("baseVersion", 2), "p3");
        assertThat(again.version()).isEqualTo(2);
        assertThat(again2.version()).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notifications WHERE related_feedback_id=?", Integer.class, feedbackId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT base_version FROM feedback WHERE id=?", Integer.class, feedbackId)).isEqualTo(2);

        // 已发布后不能再保存草稿
        assertThatThrownBy(() -> assignmentService.saveFeedback(TEACHER, c.submissionId(), feedbackBody(2, "50", "30"), "s2"))
                .satisfies(t -> assertCode(t, 409, "FEEDBACK_ALREADY_PUBLISHED"));

        StudentFeedbackViewDTO view = assignmentService.getFeedback(STUDENT, feedbackId);
        assertThat(view.id()).isEqualTo(feedbackId);
        assertThat(view.status()).isEqualTo("published");
        assertThat(view.version()).isEqualTo(2);
        assertThat(view.score()).isEqualByComparingTo("80");
        assertThat(view.maxScore()).isEqualByComparingTo("100");
        assertThat(view.rubricResults()).hasSize(2);
        assertThat(view.assignmentTitle()).isEqualTo("作业一");
        assertThat(view.publishedAt()).isNotNull();
        String messageId = jdbc.queryForObject("SELECT id FROM notifications WHERE related_feedback_id=?", String.class, feedbackId);
        assertThat(view.messageId()).isEqualTo(messageId);
        assertThat(view.teacher().displayName()).isNotBlank();
    }

    @Test
    void publishAfterNewerSubmissionReturnsSubmissionSuperseded() {
        Ctx c = submittedAssignment();
        assignmentService.saveFeedback(TEACHER, c.submissionId(), feedbackBody(0, "50", "30"), "s1");

        Map<String, Object> save = new HashMap<>();
        save.put("baseRevision", 1);
        save.put("files", List.of(Map.of("path", "index.html", "content", "V2")));
        save.put("activeFile", "index.html");
        assignmentService.saveWorkspace(STUDENT, c.assignment().id(), save, "save2");
        Map<String, Object> submit = new HashMap<>();
        submit.put("workspaceRevision", 2);
        submit.put("reflection", "再次提交");
        assignmentService.submitAssignment(STUDENT, c.assignment().id(), submit, "submit2");

        assertThatThrownBy(() -> assignmentService.publishFeedback(TEACHER, c.submissionId(), Map.of("baseVersion", 1), "p"))
                .satisfies(t -> assertCode(t, 409, "SUBMISSION_SUPERSEDED"));
        assertThatThrownBy(() -> assignmentService.saveFeedback(TEACHER, c.submissionId(), feedbackBody(1, "50", "30"), "s"))
                .satisfies(t -> assertCode(t, 409, "SUBMISSION_SUPERSEDED"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notifications WHERE type='feedback_published'", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT status FROM feedback WHERE submission_id=?", String.class, c.submissionId())).isEqualTo("draft");
    }

    @Test
    void studentCannotReadDraftOrOthersFeedbackAndWrongRolesAreRejected() {
        Ctx c = submittedAssignment();
        enrollStudent(c.offering().id(), OTHER_STUDENT);
        assignmentService.saveFeedback(TEACHER, c.submissionId(), feedbackBody(0, "50", "30"), "s1");
        String feedbackId = feedbackIdOf(c.submissionId());

        // 草稿对本人也是 404
        assertThatThrownBy(() -> assignmentService.getFeedback(STUDENT, feedbackId))
                .satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
        assignmentService.publishFeedback(TEACHER, c.submissionId(), Map.of("baseVersion", 1), "p");
        assertThat(assignmentService.getFeedback(STUDENT, feedbackId).status()).isEqualTo("published");

        // 同班他人、教师本人（含授课教师）均不能经 /me/feedback 读取
        assertThatThrownBy(() -> assignmentService.getFeedback(OTHER_STUDENT, feedbackId))
                .satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
        assertThatThrownBy(() -> assignmentService.getFeedback(TEACHER, feedbackId))
                .satisfies(t -> assertCode(t, 403, "FORBIDDEN"));
        assertThatThrownBy(() -> assignmentService.getFeedback(STUDENT, UUID.randomUUID().toString()))
                .satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
    }

    @Test
    void otherOfferingTeacherAndStudentCannotWriteFeedback() {
        Ctx c = submittedAssignment();
        assertThatThrownBy(() -> assignmentService.saveFeedback(OTHER_TEACHER, c.submissionId(), feedbackBody(0, "50", "30"), "x"))
                .satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
        assertThatThrownBy(() -> assignmentService.publishFeedback(OTHER_TEACHER, c.submissionId(), Map.of("baseVersion", 0), "x"))
                .satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
        assertThatThrownBy(() -> assignmentService.saveFeedback(STUDENT, c.submissionId(), feedbackBody(0, "50", "30"), "x"))
                .satisfies(t -> assertCode(t, 403, "FORBIDDEN"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM feedback", Integer.class)).isZero();
    }

    @Test
    void rubricCommentAcceptsUpTo8000CharsAndRejectsLonger() {
        Ctx c = submittedAssignment();
        String long5000 = "评".repeat(5000);
        Map<String, Object> body = feedbackBody(0, "50", "30");
        body.put("rubricResults", List.of(
                Map.of("criterionId", "layout", "score", new BigDecimal("50"), "comment", long5000),
                Map.of("criterionId", "quality", "score", new BigDecimal("30"), "comment", "质量")));
        var saved = assignmentService.saveFeedback(TEACHER, c.submissionId(), body, "long-ok");
        assertThat(saved.feedback().rubricResults()).filteredOn(r -> "layout".equals(r.criterionId()))
                .singleElement().satisfies(r -> assertThat(r.comment()).isEqualTo(long5000));
        assertThat(jdbc.queryForObject("SELECT s.comment FROM feedback_rubric_scores s JOIN feedback f ON f.id=s.feedback_id WHERE f.submission_id=? AND s.criterion_id='layout'",
                String.class, c.submissionId())).isEqualTo(long5000);
        // 恰好 8000 通过，8001 为 422
        Map<String, Object> max = feedbackBody(1, "50", "30");
        max.put("rubricResults", List.of(
                Map.of("criterionId", "layout", "score", new BigDecimal("50"), "comment", "a".repeat(8000)),
                Map.of("criterionId", "quality", "score", new BigDecimal("30"), "comment", "质量")));
        assignmentService.saveFeedback(TEACHER, c.submissionId(), max, "max-ok");
        Map<String, Object> over = feedbackBody(2, "50", "30");
        over.put("rubricResults", List.of(
                Map.of("criterionId", "layout", "score", new BigDecimal("50"), "comment", "a".repeat(8001)),
                Map.of("criterionId", "quality", "score", new BigDecimal("30"), "comment", "质量")));
        assertThatThrownBy(() -> assignmentService.saveFeedback(TEACHER, c.submissionId(), over, "over"))
                .satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
    }

    @Test
    void feedbackScoresAreValidatedAgainstRubricSnapshotAndArchiveBlocksWrites() {
        Ctx c = submittedAssignment();
        // 单项超过量规上限 -> 422
        assertThatThrownBy(() -> assignmentService.saveFeedback(TEACHER, c.submissionId(), feedbackBody(0, "61", "10"), "x"))
                .satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
        // 总分与各项之和不一致 -> 422
        Map<String, Object> mismatch = feedbackBody(0, "50", "30");
        mismatch.put("score", new BigDecimal("99"));
        assertThatThrownBy(() -> assignmentService.saveFeedback(TEACHER, c.submissionId(), mismatch, "x"))
                .satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
        // 缺少量规项 -> 422
        Map<String, Object> missing = feedbackBody(0, "50", "30");
        missing.put("rubricResults", List.of(Map.of("criterionId", "layout", "score", new BigDecimal("50"), "comment", "c")));
        assertThatThrownBy(() -> assignmentService.saveFeedback(TEACHER, c.submissionId(), missing, "x"))
                .satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
        // 未知字段 -> 400 INVALID_REQUEST（旧字段名不再被接受）
        Map<String, Object> legacy = new HashMap<>();
        legacy.put("overallComment", "旧字段");
        assertThatThrownBy(() -> assignmentService.saveFeedback(TEACHER, c.submissionId(), legacy, "x"))
                .satisfies(t -> assertCode(t, 400, "INVALID_REQUEST"));
        // 无评价时发布 -> 404
        assertThatThrownBy(() -> assignmentService.publishFeedback(TEACHER, c.submissionId(), Map.of("baseVersion", 0), "x"))
                .satisfies(t -> assertCode(t, 404, "NOT_FOUND"));

        // 归档作业：先发布另一份评价让归档通过，再验证写入被拒
        assignmentService.saveFeedback(TEACHER, c.submissionId(), feedbackBody(0, "50", "30"), "s");
        assignmentService.publishFeedback(TEACHER, c.submissionId(), Map.of("baseVersion", 1), "p");
        assignmentService.archiveAssignment(TEACHER, c.assignment().id(), "archive");
        assertThatThrownBy(() -> assignmentService.publishFeedback(TEACHER, c.submissionId(), Map.of("baseVersion", 2), "x"))
                .satisfies(t -> assertCode(t, 409, "ASSIGNMENT_ARCHIVED"));
        assertThatThrownBy(() -> assignmentService.saveFeedback(TEACHER, c.submissionId(), feedbackBody(2, "50", "30"), "x"))
                .satisfies(t -> assertCode(t, 409, "ASSIGNMENT_ARCHIVED"));
    }

    // ---- P1-C 提交与消息对齐用例 ----

    private AssignmentService.SubmissionCreatedResponse saveAndSubmit(String assignmentId, int baseRevision, String content, String reflection) {
        Map<String, Object> save = new HashMap<>();
        save.put("baseRevision", baseRevision);
        save.put("files", List.of(Map.of("path", "index.html", "content", content)));
        save.put("activeFile", "index.html");
        assignmentService.saveWorkspace(STUDENT, assignmentId, save, "save");
        return assignmentService.submitAssignment(STUDENT, assignmentId,
                new HashMap<>(Map.of("workspaceRevision", baseRevision + 1, "reflection", reflection)), "submit");
    }

    @Test
    void sameRevisionRetryReturnsOriginalWhenResubmitNotAllowed() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        Map<String, Object> body = assignmentBody();
        body.put("allowResubmit", false);
        body.put("maxAttempts", 1);
        TeacherAssignmentDTO assignment = assignmentService.createAssignment(TEACHER, offering.id(), body, "create");
        assignmentService.publishAssignment(TEACHER, assignment.id(), "publish");
        var first = saveAndSubmit(assignment.id(), 0, "V1", "第一次");
        assertThat(first.created()).isTrue();

        var retry = assignmentService.submitAssignment(STUDENT, assignment.id(),
                new HashMap<>(Map.of("workspaceRevision", 1, "reflection", "不应覆盖")), "retry");
        assertThat(retry.created()).isFalse();
        assertThat(retry.submission().id()).isEqualTo(first.submission().id());
        assertThat(jdbc.queryForObject("SELECT reflection FROM submissions WHERE id=?", String.class, first.submission().id()))
                .isEqualTo("第一次");

        // 新 revision 才被业务阻断。
        Map<String, Object> save = new HashMap<>();
        save.put("baseRevision", 1);
        save.put("files", List.of(Map.of("path", "index.html", "content", "V2")));
        save.put("activeFile", "index.html");
        assignmentService.saveWorkspace(STUDENT, assignment.id(), save, "save2");
        assertThatThrownBy(() -> assignmentService.submitAssignment(STUDENT, assignment.id(),
                new HashMap<>(Map.of("workspaceRevision", 2, "reflection", "x")), "blocked"))
                .satisfies(t -> assertCode(t, 409, "RESUBMIT_NOT_ALLOWED"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM submissions WHERE assignment_id=?", Integer.class, assignment.id())).isEqualTo(1);
    }

    @Test
    void sameRevisionRetryReturnsOriginalWhenAttemptsExhaustedOrReviewed() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        Map<String, Object> body = assignmentBody();
        body.put("maxAttempts", 1);
        TeacherAssignmentDTO assignment = assignmentService.createAssignment(TEACHER, offering.id(), body, "create");
        assignmentService.publishAssignment(TEACHER, assignment.id(), "publish");
        var first = saveAndSubmit(assignment.id(), 0, "V1", "第一次");

        var retry = assignmentService.submitAssignment(STUDENT, assignment.id(),
                new HashMap<>(Map.of("workspaceRevision", 1, "reflection", "重试")), "retry");
        assertThat(retry.created()).isFalse();
        assertThat(retry.submission().id()).isEqualTo(first.submission().id());

        Map<String, Object> save = new HashMap<>();
        save.put("baseRevision", 1);
        save.put("files", List.of(Map.of("path", "index.html", "content", "V2")));
        save.put("activeFile", "index.html");
        assignmentService.saveWorkspace(STUDENT, assignment.id(), save, "save2");
        assertThatThrownBy(() -> assignmentService.submitAssignment(STUDENT, assignment.id(),
                new HashMap<>(Map.of("workspaceRevision", 2, "reflection", "x")), "blocked"))
                .satisfies(t -> assertCode(t, 409, "ATTEMPT_LIMIT_REACHED"));
    }

    @Test
    void sameRevisionRetryReturnsOriginalAfterFeedbackPublishedAndNewRevisionIsBlocked() {
        Ctx c = submittedAssignment();
        assignmentService.saveFeedback(TEACHER, c.submissionId(), feedbackBody(0, "50", "30"), "s1");
        assignmentService.publishFeedback(TEACHER, c.submissionId(), Map.of("baseVersion", 1), "p1");

        var retry = assignmentService.submitAssignment(STUDENT, c.assignment().id(),
                new HashMap<>(Map.of("workspaceRevision", 1, "reflection", "重试")), "retry");
        assertThat(retry.created()).isFalse();
        assertThat(retry.submission().id()).isEqualTo(c.submissionId());
        assertThat(retry.submission().feedbackStatus()).isEqualTo("published");

        Map<String, Object> save = new HashMap<>();
        save.put("baseRevision", 1);
        save.put("files", List.of(Map.of("path", "index.html", "content", "V2")));
        save.put("activeFile", "index.html");
        assignmentService.saveWorkspace(STUDENT, c.assignment().id(), save, "save2");
        assertThatThrownBy(() -> assignmentService.submitAssignment(STUDENT, c.assignment().id(),
                new HashMap<>(Map.of("workspaceRevision", 2, "reflection", "x")), "blocked"))
                .satisfies(t -> assertCode(t, 409, "RESUBMIT_AFTER_REVIEW"));
    }

    @Test
    void concurrentDuplicateSubmitCreatesSingleRow() throws Exception {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        TeacherAssignmentDTO assignment = assignmentService.createAssignment(TEACHER, offering.id(), assignmentBody(), "create");
        assignmentService.publishAssignment(TEACHER, assignment.id(), "publish");
        Map<String, Object> save = new HashMap<>();
        save.put("baseRevision", 0);
        save.put("files", List.of(Map.of("path", "index.html", "content", "V1")));
        save.put("activeFile", "index.html");
        assignmentService.saveWorkspace(STUDENT, assignment.id(), save, "save");

        var pool = Executors.newFixedThreadPool(2);
        try {
            CountDownLatch ready = new CountDownLatch(2);
            CountDownLatch go = new CountDownLatch(1);
            List<java.util.concurrent.Future<AssignmentService.SubmissionCreatedResponse>> futures = new java.util.ArrayList<>();
            for (int i = 0; i < 2; i++) {
                final int n = i;
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    go.await(10, TimeUnit.SECONDS);
                    return assignmentService.submitAssignment(STUDENT, assignment.id(),
                            new HashMap<>(Map.of("workspaceRevision", 1, "reflection", "并发" + n)), "submit" + n);
                }));
            }
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            go.countDown();
            var r1 = futures.get(0).get(30, TimeUnit.SECONDS);
            var r2 = futures.get(1).get(30, TimeUnit.SECONDS);
            assertThat(r1.submission().id()).isEqualTo(r2.submission().id());
            assertThat(List.of(r1.created(), r2.created())).containsExactlyInAnyOrder(true, false);
        } finally {
            pool.shutdownNow();
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM submissions WHERE assignment_id=?", Integer.class, assignment.id())).isEqualTo(1);
    }

    @Test
    void consecutiveDuplicateSubmitsDoNotCreateExtraRows() {
        Ctx c = submittedAssignment();
        for (int i = 0; i < 3; i++) {
            var retry = assignmentService.submitAssignment(STUDENT, c.assignment().id(),
                    new HashMap<>(Map.of("workspaceRevision", 1, "reflection", "重试" + i)), "retry" + i);
            assertThat(retry.created()).isFalse();
            assertThat(retry.submission().id()).isEqualTo(c.submissionId());
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM submissions WHERE assignment_id=?", Integer.class, c.assignment().id())).isEqualTo(1);
    }

    @Test
    void getSubmissionReturnsRoleSpecificViewsAndRejectsOthers() {
        Ctx c = submittedAssignment();
        enrollStudent(c.offering().id(), OTHER_STUDENT);
        assignmentService.saveFeedback(TEACHER, c.submissionId(), feedbackBody(0, "50", "30"), "s1");

        Object teacherView = assignmentService.getSubmission(TEACHER, c.submissionId());
        assertThat(teacherView).isInstanceOf(TeacherSubmissionDetailDTO.class);
        TeacherSubmissionDetailDTO td = (TeacherSubmissionDetailDTO) teacherView;
        assertThat(td.student().id()).isEqualTo(STUDENT.id());
        assertThat(td.student().username()).isEqualTo(STUDENT.username());
        assertThat(td.feedbackStatus()).isEqualTo("draft");
        assertThat(td.draftFeedback()).isNotNull();
        assertThat(td.draftFeedback().status()).isEqualTo("draft");
        assertThat(td.publishedFeedback()).isNull();
        assertThat(td.files()).hasSize(1);
        assertThat(td.assignmentSnapshot().title()).isEqualTo("作业一");

        Object studentView = assignmentService.getSubmission(STUDENT, c.submissionId());
        assertThat(studentView).isInstanceOf(SubmissionDetailDTO.class);
        SubmissionDetailDTO sd = (SubmissionDetailDTO) studentView;
        assertThat(sd.feedbackStatus()).isEqualTo("none");
        assertThat(sd.publishedFeedback()).isNull();
        assertThat(sd.reflection()).isEqualTo("完成");

        assertThatThrownBy(() -> assignmentService.getSubmission(OTHER_STUDENT, c.submissionId()))
                .satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
        assertThatThrownBy(() -> assignmentService.getSubmission(OTHER_TEACHER, c.submissionId()))
                .satisfies(t -> assertCode(t, 404, "NOT_FOUND"));

        assignmentService.publishFeedback(TEACHER, c.submissionId(), Map.of("baseVersion", 1), "p1");
        Object afterTeacher = assignmentService.getSubmission(TEACHER, c.submissionId());
        TeacherSubmissionDetailDTO td2 = (TeacherSubmissionDetailDTO) afterTeacher;
        assertThat(td2.feedbackStatus()).isEqualTo("published");
        assertThat(td2.publishedFeedback()).isNotNull();
        assertThat(td2.draftFeedback()).isNull();
        SubmissionDetailDTO sd2 = (SubmissionDetailDTO) assignmentService.getSubmission(STUDENT, c.submissionId());
        assertThat(sd2.feedbackStatus()).isEqualTo("published");
        assertThat(sd2.publishedFeedback()).isNotNull();
        assertThat(sd2.publishedFeedback().status()).isEqualTo("published");
        assertThat(sd2.publishedFeedback().messageId()).isNotNull();
    }

    @Test
    void feedbackStatusFollowsDraftAndPublishInListings() {
        Ctx c = submittedAssignment();
        String aid = c.assignment().id();

        var mine = assignmentService.listMySubmissions(STUDENT, aid, 1, 20);
        assertThat(((SubmissionSummaryDTO) mine.items().get(0)).feedbackStatus()).isEqualTo("none");
        var teacherNone = assignmentService.listTeacherSubmissions(TEACHER, aid, "none", true, 1, 20);
        assertThat(teacherNone.total()).isEqualTo(1);

        assignmentService.saveFeedback(TEACHER, c.submissionId(), feedbackBody(0, "50", "30"), "s1");
        mine = assignmentService.listMySubmissions(STUDENT, aid, 1, 20);
        assertThat(((SubmissionSummaryDTO) mine.items().get(0)).feedbackStatus()).isEqualTo("none");
        var teacherDraft = assignmentService.listTeacherSubmissions(TEACHER, aid, "draft", true, 1, 20);
        assertThat(teacherDraft.total()).isEqualTo(1);
        TeacherSubmissionSummaryDTO row = (TeacherSubmissionSummaryDTO) teacherDraft.items().get(0);
        assertThat(row.feedbackStatus()).isEqualTo("draft");
        assertThat(row.student().id()).isEqualTo(STUDENT.id());
        assertThat(assignmentService.listTeacherSubmissions(TEACHER, aid, "none", true, 1, 20).total()).isZero();
        assertThat(assignmentService.listTeacherSubmissions(TEACHER, aid, "published", true, 1, 20).total()).isZero();

        assignmentService.publishFeedback(TEACHER, c.submissionId(), Map.of("baseVersion", 1), "p1");
        mine = assignmentService.listMySubmissions(STUDENT, aid, 1, 20);
        assertThat(((SubmissionSummaryDTO) mine.items().get(0)).feedbackStatus()).isEqualTo("published");
        assertThat(assignmentService.listTeacherSubmissions(TEACHER, aid, "published", true, 1, 20).total()).isEqualTo(1);
        assertThat(assignmentService.listTeacherSubmissions(TEACHER, aid, "draft", true, 1, 20).total()).isZero();

        assertThatThrownBy(() -> assignmentService.listTeacherSubmissions(TEACHER, aid, "bogus", true, 1, 20))
                .satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
        assertThatThrownBy(() -> assignmentService.listTeacherSubmissions(OTHER_TEACHER, aid, null, true, 1, 20))
                .satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
        assertThatThrownBy(() -> assignmentService.listTeacherSubmissions(STUDENT, aid, null, true, 1, 20))
                .satisfies(t -> assertCode(t, 403, "FORBIDDEN"));
    }

    @Test
    void listTeacherSubmissionsLatestOnlyHidesSupersededAttempts() {
        OfferingDTO offering = createOffering();
        enrollStudent(offering.id(), STUDENT);
        TeacherAssignmentDTO assignment = assignmentService.createAssignment(TEACHER, offering.id(), assignmentBody(), "create");
        assignmentService.publishAssignment(TEACHER, assignment.id(), "publish");
        var first = saveAndSubmit(assignment.id(), 0, "V1", "一");
        var second = saveAndSubmit(assignment.id(), 1, "V2", "二");
        assertThat(second.created()).isTrue();

        var latest = assignmentService.listTeacherSubmissions(TEACHER, assignment.id(), null, true, 1, 20);
        assertThat(latest.total()).isEqualTo(1);
        assertThat(((TeacherSubmissionSummaryDTO) latest.items().get(0)).id()).isEqualTo(second.submission().id());
        assertThat(((TeacherSubmissionSummaryDTO) latest.items().get(0)).superseded()).isFalse();

        var all = assignmentService.listTeacherSubmissions(TEACHER, assignment.id(), null, false, 1, 20);
        assertThat(all.total()).isEqualTo(2);
        assertThat(all.items()).extracting(i -> ((TeacherSubmissionSummaryDTO) i).id())
                .containsExactlyInAnyOrder(first.submission().id(), second.submission().id());
        assertThat(all.items().stream().filter(i -> ((TeacherSubmissionSummaryDTO) i).superseded()).count()).isEqualTo(1);
    }

    @Test
    void listMessagesSummaryFiltersAndNotificationShape() {
        Ctx c = submittedAssignment();
        assignmentService.saveFeedback(TEACHER, c.submissionId(), feedbackBody(0, "50", "30"), "s1");
        assignmentService.publishFeedback(TEACHER, c.submissionId(), Map.of("baseVersion", 1), "p1");
        String offeringId = c.offering().id();

        var all = assignmentService.listMessages(STUDENT, null, null, "all", 1, 20);
        assertThat(all.total()).isEqualTo(2);
        assertThat(all.unreadCount()).isEqualTo(2);
        NotificationDTO feedback = all.items().stream().filter(n -> "feedback".equals(n.type())).findFirst().orElseThrow();
        assertThat(feedback.offeringId()).isEqualTo(offeringId);
        assertThat(feedback.readAt()).isNull();
        assertThat(feedback.sender()).isNotNull();
        assertThat(feedback.sender().id()).isEqualTo(TEACHER.id());
        assertThat(feedback.target().type()).isEqualTo("feedback");
        assertThat(feedback.target().id()).isEqualTo(feedbackIdOf(c.submissionId()));
        assertThat(feedback.target().offeringId()).isEqualTo(offeringId);
        NotificationDTO published = all.items().stream().filter(n -> "assignment_published".equals(n.type())).findFirst().orElseThrow();
        assertThat(published.target().type()).isEqualTo("assignment");
        assertThat(published.target().id()).isEqualTo(c.assignment().id());

        var onlyFeedback = assignmentService.listMessages(STUDENT, null, "feedback", "all", 1, 20);
        assertThat(onlyFeedback.total()).isEqualTo(1);
        assertThat(onlyFeedback.unreadCount()).isEqualTo(1);
        assertThat(onlyFeedback.items().get(0).id()).isEqualTo(feedback.id());
        assertThat(assignmentService.listMessages(STUDENT, null, "assignment_published", "all", 1, 20).total()).isEqualTo(1);
        assertThat(assignmentService.listMessages(STUDENT, null, "system", "all", 1, 20).total()).isZero();
        assertThat(assignmentService.listMessages(STUDENT, null, "course_notice", "all", 1, 20).total()).isZero();
        assertThat(assignmentService.listMessages(STUDENT, null, "help_reply", "all", 1, 20).items()).isEmpty();
        assertThatThrownBy(() -> assignmentService.listMessages(STUDENT, null, "bogus", "all", 1, 20))
                .satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));
        assertThatThrownBy(() -> assignmentService.listMessages(STUDENT, null, null, "bogus", 1, 20))
                .satisfies(t -> assertCode(t, 422, "VALIDATION_ERROR"));

        assertThat(assignmentService.listMessages(STUDENT, offeringId, null, "all", 1, 20).total()).isEqualTo(2);
        var otherOffering = assignmentService.listMessages(STUDENT, UUID.randomUUID().toString(), null, "all", 1, 20);
        assertThat(otherOffering.total()).isZero();
        assertThat(otherOffering.unreadCount()).isZero();

        // 已读后：unreadCount 减少，read 过滤生效，unreadCount 不受 read 过滤与分页影响。
        assignmentService.readMessage(STUDENT, feedback.id(), "read");
        var unread = assignmentService.listMessages(STUDENT, null, null, "unread", 1, 20);
        assertThat(unread.total()).isEqualTo(1);
        assertThat(unread.unreadCount()).isEqualTo(1);
        assertThat(unread.items().get(0).type()).isEqualTo("assignment_published");
        var read = assignmentService.listMessages(STUDENT, null, null, "read", 1, 20);
        assertThat(read.total()).isEqualTo(1);
        assertThat(read.unreadCount()).isEqualTo(1);
        assertThat(read.items().get(0).readAt()).isNotNull();
        var paged = assignmentService.listMessages(STUDENT, null, null, "all", 1, 1);
        assertThat(paged.items()).hasSize(1);
        assertThat(paged.total()).isEqualTo(2);
        assertThat(paged.unreadCount()).isEqualTo(1);

        // 他人的消息不会出现在列表里。
        assertThat(assignmentService.listMessages(OTHER_STUDENT, null, null, "all", 1, 20).total()).isZero();
    }

    @Test
    void readMessageKeepsFirstReadAtAndRejectsOtherUsers() {
        Ctx c = submittedAssignment();
        String messageId = jdbc.queryForObject(
                "SELECT id FROM notifications WHERE recipient_id=? AND type='assignment_published'", String.class, STUDENT.id());

        MessageReadDTO first = assignmentService.readMessage(STUDENT, messageId, "r1");
        assertThat(first.id()).isEqualTo(messageId);
        assertThat(first.readAt()).isNotNull();

        // 固定时钟下改写库内 read_at，证明重复调用返回的是首次值而不是当前时间。
        jdbc.update("UPDATE notifications SET read_at=? WHERE id=?",
                java.sql.Timestamp.from(NOW.minus(Duration.ofDays(1))), messageId);
        MessageReadDTO again = assignmentService.readMessage(STUDENT, messageId, "r2");
        assertThat(again.readAt()).isEqualTo(NOW.minus(Duration.ofDays(1)));
        MessageReadDTO third = assignmentService.readMessage(STUDENT, messageId, "r3");
        assertThat(third.readAt()).isEqualTo(again.readAt());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notifications WHERE id=? AND is_read=1", Integer.class, messageId)).isEqualTo(1);

        // 他人的消息一律 404；不存在的消息同样 404。
        enrollStudent(c.offering().id(), OTHER_STUDENT);
        assertThatThrownBy(() -> assignmentService.readMessage(OTHER_STUDENT, messageId, "x"))
                .satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
        assertThatThrownBy(() -> assignmentService.readMessage(TEACHER, messageId, "x"))
                .satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
        assertThatThrownBy(() -> assignmentService.readMessage(STUDENT, UUID.randomUUID().toString(), "x"))
                .satisfies(t -> assertCode(t, 404, "NOT_FOUND"));
    }

    private OfferingDTO createOffering() {
        return courseService.createOffering(TEACHER, Map.of("courseId", COURSE, "termId", TERM,
                "title", "作业测试班", "groupName", "一班", "progressUnit", "chapter"), "offering");
    }

    private void enrollStudent(String offeringId, UserDTO student) {
        InviteCreatedDTO invite = courseService.createInvite(TEACHER, offeringId,
                Map.of("expiresAt", NOW.plusSeconds(3600).toString(), "maxUses", 10), "invite");
        courseService.enroll(student, Map.of("inviteCode", invite.inviteCode()), "enroll");
    }

    private Map<String, Object> assignmentBody() {
        Map<String, Object> body = new HashMap<>();
        body.put("chapterId", null);
        body.put("title", "作业一");
        body.put("description", "完成网页布局");
        body.put("estimatedMinutes", 60);
        body.put("type", "web_lab");
        body.put("isRequired", true);
        body.put("dueAt", NOW.plus(Duration.ofDays(7)).toString());
        body.put("lateUntil", NOW.plus(Duration.ofDays(10)).toString());
        body.put("allowResubmit", true);
        body.put("maxAttempts", 3);
        body.put("maxScore", new BigDecimal("100.00"));
        body.put("requirements", List.of("实现响应式布局", "通过所有测试"));
        body.put("rubric", List.of(
                Map.of("criterionId", "layout", "title", "布局", "description", "响应式布局", "maxScore", new BigDecimal("60.00")),
                Map.of("criterionId", "quality", "title", "代码质量", "description", "结构清晰", "maxScore", new BigDecimal("40.00"))));
        body.put("initialFiles", List.of(Map.of("path", "index.html", "content", "<!DOCTYPE html>\n<html>\n<body>\n</body>\n</html>")));
        body.put("knowledgePointIds", List.of());
        return body;
    }

    @Test
    void teacherWithoutStudentRoleCannotAccessStudentOperations() {
        // 测试 service 方法的授权检查
        assertThatThrownBy(() -> assignmentService.listMyAssignments(TEACHER, null, null, "all", 1, 20))
                .isInstanceOfSatisfying(BusinessException.class, e -> {
                    assertThat(e.getCode()).isEqualTo("FORBIDDEN");
                    assertThat(e.getStatus().value()).isEqualTo(403);
                });

        OfferingDTO offering = createOffering();
        TeacherAssignmentDTO assignment = assignmentService.createAssignment(TEACHER, offering.id(), assignmentBody(), "create");
        assignmentService.publishAssignment(TEACHER, assignment.id(), "publish");

        // 本班教师可通过公共详情端点读取，但得到的是教师通用视图而非学生视图
        assertThat(assignmentService.getAssignment(TEACHER, assignment.id())).isInstanceOf(TeacherAssignmentViewDTO.class);

        assertThatThrownBy(() -> assignmentService.getWorkspace(TEACHER, assignment.id()))
                .isInstanceOfSatisfying(BusinessException.class, e -> {
                    assertThat(e.getCode()).isEqualTo("FORBIDDEN");
                    assertThat(e.getStatus().value()).isEqualTo(403);
                });
    }

    private static java.sql.Timestamp ts(Instant i) { return java.sql.Timestamp.from(i); }
    private static UserDTO user(String suffix, String username, String role) {
        return new UserDTO("00000000-0000-4000-8000-0000000000" + suffix, username, "作业测试用户", List.of(role));
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FixedClockConfiguration {
        @Bean @Primary Clock clock() { return Clock.fixed(NOW, ZoneOffset.UTC); }
    }
}
