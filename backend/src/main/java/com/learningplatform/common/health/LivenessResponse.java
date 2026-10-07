package com.learningplatform.common.health;

/**
 * 存活检查的响应 DTO，仅包含接口契约要求的状态字段。
 *
 * <p>record 用来表达不可变的数据对象，Java 会自动生成构造器和字段访问方法。
 * Spring MVC 的 JSON 转换器会将它转换为 {@code {"status":"ok"}}。
 * 健康接口不返回数据库地址、版本、账号或密钥，也不使用业务接口的 data 信封。</p>
 *
 * @param status 后端进程的响应状态
 */
public record LivenessResponse(String status) {
}
