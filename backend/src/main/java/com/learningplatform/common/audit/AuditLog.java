package com.learningplatform.common.audit;

import java.time.Instant;

/** audit_logs 的一行；只追加、不更新、不删除，敏感字段不进入 toString。 */
public record AuditLog(String id, String actorId, String action, String targetType,
                       String targetId, String metadataJson, String requestId, Instant createdAt) {

    @Override
    public String toString() {
        return "AuditLog[id=" + id + ", action=" + action + ", requestId=" + requestId + "]";
    }
}
