package com.learningplatform.common.security;

import java.io.IOException;
import java.util.List;
import java.util.Locale;

import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.common.web.RequestIdFilter;
import com.learningplatform.modules.auth.model.SessionIdentity;
import com.learningplatform.modules.auth.service.DatabaseSessionService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 读取 lp_session Cookie 并识别当前身份，把结果放入 SecurityContext 供后续授权与 Controller 使用。
 * 无效或过期令牌保持未认证，受保护路径由 AuthenticationEntryPoint 返回 401；不在此处直接写响应。
 */
public class SessionCookieAuthFilter extends OncePerRequestFilter {

    public static final String ATTR_IDENTITY = SessionCookieAuthFilter.class.getName() + ".identity";
    public static final String ATTR_TOKEN = SessionCookieAuthFilter.class.getName() + ".token";

    private final DatabaseSessionService sessions;

    public SessionCookieAuthFilter(DatabaseSessionService sessions) {
        this.sessions = sessions;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !RequestIdFilter.isBusinessRequest(request);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String token = AuthCookies.read(request, AuthCookies.SESSION);
        if (token != null) {
            try {
                SessionIdentity identity = sessions.resolve(token);
                request.setAttribute(ATTR_IDENTITY, identity);
                request.setAttribute(ATTR_TOKEN, token);
                List<SimpleGrantedAuthority> authorities = identity.user().roles().stream()
                        .map(role -> new SimpleGrantedAuthority("ROLE_" + role.toUpperCase(Locale.ROOT)))
                        .toList();
                UsernamePasswordAuthenticationToken authentication =
                        new UsernamePasswordAuthenticationToken(identity, token, authorities);
                SecurityContext context = SecurityContextHolder.createEmptyContext();
                context.setAuthentication(authentication);
                SecurityContextHolder.setContext(context);
            } catch (BusinessException exception) {
                // 会话无效：保持匿名，授权阶段再决定是否拒绝；不把内部错误当成认证成功。
            }
        }
        filterChain.doFilter(request, response);
    }
}
