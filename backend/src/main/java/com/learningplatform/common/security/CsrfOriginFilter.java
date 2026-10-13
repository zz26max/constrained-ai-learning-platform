package com.learningplatform.common.security;

import java.io.IOException;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import com.learningplatform.common.api.ApiErrorResponse;
import com.learningplatform.common.web.RequestIdFilter;
import com.learningplatform.modules.auth.config.AuthHttpProperties;
import com.learningplatform.modules.auth.model.SessionIdentity;
import com.learningplatform.modules.auth.security.CsrfTokenService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import tools.jackson.databind.json.JsonMapper;

/**
 * 对所有业务写请求（POST/PUT/PATCH/DELETE）校验浏览器 Origin 与 X-CSRF-Token。
 * 已登录请求使用会话绑定令牌；匿名请求（如登录）使用预登录签名 Cookie 双提交。
 * 拒绝时直接写统一 403 CSRF_INVALID 信封，业务写入与幂等记录创建前就阻断。
 */
public class CsrfOriginFilter extends OncePerRequestFilter {

    private static final Set<String> MUTATING = Set.of("POST", "PUT", "PATCH", "DELETE");
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final AuthHttpProperties properties;
    private final CsrfTokenService csrfTokens;

    public CsrfOriginFilter(AuthHttpProperties properties, CsrfTokenService csrfTokens) {
        this.properties = properties;
        this.csrfTokens = csrfTokens;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if (!RequestIdFilter.isBusinessRequest(request)) {
            return true;
        }
        return !MUTATING.contains(request.getMethod().toUpperCase(Locale.ROOT));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String origin = request.getHeader("Origin");
        String presented = request.getHeader("X-CSRF-Token");
        if (origin == null || !properties.allowedOrigins().contains(origin)) {
            reject(request, response);
            return;
        }
        if (presented == null || presented.isEmpty() || presented.length() > 512) {
            reject(request, response);
            return;
        }
        SessionIdentity identity = (SessionIdentity) request.getAttribute(SessionCookieAuthFilter.ATTR_IDENTITY);
        if (identity != null) {
            if (!csrfTokens.verifySessionToken(identity.id(), identity.csrfSecret(), presented)) {
                reject(request, response);
                return;
            }
        } else {
            String preAuth = AuthCookies.read(request, AuthCookies.PRE_AUTH);
            if (!csrfTokens.verifyPreAuth(preAuth, presented)) {
                reject(request, response);
                return;
            }
        }
        filterChain.doFilter(request, response);
    }

    private void reject(HttpServletRequest request, HttpServletResponse response) throws IOException {
        if (response.isCommitted()) {
            return;
        }
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType("application/json;charset=UTF-8");
        response.setHeader("Cache-Control", "no-store");
        ApiErrorResponse body = ApiErrorResponse.of("CSRF_INVALID", "CSRF 或 Origin 校验失败",
                Map.of(), RequestIdFilter.getRequestId(request));
        response.getWriter().write(JSON.writeValueAsString(body));
    }
}
