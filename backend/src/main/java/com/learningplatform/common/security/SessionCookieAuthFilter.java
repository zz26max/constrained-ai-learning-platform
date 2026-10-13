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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 读取 lp_session Cookie 并识别当前身份，把结果放入 SecurityContext 供后续授权与 Controller 使用。
 * 无效或过期令牌保持未认证，受保护路径返回 401；会话查询故障由统一写出器返回 500。
 */
public class SessionCookieAuthFilter extends OncePerRequestFilter {

    private static final Logger LOGGER = LoggerFactory.getLogger(SessionCookieAuthFilter.class);

    public static final String ATTR_IDENTITY = SessionCookieAuthFilter.class.getName() + ".identity";
    public static final String ATTR_TOKEN = SessionCookieAuthFilter.class.getName() + ".token";

    private final DatabaseSessionService sessions;
    private final ApiSecurityErrorWriter errors;

    public SessionCookieAuthFilter(DatabaseSessionService sessions, ApiSecurityErrorWriter errors) {
        this.sessions = sessions;
        this.errors = errors;
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
            } catch (RuntimeException exception) {
                SecurityContextHolder.clearContext();
                request.removeAttribute(ATTR_IDENTITY);
                request.removeAttribute(ATTR_TOKEN);
                // 数据库异常消息可能含 SQL/参数；只记录请求标识及异常类型，不输出凭证或消息。
                LOGGER.error("会话查询失败，requestId={}，exceptionType={}",
                        RequestIdFilter.getRequestId(request), exception.getClass().getName());
                errors.writeServerFailure(request, response);
                return;
            }
        }
        filterChain.doFilter(request, response);
    }
}
