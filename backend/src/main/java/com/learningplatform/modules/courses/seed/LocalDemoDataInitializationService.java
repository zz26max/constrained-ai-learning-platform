package com.learningplatform.modules.courses.seed;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/** 虚构课程配置一次性导入；不创建班级，不覆盖原有学期或课程。 */
@Service
public class LocalDemoDataInitializationService {
    public static final String HISTORICAL_TERM_ID = "ad000001-0000-4000-8000-000000000001";
    public static final String CURRENT_TERM_ID = "ad000001-0000-4000-8000-000000000002";
    private final DemoDataMapper mapper;
    private final Clock clock;

    public LocalDemoDataInitializationService(DemoDataMapper mapper, Clock clock) {
        this.mapper = mapper;
        this.clock = clock;
    }

    /** 所有新数据同一事务：中途失败整体回滚；已有数据不改标题、状态或时刻。 */
    @Transactional(isolation = Isolation.READ_COMMITTED, rollbackFor = Exception.class)
    public Result initialize() {
        Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
        int termsCreated = 0;
        int coursesCreated = 0;
        // 日期只在本地演示导入时生成；运行时当前学期始终读取数据库 is_current。
        if (!mapper.termExists(HISTORICAL_TERM_ID)) {
            termsCreated += mapper.insertTerm(new DemoDataMapper.TermSeed(HISTORICAL_TERM_ID,
                    "虚构演示 · 历史学期", now.minus(365, ChronoUnit.DAYS),
                    now.minus(185, ChronoUnit.DAYS), false, now));
        }
        if (!mapper.termExists(CURRENT_TERM_ID)) {
            // 已有真实当前学期时保留它，不为了演示重置业务配置。
            termsCreated += mapper.insertTerm(new DemoDataMapper.TermSeed(CURRENT_TERM_ID,
                    "虚构演示 · 当前学期", now.minus(30, ChronoUnit.DAYS),
                    now.plus(150, ChronoUnit.DAYS), !mapper.currentTermExists(), now));
        }
        for (DemoDataMapper.CourseSeed course : List.of(
                new DemoDataMapper.CourseSeed("ad000002-0000-4000-8000-000000000001",
                        "DEMO-WEB", "WEB", "虚构演示 · Web 开发基础", "仅用于本地演示的虚构课程。", now),
                new DemoDataMapper.CourseSeed("ad000002-0000-4000-8000-000000000002",
                        "DEMO-DATABASE", "DB", "虚构演示 · 数据库设计基础", "仅用于本地演示的虚构课程。", now))) {
            if (!mapper.courseExists(course.code())) {
                coursesCreated += mapper.insertCourse(course);
            }
        }
        return new Result(termsCreated, 2 - termsCreated, coursesCreated, 2 - coursesCreated);
    }

    public record Result(int termsCreated, int termsSkipped, int coursesCreated, int coursesSkipped) { }
}
