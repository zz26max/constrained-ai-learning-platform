package com.learningplatform;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 学习平台后端的启动入口。
 *
 * <p>{@code @SpringBootApplication} 启用自动配置，并扫描当前包及其子包中的组件。
 * 因此 Controller、Service 等类放在 {@code com.learningplatform} 下，就可以被发现。
 * 启动入口只负责启动应用，后续业务规则放到对应模块中。</p>
 */
@SpringBootApplication
public class LearningPlatformApplication {

    public static void main(String[] args) {
        // 创建 Spring 容器并启动内嵌 Web 服务器，应用开始监听配置中的 HTTP 端口。
        SpringApplication.run(LearningPlatformApplication.class, args);
    }
}
