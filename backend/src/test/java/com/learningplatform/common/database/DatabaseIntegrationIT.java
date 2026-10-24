package com.learningplatform.common.database;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import javax.sql.DataSource;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mysql.MySQLContainer;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 真正的 MySQL 8.4 集成验证，独立于开发库，不使用 H2，也不整体回滚测试事务。
 *
 * <p>Failsafe 在 Maven verify 阶段执行 *IT。容器分配临时端口和独立空库，
 * Flyway 使用正式迁移建表；测试结束后容器自动释放。Docker 不可用时测试失败，
 * 不把“跳过数据库验证”误报为通过。</p>
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class DatabaseIntegrationIT {

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
        // 覆盖正式环境变量占位符；测试账号和地址由临时容器提供。
        registry.add("spring.datasource.url", mysql::getJdbcUrl);
        registry.add("spring.datasource.username", mysql::getUsername);
        registry.add("spring.datasource.password", mysql::getPassword);
    }

    @Autowired
    private JdbcTemplate jdbcTemplate;
    @Autowired
    private DataSource dataSource;
    @Autowired
    private Flyway flyway;
    @Autowired
    private MockMvc mockMvc;

    @BeforeEach
    void clearTestTerms() {
        // 只清理本测试临时库的学期数据，绝不访问开发数据库。
        jdbcTemplate.update("DELETE FROM terms");
    }

    @Test
    @Order(1)
    @DisplayName("空库自动迁移，再次执行不会重复建表")
    void migrationIsAppliedOnceAndValidatedAgain() {
        assertThat(jdbcTemplate.queryForObject("SELECT VERSION()", String.class))
                .startsWith("8.4.11");
        assertThat(flyway.info().applied()).hasSize(10)
                .extracting(migration -> migration.getVersion().getVersion())
                .containsExactly("1", "2", "3", "4", "5", "6", "7", "8", "9", "10");
        Integer checksum = flyway.info().applied()[0].getChecksum();
        assertThat(flyway.migrate().migrationsExecuted).isZero();
        assertThat(flyway.info().applied()[0].getChecksum()).isEqualTo(checksum);
        assertThat(jdbcTemplate.queryForObject("""
                SELECT ENGINE FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'terms'
                """, String.class)).isEqualTo("InnoDB");
        assertThat(jdbcTemplate.queryForObject("""
                SELECT COLLATION_NAME FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'terms' AND COLUMN_NAME = 'id'
                """, String.class)).isEqualTo("ascii_bin");
    }

    @Test
    @Order(2)
    @DisplayName("数据库连接使用 UTC、READ COMMITTED 和严格 SQL 模式")
    void connectionConfigurationMatchesTheDataModel() throws Exception {
        // 同时借出两条连接，确认配置作用于连接池创建的连接。
        try (Connection first = dataSource.getConnection();
             Connection second = dataSource.getConnection()) {
            assertThat(first.getTransactionIsolation()).isEqualTo(Connection.TRANSACTION_READ_COMMITTED);
            assertThat(second.getTransactionIsolation()).isEqualTo(Connection.TRANSACTION_READ_COMMITTED);
            for (Connection connection : new Connection[]{first, second}) {
                try (var statement = connection.createStatement();
                     var result = statement.executeQuery("SELECT @@session.time_zone, @@session.sql_mode")) {
                    assertThat(result.next()).isTrue();
                    assertThat(result.getString(1)).isEqualTo("+00:00");
                    assertThat(result.getString(2)).contains("STRICT_TRANS_TABLES");
                }
            }
        }
    }

    @Test
    @Order(3)
    @DisplayName("允许多个历史学期，当前学期最多一条")
    void currentTermUniqueConstraintAllowsHistoricalTerms() {
        String historicalId = insertTerm(0, "2025-09-01 00:00:00", "2026-01-01 00:00:00");
        insertTerm(0, "2026-02-01 00:00:00", "2026-07-01 00:00:00");
        String currentId = insertTerm(1, "2026-09-01 00:00:00", "2027-01-01 00:00:00");
        assertThat(jdbcTemplate.queryForObject("SELECT current_slot FROM terms WHERE id = ?",
                Integer.class, historicalId)).isNull();
        assertThat(jdbcTemplate.queryForObject("SELECT current_slot FROM terms WHERE id = ?",
                Integer.class, currentId)).isEqualTo(1);
        assertThatThrownBy(() -> insertTerm(1, "2027-02-01 00:00:00", "2027-07-01 00:00:00"))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM terms", Integer.class)).isEqualTo(3);
    }

    @Test
    @Order(4)
    @DisplayName("数据库拒绝非法布尔值和无效学期时间范围")
    void checkConstraintsRejectInvalidTerms() {
        assertCheckViolation(() -> insertTerm(2, "2026-09-01 00:00:00", "2027-01-01 00:00:00"),
                "ck_terms_current");
        assertCheckViolation(() -> insertTerm(0, "2026-09-01 00:00:00", "2026-09-01 00:00:00"),
                "ck_terms_time_range");
        assertCheckViolation(() -> insertTerm(0, "2026-09-02 00:00:00", "2026-09-01 00:00:00"),
                "ck_terms_time_range");
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM terms", Integer.class)).isZero();
    }

    @Test
    @Order(5)
    @DisplayName("DATETIME(6) 保留微秒，is_current 默认值为零")
    void timestampsKeepMicrosecondsAndCurrentFlagDefaultsToZero() {
        String id = UUID.randomUUID().toString();
        jdbcTemplate.update("""
                INSERT INTO terms (id, label, starts_at, ends_at, created_at, updated_at)
                VALUES (?, ?, '2026-09-01 00:00:00.123456', '2027-01-01 00:00:00',
                        '2026-10-06 00:00:00', '2026-10-06 00:00:00')
                """, id, "虚构演示学期");
        assertThat(jdbcTemplate.queryForObject("SELECT DATE_FORMAT(starts_at, '%f') FROM terms WHERE id = ?",
                String.class, id)).isEqualTo("123456");
        assertThat(jdbcTemplate.queryForObject("SELECT is_current FROM terms WHERE id = ?",
                Integer.class, id)).isZero();
    }

    @Test
    @Order(6)
    @DisplayName("真实数据库可用时匿名就绪接口返回 200")
    void realDatabaseReturnsReady() throws Exception {
        mockMvc.perform(get("/health/ready"))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"status\":\"ready\"}", JsonCompareMode.STRICT))
                .andExpect(header().string("Cache-Control", "no-store"));
    }

    @Test
    @Order(99)
    @DisplayName("真实数据库断开后就绪返回 503，存活仍返回 200")
    void databaseOutageDoesNotChangeLiveness() throws Exception {
        // 故障场景最后执行，只停止本测试自己的临时容器。
        mysql.stop();
        Instant startedAt = Instant.now();
        mockMvc.perform(get("/health/ready"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(content().json("{\"status\":\"unavailable\"}", JsonCompareMode.STRICT))
                .andExpect(header().string("Cache-Control", "no-store"));
        assertThat(Duration.between(startedAt, Instant.now())).isLessThan(Duration.ofSeconds(8));
        mockMvc.perform(get("/health/live"))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"status\":\"ok\"}", JsonCompareMode.STRICT));
    }

    private String insertTerm(int current, String startsAt, String endsAt) {
        String id = UUID.randomUUID().toString();
        Timestamp now = Timestamp.from(Instant.now());
        jdbcTemplate.update("""
                INSERT INTO terms (id, label, starts_at, ends_at, is_current, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, id, "虚构演示学期", startsAt, endsAt, current, now, now);
        return id;
    }

    private void assertCheckViolation(ThrowingCallable insertion, String constraintName) {
        // CHECK 违规的 Spring 异常分类可能随驱动而异；验证 MySQL 的真实错误码与约束名。
        assertThatThrownBy(insertion)
                .isInstanceOf(DataAccessException.class)
                .rootCause()
                .isInstanceOf(SQLException.class)
                .hasMessageContaining(constraintName)
                .satisfies(exception -> assertThat(((SQLException) exception).getErrorCode()).isEqualTo(3819));
    }
}
