package com.learningplatform.modules.auth.dto;

/** 注册成功响应：用户身份 + 会话绑定的新 CSRF 令牌（与 LoginDTO 结构一致）。 */
public record RegisterDTO(UserDTO user, String csrfToken) {
}
