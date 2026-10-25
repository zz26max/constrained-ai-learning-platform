package com.learningplatform.modules.courses.service;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.courses.dto.CourseDTOs.EnrollmentDTO;
import com.learningplatform.modules.courses.dto.CourseDTOs.InviteCreatedDTO;
import com.learningplatform.modules.courses.dto.CourseDTOs.OfferingDTO;
import com.learningplatform.modules.courses.security.InviteCodeCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpStatus;
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

/** 真实 MySQL 验证教学班归属和成员唯一约束、邀请条件扣减；不用 mock 证明并发正确性。 */
@SpringBootTest(properties = "AUTH_INVITE_SIGNING_KEY=test-only-invite-signing-key-at-least-32-characters")
@Testcontainers
@Import(OfferingIntegrationIT.FixedClockConfiguration.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class OfferingIntegrationIT {

    private static final Instant NOW = Instant.parse("2026-10-14T08:00:00.123456Z");
    private static final String COURSE = "00000000-0000-4000-8000-000000000051";
    private static final String TERM = "00000000-0000-4000-8000-000000000052";
    private static final UserDTO TEACHER = user("61", "teacher.test", "teacher");
    private static final UserDTO OTHER_TEACHER = user("62", "teacher.other", "teacher");
    private static final UserDTO STUDENT = user("63", "student.one", "student");
    private static final UserDTO OTHER_STUDENT = user("64", "student.two", "student");
    private static final JsonMapper JSON = JsonMapper.builder().findAndAddModules().build();

    @Container
    static final MySQLContainer mysql = new MySQLContainer("mysql:8.4.11")
            .withDatabaseName("learning_platform_offerings_test")
            .withUsername("offering_test")
            .withPassword(UUID.randomUUID().toString())
            .withCommand("--character-set-server=utf8mb4", "--collation-server=utf8mb4_0900_ai_ci",
                    "--default-time-zone=+00:00", "--transaction-isolation=READ-COMMITTED");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", mysql::getJdbcUrl);
        registry.add("spring.datasource.username", mysql::getUsername);
        registry.add("spring.datasource.password", mysql::getPassword);
    }

    @Autowired private CourseService service;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private InviteCodeCodec codes;

    @BeforeEach
    void prepareIndependentDatabase() {
        // 只清理本类自己的测试容器；先移除可空指针，再按依赖顺序删除，不关闭 FK。
        // P2 子记录先于课程、作品与评价清理，保留外键验证。
        for (String table : List.of("knowledge_evidence", "feedback_knowledge_evaluations", "feedback_issue_tags",
                "submission_knowledge_snapshot", "learning_events")) {
            jdbc.update("DELETE FROM " + table);
        }
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
        for (UserDTO user : List.of(TEACHER, OTHER_TEACHER, STUDENT, OTHER_STUDENT)) {
            jdbc.update("INSERT INTO users(id,username,display_name,password_hash,roles,status,created_at,updated_at) VALUES(?,?,?,?,CAST(? AS JSON),'active',?,?)",
                    user.id(), user.username(), user.displayName(), "TEST_ONLY_NOT_A_REAL_HASH",
                    JSON.writeValueAsString(user.roles()), timestamp(NOW), timestamp(NOW));
        }
        jdbc.update("INSERT INTO terms(id,label,starts_at,ends_at,is_current,created_at,updated_at) VALUES(?,?,?,?,1,?,?)",
                TERM, "虚构秋季学期", timestamp(NOW.minus(Duration.ofDays(40))), timestamp(NOW.plus(Duration.ofDays(100))), timestamp(NOW), timestamp(NOW));
        jdbc.update("INSERT INTO courses(id,code,mark,title,description,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,'active',?,?,?)",
                COURSE, "demo-course", "DEMO", "虚构基础课程", "测试课程说明", TEACHER.id(), timestamp(NOW), timestamp(NOW));
    }

    @Test
    void creatorAutomaticallyBecomesActiveTeachingMember() {
        OfferingDTO offering = create(TEACHER);
        assertThat(offering.teachers()).singleElement().satisfies(t -> assertThat(t.id()).isEqualTo(TEACHER.id()));
        assertThat(jdbc.queryForMap("SELECT role,status,user_id FROM offering_members WHERE offering_id=?", offering.id()))
                .containsEntry("role", "teacher").containsEntry("status", "active").containsEntry("user_id", TEACHER.id());
        assertThat(service.listBaseCourses(TEACHER, 1, 20).items()).singleElement();
        assertThat(service.listTeacherOfferings(TEACHER, null, 1, 20).items()).singleElement();
        assertThat(service.listTeacherOfferings(OTHER_TEACHER, null, 1, 20).items()).isEmpty();
        assertThat(service.getOffering(TEACHER, offering.id()).id()).isEqualTo(offering.id());
        assertThat(service.listMembers(TEACHER, offering.id(), 1, 20).items()).singleElement();
    }

    @Test
    void invitationStoresHmacAndReturnsPlaintextOnlyWhenCreated() {
        OfferingDTO offering = create(TEACHER);
        InviteCreatedDTO invite = invite(offering.id(), 3);
        String stored = jdbc.queryForObject("SELECT code_digest FROM course_invites WHERE id=?", String.class, invite.id());
        assertThat(invite.inviteCode()).matches("[0-9a-f]{64}");
        assertThat(stored).isEqualTo(codes.digest(invite.inviteCode())).isNotEqualTo(invite.inviteCode());
        assertThat(JSON.writeValueAsString(service.listInvites(TEACHER, offering.id(), 1, 20)))
                .doesNotContain(invite.inviteCode(), stored, "inviteCode", "codeDigest");
        assertThat(service.revokeInvite(TEACHER, invite.id(), "req-revoke").revokedAt()).isEqualTo(NOW);
        assertThat(service.revokeInvite(TEACHER, invite.id(), "req-revoke-again").revokedAt()).isEqualTo(NOW);
    }

    @Test
    void repeatedEnrollmentReturnsExistingMembershipAndConsumesOneSeat() {
        OfferingDTO offering = create(TEACHER);
        InviteCreatedDTO invite = invite(offering.id(), 2);
        EnrollmentDTO first = enroll(STUDENT, invite.inviteCode());
        EnrollmentDTO again = enroll(STUDENT, invite.inviteCode());
        assertThat(first.created()).isTrue();
        assertThat(again.created()).isFalse();
        assertThat(again.offeringId()).isEqualTo(first.offeringId());
        assertThat(again.enrolledAt()).isEqualTo(first.enrolledAt());
        assertThat(used(invite.id())).isEqualTo(1);
        assertThat(studentCount(offering.id())).isEqualTo(1);
        assertThat(service.listMyCourses(STUDENT, null, "active", 1, 20).items()).singleElement();
    }

    @Test
    void twoStudentsRaceForLastSeatOnlyOneSucceeds() throws Exception {
        OfferingDTO offering = create(TEACHER);
        InviteCreatedDTO invite = invite(offering.id(), 1);
        List<Attempt> attempts = simultaneously(
                () -> attempt(STUDENT, invite.inviteCode()), () -> attempt(OTHER_STUDENT, invite.inviteCode()));
        assertThat(attempts.stream().filter(a -> a.result() != null && a.result().created())).hasSize(1);
        assertThat(attempts.stream().filter(a -> "INVALID_INVITE_CODE".equals(a.error()))).hasSize(1);
        assertThat(used(invite.id())).isEqualTo(1);
        assertThat(studentCount(offering.id())).isEqualTo(1);
    }

    @Test
    void sameStudentConcurrentEnrollmentCreatesOnceAndChargesOnce() throws Exception {
        OfferingDTO offering = create(TEACHER);
        InviteCreatedDTO invite = invite(offering.id(), 1);
        List<Attempt> attempts = simultaneously(
                () -> attempt(STUDENT, invite.inviteCode()), () -> attempt(STUDENT, invite.inviteCode()));
        assertThat(attempts).allSatisfy(a -> assertThat(a.error()).isNull());
        assertThat(attempts.stream().filter(a -> a.result().created())).hasSize(1);
        assertThat(attempts.stream().filter(a -> !a.result().created())).hasSize(1);
        assertThat(used(invite.id())).isEqualTo(1);
        assertThat(studentCount(offering.id())).isEqualTo(1);
    }

    @Test
    void outsidersCannotReadOrMutatePrivateOfferingObjects() {
        OfferingDTO offering = create(TEACHER);
        InviteCreatedDTO invite = invite(offering.id(), 2);
        assertError("NOT_FOUND", HttpStatus.NOT_FOUND, () -> service.getOffering(STUDENT, offering.id()));
        assertError("NOT_FOUND", HttpStatus.NOT_FOUND, () -> service.getOffering(OTHER_TEACHER, offering.id()));
        assertError("NOT_FOUND", HttpStatus.NOT_FOUND, () -> service.listMembers(OTHER_TEACHER, offering.id(), 1, 20));
        assertError("NOT_FOUND", HttpStatus.NOT_FOUND, () -> service.createInvite(OTHER_TEACHER, offering.id(), inviteBody(2), "req-cross-invite"));
        assertError("NOT_FOUND", HttpStatus.NOT_FOUND, () -> service.listInvites(OTHER_TEACHER, offering.id(), 1, 20));
        assertError("NOT_FOUND", HttpStatus.NOT_FOUND, () -> service.revokeInvite(OTHER_TEACHER, invite.id(), "req-cross-revoke"));
        assertError("NOT_FOUND", HttpStatus.NOT_FOUND, () -> service.archiveOffering(OTHER_TEACHER, offering.id(), "req-cross-archive"));
        assertError("FORBIDDEN", HttpStatus.FORBIDDEN, () -> service.createOffering(STUDENT, offeringBody(), "req-student-create"));
    }

    @Test
    void unavailableInvitationsReturnSameErrorWithoutOfferingInformation() {
        OfferingDTO offering = create(TEACHER);
        InviteCreatedDTO expired = invite(offering.id(), 2);
        jdbc.update("UPDATE course_invites SET created_at=?, expires_at=? WHERE id=?",
                timestamp(NOW.minus(Duration.ofDays(2))), timestamp(NOW.minus(Duration.ofDays(1))), expired.id());
        InviteCreatedDTO revoked = invite(offering.id(), 2);
        service.revokeInvite(TEACHER, revoked.id(), "req-revoke-unavailable");
        InviteCreatedDTO full = invite(offering.id(), 1);
        enroll(OTHER_STUDENT, full.inviteCode());
        for (String code : List.of("unknown-code", expired.inviteCode(), revoked.inviteCode(), full.inviteCode())) {
            assertError("INVALID_INVITE_CODE", HttpStatus.BAD_REQUEST, () -> enroll(STUDENT, code));
        }
        assertThat(studentCount(offering.id())).isEqualTo(1);
    }

    @Test
    void teachingMemberCannotBecomeStudentByInvitation() {
        OfferingDTO offering = create(TEACHER);
        InviteCreatedDTO invite = invite(offering.id(), 2);
        UserDTO bothRoles = new UserDTO(TEACHER.id(), TEACHER.username(), TEACHER.displayName(), List.of("teacher", "student"));
        assertError("FORBIDDEN", HttpStatus.FORBIDDEN, () -> enroll(bothRoles, invite.inviteCode()));
        assertThat(used(invite.id())).isZero();
        assertThat(studentCount(offering.id())).isZero();
    }

    @Test
    void archiveIsIdempotentAndPreventsNewMembersAndInvites() {
        OfferingDTO offering = create(TEACHER);
        InviteCreatedDTO invite = invite(offering.id(), 3);
        enroll(STUDENT, invite.inviteCode());
        assertThat(service.archiveOffering(TEACHER, offering.id(), "req-archive").status()).isEqualTo("archived");
        assertThat(service.archiveOffering(TEACHER, offering.id(), "req-archive-again").status()).isEqualTo("archived");
        assertThat(service.getOffering(STUDENT, offering.id()).status()).isEqualTo("archived");
        assertError("OFFERING_ARCHIVED", HttpStatus.CONFLICT, () -> service.createInvite(TEACHER, offering.id(), inviteBody(2), "req-archive-invite"));
        assertError("OFFERING_ARCHIVED", HttpStatus.CONFLICT, () -> enroll(OTHER_STUDENT, invite.inviteCode()));
        assertThat(used(invite.id())).isEqualTo(1);
    }

    @Test
    void invalidOfferingAndInviteFieldsAreRejectedBeforeWrites() {
        assertError("VALIDATION_ERROR", HttpStatus.UNPROCESSABLE_CONTENT, () -> service.createOffering(TEACHER,
                Map.of("courseId", COURSE, "termId", TERM, "title", "", "groupName", "虚构班级", "progressUnit", "chapter"), "req-invalid-offering"));
        OfferingDTO offering = create(TEACHER);
        assertError("VALIDATION_ERROR", HttpStatus.UNPROCESSABLE_CONTENT, () -> service.createInvite(TEACHER,
                offering.id(), Map.of("expiresAt", NOW.minusSeconds(1).toString(), "maxUses", 1), "req-expired-invite"));
        assertError("VALIDATION_ERROR", HttpStatus.UNPROCESSABLE_CONTENT, () -> service.createInvite(TEACHER,
                offering.id(), Map.of("expiresAt", NOW.plusSeconds(3600).toString(), "maxUses", 0), "req-zero-seat"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM course_invites", Integer.class)).isZero();
    }

    private OfferingDTO create(UserDTO teacher) { return service.createOffering(teacher, offeringBody(), "req-create-offering"); }
    private Map<String, Object> offeringBody() { return Map.of("courseId", COURSE, "termId", TERM, "title", "虚构教学班", "groupName", "演示班", "progressUnit", "chapter"); }
    private Map<String, Object> inviteBody(int seats) { return Map.of("expiresAt", NOW.plus(Duration.ofDays(7)).toString(), "maxUses", seats); }
    private InviteCreatedDTO invite(String offeringId, int seats) { return service.createInvite(TEACHER, offeringId, inviteBody(seats), "req-create-invite"); }
    private EnrollmentDTO enroll(UserDTO student, String code) { return service.enroll(student, Map.of("inviteCode", code), "req-enroll"); }
    private int used(String id) { return jdbc.queryForObject("SELECT used_count FROM course_invites WHERE id=?", Integer.class, id); }
    private int studentCount(String id) { return jdbc.queryForObject("SELECT COUNT(*) FROM offering_members WHERE offering_id=? AND role='student'", Integer.class, id); }
    private static Timestamp timestamp(Instant at) { return Timestamp.from(at); }
    private static UserDTO user(String suffix, String username, String role) {
        return new UserDTO("00000000-0000-4000-8000-0000000000" + suffix, username, "虚构用户", List.of(role));
    }

    private void assertError(String code, HttpStatus status, Runnable action) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(BusinessException.class, error -> {
            assertThat(error.getCode()).isEqualTo(code);
            assertThat(error.getStatus()).isEqualTo(status);
            assertThat(error.getDetails()).isEmpty();
        });
    }

    record Attempt(EnrollmentDTO result, String error) {}
    private Attempt attempt(UserDTO user, String code) {
        try { return new Attempt(enroll(user, code), null); }
        catch (BusinessException rejected) { return new Attempt(null, rejected.getCode()); }
    }

    private <T> List<T> simultaneously(Callable<T> first, Callable<T> second) throws Exception {
        var pool = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            var a = pool.submit(() -> { ready.countDown(); if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("并发放行超时"); return first.call(); });
            var b = pool.submit(() -> { ready.countDown(); if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("并发放行超时"); return second.call(); });
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            return List.of(a.get(20, TimeUnit.SECONDS), b.get(20, TimeUnit.SECONDS));
        } finally { start.countDown(); pool.shutdownNow(); }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FixedClockConfiguration {
        @Bean @Primary Clock testClock() { return Clock.fixed(NOW, ZoneOffset.UTC); }
    }
}
