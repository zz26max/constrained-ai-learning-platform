package com.learningplatform.modules.auth.config;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** 登录失败限流：按“规范化用户名 + 客户端 IP”计数，成功登录清除计数。 */
@ConfigurationProperties("auth.login-rate-limit")
public record LoginRateLimitProperties(Duration window, int maxFailures) {

    public LoginRateLimitProperties {
        if (window == null || window.isNegative() || window.isZero()) {
            throw new IllegalArgumentException("登录限流窗口必须为正数");
        }
        if (maxFailures < 1) {
            throw new IllegalArgumentException("登录限流上限必须至少为 1");
        }
    }
}
