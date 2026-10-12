package com.learningplatform.modules.auth.model;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.learningplatform.modules.auth.dto.UserDTO;

/** 有效会话对应的当前身份；CSRF 秘密仅供后续过滤链使用，不直接序列化或打印。 */
public record SessionIdentity(String id, UserDTO user, @JsonIgnore String csrfSecret,
                              Instant expiresAt, Instant idleExpiresAt) {

    @Override
    public String toString() {
        return "SessionIdentity[id=" + id + ", userId=" + user.id() + "]";
    }
}
