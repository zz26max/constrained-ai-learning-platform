package com.learningplatform.modules.analytics.service;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name="analytics.retention-enabled",havingValue="true")
public class EventRetentionWorker {
    private final LearningEventService events;
    public EventRetentionWorker(LearningEventService events){this.events=events;}
    @Scheduled(fixedDelayString="${analytics.retention-scan-ms:3600000}")
    public void purge(){events.purgeExpiredClients();}
}
