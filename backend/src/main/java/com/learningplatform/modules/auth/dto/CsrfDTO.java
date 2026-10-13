package com.learningplatform.modules.auth.dto;

/** 匿名或登录用户获取的 CSRF 令牌。 */
public record CsrfDTO(String csrfToken) {
}
