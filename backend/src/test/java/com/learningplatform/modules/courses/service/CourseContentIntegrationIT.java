package com.learningplatform.modules.courses.service;

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
import com.learningplatform.modules.courses.dto.CourseDTOs.ChapterProgressDTO;
import com.learningplatform.modules.courses.dto.CourseDTOs.InviteCreatedDTO;
import com.learningplatform.modules.courses.dto.CourseDTOs.OfferingDTO;
import com.learningplatform.modules.courses.dto.CourseDTOs.ResourceDTO;
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
@Import(CourseContentIntegrationIT.FixedClockConfiguration.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class CourseContentIntegrationIT {
    private static final Instant NOW = Instant.parse("2026-10-14T08:00:00.123456Z");
    private static final String COURSE = "00000000-0000-4000-8000-000000000071";
    private static final String TERM = "00000000-0000-4000-8000-000000000072";
    private static final UserDTO TEACHER = user("73", "content.teacher", "teacher");
    private static final UserDTO STUDENT = user("74", "content.student", "student");
    private static final UserDTO OUTSIDER = user("75", "content.outsider", "student");
    private static final JsonMapper JSON = JsonMapper.builder().findAndAddModules().build();

    @Container
    static final MySQLContainer mysql = new MySQLContainer("mysql:8.4.11")
            .withDatabaseName("learning_platform_content_test")
            .withUsername("content_test").withPassword(UUID.randomUUID().toString())
            .withCommand("--character-set-server=utf8mb4", "--collation-server=utf8mb4_0900_ai_ci",
                    "--default-time-zone=+00:00", "--transaction-isolation=READ-COMMITTED");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", mysql::getJdbcUrl);
        r.add("spring.datasource.username", mysql::getUsername);
        r.add("spring.datasource.password", mysql::getPassword);
    }

    @Autowired private CourseService service;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private InviteCodeCodec codes;

    @BeforeEach
    void reset() {
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
        for (UserDTO u : List.of(TEACHER, STUDENT, OUTSIDER)) {
            jdbc.update("INSERT INTO users(id,username,display_name,password_hash,roles,status,created_at,updated_at) VALUES(?,?,?,?,CAST(? AS JSON),'active',?,?)",
                    u.id(), u.username(), u.displayName(), "TEST_ONLY_NOT_A_REAL_HASH", JSON.writeValueAsString(u.roles()), ts(NOW), ts(NOW));
        }
        jdbc.update("INSERT INTO terms(id,label,starts_at,ends_at,is_current,created_at,updated_at) VALUES(?,?,?,?,1,?,?)",
                TERM, "内容测试学期", ts(NOW.minus(Duration.ofDays(30))), ts(NOW.plus(Duration.ofDays(100))), ts(NOW), ts(NOW));
        jdbc.update("INSERT INTO courses(id,code,mark,title,description,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,'active',?,?,?)",
                COURSE, "content-course", "CNT", "内容测试课程", "测试", TEACHER.id(), ts(NOW), ts(NOW));
    }

    @Test
    void draftIsHiddenUntilPublishAndPublishedPositionFreezes() {
        OfferingDTO offering = offering();
        InviteCreatedDTO invite = service.createInvite(TEACHER, offering.id(), Map.of("expiresAt", NOW.plusSeconds(3600).toString(), "maxUses", 1), "invite");
        service.enroll(STUDENT, Map.of("inviteCode", invite.inviteCode()), "enroll");
        var chapter = service.createChapter(TEACHER, offering.id(), Map.of("number", 1, "title", "第一章", "summary", "摘要", "isRequired", true), "create");
        assertThat(service.listChapters(STUDENT, offering.id()).items()).isEmpty();
        assertThatThrownBy(() -> service.getChapter(STUDENT, chapter.id())).isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getCode()).isEqualTo("NOT_FOUND"));
        service.publishChapter(TEACHER, chapter.id(), "publish");
        assertThat(service.listChapters(STUDENT, offering.id()).items()).extracting(x -> x.id()).containsExactly(chapter.id());
        assertThatThrownBy(() -> service.patchChapter(TEACHER, chapter.id(), Map.of("number", 2), "freeze"))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getCode()).isEqualTo("CHAPTER_ALREADY_PUBLISHED"));
        Map<String, Object> resource = new HashMap<>();
        resource.put("knowledgePointId", null); resource.put("title", "资料"); resource.put("type", "markdown");
        resource.put("content", "# 原文"); resource.put("url", null); resource.put("order", 1);
        ResourceDTO saved = service.createResource(TEACHER, chapter.id(), resource, "resource");
        assertThat(service.getResource(STUDENT, saved.id()).content()).isEqualTo("# 原文");
        service.archiveOffering(TEACHER, offering.id(), "archive");
        assertThat(service.listChapters(STUDENT, offering.id()).items()).hasSize(1);
    }

    @Test
    void progressUsesHalfUpAndConcurrentCompletionCannotBeDowngraded() throws Exception {
        OfferingDTO offering = offering();
        InviteCreatedDTO invite = service.createInvite(TEACHER, offering.id(), Map.of("expiresAt", NOW.plusSeconds(3600).toString(), "maxUses", 1), "invite");
        service.enroll(STUDENT, Map.of("inviteCode", invite.inviteCode()), "enroll");
        var first = service.createChapter(TEACHER, offering.id(), Map.of("number", 1, "title", "一", "summary", "一", "isRequired", true), "c1");
        var second = service.createChapter(TEACHER, offering.id(), Map.of("number", 2, "title", "二", "summary", "二", "isRequired", true), "c2");
        service.publishChapter(TEACHER, first.id(), "p1"); service.publishChapter(TEACHER, second.id(), "p2");
        ChapterProgressDTO progress = service.updateChapterProgress(STUDENT, first.id(), Map.of("status", "completed"), "progress");
        assertThat(progress.courseProgress().total()).isEqualTo(2);
        assertThat(progress.courseProgress().percent()).isEqualTo(50);
        var pool = Executors.newFixedThreadPool(2); var ready = new CountDownLatch(2); var start = new CountDownLatch(1);
        try {
            var a = pool.submit((java.util.concurrent.Callable<Void>) () -> { update(start, ready, second.id(), "in_progress"); return null; });
            var b = pool.submit((java.util.concurrent.Callable<Void>) () -> { update(start, ready, second.id(), "completed"); return null; });
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue(); start.countDown(); a.get(20, TimeUnit.SECONDS); b.get(20, TimeUnit.SECONDS);
        } finally { start.countDown(); pool.shutdownNow(); }
        assertThat(service.updateChapterProgress(STUDENT, second.id(), Map.of("status", "in_progress"), "read").studentProgress().status()).isEqualTo("completed");
        assertThatThrownBy(() -> service.listChapters(OUTSIDER, offering.id())).isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getCode()).isEqualTo("NOT_FOUND"));
    }

    private void update(CountDownLatch start, CountDownLatch ready, String id, String status) throws Exception { ready.countDown(); start.await(10, TimeUnit.SECONDS); service.updateChapterProgress(STUDENT, id, Map.of("status", status), status); }
    private OfferingDTO offering() { return service.createOffering(TEACHER, Map.of("courseId", COURSE, "termId", TERM, "title", "内容班", "groupName", "一班", "progressUnit", "chapter"), "offering"); }
    private static java.sql.Timestamp ts(Instant i) { return java.sql.Timestamp.from(i); }
    private static UserDTO user(String suffix, String username, String role) { return new UserDTO("00000000-0000-4000-8000-0000000000" + suffix, username, "内容测试用户", List.of(role)); }

    @TestConfiguration(proxyBeanMethods = false)
    static class FixedClockConfiguration { @Bean @Primary Clock clock() { return Clock.fixed(NOW, ZoneOffset.UTC); } }
}

