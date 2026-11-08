package com.learningplatform.modules.checks;

import java.time.Clock;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class CheckWorker {
    private static final Logger LOG = LoggerFactory.getLogger(CheckWorker.class);
    private final CheckStore store;
    private final CheckRunner runner;
    private final Clock clock;
    private final boolean enabled;
    private final AtomicBoolean busy = new AtomicBoolean();

    public CheckWorker(CheckStore store, CheckRunner runner, Clock clock,
                       @Value("${checks.enabled:false}") boolean enabled) {
        this.store = store;
        this.runner = runner;
        this.clock = clock;
        this.enabled = enabled;
    }

    @Scheduled(fixedDelayString = "${checks.poll-ms:1000}")
    public void scan() {
        if (!busy.compareAndSet(false, true)) return;
        Thread.startVirtualThread(() -> {
            try {
                store.expire(clock.instant());
                if (enabled) for (String id : store.queued()) execute(id);
            } catch (RuntimeException e) {
                LOG.warn("Automatic check worker failed to process queue ({})", e.getClass().getSimpleName());
            } finally {
                busy.set(false);
            }
        });
    }

    void execute(String id) {
        String token = UUID.randomUUID().toString();
        CheckStore.Job job = store.claim(id, token, clock.instant().plusSeconds(120));
        if (job == null) return;
        Map<String, Object> result = null;
        Map<String, Object> error = null;
        try {
            result = runner.run(id, job.policy(), job.files());
        } catch (CheckRunner.RunnerFailure e) {
            error = Map.of("code", e.code, "message", e.getMessage());
        } catch (RuntimeException e) {
            error = Map.of("code", "RUNNER_INTERNAL_ERROR", "message", "检查环境运行失败。");
        }
        store.complete(id, token, clock.instant(), result, error);
    }
}
