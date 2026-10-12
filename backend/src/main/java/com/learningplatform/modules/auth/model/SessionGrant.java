package com.learningplatform.modules.auth.model;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.learningplatform.modules.auth.dto.UserDTO;

/** 新会话交给内部 HTTP 适配层的结果；后续令牌仅写 Cookie，不能直接作为登录 JSON。 */
public record SessionGrant(String id, @JsonIgnore String token, @JsonIgnore String csrfSecret,
                           UserDTO user, Instant expiresAt) {

    @Override
    public String toString() {
        return "SessionGrant[id=" + id + ", userId=" + user.id() + ", expiresAt=" + expiresAt + "]";
    }
}
