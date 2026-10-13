package com.learningplatform.common.security;

import com.learningplatform.modules.auth.config.AuthHttpProperties;
import com.learningplatform.modules.auth.security.CsrfTokenService;
import com.learningplatform.modules.auth.service.DatabaseSessionService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;

/**
 * /api/v1 的认证链：Cookie 会话识别 → CSRF/Origin 校验 → 授权。
 * 过滤器在链内直接实例化，避免被 Spring Boot 当作独立 Filter Bean 再注册进 servlet 链而重复执行。
 */
@Configuration
@EnableWebSecurity
public class SecurityConfiguration {

    @Bean
    public SecurityFilterChain apiFilterChain(HttpSecurity http,
                                              DatabaseSessionService sessions,
                                              CsrfTokenService csrfTokens,
                                              AuthHttpProperties properties) throws Exception {
        ApiSecurityErrorWriter errors = new ApiSecurityErrorWriter();
        SessionCookieAuthFilter sessionAuth = new SessionCookieAuthFilter(sessions, errors);
        CsrfOriginFilter csrfOrigin = new CsrfOriginFilter(properties, csrfTokens);

        http.securityMatcher("/api/v1/**")
                .csrf(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(exceptions ->
                        exceptions.authenticationEntryPoint(errors).accessDeniedHandler(errors))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers("/api/v1/auth/csrf-token", "/api/v1/auth/login").permitAll()
                        .anyRequest().authenticated())
                .addFilterBefore(sessionAuth, AuthorizationFilter.class)
                .addFilterBefore(csrfOrigin, AuthorizationFilter.class);
        return http.build();
    }
}
