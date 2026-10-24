package com.learningplatform.modules.helprequests;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Explicit opt-in: installing the migration does not authorize deleting live content. */
@Component
@ConditionalOnProperty(name="help.retention-enabled",havingValue="true")
public class HelpRetentionWorker {
    private final HelpService service;
    public HelpRetentionWorker(HelpService service){this.service=service;}
    @Scheduled(fixedDelayString="${help.retention-cleanup-delay:3600000}")
    public void purge(){service.purgeExpiredSnapshots();}
}
