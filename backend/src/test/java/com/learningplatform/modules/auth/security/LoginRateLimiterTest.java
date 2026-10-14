package com.learningplatform.modules.auth.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import com.learningplatform.modules.auth.config.LoginRateLimitProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class LoginRateLimiterTest {

    private static final Instant START = Instant.parse("2026-10-11T00:00:00Z");
    private final AdjustableClock clock = new AdjustableClock(START);
    private LoginRateLimiter limiter;

    @BeforeEach
    void setUp() {
        limiter = new LoginRateLimiter(new LoginRateLimitProperties(Duration.ofMinutes(5), 5), clock);
    }

    @Test
    void blocksAtLimitWithRetryAfterEqualToWindow() {
        String key = limiter.key("student.demo", "127.0.0.1");
        for (int i = 0; i < 4; i++) {
            limiter.acquire(key).onFailure();
            try (LoginRateLimiter.Admission probe = limiter.acquire(key)) {
                assertThat(probe.limited()).isFalse();
            }
        }
        limiter.acquire(key).onFailure(); // 第 5 次失败，达到上限
        LoginRateLimiter.Admission limited = limiter.acquire(key);
        assertThat(limited.limited()).isTrue();
        assertThat(limited.retryAfterSeconds()).isEqualTo(300);
    }

    @Test
    void successClearsFailuresWithoutDiscardingOtherInFlightRequests() {
        String key = limiter.key("student.demo", "127.0.0.1");
        for (int i = 0; i < 3; i++) {
            limiter.acquire(key).onFailure();
        }
        LoginRateLimiter.Admission successful = limiter.acquire(key);
        LoginRateLimiter.Admission stillRunning = limiter.acquire(key);
        assertThat(limiter.acquire(key).limited()).isTrue();

        successful.onSuccess();
        List<LoginRateLimiter.Admission> newlyAdmitted = new ArrayList<>();
        try {
            // 成功清空三次失败，但另一个在途请求依然占一格，只能再准入四个。
            for (int i = 0; i < 4; i++) {
                LoginRateLimiter.Admission admission = limiter.acquire(key);
                assertThat(admission.limited()).isFalse();
                newlyAdmitted.add(admission);
            }
            assertThat(limiter.acquire(key).limited()).isTrue();
            stillRunning.onFailure();
            assertThat(limiter.acquire(key).limited()).isTrue();
        } finally {
            newlyAdmitted.forEach(LoginRateLimiter.Admission::close);
            stillRunning.close();
            successful.close();
        }
    }

    @Test
    void windowExpiryFreesTheKey() {
        String key = limiter.key("student.demo", "127.0.0.1");
        for (int i = 0; i < 5; i++) {
            limiter.acquire(key).onFailure();
        }
        assertThat(limiter.acquire(key).limited()).isTrue();
        clock.advanceTo(START.plus(Duration.ofMinutes(5)));
        try (LoginRateLimiter.Admission admission = limiter.acquire(key)) {
            assertThat(admission.limited()).isFalse();
        }
    }

    @Test
    void inFlightReservationsAreReleasedOnlyOnce() {
        String key = limiter.key("student.demo", "127.0.0.1");
        List<LoginRateLimiter.Admission> running = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            running.add(limiter.acquire(key));
        }
        LoginRateLimiter.Admission limited = limiter.acquire(key);
        assertThat(limited.limited()).isTrue();
        assertThat(limited.retryAfterSeconds()).isEqualTo(1);

        running.getFirst().close();
        running.getFirst().close();
        try (LoginRateLimiter.Admission replacement = limiter.acquire(key)) {
            assertThat(replacement.limited()).isFalse();
            assertThat(limiter.acquire(key).limited()).isTrue();
        } finally {
            running.forEach(LoginRateLimiter.Admission::close);
        }
    }

    @Test
    void keyNormalizesUsernameAndSeparatesByIp() {
        assertThat(limiter.key("Student.Demo", "1.2.3.4")).isEqualTo(limiter.key("  student.demo  ", "1.2.3.4"));
        assertThat(limiter.key("student.demo", "1.2.3.4")).isNotEqualTo(limiter.key("student.demo", "5.6.7.8"));
    }

    private static final class AdjustableClock extends Clock {
        private final AtomicReference<Instant> current;

        AdjustableClock(Instant start) {
            this.current = new AtomicReference<>(start);
        }

        void advanceTo(Instant instant) {
            current.set(instant);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return Clock.fixed(instant(), zone);
        }

        @Override
        public Instant instant() {
            return current.get();
        }
    }
}
