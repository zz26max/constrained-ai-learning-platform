package com.learningplatform.modules.auth.security;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import com.learningplatform.common.exception.BusinessException;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class RegistrationRateLimiterTest {
    @Test
    void countsEveryAdmissionSeparatesIpsAndReopensAtWindowBoundary() {
        Clock clock = mock(Clock.class);
        Instant start = Instant.parse("2026-11-06T00:00:00Z");
        when(clock.instant()).thenReturn(start);
        RegistrationRateLimiter limiter = new RegistrationRateLimiter(clock, 2, 60);
        limiter.check("ip1");
        limiter.check("ip1");
        assertThatThrownBy(() -> limiter.check("ip1")).isInstanceOfSatisfying(BusinessException.class, e -> {
            assertThat(e.getCode()).isEqualTo("RATE_LIMITED");
            assertThat(e.getRetryAfterSeconds()).isEqualTo(60);
        });
        limiter.check("ip2");
        when(clock.instant()).thenReturn(start.plusSeconds(59));
        assertThatThrownBy(() -> limiter.check("ip1")).isInstanceOfSatisfying(BusinessException.class,
                e -> assertThat(e.getRetryAfterSeconds()).isEqualTo(1));
        when(clock.instant()).thenReturn(start.plusSeconds(60));
        limiter.check("ip1");
    }

    @Test
    void parallelRequestsCannotExceedQuota() throws Exception {
        var limiter = new RegistrationRateLimiter(Clock.fixed(Instant.EPOCH, ZoneOffset.UTC), 5, 60);
        try (var pool = Executors.newFixedThreadPool(20)) {
            var jobs = new java.util.ArrayList<java.util.concurrent.Future<Boolean>>();
            for (int i = 0; i < 20; i++) jobs.add(pool.submit(() -> {
                try { limiter.check("same-ip"); return true; }
                catch (BusinessException e) { assertThat(e.getCode()).isEqualTo("RATE_LIMITED"); return false; }
            }));
            int admitted = 0;
            for (var job : jobs) if (job.get(10, TimeUnit.SECONDS)) admitted++;
            assertThat(admitted).isEqualTo(5);
        }
    }
}
