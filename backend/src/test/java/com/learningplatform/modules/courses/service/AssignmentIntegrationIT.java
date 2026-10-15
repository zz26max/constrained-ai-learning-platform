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
        for (UserDTO u : List.of(TEACHER, STUDENT, OTHER_STUDENT)) {
            jdbc.update("INSERT INTO users(id,username,display_name,password_hash,roles,status,created_at,updated_at) VALUES(?,?,?,?,CAST(? AS JSON),'active',?,?)",
                    u.id(), u.username(), u.displayName(), "TEST_ONLY_NOT_A_REAL_HASH", JSON.writeValueAsString(u.roles()), ts(NOW), ts(NOW));
        }
        jdbc.update("INSERT INTO terms(id,label,starts_at,ends_at,is_current,created_at,updated_at) VALUES(?,?,?,?,1,?,?)",
                TERM, "作业测试学期", ts(NOW.minus(Duration.ofDays(30))), ts(NOW.plus(Duration.ofDays(100))), ts(NOW), ts(NOW));
        jdbc.update("INSERT INTO courses(id,code,mark,title,description,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,'active',?,?,?)",
                COURSE, "assignment-course", "ASG", "作业测试课程", "测试", TEACHER.id(), ts(NOW), ts(NOW));
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
        AssignmentDetailDTO studentView = assignmentService.getAssignment(STUDENT, published.id());
        assertThat(studentView.publicationState()).isEqualTo("published");
        assertThat(studentView.canSubmit()).isTrue();

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
        SubmissionDetailDTO detail = assignmentService.getSubmission(STUDENT, submission.submission().id());
        assertThat(detail.files()).hasSize(1);
        assertThat(detail.files().get(0).content()).isEqualTo("<h1>Updated</h1>");
        assertThat(detail.reflection()).isEqualTo("已完成所有功能");
        assertThat(detail.assignmentSnapshot().title()).isEqualTo("作业一");

        // 归档作业（有待评阅提交时拒绝）
        assertThatThrownBy(() -> assignmentService.archiveAssignment(TEACHER, published.id(), "archive-fail"))
                .isInstanceOfSatisfying(BusinessException.class, e -> {
                    assertThat(e.getCode()).isEqualTo("PENDING_REVIEWS_EXIST");
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
                    assertThat(e.getCode()).isEqualTo("VERSION_CONFLICT");
                    assertThat(e.getStatus().value()).isEqualTo(409);
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
            assertThat(List.of(result1, result2)).containsExactlyInAnyOrder("success", "VERSION_CONFLICT");
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
                    assertThat(e.getCode()).isEqualTo("ASSIGNMENT_LOCKED");
                    assertThat(e.getStatus().value()).isEqualTo(409);
                });

        // 提交被阻止
        Map<String, Object> submitBody = new HashMap<>();
        submitBody.put("workspaceRevision", 1);
        submitBody.put("reflection", "Test");
        assertThatThrownBy(() -> assignmentService.submitAssignment(STUDENT, assignment.id(), submitBody, "submit"))
                .isInstanceOfSatisfying(BusinessException.class, e -> {
                    assertThat(e.getCode()).isEqualTo("SUBMISSION_BLOCKED");
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
                    assertThat(e.getCode()).isEqualTo("SUBMISSION_BLOCKED");
                    assertThat(e.getMessage()).contains("最大提交次数");
                });
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
        body.put("rubric", List.of());
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

        assertThatThrownBy(() -> assignmentService.getAssignment(TEACHER, assignment.id()))
                .isInstanceOfSatisfying(BusinessException.class, e -> {
                    assertThat(e.getCode()).isEqualTo("FORBIDDEN");
                    assertThat(e.getStatus().value()).isEqualTo(403);
                });

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
