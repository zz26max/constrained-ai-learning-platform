package com.learningplatform.modules.auth.service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;

import com.learningplatform.common.config.PasswordConfiguration;
import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.auth.mapper.UserMapper;
import com.learningplatform.modules.auth.model.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** 单独验证输入边界与失败分支；密码计算使用实际项目算法，不用耗时断言衡量安全性。 */
class LoginCredentialServiceTest {

    private static final String TEST_PASSWORD = "Test-only-login-password";

    private UserMapper userMapper;
    private PasswordEncoder passwordEncoder;
    private LoginCredentialService service;

    @BeforeEach
    void setUp() {
        userMapper = mock(UserMapper.class);
        passwordEncoder = spy(new PasswordConfiguration().passwordEncoder());
        service = new LoginCredentialService(userMapper, passwordEncoder);
        // 构造器创建占位哈希不属于每次登录的计算，单独观察当前请求的调用。
        clearInvocations(passwordEncoder);
    }

    @ParameterizedTest
    @MethodSource("invalidUsernames")
    @DisplayName("用户名缺失或格式非法时拒绝输入，不查询数据库、不回显输入")
    void rejectsInvalidUsernameBeforeDatabaseAccess(String username) {
        assertInvalidInput(username, TEST_PASSWORD, "username");
        verifyNoInteractions(userMapper, passwordEncoder);
    }

    static Stream<String> invalidUsernames() {
        return Stream.of(null, "", "   ", "ab", "a".repeat(65), "-student", "学生账号",
                "student demo", "student.demo' OR '1'='1", "student.demo\nx", " ".repeat(254) + "abc");
    }

    @ParameterizedTest
    @MethodSource("invalidPasswords")
    @DisplayName("密码缺失或超长时拒绝输入，不查询数据库、不回显密码")
    void rejectsMissingOrOverlongPasswordBeforeDatabaseAccess(String password) {
        assertInvalidInput("student.demo", password, "password");
        verifyNoInteractions(userMapper, passwordEncoder);
    }

    static Stream<String> invalidPasswords() {
        return Stream.of(null, "", "a".repeat(129), "🔐".repeat(129));
    }

    @Test
    @DisplayName("用户不存在时仍执行一次实际密码校验，结果为统一凭据失败")
    void missingUserStillPerformsPasswordCalculation() {
        when(userMapper.findByUsername("missing.user")).thenReturn(Optional.empty());

        assertInvalidCredentials("missing.user", TEST_PASSWORD);

        verify(passwordEncoder).matches(eq(TEST_PASSWORD), anyString());
    }

    @Test
    @DisplayName("禁用账户也先执行密码校验，不能用正确密码登录")
    void disabledUserStillPerformsPasswordCalculation() {
        String hash = passwordEncoder.encode(TEST_PASSWORD);
        when(userMapper.findByUsername("student.demo")).thenReturn(Optional.of(user(hash, "disabled")));
        clearInvocations(passwordEncoder);

        assertInvalidCredentials("student.demo", TEST_PASSWORD);

        verify(passwordEncoder).matches(TEST_PASSWORD, hash);
    }

    @Test
    @DisplayName("未知算法拒绝认证，并使用占位哈希完成有效计算")
    void invalidStoredHashFailsClosedWithoutRevealingItsValue() {
        String invalidHash = "{unsupported}Test-only-invalid-hash";
        when(userMapper.findByUsername("student.demo")).thenReturn(Optional.of(user(invalidHash, "active")));

        assertInvalidCredentials("student.demo", TEST_PASSWORD);

        verify(passwordEncoder, times(2)).matches(eq(TEST_PASSWORD), anyString());
    }

    @Test
    @DisplayName("数据库故障保留服务端异常，不伪装成用户名或密码错误")
    void databaseFailureIsNotConvertedToCredentialFailure() {
        DataAccessResourceFailureException failure = new DataAccessResourceFailureException("Test-only database failure");
        when(userMapper.findByUsername("student.demo")).thenThrow(failure);

        assertThatThrownBy(() -> service.verifyCredentials("student.demo", TEST_PASSWORD)).isSameAs(failure);

        verify(passwordEncoder, never()).matches(anyString(), anyString());
    }

    private void assertInvalidInput(String username, String password, String field) {
        assertThatThrownBy(() -> service.verifyCredentials(username, password))
                .isInstanceOfSatisfying(BusinessException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
                    assertThat(exception.getCode()).isEqualTo("VALIDATION_ERROR");
                    assertThat(exception.getMessage()).isEqualTo("请求参数校验失败");
                    String message = "username".equals(field) ? "用户名格式不正确" : "密码须为 1～128 个字符";
                    assertThat(exception.getDetails()).isEqualTo(
                            java.util.Map.of("fields", List.of(java.util.Map.of("field", field, "message", message))));
                });
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

    private User user(String hash, String status) {
        Instant now = Instant.now();
        return new User(UUID.randomUUID().toString(), "student.demo", "虚构测试学生", hash,
                List.of("student"), status, now, now);
    }
}
