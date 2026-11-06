package com.learningplatform.modules.auth.controller;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import com.learningplatform.common.audit.AuditService;
import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.common.web.RequestIdFilter;
import com.learningplatform.modules.auth.config.AuthHttpProperties;
import com.learningplatform.modules.auth.config.LoginRateLimitProperties;
import com.learningplatform.modules.auth.dto.LoginWrite;
import com.learningplatform.modules.auth.security.CsrfTokenService;
import com.learningplatform.modules.auth.security.LoginRateLimiter;
import com.learningplatform.modules.auth.service.DatabaseSessionService;
import com.learningplatform.modules.courses.service.TermQueryService;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AuthControllerConcurrencyTest {

    @Test
    void databaseFailureReleasesAdmissionWithoutCountingAnInvalidPassword() {
        Clock clock = Clock.fixed(Instant.parse("2026-10-14T00:00:00Z"), ZoneOffset.UTC);
        DatabaseSessionService sessions = mock(DatabaseSessionService.class);
        LoginRateLimiter limiter = new LoginRateLimiter(
                new LoginRateLimitProperties(Duration.ofMinutes(5), 5), clock);
        AuthController controller = new AuthController(sessions, mock(com.learningplatform.modules.auth.service.RegisterService.class),
                mock(CsrfTokenService.class), limiter,
                new com.learningplatform.modules.auth.security.RegistrationRateLimiter(clock, 10, 60),
                mock(AuditService.class), mock(TermQueryService.class),
                new AuthHttpProperties(Duration.ofMinutes(10), "", List.of("http://localhost:5173"), false), clock,
                mock(com.learningplatform.modules.tutoring.provider.TutoringProvider.class));
        when(sessions.login(anyString(), anyString(), any(), anyString()))
                .thenThrow(new DataAccessResourceFailureException("Test-only database failure"));

        // 超过五次系统故障后仍能进入 Service，证明故障既没有占住名额，也没有计为错误口令。
        for (int i = 0; i < 6; i++) {
            MockHttpServletRequest request = new MockHttpServletRequest();
            request.setRemoteAddr("127.0.0.1");
            request.setAttribute(RequestIdFilter.ATTRIBUTE_NAME, "database-failure-" + i);
            assertThatThrownBy(() -> controller.login(new LoginWrite("student.demo", "test-password"),
                    request, new MockHttpServletResponse()))
                    .isInstanceOf(DataAccessResourceFailureException.class);
        }
    }

    @Test
    void simultaneousLoginsAdmitAtMostFiveCredentialChecks() throws Exception {
        int requests = 20;
        Clock clock = Clock.fixed(Instant.parse("2026-10-14T00:00:00Z"), ZoneOffset.UTC);
        DatabaseSessionService sessions = mock(DatabaseSessionService.class);
        LoginRateLimiter limiter = new LoginRateLimiter(
                new LoginRateLimitProperties(Duration.ofMinutes(5), 5), clock);
        AuthController controller = new AuthController(sessions, mock(com.learningplatform.modules.auth.service.RegisterService.class),
                mock(CsrfTokenService.class), limiter,
                new com.learningplatform.modules.auth.security.RegistrationRateLimiter(clock, 10, 60),
                mock(AuditService.class), mock(TermQueryService.class),
                new AuthHttpProperties(Duration.ofMinutes(10), "", List.of("http://localhost:5173"), false), clock,
                mock(com.learningplatform.modules.tutoring.provider.TutoringProvider.class));

        CountDownLatch ready = new CountDownLatch(requests);
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch admittedOrRejected = new CountDownLatch(requests);
        CountDownLatch finishVerification = new CountDownLatch(1);
        AtomicInteger credentialChecks = new AtomicInteger();
        doAnswer(invocation -> {
            credentialChecks.incrementAndGet();
            admittedOrRejected.countDown();
            // 所有请求先完成准入决定，之后才允许凭据验证返回，稳定复现检查与失败记录之间的空档。
            assertThat(finishVerification.await(10, TimeUnit.SECONDS)).isTrue();
            throw new BusinessException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "用户名或密码错误");
        }).when(sessions).login(anyString(), anyString(), any(), anyString());

        ExecutorService executor = Executors.newFixedThreadPool(requests);
        List<Future<String>> results = new ArrayList<>();
        try {
            for (int i = 0; i < requests; i++) {
                int requestNumber = i;
                results.add(executor.submit(() -> {
                    MockHttpServletRequest request = new MockHttpServletRequest();
                    request.setRemoteAddr("127.0.0.1");
                    request.setAttribute(RequestIdFilter.ATTRIBUTE_NAME, "concurrent-login-" + requestNumber);
                    ready.countDown();
                    assertThat(start.await(10, TimeUnit.SECONDS)).isTrue();
                    try {
                        controller.login(new LoginWrite("student.demo", "wrong-test-password"),
                                request, new MockHttpServletResponse());
                        return "unexpected-success";
                    } catch (BusinessException exception) {
                        if ("RATE_LIMITED".equals(exception.getCode())) {
                            admittedOrRejected.countDown();
                            assertThat(exception.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
                            assertThat(exception.getRetryAfterSeconds()).isPositive();
                        }
                        return exception.getCode();
                    }
                }));
            }
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            assertThat(admittedOrRejected.await(10, TimeUnit.SECONDS)).isTrue();
            assertThat(credentialChecks.get()).isLessThanOrEqualTo(5);

            finishVerification.countDown();
            List<String> codes = new ArrayList<>();
            for (Future<String> result : results) {
                codes.add(result.get(10, TimeUnit.SECONDS));
            }
            assertThat(codes).filteredOn("INVALID_CREDENTIALS"::equals).hasSize(5);
            assertThat(codes).filteredOn("RATE_LIMITED"::equals).hasSize(15);
        } finally {
            start.countDown();
            finishVerification.countDown();
            executor.shutdownNow();
            assertThat(executor.awaitTermination(10, TimeUnit.SECONDS)).isTrue();
        }
    }
}
