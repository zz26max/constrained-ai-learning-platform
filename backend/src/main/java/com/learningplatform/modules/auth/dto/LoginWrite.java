package com.learningplatform.modules.auth.dto;

import jakarta.validation.constraints.NotBlank;

/** 登录请求；长度与格式的最终判定由 LoginCredentialService 按码点执行，这里只保证非空。 */
public record LoginWrite(
        @NotBlank String username,
        @NotBlank String password) {
}
