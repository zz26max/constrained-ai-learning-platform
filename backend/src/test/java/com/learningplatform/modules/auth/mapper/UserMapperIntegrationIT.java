package com.learningplatform.modules.auth.mapper;

import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.TimeZone;
import java.util.UUID;
import java.util.stream.Stream;

import com.learningplatform.modules.auth.model.User;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.junit.jupiter.api.parallel.Resources;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
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

/**
 * 用户数据访问的真实 MySQL 验证：正式 Flyway 迁移建表，正式 Mapper 执行查询。
 *
 * <p>查询用例的测试数据使用 JdbcTemplate 写入，使查询验证不依赖 Mapper 的新增方法。
 * 临时容器有独立账号、随机端口，数据清理仅作用于本测试库。</p>
 */
@SpringBootTest
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class UserMapperIntegrationIT {

    // 这是明显不可用于登录的测试占位文本，不是真实密码，也不是有效的密码哈希。
    private static final String TEST_ONLY_FAKE_HASH = "TEST_ONLY_NOT_A_VALID_PASSWORD_HASH";
    private static final String CREATED_AT_SQL = "2026-10-08 03:04:05.123456";
    private static final String UPDATED_AT_SQL = "2026-10-08 04:05:06.654321";
    private static final Instant CREATED_AT = Instant.parse("2026-10-08T03:04:05.123456Z");
    private static final Instant UPDATED_AT = Instant.parse("2026-10-08T04:05:06.654321Z");
    private static boolean initialDatabaseChecked;

    @Container
    static final MySQLContainer mysql = new MySQLContainer("mysql:8.4.11")
            .withDatabaseName("learning_platform_users_test")
            .withUsername("users_test")
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
    private UserMapper userMapper;

    @BeforeEach
    void clearTestUsers() {
        if (!initialDatabaseChecked) {
            // 本类第一次执行时，在任何 DELETE 之前检查迁移没有创建默认账号。
            assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM users", Integer.class)).isZero();
            initialDatabaseChecked = true;
        }
        jdbcTemplate.update("DELETE FROM users");
    }

    @Test
    @DisplayName("按用户名查询正确映射中文名字、角色列表和微秒时间")
    void findByUsernameMapsAccountAndKeepsRolesImmutable() {
        String id = insertUser("teacher.alice", "[\"teacher\",\"admin\"]", "active");

        User user = userMapper.findByUsername("teacher.alice").orElseThrow();

        assertThat(user).extracting(User::id, User::username, User::displayName, User::passwordHash,
                        User::roles, User::status, User::createdAt, User::updatedAt)
                .containsExactly(id, "teacher.alice", "虚构测试老师", TEST_ONLY_FAKE_HASH,
                        List.of("teacher", "admin"), "active", CREATED_AT, UPDATED_AT);
        assertThatThrownBy(() -> user.roles().add("student"))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    @DisplayName("未找到用户时返回空 Optional")
    void returnsEmptyWhenUserDoesNotExist() {
        assertThat(userMapper.findByUsername("missing.user")).isEmpty();
    }

    @Test
    @DisplayName("查询使用参数绑定且精确匹配规范化用户名")
    void queryDoesNotInterpretSqlOrSilentlyChangeUsernameCase() {
        insertUser("teacher.alice", "[\"teacher\"]", "active");

        assertThat(userMapper.findByUsername("teacher.alice' OR '1' = '1")).isEmpty();
        assertThat(userMapper.findByUsername("TEACHER.ALICE")).isEmpty();
        assertThat(userMapper.findByUsername(" teacher.alice ")).isEmpty();
        assertThat(userMapper.findByUsername("teacher.alice ")).isEmpty();
        assertThat(userMapper.findByUsername("teacher.alice  ")).isEmpty();
        assertThat(userMapper.findByUsername("teacher.alice")).isPresent();
    }

    @Test
    @DisplayName("用户名唯一且允许规范长度边界")
    void usernameIsUniqueAndAcceptsLengthBoundaries() {
        insertUser("a01", "[\"student\"]", "active");
        insertUser("a".repeat(64), "[\"student\"]", "active");

        assertThatThrownBy(() -> insertUser("a01", "[\"teacher\"]", "active"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("uq_users_username");
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM users", Integer.class)).isEqualTo(2);
    }

    @ParameterizedTest(name = "拒绝非法用户名 [{index}]")
    @MethodSource("invalidUsernames")
    @DisplayName("数据库拒绝大写、非法字符、空白和不合法长度")
    void usernameConstraintRejectsInvalidInput(String username) {
        // 超过列长度由严格 SQL 模式拒绝，其余非法值由 CHECK 拒绝。
        assertThatThrownBy(() -> insertUser(username, "[\"student\"]", "active"))
                .isInstanceOf(DataAccessException.class);
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM users", Integer.class)).isZero();
    }

    static Stream<String> invalidUsernames() {
        return Stream.of("ab", "a".repeat(65), "Alice", " alice", "alice ", "a/b",
                "-alice", "alice\n", "alice\r", "\talice", "alice@school");
    }

    @ParameterizedTest(name = "拒绝非法角色集合 [{index}]")
    @ValueSource(strings = {"[]", "{}", "\"student\"", "[\"owner\"]",
            "[\"student\",\"student\"]", "[null]", "[1]",
            "[\"student\",\"teacher\",\"admin\",\"student\"]"})
    @DisplayName("角色必须是非空、合法且无重复的 JSON 数组")
    void rolesConstraintRejectsInvalidInput(String rolesJson) {
        assertCheckViolation(() -> insertUser("test.user", rolesJson, "active"), "ck_users_roles");
    }

    @ParameterizedTest(name = "拒绝非法状态 [{index}]")
    @ValueSource(strings = {"locked", "ACTIVE", "", "active ", "disabled ", "active\n"})
    @DisplayName("数据库只接受 active 和 disabled 状态")
    void statusConstraintRejectsInvalidInput(String status) {
        assertCheckViolation(() -> insertUser("test.user", "[\"student\"]", status),
                "ck_users_status");
    }

    @Test
    @DisplayName("新用户状态默认 active，查询仍返回 disabled 用户供业务判断")
    void statusDefaultAndDisabledUserAreMapped() {
        String id = UUID.randomUUID().toString();
        jdbcTemplate.update("""
                INSERT INTO users (id, username, display_name, password_hash, roles, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, id, "default.user", "虚构测试学生", TEST_ONLY_FAKE_HASH,
                "[\"student\"]", CREATED_AT_SQL, UPDATED_AT_SQL);
        insertUser("disabled.user", "[\"student\"]", "disabled");

        assertThat(userMapper.findByUsername("default.user").orElseThrow().status()).isEqualTo("active");
        // Mapper 如实读取数据；后续登录 Service 负责拒绝禁用账号。
        assertThat(userMapper.findByUsername("disabled.user").orElseThrow().status()).isEqualTo("disabled");
    }

    @ParameterizedTest(name = "JVM 时区 {0} 下仍按 UTC 读取")
    @ValueSource(strings = {"Asia/Shanghai", "Pacific/Honolulu"})
    @ResourceLock(Resources.TIME_ZONE)
    @DisplayName("DATETIME 转 Instant 不依赖 JVM 默认时区")
    void readingDatesKeepsUtcWhenJvmZoneChanges(String zoneId) {
        insertUser("utc.user", "[\"student\"]", "active");
        TimeZone original = TimeZone.getDefault();
        try {
            // 刻意模拟开发电脑或服务器在非 UTC 时区；测试结束必须恢复全局状态。
            TimeZone.setDefault(TimeZone.getTimeZone(zoneId));
            User user = userMapper.findByUsername("utc.user").orElseThrow();
            assertThat(user.createdAt()).isEqualTo(CREATED_AT);
            assertThat(user.updatedAt()).isEqualTo(UPDATED_AT);
        } finally {
            TimeZone.setDefault(original);
        }
    }

    @Test
    @DisplayName("日志文本和 JSON 序列化不泄漏密码哈希")
    void modelDoesNotExposePasswordHashInLogsOrJson() {
        insertUser("safe.user", "[\"student\"]", "active");
        User user = userMapper.findByUsername("safe.user").orElseThrow();

        assertThat(user.toString()).doesNotContain(TEST_ONLY_FAKE_HASH);
        String json = JsonMapper.builder().build().writeValueAsString(user);
        assertThat(json).doesNotContain("passwordHash", TEST_ONLY_FAKE_HASH);
        assertThat(json).contains("safe.user");
    }

    private String insertUser(String username, String rolesJson, String status) {
        String id = UUID.randomUUID().toString();
        jdbcTemplate.update("""
                INSERT INTO users (id, username, display_name, password_hash, roles, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, id, username, "虚构测试老师", TEST_ONLY_FAKE_HASH, rolesJson, status,
                CREATED_AT_SQL, UPDATED_AT_SQL);
        return id;
    }

    private void assertCheckViolation(ThrowingCallable insertion, String constraintName) {
        // CHECK 的 Spring 异常分类可能随驱动变化，核对 MySQL 的真实错误码和约束名。
        assertThatThrownBy(insertion)
                .isInstanceOf(DataAccessException.class)
                .rootCause()
                .isInstanceOf(SQLException.class)
                .hasMessageContaining(constraintName)
                .satisfies(exception -> assertThat(((SQLException) exception).getErrorCode()).isEqualTo(3819));
    }
}
