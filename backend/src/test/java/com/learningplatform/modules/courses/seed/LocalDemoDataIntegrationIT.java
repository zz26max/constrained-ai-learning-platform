package com.learningplatform.modules.courses.seed;

import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mysql.MySQLContainer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;

/** 用正式 Flyway/MyBatis 和真实 MySQL 验证初始化事务与同班约束；不访问本地开发库。 */
@SpringBootTest
@Testcontainers
@Import(LocalDemoDataIntegrationIT.FixedClockConfiguration.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class LocalDemoDataIntegrationIT {
    private static final Instant NOW = Instant.parse("2026-10-14T08:09:10.123456Z");
    private static final String DATE = "2026-10-14 08:09:10.123456";
    private static final List<String> COURSE_TABLES = List.of("courses", "course_offerings",
            "offering_members", "course_invites", "chapters", "knowledge_points", "resources", "chapter_progress");

    @Container
    static final MySQLContainer mysql = new MySQLContainer("mysql:8.4.11")
            .withDatabaseName("learning_platform_course_seed_test")
            .withUsername("course_seed_test").withPassword(UUID.randomUUID().toString())
            .withCommand("--default-time-zone=+00:00", "--transaction-isolation=READ-COMMITTED");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", mysql::getJdbcUrl);
        registry.add("spring.datasource.username", mysql::getUsername);
        registry.add("spring.datasource.password", mysql::getPassword);
    }

    @Autowired JdbcTemplate jdbc;
    @Autowired LocalDemoDataInitializationService service;
    @Autowired ApplicationContext context;
    @MockitoSpyBean DemoDataMapper mapper;

    @BeforeEach
    void clearOwnContainer() {
        reset(mapper);
        jdbc.update("UPDATE offering_members SET last_chapter_id=NULL");
        for (String table : List.of("chapter_progress", "resources", "knowledge_points", "chapters",
                "course_invites", "offering_members", "course_offerings", "courses", "terms", "users")) {
            jdbc.update("DELETE FROM " + table);
        }
    }

    @Test
    @DisplayName("普通 api 上下文不启动一次性导入，也不预置课程")
    void apiProfileDoesNotSeedDemoData() {
        assertThat(context.containsBean("localDemoDataInitializationRunner")).isFalse();
        assertThat(count("terms")).isZero();
        assertThat(count("courses")).isZero();
        assertThat(count("course_offerings")).isZero();
    }

    @Test
    @DisplayName("一次性导入两个虚构学期和基础课程，当前学期唯一，不创建班级")
    void seedsTwoTermsAndCoursesWithOneCurrentTermAndNoOfferings() {
        assertThat(service.initialize()).isEqualTo(new LocalDemoDataInitializationService.Result(2, 0, 2, 0));
        assertThat(count("terms")).isEqualTo(2);
        assertThat(count("courses")).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM terms WHERE is_current=1", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForList("SELECT status FROM courses", String.class)).containsOnly("active");
        assertThat(jdbc.queryForObject("SELECT DATE_FORMAT(created_at,'%f') FROM terms WHERE id=?", String.class,
                LocalDemoDataInitializationService.CURRENT_TERM_ID)).isEqualTo("123456");
        assertThat(count("course_offerings")).isZero();
    }

    @Test
    @DisplayName("重复执行跳过已有配置，保留标题状态及所有时间")
    void repeatedInitializationPreservesExistingData() {
        service.initialize();
        jdbc.update("UPDATE courses SET title='已经人工编辑',status='archived' WHERE code='DEMO-WEB'");
        List<Map<String, Object>> courses = jdbc.queryForList("SELECT * FROM courses ORDER BY id");
        List<Map<String, Object>> terms = jdbc.queryForList("SELECT * FROM terms ORDER BY id");
        assertThat(service.initialize()).isEqualTo(new LocalDemoDataInitializationService.Result(0, 2, 0, 2));
        assertThat(jdbc.queryForList("SELECT * FROM courses ORDER BY id")).isEqualTo(courses);
        assertThat(jdbc.queryForList("SELECT * FROM terms ORDER BY id")).isEqualTo(terms);
    }

    @Test
    @DisplayName("已有当前学期不会被演示导入覆盖")
    void preservesAnAlreadyConfiguredCurrentTerm() {
        String id = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO terms(id,label,starts_at,ends_at,is_current,created_at,updated_at) VALUES(?,?,'2026-01-01','2027-01-01',1,?,?)",
                id, "已有学期", DATE, DATE);
        service.initialize();
        assertThat(jdbc.queryForObject("SELECT id FROM terms WHERE is_current=1", String.class)).isEqualTo(id);
        assertThat(count("terms")).isEqualTo(3);
    }

    @Test
    @DisplayName("课程导入中途失败，前面新增的学期和课程一起回滚")
    void initializationFailureRollsBackEveryInsertedRow() {
        doThrow(new IllegalStateException("test-only injected insertion failure"))
                .when(mapper).insertCourse(argThat(course -> course != null && "DEMO-DATABASE".equals(course.code())));
        assertThatThrownBy(service::initialize).isInstanceOf(IllegalStateException.class);
        assertThat(count("terms")).isZero();
        assertThat(count("courses")).isZero();
    }

    @Test
    @DisplayName("八张表为 InnoDB，UUID 外键统一 ascii_bin，关键查询索引存在")
    void migrationCreatesInnoDbTablesAndExpectedIndexes() {
        for (String table : COURSE_TABLES) {
            assertThat(jdbc.queryForObject("SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?",
                    String.class, table)).isEqualTo("InnoDB");
            assertThat(jdbc.queryForObject("SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME='id'",
                    String.class, table)).isEqualTo("ascii_bin");
        }
        assertThat(jdbc.queryForList("SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()", String.class))
                .contains("uq_offering_members_offering_user", "uq_chapters_offering_position",
                        "uq_chapter_progress_member_chapter", "ix_course_offerings_term_status",
                        "ix_offering_members_user_last_studied", "ix_chapters_offering_status_position",
                        "ix_resources_chapter_status_position", "ix_chapter_progress_member_last_opened");
    }

    @Test
    @DisplayName("知识点、资料、进度及最后章节均拒绝跨班引用")
    void compositeForeignKeysRejectCrossOfferingReferences() {
        Fixtures f = fixtures();
        assertThatThrownBy(() -> jdbc.update("UPDATE offering_members SET last_chapter_id=? WHERE id=?", f.chapterB, f.memberA))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertKnowledgePoint(f.offeringA, f.chapterB))
                .isInstanceOf(DataIntegrityViolationException.class);
        String pointB = insertKnowledgePoint(f.offeringB, f.chapterB);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO resources(id,offering_id,chapter_id,knowledge_point_id,title,content_markdown,position,created_at,updated_at) VALUES(?,?,?,?,?,'原文',1,?,?)",
                UUID.randomUUID().toString(), f.offeringA, f.chapterA, pointB, "资料", DATE, DATE))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO chapter_progress(id,offering_id,member_id,chapter_id,status,created_at,updated_at) VALUES(?,?,?,?,'in_progress',?,?)",
                UUID.randomUUID().toString(), f.offeringA, f.memberA, f.chapterB, DATE, DATE))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("成员、章节排序自然键唯一，邀请名额及布尔值受 CHECK 保护")
    void uniqueAndCheckConstraintsProtectCourseState() {
        Fixtures f = fixtures();
        assertThatThrownBy(() -> jdbc.update("INSERT INTO offering_members(id,offering_id,user_id,role,joined_at,created_at,updated_at) SELECT ?,offering_id,user_id,role,joined_at,created_at,updated_at FROM offering_members WHERE id=?",
                UUID.randomUUID().toString(), f.memberA)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertChapter(f.offeringA)).isInstanceOf(DataIntegrityViolationException.class);
        assertCheckFailure(() -> jdbc.update("UPDATE chapters SET is_required=2 WHERE id=?", f.chapterA));
        assertCheckFailure(() -> jdbc.update("UPDATE chapters SET position=0 WHERE id=?", f.chapterA));
        assertCheckFailure(() -> jdbc.update("INSERT INTO course_invites(id,offering_id,code_digest,expires_at,max_uses,used_count,created_by,created_at,updated_at) VALUES(?,?,?,'2027-01-01',1,2,?,?,?)",
                UUID.randomUUID().toString(), f.offeringA, "a".repeat(64), f.user, DATE, DATE));
    }

    private Fixtures fixtures() {
        service.initialize();
        String user = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO users(id,username,display_name,password_hash,roles,status,created_at,updated_at) VALUES(?,'test.teacher','虚构教师','test-only-fake-hash',JSON_ARRAY('teacher'),'active',?,?)", user, DATE, DATE);
        String offeringA = insertOffering(user);
        String offeringB = insertOffering(user);
        String memberA = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO offering_members(id,offering_id,user_id,role,joined_at,created_at,updated_at) VALUES(?,?,?,'teacher',?,?,?)", memberA, offeringA, user, DATE, DATE, DATE);
        return new Fixtures(user, offeringA, offeringB, memberA, insertChapter(offeringA), insertChapter(offeringB));
    }

    private String insertOffering(String user) {
        String id = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO course_offerings(id,course_id,term_id,title,group_name,progress_unit,created_by,created_at,updated_at) VALUES(?,'ad000002-0000-4000-8000-000000000001',?,'演示班','甲班','chapter',?,?,?)",
                id, LocalDemoDataInitializationService.CURRENT_TERM_ID, user, DATE, DATE);
        return id;
    }

    private String insertChapter(String offering) {
        String id = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO chapters(id,offering_id,position,title,summary,is_required,created_at,updated_at) VALUES(?,?,1,'第一章','摘要',1,?,?)", id, offering, DATE, DATE);
        return id;
    }

    private String insertKnowledgePoint(String offering, String chapter) {
        String id = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO knowledge_points(id,offering_id,title,description,chapter_id,position,created_at,updated_at) VALUES(?,?,'知识点','说明',?,1,?,?)", id, offering, chapter, DATE, DATE);
        return id;
    }

    private int count(String table) { return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class); }
    private void assertCheckFailure(Runnable command) {
        assertThatThrownBy(command::run).isInstanceOf(DataAccessException.class).rootCause()
                .isInstanceOf(SQLException.class)
                .satisfies(error -> assertThat(((SQLException) error).getErrorCode()).isEqualTo(3819));
    }
    private record Fixtures(String user, String offeringA, String offeringB, String memberA, String chapterA, String chapterB) { }

    @TestConfiguration(proxyBeanMethods = false)
    static class FixedClockConfiguration {
        @Bean @Primary Clock fixedSeedClock() { return Clock.fixed(NOW, ZoneOffset.UTC); }
    }
}
