package com.learningplatform.common.exception;

import java.util.List;
import java.util.Map;

import com.learningplatform.common.api.ApiErrorResponse;
import com.learningplatform.common.web.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.TypeMismatchException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * 统一处理 Spring MVC 业务请求中的异常，Controller 不必重复写 try/catch 拼装错误 JSON。
 *
 * <p>父类已经识别 JSON 解析、参数校验、404、405 等框架异常，子类集中调整状态和响应体。
 * 必须按请求路径判断，才能覆盖“没有任何业务 Controller 匹配”的 404。
 * Spring Security 过滤链的拒绝响应不经过这里，随认证功能单独接入同一个错误 DTO。</p>
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /** 明确的业务拒绝保留业务层提供的公开错误码、文案、详情和状态码。 */
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<Object> handleBusinessException(BusinessException exception,
                                                          HttpServletRequest request) {
        if (!RequestIdFilter.isBusinessRequest(request)) {
            throw exception;
        }
        HttpHeaders headers = new HttpHeaders();
        if (exception.getRetryAfterSeconds() != null) {
            // 契约要求 429 与 REQUEST_IN_PROGRESS 必须返回重试等待秒数。
            headers.set("Retry-After", String.valueOf(exception.getRetryAfterSeconds()));
        }
        return errorResponse(exception.getStatus(), headers, exception.getCode(),
                exception.getMessage(), exception.getDetails(), request);
    }

    /** 未预期异常统一返回 500；原始消息和堆栈只留在内部日志，不进入响应。 */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Object> handleUnexpectedException(Exception exception,
                                                            HttpServletRequest request) throws Exception {
        if (!RequestIdFilter.isBusinessRequest(request)) {
            // 主动退出处理，让健康接口等非业务路径继续走 Spring 原本的异常处理流程。
            throw exception;
        }
        logUnexpectedException(exception, request);
        return errorResponse(HttpStatus.INTERNAL_SERVER_ERROR, new HttpHeaders(), "INTERNAL_ERROR",
                "服务暂时出现问题，请稍后重试。", Map.of(), request);
    }

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception exception, Object body,
                                                              HttpHeaders headers, HttpStatusCode statusCode,
                                                              WebRequest webRequest) {
        ServletWebRequest servletRequest = (ServletWebRequest) webRequest;
        HttpServletRequest request = servletRequest.getRequest();
        if (!RequestIdFilter.isBusinessRequest(request)) {
            return super.handleExceptionInternal(exception, body, headers, statusCode, webRequest);
        }
        HttpServletResponse response = servletRequest.getResponse();
        if (response != null && response.isCommitted()) {
            // 已发出的响应不能重新改写，例如流式传输中断；不要再尝试发送另一份 JSON。
            return null;
        }

        Map<String, Object> details = Map.of();
        if (exception instanceof MethodArgumentNotValidException validationException) {
            statusCode = HttpStatus.UNPROCESSABLE_CONTENT;
            // 不返回 rejectedValue，也不直接使用可能包含输入内容的自定义校验消息。
            List<Map<String, String>> fields = validationException.getBindingResult().getFieldErrors()
                    .stream().map(error -> error.getField()).distinct().sorted()
                    .map(field -> Map.of("field", field, "message", "字段值不符合要求。"))
                    .toList();
            details = Map.of("fields", fields);
        } else if (exception instanceof HandlerMethodValidationException validationException) {
            // 输入校验失败属于 422；Controller 自己返回不合法数据则是服务端的 500。
            statusCode = validationException.isForReturnValue()
                    ? HttpStatus.INTERNAL_SERVER_ERROR : HttpStatus.UNPROCESSABLE_CONTENT;
        } else if (exception instanceof TypeMismatchException
                || exception instanceof MissingServletRequestParameterException) {
            statusCode = HttpStatus.UNPROCESSABLE_CONTENT;
        }

        ErrorDescription error = describe(statusCode);
        if (statusCode.is5xxServerError()) {
            logUnexpectedException(exception, request);
        }
        return errorResponse(statusCode, headers, error.code(), error.message(), details, request);
    }

    private ResponseEntity<Object> errorResponse(HttpStatusCode statusCode, HttpHeaders originalHeaders,
                                                 String code, String message, Map<String, Object> details,
                                                 HttpServletRequest request) {
        HttpHeaders headers = new HttpHeaders();
        // 保留框架产生的 Allow 等响应头，405 等错误依然符合 HTTP 协议。
        headers.putAll(originalHeaders);
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setCacheControl(CacheControl.noStore());
        ApiErrorResponse body = ApiErrorResponse.of(code, message, details,
                RequestIdFilter.getRequestId(request));
        return new ResponseEntity<>(body, headers, statusCode);
    }

    private void logUnexpectedException(Exception exception, HttpServletRequest request) {
        // 不额外记录请求正文、Cookie 或环境变量；用请求标识把前端错误与内部堆栈对应起来。
        LOGGER.error("业务请求处理失败，requestId={}", RequestIdFilter.getRequestId(request), exception);
    }

    private ErrorDescription describe(HttpStatusCode statusCode) {
        return switch (statusCode.value()) {
            case 404 -> new ErrorDescription("NOT_FOUND", "请求的资源不存在。");
            case 405 -> new ErrorDescription("METHOD_NOT_ALLOWED", "该接口不支持此请求方法。");
            case 406 -> new ErrorDescription("NOT_ACCEPTABLE", "该接口无法提供所请求的响应格式。");
            case 415 -> new ErrorDescription("UNSUPPORTED_MEDIA_TYPE", "请求正文的格式不受支持。");
            case 422 -> new ErrorDescription("VALIDATION_ERROR", "请求参数不符合要求。");
            case 503 -> new ErrorDescription("SERVICE_UNAVAILABLE", "服务暂时不可用，请稍后重试。");
            default -> statusCode.is5xxServerError()
                    ? new ErrorDescription("INTERNAL_ERROR", "服务暂时出现问题，请稍后重试。")
                    : new ErrorDescription("INVALID_REQUEST", "请求格式不正确，请检查后重试。");
        };
    }

    /** 只在处理器内部使用的错误码和通用文案，不是新的对外 DTO。 */
    private record ErrorDescription(String code, String message) {
    }
}
