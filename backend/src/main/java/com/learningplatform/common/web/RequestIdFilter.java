package com.learningplatform.common.web;

import java.io.IOException;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 在业务请求进入 Controller 之前准备请求标识，供成功响应、异常响应和日志共用。
 *
 * <p>Filter 位于 Spring MVC 外层；优先执行也方便后续认证过滤器复用该标识。
 * 当前只处理 /api/v1，不改变运维健康接口的响应格式。</p>
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {

    public static final String HEADER_NAME = "X-Request-ID";
    public static final String ATTRIBUTE_NAME = RequestIdFilter.class.getName() + ".requestId";

    private static final String MDC_KEY = "requestId";
    private static final Pattern VALID_REQUEST_ID =
            Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,63}");

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !isBusinessRequest(request);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        List<String> suppliedIds = Collections.list(request.getHeaders(HEADER_NAME));
        String requestId = suppliedIds.size() == 1
                && VALID_REQUEST_ID.matcher(suppliedIds.getFirst()).matches()
                ? suppliedIds.getFirst()
                : "req-" + UUID.randomUUID();

        // request 属性属于本次请求；响应头和 JSON 都读取同一个值，避免各自生成标识。
        request.setAttribute(ATTRIBUTE_NAME, requestId);
        response.setHeader(HEADER_NAME, requestId);

        // MDC 是日志的线程上下文。服务器线程会复用，结束时必须恢复，避免串到下一次请求。
        String previousRequestId = MDC.get(MDC_KEY);
        MDC.put(MDC_KEY, requestId);
        try {
            // 继续调用后续过滤器，最后进入 Spring MVC 和 Controller。
            filterChain.doFilter(request, response);
        } finally {
            if (previousRequestId == null) {
                MDC.remove(MDC_KEY);
            } else {
                MDC.put(MDC_KEY, previousRequestId);
            }
        }
    }

    /** 去掉部署上下文路径后匹配业务前缀，避免把 /api/v10 等路径误认为 v1。 */
    public static boolean isBusinessRequest(HttpServletRequest request) {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        return path.equals("/api/v1") || path.startsWith("/api/v1/");
    }

    /** 后续业务 Controller 使用此方法取得 Filter 已经准备好的标识。 */
    public static String getRequestId(HttpServletRequest request) {
        Object requestId = request.getAttribute(ATTRIBUTE_NAME);
        if (requestId instanceof String value) {
            return value;
        }
        throw new IllegalStateException("业务请求尚未经过 RequestIdFilter");
    }
}
