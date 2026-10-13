package com.learningplatform.modules.auth.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import com.learningplatform.modules.auth.config.LoginRateLimitProperties;
import org.springframework.stereotype.Component;

/**
 * 登录失败限流：按“规范化用户名 + 客户端 IP”计数，失败记录和正在验证的请求共同占用名额。
 * 成功登录清除该组合计数。单节点内存实现，适合当前课程规模；多实例部署需换共享存储。
 */
@Component
public class LoginRateLimiter {

    private final Duration window;
    private final int maxFailures;
    private final Clock clock;
    private final ConcurrentHashMap<String, WindowState> attempts = new ConcurrentHashMap<>();

    public LoginRateLimiter(LoginRateLimitProperties properties, Clock clock) {
        this.window = properties.window();
        this.maxFailures = properties.maxFailures();
        this.clock = clock;
    }

    public String key(String rawUsername, String clientIp) {
        String username = rawUsername == null ? "" : rawUsername.strip().toLowerCase(Locale.ROOT);
        return username + "|" + clientIp;
    }

    /** 同一 key 的检查与预占在 compute 中原子完成，凭据验证在此操作结束后执行。 */
    public Admission acquire(String key) {
        AtomicReference<Admission> result = new AtomicReference<>();
        attempts.compute(key, (ignored, existing) -> {
            Instant now = clock.instant();
            WindowState state = existing == null ? new WindowState() : existing;
            prune(state.failures, now.minus(window));
            if (state.failures.size() + state.inFlight >= maxFailures) {
                result.set(new Admission(this, key, true, retryAfter(state, now)));
            } else {
                state.inFlight++;
                result.set(new Admission(this, key, false, 0));
            }
            return state;
        });
        sweep();
        return result.get();
    }

    /** 清除失败计数；仍在验证的请求保留名额，也用于测试间重置已经结束的请求状态。 */
    public void onSuccess(String key) {
        attempts.computeIfPresent(key, (ignored, state) -> {
            state.failures.clear();
            return state.empty() ? null : state;
        });
    }

    private void complete(Admission admission, Completion completion) {
        if (admission.limited || !admission.completed.compareAndSet(false, true)) {
            return;
        }
        attempts.computeIfPresent(admission.key, (ignored, state) -> {
            Instant now = clock.instant();
            prune(state.failures, now.minus(window));
            state.inFlight--;
            if (completion == Completion.SUCCESS) {
                state.failures.clear();
            } else if (completion == Completion.FAILURE) {
                state.failures.addLast(now);
            }
            return state.empty() ? null : state;
        });
    }

    private long retryAfter(WindowState state, Instant now) {
        if (state.failures.isEmpty()) {
            // 仅在途请求占满时无法预计验证结束时间，至少等待一秒再试。
            return 1;
        }
        Duration remaining = Duration.between(now, state.failures.peekFirst().plus(window));
        long seconds = remaining.getSeconds() + (remaining.getNano() == 0 ? 0 : 1);
        return Math.max(seconds, 1);
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
        attempts.forEach((key, ignored) -> attempts.computeIfPresent(key, (unused, state) -> {
            // 准入、结算与清理都操作 map 内的当前状态，避免线程持有已被移除的旧计数器。
            prune(state.failures, clock.instant().minus(window));
            return state.empty() ? null : state;
        }));
    }

    private static final class WindowState {
        private final Deque<Instant> failures = new ArrayDeque<>();
        private int inFlight;

        private boolean empty() {
            return failures.isEmpty() && inFlight == 0;
        }
    }

    private enum Completion { SUCCESS, FAILURE, RELEASE }

    /** 每次准入只结算一次；finally 中 close 释放系统故障等未结算路径的名额。 */
    public static final class Admission implements AutoCloseable {
        private final LoginRateLimiter owner;
        private final String key;
        private final boolean limited;
        private final long retryAfterSeconds;
        private final AtomicBoolean completed = new AtomicBoolean();

        private Admission(LoginRateLimiter owner, String key, boolean limited, long retryAfterSeconds) {
            this.owner = owner;
            this.key = key;
            this.limited = limited;
            this.retryAfterSeconds = retryAfterSeconds;
        }

        public boolean limited() {
            return limited;
        }

        public long retryAfterSeconds() {
            return retryAfterSeconds;
        }

        public void onSuccess() {
            owner.complete(this, Completion.SUCCESS);
        }

        public void onFailure() {
            owner.complete(this, Completion.FAILURE);
        }

        @Override
        public void close() {
            owner.complete(this, Completion.RELEASE);
        }
    }
}
