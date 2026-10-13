package com.learningplatform.modules.auth.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.auth.mapper.AuthSessionMapper;
import com.learningplatform.modules.auth.mapper.UserMapper;
import com.learningplatform.modules.auth.model.AuthSession;
import com.learningplatform.modules.auth.model.SessionGrant;
import com.learningplatform.modules.auth.model.SessionIdentity;
import com.learningplatform.modules.auth.security.SessionTokenCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mysql.MySQLContainer;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;

/** 真实 MySQL 会话测试；可控时钟验证期限，独立事务与行锁验证并发状态变化。 */
@SpringBootTest
@Testcontainers
@Import(DatabaseSessionIntegrationIT.TestClockConfiguration.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class DatabaseSessionIntegrationIT {

    private static final String TEST_PASSWORD = "Test-only-session-password-2026";
    private static final Instant START = Instant.parse("2026-10-08T08:00:00.123456Z");

    @Container
    static final MySQLContainer mysql = new MySQLContainer("mysql:8.4.11")
            .withDatabaseName("learning_platform_sessions_test")
            .withUsername("sessions_test")
            .withPassword(UUID.randomUUID().toString())
            .withCommand("--character-set-server=utf8mb4", "--collation-server=utf8mb4_0900_ai_ci",
                    "--default-time-zone=+00:00", "--transaction-isolation=READ-COMMITTED");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", mysql::getJdbcUrl);
        registry.add("spring.datasource.username", mysql::getUsername);
        registry.add("spring.datasource.password", mysql::getPassword);
        registry.add("auth.session.idle-timeout", () -> "PT12H");
        registry.add("auth.session.absolute-timeout", () -> "P7D");
    }

    @Autowired
    private DatabaseSessionService service;
    @Autowired
    private LocalAccountInitializationService initializer;
    @Autowired
    private AuthSessionMapper sessionMapper;
    @Autowired
    private JdbcTemplate jdbcTemplate;
    @Autowired
    private MutableClock clock;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired
    private SqlSessionTemplate sqlSessionTemplate;
    private UserMapper realUserMapper;
    @MockitoSpyBean
    private UserMapper userMapper;
    @MockitoSpyBean
    private SessionTokenCodec tokens;

    @BeforeEach
    void prepareAccounts() {
        // Mapper 是接口代理，Mockito 的 callRealMethod 无法执行接口抽象方法。
        // 另取正式 MyBatis 代理作为委托，仍使用相同的事务连接和正式 XML。
        realUserMapper = sqlSessionTemplate.getMapper(UserMapper.class);
        // 只清理本测试容器，正常启动不会生成任何会话。
        jdbcTemplate.update("DELETE FROM auth_sessions");
        jdbcTemplate.update("DELETE FROM users");
        clock.set(START);
        initializer.initialize(TEST_PASSWORD, TEST_PASSWORD, TEST_PASSWORD);
    }

    @Test
    @DisplayName("正确凭据创建会话，后续用令牌识别用户；数据库不保存原令牌")
    void loginCreatesSessionAndRecognizesNextRequest() {
        // 第一处业务入口：凭据校验 + 创建会话。
        SessionGrant grant = service.login("student.demo", TEST_PASSWORD, null, "test-request-id");

        AuthSession stored = stored(grant.token());
        assertThat(countSessions()).isEqualTo(1);
        assertThat(grant.token()).matches("[0-9a-f]{64}").isNotEqualTo(grant.csrfSecret());
        assertThat(UUID.fromString(grant.id()).toString()).isEqualTo(grant.id());
        assertThat(stored.userId()).isEqualTo(grant.user().id());
        assertThat(stored.tokenHash()).isEqualTo(tokens.digest(grant.token())).isNotEqualTo(grant.token());
        assertThat(stored.credentialHash()).isEqualTo(tokens.digest(
                userMapper.findByUsername("student.demo").orElseThrow().passwordHash() + "\nstudent"));
        assertThat(stored.createdAt()).isEqualTo(START);
        assertThat(stored.lastSeenAt()).isEqualTo(START);
        assertThat(stored.expiresAt()).isEqualTo(START.plus(Duration.ofDays(7)));
        assertThat(stored.idleExpiresAt()).isEqualTo(START.plus(Duration.ofHours(12)));
        assertThat(stored.revokedAt()).isNull();

        // 第二处业务入口：模拟后续请求携带令牌，不再次输入用户名与密码。
        SessionIdentity identity = service.resolve(grant.token());

        assertThat(identity.user()).isEqualTo(grant.user());
        assertThat(identity.id()).isEqualTo(grant.id());
        assertThat(identity.csrfSecret()).isEqualTo(grant.csrfSecret());
        JsonMapper json = JsonMapper.builder().build();
        assertThat(json.writeValueAsString(grant)).doesNotContain(grant.token(), grant.csrfSecret(), TEST_PASSWORD);
        assertThat(json.writeValueAsString(stored)).doesNotContain(stored.tokenHash(), stored.credentialHash(), stored.csrfSecret());
        assertThat(json.writeValueAsString(identity)).doesNotContain(grant.csrfSecret());
        assertThat(grant.toString()).doesNotContain(grant.token(), grant.csrfSecret());
        assertThat(stored.toString()).doesNotContain(stored.tokenHash(), stored.credentialHash(), stored.csrfSecret());
        assertThat(identity.toString()).doesNotContain(grant.csrfSecret());
    }

    @Test
    void wrongPasswordDoesNotCreateSessionOrRevokeExistingOne() {
        SessionGrant existing = login();
        assertThatThrownBy(() -> service.login("student.demo", "Wrong-test-password", existing.token(), "test-request-id"))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getCode()).isEqualTo("INVALID_CREDENTIALS"));
        assertThat(countSessions()).isEqualTo(1);
        assertThat(stored(existing.token()).revokedAt()).isNull();
        assertThat(service.resolve(existing.token()).user().username()).isEqualTo("student.demo");
    }

    @Test
    void successfulLoginRotatesPreviousSessionAndCsrfSecret() {
        SessionGrant old = login();
        SessionGrant replacement = service.login("student.demo", TEST_PASSWORD, old.token(), "test-request-id");
        assertThat(replacement.token()).isNotEqualTo(old.token());
        assertThat(replacement.csrfSecret()).isNotEqualTo(old.csrfSecret());
        assertThat(stored(old.token()).revokedAt()).isEqualTo(START);
        assertUnauthenticated(old.token());
        assertThat(service.resolve(replacement.token()).user().username()).isEqualTo("student.demo");
    }

    @Test
    void switchingAccountsRevokesOnlyPresentedPreviousSession() {
        SessionGrant old = login();
        SessionGrant otherDevice = login();
        SessionGrant teacher = service.login("teacher.demo", TEST_PASSWORD, old.token(), "test-request-id");
        assertUnauthenticated(old.token());
        assertThat(service.resolve(teacher.token()).user().roles()).containsExactly("teacher");
        assertThat(service.resolve(otherDevice.token()).user().username()).isEqualTo("student.demo");
    }

    @Test
    void revocationIsPersistentAndIdempotent() {
        SessionGrant grant = login();
        clock.set(START.plusSeconds(60));
        service.revoke(grant.token());
        Instant revokedAt = stored(grant.token()).revokedAt();
        clock.set(START.plusSeconds(120));
        service.revoke(grant.token());
        service.revoke(null);
        service.revoke(tokens.generate());
        assertThat(stored(grant.token()).revokedAt()).isEqualTo(revokedAt);
        assertUnauthenticated(grant.token());
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", " ", "not-a-session", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"})
    void missingOrMalformedTokensCannotAuthenticate(String token) {
        assertUnauthenticated(token);
        assertThat(countSessions()).isZero();
    }

    @Test
    void unknownWellFormedTokenCannotAuthenticate() {
        assertUnauthenticated(tokens.generate());
        assertThat(countSessions()).isZero();
    }

    @Test
    void idleDeadlineIsExclusiveAndExpiredSessionCannotReviveAfterClockRollback() {
        SessionGrant grant = login();
        clock.set(START.plus(Duration.ofHours(12)));
        assertUnauthenticated(grant.token());
        assertThat(stored(grant.token()).revokedAt()).isNotNull();
        clock.set(START.plus(Duration.ofHours(1)));
        assertUnauthenticated(grant.token());
    }

    @Test
    void validActivityExtendsIdleDeadlineButNotAbsoluteDeadline() {
        SessionGrant grant = login();
        clock.set(START.plus(Duration.ofHours(11)));
        SessionIdentity identity = service.resolve(grant.token());
        assertThat(identity.idleExpiresAt()).isEqualTo(START.plus(Duration.ofHours(23)));
        assertThat(identity.expiresAt()).isEqualTo(grant.expiresAt());
        clock.set(START.plus(Duration.ofHours(23)));
        assertUnauthenticated(grant.token());
    }

    @Test
    void repeatedActivityCannotExtendSessionBeyondSevenDays() {
        SessionGrant grant = login();
        SessionIdentity identity = null;
        for (int i = 1; i <= 15; i++) {
            clock.set(START.plus(Duration.ofHours(i * 11L)));
            identity = service.resolve(grant.token());
        }
        assertThat(identity.idleExpiresAt()).isEqualTo(grant.expiresAt());
        clock.set(grant.expiresAt());
        assertUnauthenticated(grant.token());
    }

    @Test
    void disabledAccountInvalidatesSessionAndReenablingDoesNotRestoreIt() {
        SessionGrant grant = login();
        jdbcTemplate.update("UPDATE users SET status = 'disabled' WHERE username = 'student.demo'");
        assertUnauthenticated(grant.token());
        jdbcTemplate.update("UPDATE users SET status = 'active' WHERE username = 'student.demo'");
        assertUnauthenticated(grant.token());
    }

    @Test
    void passwordChangeInvalidatesOldSession() {
        SessionGrant grant = login();
        String newHash = new com.learningplatform.common.config.PasswordConfiguration()
                .passwordEncoder().encode("Changed-test-session-password");
        jdbcTemplate.update("UPDATE users SET password_hash = ? WHERE username = 'student.demo'", newHash);
        assertUnauthenticated(grant.token());
        SessionGrant replacement = service.login("student.demo", "Changed-test-session-password", null, "test-request-id");
        assertThat(service.resolve(replacement.token()).user().username()).isEqualTo("student.demo");
    }

    @Test
    void displayNameChangeIsVisibleWithoutChangingSession() {
        SessionGrant grant = login();
        jdbcTemplate.update("UPDATE users SET display_name = ? WHERE username = 'student.demo'", "新演示名称");
        SessionIdentity identity = service.resolve(grant.token());
        assertThat(identity.user().roles()).containsExactly("student");
        assertThat(identity.user().displayName()).isEqualTo("新演示名称");
    }

    @Test
    void platformRoleChangeInvalidatesPreviousSession() {
        SessionGrant grant = login();
        jdbcTemplate.update("UPDATE users SET roles = ? WHERE username = 'student.demo'", "[\"teacher\"]");
        assertUnauthenticated(grant.token());
        SessionGrant replacement = login();
        assertThat(service.resolve(replacement.token()).user().roles()).containsExactly("teacher");
    }

    @Test
    void roleOrderAloneDoesNotInvalidateSession() {
        jdbcTemplate.update("UPDATE users SET roles = ? WHERE username = 'student.demo'", "[\"student\",\"teacher\"]");
        SessionGrant grant = login();
        jdbcTemplate.update("UPDATE users SET roles = ? WHERE username = 'student.demo'", "[\"teacher\",\"student\"]");
        assertThat(service.resolve(grant.token()).user().roles()).containsExactlyInAnyOrder("student", "teacher");
    }

    @Test
    void deletingAccountCascadesSessionDeletion() {
        SessionGrant grant = login();
        jdbcTemplate.update("DELETE FROM users WHERE username = 'student.demo'");
        assertThat(countSessions()).isZero();
        assertUnauthenticated(grant.token());
    }

    @Test
    void insertFailureRollsBackPreviousSessionRevocation() {
        SessionGrant existing = login();
        // 强制碰撞真实唯一键，验证 SQL 插入失败不会留下“旧会话已撤销、新会话未创建”。
        doReturn(existing.token()).when(tokens).generate();
        assertThatThrownBy(() -> service.login("student.demo", TEST_PASSWORD, existing.token(), "test-request-id"))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(countSessions()).isEqualTo(1);
        assertThat(stored(existing.token()).revokedAt()).isNull();
        assertThat(service.resolve(existing.token()).user().username()).isEqualTo("student.demo");
    }

    @ParameterizedTest
    @ValueSource(strings = {"status", "password"})
    void accountChangeBetweenPasswordCheckAndAccountLockPreventsSessionCreation(String change) {
        String replacementHash = new com.learningplatform.common.config.PasswordConfiguration()
                .passwordEncoder().encode("Changed-during-login-test-password");
        doAnswer(invocation -> {
            // 独立事务模拟另一请求在密码计算后提交变更；不能跟随失败登录一起回滚。
            inNewTransaction(() -> {
                if ("status".equals(change)) {
                    jdbcTemplate.update("UPDATE users SET status = 'disabled' WHERE username = 'student.demo'");
                } else {
                    jdbcTemplate.update("UPDATE users SET password_hash = ? WHERE username = 'student.demo'", replacementHash);
                }
            });
            return realUserMapper.findByIdForShare(invocation.getArgument(0, String.class));
        }).when(userMapper).findByIdForShare(anyString());

        assertThatThrownBy(() -> service.login("student.demo", TEST_PASSWORD, null, "test-request-id"))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getCode()).isEqualTo("INVALID_CREDENTIALS"));
        assertThat(countSessions()).isZero();
    }

    @Test
    void sessionCreationSamplesTimeAfterWaitingForAccountLock() throws Exception {
        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch attemptedRead = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        doAnswer(invocation -> {
            attemptedRead.countDown();
            return realUserMapper.findByIdForShare(invocation.getArgument(0, String.class));
        }).when(userMapper).findByIdForShare(anyString());
        try {
            Future<?> blocker = executor.submit(() -> inNewTransaction(() -> {
                jdbcTemplate.queryForObject("SELECT id FROM users WHERE username = 'student.demo' FOR UPDATE", String.class);
                locked.countDown();
                try {
                    if (!release.await(5, TimeUnit.SECONDS)) { throw new IllegalStateException("测试锁未及时释放"); }
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("测试线程中断");
                }
            }));
            assertThat(locked.await(5, TimeUnit.SECONDS)).isTrue();
            Future<SessionGrant> login = executor.submit(this::login);
            assertThat(attemptedRead.await(5, TimeUnit.SECONDS)).isTrue();
            clock.set(START.plus(Duration.ofHours(5)));
            release.countDown();
            SessionGrant grant = login.get(10, TimeUnit.SECONDS);
            blocker.get(10, TimeUnit.SECONDS);
            assertThat(stored(grant.token()).createdAt()).isEqualTo(clock.instant());
        } finally {
            release.countDown();
            executor.shutdownNow();
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"token_hash = 'invalid'", "credential_hash = 'invalid'", "csrf_secret = 'invalid'",
            "expires_at = created_at", "idle_expires_at = last_seen_at", "revoked_at = DATE_SUB(created_at, INTERVAL 1 SECOND)"})
    void databaseRejectsInvalidSessionData(String assignment) {
        SessionGrant grant = login();
        assertThatThrownBy(() -> jdbcTemplate.update("UPDATE auth_sessions SET " + assignment + " WHERE id = ?", grant.id()))
                .isInstanceOfSatisfying(DataAccessException.class, exception ->
                        assertThat(exception.getMostSpecificCause()).isInstanceOfSatisfying(SQLException.class,
                                sqlException -> assertThat(sqlException.getErrorCode()).isEqualTo(3819)));
    }

    @Test
    void sessionSchemaHasRequiredEngineIndexesAndUserForeignKey() {
        assertThat(jdbcTemplate.queryForObject("SELECT ENGINE FROM information_schema.TABLES "
                + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'auth_sessions'", String.class)).isEqualTo("InnoDB");
        assertThat(jdbcTemplate.queryForObject("SELECT COLLATION_NAME FROM information_schema.COLUMNS "
                + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'auth_sessions' AND COLUMN_NAME = 'token_hash'", String.class))
                .isEqualTo("ascii_bin");
        AuthSession orphan = new AuthSession(UUID.randomUUID().toString(), UUID.randomUUID().toString(),
                tokens.digest(tokens.generate()), tokens.digest("test-only-credential"), tokens.generate(),
                START.plus(Duration.ofDays(7)), START.plus(Duration.ofHours(12)), null, START, START, START);
        assertThatThrownBy(() -> sessionMapper.insert(orphan)).isInstanceOf(DataIntegrityViolationException.class);
    }

    private SessionGrant login() {
        return service.login("student.demo", TEST_PASSWORD, null, "test-request-id");
    }

    private AuthSession stored(String token) {
        return sessionMapper.findByTokenHash(tokens.digest(token)).orElseThrow();
    }

    private int countSessions() {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM auth_sessions", Integer.class);
    }

    private void assertUnauthenticated(String token) {
        assertThatThrownBy(() -> service.resolve(token)).isInstanceOfSatisfying(BusinessException.class, exception -> {
            assertThat(exception.getStatus()).isEqualTo(HttpStatus.UNAUTHORIZED);
            assertThat(exception.getCode()).isEqualTo("UNAUTHENTICATED");
            assertThat(exception.getDetails()).isEmpty();
        });
    }

    private void inNewTransaction(Runnable action) {
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        transaction.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        transaction.executeWithoutResult(status -> action.run());
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class TestClockConfiguration {
        @Bean
        @Primary
        MutableClock testSessionClock() { return new MutableClock(); }
    }

    static class MutableClock extends Clock {
        private final AtomicReference<Instant> current = new AtomicReference<>(START);
        void set(Instant instant) { current.set(instant); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return Clock.fixed(instant(), zone); }
        @Override public Instant instant() { return current.get(); }
    }
}
