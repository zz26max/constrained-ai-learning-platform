package com.learningplatform.modules.auth.config;

import java.time.Duration;
import java.util.List;
import java.util.regex.Pattern;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** 认证 HTTP 层的 Cookie、预登录签名与 Origin 配置。 */
@ConfigurationProperties("auth.http")
public record AuthHttpProperties(Duration preLoginMaxAge, String preLoginSigningKey,
                                 List<String> allowedOrigins, boolean cookieSecure) {

    private static final Pattern ORIGIN = Pattern.compile("^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$");

    public AuthHttpProperties {
        if (preLoginMaxAge == null || preLoginMaxAge.isNegative() || preLoginMaxAge.isZero()) {
            throw new IllegalArgumentException("预登录 Cookie 有效期必须为正数");
        }
        if (preLoginSigningKey == null) {
            preLoginSigningKey = "";
        }
        if (allowedOrigins == null || allowedOrigins.isEmpty()) {
            throw new IllegalArgumentException("必须配置至少一个允许的浏览器 Origin");
        }
        allowedOrigins = List.copyOf(allowedOrigins);
        for (String origin : allowedOrigins) {
            if (!ORIGIN.matcher(origin).matches()) {
                throw new IllegalArgumentException("允许的 Origin 必须是 http(s) 来源，且不含路径：" + origin);
            }
        }
    }
}
