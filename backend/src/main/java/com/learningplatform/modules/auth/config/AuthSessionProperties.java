package com.learningplatform.modules.auth.config;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** 会话的两个期限统一配置：空闲期限可以续期，绝对期限不能续期。 */
@ConfigurationProperties("auth.session")
public record AuthSessionProperties(Duration idleTimeout, Duration absoluteTimeout) {

    public AuthSessionProperties {
        if (idleTimeout == null || absoluteTimeout == null || idleTimeout.isNegative() || idleTimeout.isZero()
                || absoluteTimeout.isNegative() || absoluteTimeout.isZero()
                || idleTimeout.compareTo(absoluteTimeout) > 0
                || idleTimeout.getNano() % 1000 != 0 || absoluteTimeout.getNano() % 1000 != 0) {
            throw new IllegalArgumentException("会话期限须为正数、精确到微秒，且空闲期限不能超过绝对期限");
        }
    }
}
