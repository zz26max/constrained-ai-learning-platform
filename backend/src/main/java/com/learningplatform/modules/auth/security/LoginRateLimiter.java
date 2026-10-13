package com.learningplatform.modules.auth.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;

import com.learningplatform.modules.auth.config.LoginRateLimitProperties;
import org.springframework.stereotype.Component;

/**
 * 登录失败限流：按“规范化用户名 + 客户端 IP”在固定窗口内计数，达到上限后返回限流并附带等待秒数。
 * 成功登录清除该组合计数。单节点内存实现，适合当前课程规模；多实例部署需换共享存储。
 */
@Component
public class LoginRateLimiter {

    private final Duration window;
    private final int maxFailures;
    private final Clock clock;
    private final ConcurrentHashMap<String, Deque<Instant>> attempts = new ConcurrentHashMap<>();

    public LoginRateLimiter(LoginRateLimitProperties properties, Clock clock) {
        this.window = properties.window();
        this.maxFailures = properties.maxFailures();
        this.clock = clock;
    }

    public String key(String rawUsername, String clientIp) {
        String username = rawUsername == null ? "" : rawUsername.strip().toLowerCase(Locale.ROOT);
        return username + "|" + clientIp;
    }

    public record Outcome(boolean limited, long retryAfterSeconds) {
    }

    /** 读取当前是否已达上限；不新增计数。 */
    public Outcome check(String key) {
        Deque<Instant> deque = attempts.get(key);
        if (deque == null) {
            return new Outcome(false, 0);
        }
        synchronized (deque) {
            Instant cutoff = clock.instant().minus(window);
            prune(deque, cutoff);
            if (deque.isEmpty()) {
                attempts.remove(key, deque);
                return new Outcome(false, 0);
            }
            if (deque.size() >= maxFailures) {
                long retry = Duration.between(clock.instant(), deque.peekFirst().plus(window)).getSeconds();
                return new Outcome(true, Math.max(retry, 1));
            }
            return new Outcome(false, 0);
        }
    }

    /** 记录一次失败尝试。 */
    public void onFailure(String key) {
        Instant now = clock.instant();
        Deque<Instant> deque = attempts.computeIfAbsent(key, ignored -> new ArrayDeque<>());
        synchronized (deque) {
            prune(deque, now.minus(window));
            deque.addLast(now);
        }
        sweep();
    }

    /** 成功登录清除该组合的失败计数。 */
    public void onSuccess(String key) {
        attempts.remove(key);
    }

    private void prune(Deque<Instant> deque, Instant cutoff) {
        while (!deque.isEmpty() && !deque.peekFirst().isAfter(cutoff)) {
            deque.pollFirst();
        }
    }

    private void sweep() {
        if (attempts.size() <= 10_000) {
            return;
        }
        Instant cutoff = clock.instant().minus(window);
        attempts.forEach((key, deque) -> {
            synchronized (deque) {
                prune(deque, cutoff);
                if (deque.isEmpty()) {
                    attempts.remove(key, deque);
                }
            }
        });
    }
}
