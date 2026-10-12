package com.learningplatform.common.config;

import java.util.Map;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.DelegatingPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/** 初始化账户和后续登录共用一套密码算法，避免两处配置不一致。 */
@Configuration(proxyBeanMethods = false)
public class PasswordConfiguration {

    @Bean
    public PasswordEncoder passwordEncoder() {
        // Argon2id：16 字节随机盐、32 字节输出、1 路并行、19 MiB 内存、2 轮计算。
        // 参数采用 OWASP 的最低推荐基线；部署时根据机器负载评估并逐步调整。
        Argon2PasswordEncoder argon2 = new Argon2PasswordEncoder(16, 32, 1, 19456, 2);
        // {argon2} 前缀标明算法；盐和计算参数也包含在哈希内，校验时无需另存盐字段。
        return new DelegatingPasswordEncoder("argon2", Map.of("argon2", argon2));
    }
}
