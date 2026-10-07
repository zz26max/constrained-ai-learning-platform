package com.learningplatform.common.api;

/**
 * 业务接口的成功响应：具体业务数据放在 data，本次请求的标识放在 requestId。
 *
 * <p>T 是泛型，可以替换为用户 DTO、课程列表等不同类型，避免每个接口重复定义外层结构。
 * Controller 显式创建这个对象；健康检查继续使用自己的 status 响应。</p>
 *
 * <p>record 自动生成这个构造器及 data()、requestId() 访问方法。
 * 创建 Java 对象与发送 HTTP 响应是两个动作；转换成 JSON 由 Spring 的消息转换器完成。</p>
 *
 * @param data 业务数据；允许为 null，表示操作没有额外返回数据
 * @param requestId 与 X-Request-ID 响应头一致的请求标识
 */
public record ApiResponse<T>(T data, String requestId) {
}
