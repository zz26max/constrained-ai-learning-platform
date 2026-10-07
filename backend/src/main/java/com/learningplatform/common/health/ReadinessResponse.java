package com.learningplatform.common.health;

/**
 * 数据库就绪检查响应，字段结构与接口契约一致。
 *
 * @param status 可用为 ready，不可用为 unavailable
 */
public record ReadinessResponse(String status) {
}
