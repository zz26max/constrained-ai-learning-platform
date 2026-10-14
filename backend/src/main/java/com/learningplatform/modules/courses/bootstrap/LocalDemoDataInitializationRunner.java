package com.learningplatform.modules.courses.bootstrap;

import com.learningplatform.modules.courses.seed.LocalDemoDataInitializationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** 仅显式 local-demo-data profile 激活；完成后退出，普通 api 启动不插入演示数据。 */
@Component
@Profile("local-demo-data")
public class LocalDemoDataInitializationRunner implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(LocalDemoDataInitializationRunner.class);
    private final LocalDemoDataInitializationService service;
    private final ConfigurableApplicationContext context;

    public LocalDemoDataInitializationRunner(LocalDemoDataInitializationService service,
                                            ConfigurableApplicationContext context) {
        this.service = service;
        this.context = context;
    }

    @Override
    public void run(ApplicationArguments args) {
        var result = service.initialize();
        log.info("本地演示数据初始化完成：学期新增 {}、跳过 {}；基础课程新增 {}、跳过 {}",
                result.termsCreated(), result.termsSkipped(), result.coursesCreated(), result.coursesSkipped());
        context.close();
    }
}
