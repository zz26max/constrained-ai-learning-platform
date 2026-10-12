package com.learningplatform.modules.auth.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/** 认证 HTTP 层配置入口；只注册配置属性，不在这里承载业务逻辑。 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties({AuthHttpProperties.class, LoginRateLimitProperties.class})
public class AuthHttpConfiguration {
}
