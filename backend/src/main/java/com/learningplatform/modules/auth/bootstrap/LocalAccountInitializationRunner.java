package com.learningplatform.modules.auth.bootstrap;

import com.learningplatform.modules.auth.service.LocalAccountInitializationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** 一次性命令入口；普通 api 启动不会注册这个 Runner，也不会创建账户。 */
@Component
@Profile("local-accounts")
public class LocalAccountInitializationRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(LocalAccountInitializationRunner.class);

    private final LocalAccountInitializationService service;
    private final ConfigurableApplicationContext context;
    private final String studentPassword;
    private final String teacherPassword;
    private final String adminPassword;

    public LocalAccountInitializationRunner(LocalAccountInitializationService service,
                                            ConfigurableApplicationContext context,
                                            @Value("${local.accounts.student-password:}") String studentPassword,
                                            @Value("${local.accounts.teacher-password:}") String teacherPassword,
                                            @Value("${local.accounts.admin-password:}") String adminPassword) {
        this.service = service;
        this.context = context;
        this.studentPassword = studentPassword;
        this.teacherPassword = teacherPassword;
        this.adminPassword = adminPassword;
    }

    @Override
    public void run(ApplicationArguments args) {
        LocalAccountInitializationService.Result result =
                service.initialize(studentPassword, teacherPassword, adminPassword);
        log.info("本地演示账户初始化完成：新增 {}，跳过 {}", result.created(), result.skipped());
        // 本命令不提供 HTTP 服务，完成后关闭连接池并退出；失败时由 Boot 关闭上下文。
        context.close();
    }
}
