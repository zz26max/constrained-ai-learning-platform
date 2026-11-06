package com.learningplatform.modules.auth.security;

import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

import com.learningplatform.common.exception.BusinessException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/** Single-node, bounded IP quota. All admitted registrations count, including successes. */
@Component
public class RegistrationRateLimiter {
    private static final int MAX_KEYS = 10_000;
    private final Clock clock;
    private final int maxRequests;
    private final long windowSeconds;
    private final Map<String, Window> windows = new HashMap<>();

    public RegistrationRateLimiter(Clock clock,
            @Value("${auth.registration-rate-limit.max-requests:10}") int maxRequests,
            @Value("${auth.registration-rate-limit.window-seconds:60}") long windowSeconds) {
        if (maxRequests < 1 || windowSeconds < 1) throw new IllegalArgumentException("Invalid registration limit");
        this.clock = clock;
        this.maxRequests = maxRequests;
        this.windowSeconds = windowSeconds;
    }

    /** Uses the server-observed remote address, never an untrusted forwarded header. */
    public synchronized void check(String remoteAddress) {
        Instant now = clock.instant();
        String key = remoteAddress == null ? "unknown" : remoteAddress;
        Window window = windows.get(key);
        if (window == null || !now.isBefore(window.until())) {
            if (windows.size() >= MAX_KEYS) {
                windows.entrySet().removeIf(entry -> !now.isBefore(entry.getValue().until()));
                if (window == null && windows.size() >= MAX_KEYS) throw limited(1);
            }
            windows.put(key, new Window(now.plusSeconds(windowSeconds), 1));
            return;
        }
        if (window.count() >= maxRequests) {
            long millis = java.time.Duration.between(now, window.until()).toMillis();
            throw limited(Math.max(1, (millis + 999) / 1000));
        }
        windows.put(key, new Window(window.until(), window.count() + 1));
    }

    private BusinessException limited(long retryAfter) {
        return new BusinessException(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED",
                "注册请求过于频繁，请稍后再试。", Map.of(), (int) Math.min(Integer.MAX_VALUE, retryAfter));
    }

    private record Window(Instant until, int count) {}
}
