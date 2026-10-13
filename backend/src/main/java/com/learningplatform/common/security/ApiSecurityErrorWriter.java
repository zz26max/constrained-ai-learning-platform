package com.learningplatform.common.security;

import java.io.IOException;
import java.util.Map;

import com.learningplatform.common.api.ApiErrorResponse;
import com.learningplatform.common.web.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;

import tools.jackson.databind.json.JsonMapper;

/** 过滤链拒绝响应统一走业务错误信封，避免默认 HTML 登录跳转或两套格式。 */
public class ApiSecurityErrorWriter implements AuthenticationEntryPoint, AccessDeniedHandler {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
                         AuthenticationException authException) throws IOException {
        write(request, response, HttpServletResponse.SC_UNAUTHORIZED, "UNAUTHENTICATED", "登录状态已失效，请重新登录");
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
                       AccessDeniedException accessDeniedException) throws IOException {
        write(request, response, HttpServletResponse.SC_FORBIDDEN, "FORBIDDEN", "权限不足");
    }

    private void write(HttpServletRequest request, HttpServletResponse response,
                       int status, String code, String message) throws IOException {
        if (response.isCommitted()) {
            return;
        }
        response.setStatus(status);
        response.setContentType("application/json;charset=UTF-8");
        response.setHeader("Cache-Control", "no-store");
        ApiErrorResponse body = ApiErrorResponse.of(code, message, Map.of(),
                RequestIdFilter.getRequestId(request));
        response.getWriter().write(JSON.writeValueAsString(body));
    }
}
