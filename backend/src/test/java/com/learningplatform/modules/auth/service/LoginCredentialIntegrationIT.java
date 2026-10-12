package com.learningplatform.modules.auth.service;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.auth.mapper.UserMapper;
import com.learningplatform.modules.auth.model.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mysql.MySQLContainer;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 在临时真实 MySQL 中串起初始化、查询、密码验证和安全身份返回；不创建 HTTP 会话。 */
@SpringBootTest
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class LoginCredentialIntegrationIT {

    private static final String TEST_PASSWORD = "Test-only-login-password-2026";

    @Container
    static final MySQLContainer mysql = new MySQLContainer("mysql:8.4.11")
            .withDatabaseName("learning_platform_login_test")
            .withUsername("login_test")
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
    private LoginCredentialService service;
    @Autowired
    private LocalAccountInitializationService initializer;
    @Autowired
    private UserMapper userMapper;
    @Autowired
    private PasswordEncoder passwordEncoder;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void prepareAccounts() {
        // 清理仅作用于本测试的临时库；开发库中的三种演示账户不受影响。
        jdbcTemplate.update("DELETE FROM users");
        initializer.initialize(TEST_PASSWORD, TEST_PASSWORD, TEST_PASSWORD);
    }

    @Test
    @DisplayName("有效账户凭据返回安全身份资料，验证前后账户数据不变")
    void verifiesActiveAccountAndReturnsSafeIdentity() {
        User before = userMapper.findByUsername("student.demo").orElseThrow();

        // 建议先在这行设置断点，再在 Service 的查询与 matches 语句设行断点。
        UserDTO identity = service.verifyCredentials("student.demo", TEST_PASSWORD);

        assertThat(identity).isEqualTo(new UserDTO(before.id(), "student.demo", "演示学生", List.of("student")));
        String json = JsonMapper.builder().build().writeValueAsString(identity);
        assertThat(json).contains("\"id\"", "\"username\"", "\"displayName\"", "\"roles\"")
                .doesNotContain("password", TEST_PASSWORD, before.passwordHash(), "status", "createdAt", "updatedAt");
        assertThat(identity.toString()).doesNotContain(TEST_PASSWORD, before.passwordHash());
        assertThatThrownBy(() -> identity.roles().add("admin")).isInstanceOf(UnsupportedOperationException.class);
        assertThat(userMapper.findByUsername("student.demo").orElseThrow()).isEqualTo(before);
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM users", Integer.class)).isEqualTo(3);
    }

    @ParameterizedTest
    @ValueSource(strings = {"teacher", "admin"})
    @DisplayName("教师和管理员凭据也可验证，角色取自数据库")
    void verifiesOtherRoles(String role) {
        assertThat(service.verifyCredentials(role + ".demo", TEST_PASSWORD).roles()).containsExactly(role);
    }

    @Test
    @ResourceLock("default-locale")
    @DisplayName("用户名去除首尾空白并按 Locale.ROOT 转小写，不受土耳其语默认区域影响")
    void normalizesUsernameIndependentlyOfDefaultLocale() {
        Locale previous = Locale.getDefault();
        try {
            Locale.setDefault(Locale.forLanguageTag("tr-TR"));
            assertThat(service.verifyCredentials("\u2003 ADMIN.DEMO \u2003", TEST_PASSWORD).username())
                    .isEqualTo("admin.demo");
        } finally {
            Locale.setDefault(previous);
        }
    }

    @Test
    @DisplayName("错误的短密码属于凭据失败，不套用新建账户的最小密码长度")
    void rejectsWrongShortPasswordWithCredentialFailure() {
        assertInvalidCredentials("student.demo", "bad");
    }

    @Test
    @DisplayName("不存在的账户与密码错误返回相同错误，不新增用户")
    void missingAccountFailsWithoutCreatingUser() {
        assertInvalidCredentials("missing.user", TEST_PASSWORD);
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM users", Integer.class)).isEqualTo(3);
    }

    @Test
    @DisplayName("禁用账户即使密码正确也拒绝，不更改账户状态或哈希")
    void disabledAccountFailsWithSamePublicError() {
        jdbcTemplate.update("UPDATE users SET status = 'disabled' WHERE username = 'student.demo'");
        User before = userMapper.findByUsername("student.demo").orElseThrow();

        assertInvalidCredentials("student.demo", TEST_PASSWORD);
        assertInvalidCredentials("student.demo", "Incorrect-test-password");

        assertThat(userMapper.findByUsername("student.demo").orElseThrow()).isEqualTo(before);
    }

    @Test
    @DisplayName("密码的 Unicode、首尾空格和大小写必须完全一致")
    void preservesPasswordWithoutNormalization() {
        String exactPassword = "  登录测试AbC-2026-🔐  ";
        jdbcTemplate.update("UPDATE users SET password_hash = ? WHERE username = ?",
                passwordEncoder.encode(exactPassword), "student.demo");

        assertThat(service.verifyCredentials("STUDENT.DEMO", exactPassword).username()).isEqualTo("student.demo");
        assertInvalidCredentials("student.demo", exactPassword.strip());
        assertInvalidCredentials("student.demo", "  登录测试abc-2026-🔐  ");
    }

    @Test
    @DisplayName("允许 128 个 Unicode 码点的密码，按字符而不是 UTF-16 长度限制")
    void acceptsUnicodePasswordAtMaximumLength() {
        String maximumPassword = "🔐".repeat(128);
        jdbcTemplate.update("UPDATE users SET password_hash = ? WHERE username = ?",
                passwordEncoder.encode(maximumPassword), "student.demo");

        assertThat(service.verifyCredentials("student.demo", maximumPassword).username()).isEqualTo("student.demo");
    }

    @Test
    @DisplayName("已存有效哈希的短密码按实际哈希验证，创建规则不追溯到登录")
    void verifiesExistingShortPasswordInsteadOfApplyingCreationPolicy() {
        jdbcTemplate.update("UPDATE users SET password_hash = ? WHERE username = ?",
                passwordEncoder.encode("tiny"), "student.demo");

        assertThat(service.verifyCredentials("student.demo", "tiny").username()).isEqualTo("student.demo");
    }

    @ParameterizedTest
    @ValueSource(strings = {"TEST_ONLY_NOT_A_VALID_HASH", "{noop}Test-only-login-password-2026",
            "{unsupported}Test-only-value", "{argon2}$argon2id$broken"})
    @DisplayName("损坏或不支持的密码哈希不能绕过验证，返回统一凭据失败")
    void rejectsInvalidStoredHash(String invalidHash) {
        jdbcTemplate.update("UPDATE users SET password_hash = ? WHERE username = ?", invalidHash, "student.demo");

        assertInvalidCredentials("student.demo", TEST_PASSWORD);
    }

    private void assertInvalidCredentials(String username, String password) {
        assertThatThrownBy(() -> service.verifyCredentials(username, password))
                .isInstanceOfSatisfying(BusinessException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.UNAUTHORIZED);
                    assertThat(exception.getCode()).isEqualTo("INVALID_CREDENTIALS");
                    assertThat(exception.getMessage()).isEqualTo("用户名或密码错误");
                    assertThat(exception.getDetails()).isEmpty();
                });
    }
}
