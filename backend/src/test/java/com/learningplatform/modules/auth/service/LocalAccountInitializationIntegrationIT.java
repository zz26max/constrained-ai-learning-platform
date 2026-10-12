package com.learningplatform.modules.auth.service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

import com.learningplatform.modules.auth.mapper.UserMapper;
import com.learningplatform.modules.auth.model.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mysql.MySQLContainer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 验证真实密码算法、Mapper 写入与事务回滚；所有数据只存在于独立临时 MySQL。 */
@SpringBootTest
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class LocalAccountInitializationIntegrationIT {

    private static final String STUDENT_PASSWORD = "Test-only-student-password";
    private static final String TEACHER_PASSWORD = "Test-only-teacher-password";
    private static final String ADMIN_PASSWORD = "Test-only-admin-password";
    private static boolean initialDatabaseChecked;

    @Container
    static final MySQLContainer mysql = new MySQLContainer("mysql:8.4.11")
            .withDatabaseName("learning_platform_accounts_test")
            .withUsername("accounts_test")
            .withPassword(UUID.randomUUID().toString())
            .withCommand("--character-set-server=utf8mb4", "--collation-server=utf8mb4_0900_ai_ci",
                    "--default-time-zone=+00:00", "--transaction-isolation=READ-COMMITTED");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", mysql::getJdbcUrl);
        registry.add("spring.datasource.username", mysql::getUsername);
        registry.add("spring.datasource.password", mysql::getPassword);
    }

    @Autowired
    private LocalAccountInitializationService service;
    @Autowired
    private UserMapper userMapper;
    @Autowired
    private PasswordEncoder passwordEncoder;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void clearTestUsers() {
        if (!initialDatabaseChecked) {
            // 默认 api 上下文没有激活初始化 Runner，不会自动插入默认账号。
            assertThat(countUsers()).isZero();
            initialDatabaseChecked = true;
        }
        jdbcTemplate.update("DELETE FROM users");
    }

    @Test
    @DisplayName("创建三个独立角色的账户，密码可校验，UUID 和 UTC 微秒时间可往返")
    void createsAccountsWithVerifiableHashes() {
        Instant before = Instant.now().truncatedTo(ChronoUnit.MICROS);

        LocalAccountInitializationService.Result result =
                service.initialize(STUDENT_PASSWORD, TEACHER_PASSWORD, ADMIN_PASSWORD);

        assertThat(result).isEqualTo(new LocalAccountInitializationService.Result(3, 0));
        assertThat(countUsers()).isEqualTo(3);
        List<String> roles = List.of("student", "teacher", "admin");
        List<String> names = List.of("演示学生", "演示教师", "演示管理员");
        List<String> passwords = List.of(STUDENT_PASSWORD, TEACHER_PASSWORD, ADMIN_PASSWORD);
        for (int i = 0; i < roles.size(); i++) {
            User user = userMapper.findByUsername(roles.get(i) + ".demo").orElseThrow();
            assertThat(UUID.fromString(user.id()).toString()).isEqualTo(user.id());
            assertThat(user.displayName()).isEqualTo(names.get(i));
            assertThat(user.roles()).containsExactly(roles.get(i));
            assertThat(user.status()).isEqualTo("active");
            assertThat(user.createdAt()).isBetween(before, Instant.now());
            assertThat(user.updatedAt()).isEqualTo(user.createdAt());
            assertThat(user.createdAt().getNano() % 1000).isZero();
            assertThat(passwordEncoder.matches(passwords.get(i), user.passwordHash())).isTrue();
            assertThat(passwordEncoder.matches("Incorrect-test-password", user.passwordHash())).isFalse();
        }
    }

    @Test
    @DisplayName("重复执行跳过已有账户，配置新密码也不重置数据库里的哈希")
    void repeatedInitializationPreservesEveryExistingField() {
        service.initialize(STUDENT_PASSWORD, TEACHER_PASSWORD, ADMIN_PASSWORD);
        List<User> before = loadAccounts();

        LocalAccountInitializationService.Result result = service.initialize(
                "Changed-student-test-password", "Changed-teacher-test-password", "Changed-admin-test-password");

        assertThat(result).isEqualTo(new LocalAccountInitializationService.Result(0, 3));
        assertThat(loadAccounts()).isEqualTo(before);
        assertThat(countUsers()).isEqualTo(3);
    }

    @Test
    @DisplayName("补齐缺失账户时不恢复已有禁用账户，也不修改姓名和权限")
    void fillsMissingAccountsWithoutChangingExistingIdentity() {
        service.initialize(STUDENT_PASSWORD, TEACHER_PASSWORD, ADMIN_PASSWORD);
        jdbcTemplate.update("DELETE FROM users WHERE username <> 'student.demo'");
        jdbcTemplate.update("UPDATE users SET display_name = ?, roles = ?, status = ? WHERE username = ?",
                "已修改的名字", "[\"teacher\"]", "disabled", "student.demo");
        User existing = userMapper.findByUsername("student.demo").orElseThrow();

        // 已有账户无需提供新密码；本命令不会借机重置它。
        assertThat(service.initialize(null, TEACHER_PASSWORD, ADMIN_PASSWORD))
                .isEqualTo(new LocalAccountInitializationService.Result(2, 1));
        assertThat(userMapper.findByUsername("student.demo").orElseThrow()).isEqualTo(existing);
    }

    @ParameterizedTest
    @MethodSource("invalidPasswords")
    @DisplayName("第三个账户密码不合法时，前两个账户也回滚，错误消息不携带口令")
    void invalidPasswordRollsBackWholeInitialization(String invalidPassword) {
        assertThatThrownBy(() -> service.initialize(STUDENT_PASSWORD, TEACHER_PASSWORD, invalidPassword))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("新建本地账户的密码须为 15～128 个字符，且不能全为空白");
        assertThat(countUsers()).isZero();
    }

    static Stream<String> invalidPasswords() {
        return Stream.of(null, "a".repeat(14), "b".repeat(129), " ".repeat(15));
    }

    @Test
    @DisplayName("长度边界按 Unicode 字符计算，允许 15 字符及 128 个补充平面字符")
    void acceptsPasswordLengthBoundariesWithoutTruncation() {
        String minimum = "a".repeat(15);
        String unicodeMaximum = "🔐".repeat(128);
        String spaced = "  Exact-test-password  ";
        service.initialize(minimum, unicodeMaximum, spaced);

        assertThat(passwordEncoder.matches(minimum, userMapper.findByUsername("student.demo").orElseThrow().passwordHash()))
                .isTrue();
        assertThat(passwordEncoder.matches(unicodeMaximum, userMapper.findByUsername("teacher.demo").orElseThrow().passwordHash()))
                .isTrue();
        String adminHash = userMapper.findByUsername("admin.demo").orElseThrow().passwordHash();
        assertThat(passwordEncoder.matches(spaced, adminHash)).isTrue();
        assertThat(passwordEncoder.matches(spaced.strip(), adminHash)).isFalse();
    }

    @Test
    @DisplayName("数据库写入失败时回滚前面的新增，保留本来存在的账户")
    void databaseFailureRollsBackNewRowsOnly() {
        service.initialize(STUDENT_PASSWORD, TEACHER_PASSWORD, ADMIN_PASSWORD);
        User existing = userMapper.findByUsername("admin.demo").orElseThrow();
        jdbcTemplate.update("DELETE FROM users WHERE username <> 'admin.demo'");
        // 仅在本测试容器增加一条故障约束，验证真实 SQL 失败后的事务回滚。
        jdbcTemplate.execute("ALTER TABLE users ADD CONSTRAINT ck_test_reject_teacher "
                + "CHECK (username <> 'teacher.demo')");
        try {
            assertThatThrownBy(() -> service.initialize(STUDENT_PASSWORD, TEACHER_PASSWORD, ADMIN_PASSWORD))
                    .isInstanceOf(DataAccessException.class);
            assertThat(countUsers()).isEqualTo(1);
            assertThat(userMapper.findByUsername("student.demo")).isEmpty();
            assertThat(userMapper.findByUsername("admin.demo").orElseThrow()).isEqualTo(existing);
        } finally {
            jdbcTemplate.execute("ALTER TABLE users DROP CHECK ck_test_reject_teacher");
        }
    }

    private int countUsers() {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM users", Integer.class);
    }

    private List<User> loadAccounts() {
        return Stream.of("student.demo", "teacher.demo", "admin.demo")
                .map(username -> userMapper.findByUsername(username).orElseThrow()).toList();
    }
}
