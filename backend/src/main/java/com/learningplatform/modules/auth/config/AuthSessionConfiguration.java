package com.learningplatform.modules.auth.config;

import java.time.Clock;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(AuthSessionProperties.class)
public class AuthSessionConfiguration {

    /** 注入时钟而不是把当前时间写死，测试可以直接推进时间验证过期，无需等待。 */
    @Bean
    public Clock sessionClock() {
        return Clock.systemUTC();
    }
}
