package com.learningplatform.common.api;

import java.util.Map;

/**
 * 业务接口的失败响应，与成功响应分开建模，避免同时出现 data 和 error。
 *
 * <p>这里只有允许向调用者公开的信息，不保存 Java 异常、堆栈或数据库连接信息。</p>
 */
public record ApiErrorResponse(ApiError error, String requestId) {

    /** 统一构造错误信封；没有附加信息时，details 返回空对象 {}。 */
    public static ApiErrorResponse of(String code, String message,
                                      Map<String, Object> details, String requestId) {
        return new ApiErrorResponse(new ApiError(code, message, details), requestId);
    }

    /**
     * code 供前端判断错误类别，message 供用户阅读，details 保存明确约定的附加信息。
     * Map.copyOf 复制外层映射，防止调用者在创建响应后修改它；不代表内部对象深度不可变。
     */
    public record ApiError(String code, String message, Map<String, Object> details) {
        public ApiError {
            details = Map.copyOf(details);
        }
    }
}
