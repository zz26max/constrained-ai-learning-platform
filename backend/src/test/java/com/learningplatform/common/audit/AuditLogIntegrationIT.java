package com.learningplatform.common.audit;

import java.sql.SQLException;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mysql.MySQLContainer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * audit_logs 的真实 MySQL 验证：迁移、追加写入、账户删除后的 actor 匿名化与 CHECK 约束。
 */
@SpringBootTest
@Testcontainers
class AuditLogIntegrationIT {

    private static final Instant NOW = Instant.parse("2026-10-11T00:00:00Z");

    @Container
    static final MySQLContainer mysql = new MySQLContainer("mysql:8.4.11")
            .withDatabaseName("learning_platform_test")
            .withUsername("platform_test")
            .withPassword(UUID.randomUUID().toString())
            .withCommand("--character-set-server=utf8mb4",
                    "--collation-server=utf8mb4_0900_ai_ci",
                    "--default-time-zone=+00:00",
                    "--transaction-isolation=READ-COMMITTED");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", mysql::getJdbcUrl);
        registry.add("spring.datasource.username", mysql::getUsername);
        registry.add("spring.datasource.password", mysql::getPassword);
    }

    @Autowired
    private JdbcTemplate jdbcTemplate;
    @Autowired
    private AuditService auditService;

    @BeforeEach
    void clear() {
        jdbcTemplate.update("DELETE FROM audit_logs");
        jdbcTemplate.update("DELETE FROM users");
    }

    @Test
    @DisplayName("Flyway 建立 audit_logs 表且使用 InnoDB")
    void migrationCreatesAuditTable() {
        String engine = jdbcTemplate.queryForObject("SELECT ENGINE FROM information_schema.TABLES "
                + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_logs'", String.class);
        assertThat(engine).isEqualTo("InnoDB");
    }

    @Test
    @DisplayName("审计行保存 actor 与元数据；账户删除后 actor 匿名化，审计行保留")
    void userDeletionAnonymizesActorButKeepsRow() {
        String userId = UUID.randomUUID().toString();
        insertUser(userId, "student.demo");

        auditService.record(userId, AuditService.ACTION_LOGIN_SUCCESS, "user", userId,
                Map.of("username", "student.demo"), "req-test-001");

        assertThat(count("SELECT COUNT(*) FROM audit_logs WHERE actor_id = ?", userId)).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject("SELECT metadata->>'$.username' FROM audit_logs WHERE actor_id = ?",
                String.class, userId)).isEqualTo("student.demo");

        jdbcTemplate.update("DELETE FROM users WHERE id = ?", userId);

        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM audit_logs", Integer.class)).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject("SELECT actor_id FROM audit_logs", String.class)).isNull();
    }

    @Test
    @DisplayName("非法 action 与非法 request_id 被数据库 CHECK 拒绝")
    void checkConstraintsRejectInvalidValues() {
        String id = UUID.randomUUID().toString();
        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO audit_logs (id, action, metadata, request_id, created_at) VALUES (?, ?, ?, ?, ?)",
                id, "bad action!", "{}", "req-test-002", NOW))
                .isInstanceOfSatisfying(DataAccessException.class, exception ->
                        assertThat(sqlErrorCode(exception)).isEqualTo(3819));

        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO audit_logs (id, action, metadata, request_id, created_at) VALUES (?, ?, ?, ?, ?)",
                id, "LOGIN_SUCCESS", "{}", "req test-003", NOW))
                .isInstanceOfSatisfying(DataAccessException.class, exception ->
                        assertThat(sqlErrorCode(exception)).isEqualTo(3819));
    }

    private void insertUser(String id, String username) {
        jdbcTemplate.update("INSERT INTO users (id, username, display_name, password_hash, roles, status, created_at, updated_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                id, username, "演示学生", "{argon2}$argon2id$test", "[\"student\"]", "active", NOW, NOW);
    }

    private int count(String sql, String param) {
        return jdbcTemplate.queryForObject(sql, Integer.class, param);
    }

    private int sqlErrorCode(DataAccessException exception) {
        return ((SQLException) exception.getMostSpecificCause()).getErrorCode();
    }
}
