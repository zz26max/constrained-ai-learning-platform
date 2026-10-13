package com.learningplatform.modules.auth.dto;

/** 登录成功响应：用户身份 + 会话绑定的新 CSRF 令牌。 */
public record LoginDTO(UserDTO user, String csrfToken) {
}
