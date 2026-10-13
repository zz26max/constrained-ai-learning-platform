package com.learningplatform.modules.auth.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
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
            limiter.onFailure(key);
            assertThat(limiter.check(key).limited()).isFalse();
        }
        limiter.onFailure(key); // 第 5 次失败，达到上限
        assertThat(limiter.check(key).limited()).isTrue();
        assertThat(limiter.check(key).retryAfterSeconds()).isEqualTo(300);
    }

    @Test
    void successClearsFailureCount() {
        String key = limiter.key("student.demo", "127.0.0.1");
        for (int i = 0; i < 5; i++) {
            limiter.onFailure(key);
        }
        limiter.onSuccess(key);
        assertThat(limiter.check(key).limited()).isFalse();
    }

    @Test
    void windowExpiryFreesTheKey() {
        String key = limiter.key("student.demo", "127.0.0.1");
        for (int i = 0; i < 5; i++) {
            limiter.onFailure(key);
        }
        assertThat(limiter.check(key).limited()).isTrue();
        clock.advanceTo(START.plus(Duration.ofMinutes(5)).plusSeconds(1));
        assertThat(limiter.check(key).limited()).isFalse();
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
