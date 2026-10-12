package com.learningplatform.modules.auth.model;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonIgnore;

/** 会话数据库记录；令牌只保存摘要，安全状态摘要用于识别密码或平台角色变更。 */
public record AuthSession(String id, String userId, @JsonIgnore String tokenHash,
                          @JsonIgnore String credentialHash, @JsonIgnore String csrfSecret,
                          Instant expiresAt, Instant idleExpiresAt, Instant revokedAt,
                          Instant lastSeenAt, Instant createdAt, Instant updatedAt) {

    @Override
    public String toString() {
        return "AuthSession[id=" + id + ", userId=" + userId + ", expiresAt=" + expiresAt + "]";
    }
}
