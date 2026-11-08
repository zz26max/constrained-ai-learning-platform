package com.learningplatform.modules.checks;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;

class CheckWorkerTest {
    @Test
    void disabledWorkerExpiresJobsWithoutClaimingOrRunningAnything() throws Exception {
        Instant now = Instant.parse("2026-11-07T00:00:00Z");
        CheckStore store = mock(CheckStore.class);
        CheckRunner runner = mock(CheckRunner.class);
        var scanThread = new CompletableFuture<Thread>();
        doAnswer(call -> {
            scanThread.complete(Thread.currentThread());
            return null;
        }).when(store).expire(now);

        new CheckWorker(store, runner, Clock.fixed(now, ZoneOffset.UTC), false).scan();

        assertThat(scanThread.get(5, TimeUnit.SECONDS).join(Duration.ofSeconds(5))).isTrue();
        verify(store).expire(now);
        verifyNoMoreInteractions(store);
        verifyNoInteractions(runner);
    }
}
