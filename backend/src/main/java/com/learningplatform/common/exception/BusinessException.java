package com.learningplatform.common.exception;

import java.util.Map;
import java.util.Objects;

import org.springframework.http.HttpStatus;

/**
 * 表示业务规则明确拒绝了当前操作，例如工作区版本冲突。
 *
 * <p>业务层负责判断规则并抛出异常，统一处理器负责转换成 HTTP 响应。
 * message 和 details 会公开给前端，必须由业务代码明确提供安全文案；
 * 不能把捕获到的数据库异常消息直接放进来。</p>
 */
public class BusinessException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final Map<String, Object> details;

    public BusinessException(HttpStatus status, String code, String message) {
        this(status, code, message, Map.of());
    }

    public BusinessException(HttpStatus status, String code, String message,
                             Map<String, Object> details) {
        super(Objects.requireNonNull(message));
        this.status = Objects.requireNonNull(status);
        if (!status.isError()) {
            throw new IllegalArgumentException("业务异常必须使用 4xx 或 5xx 状态码");
        }
        this.code = Objects.requireNonNull(code);
        this.details = Map.copyOf(details);
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }

    public Map<String, Object> getDetails() {
        return details;
    }
}
