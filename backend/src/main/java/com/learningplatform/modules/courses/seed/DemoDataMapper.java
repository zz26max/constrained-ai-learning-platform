package com.learningplatform.modules.courses.seed;

import java.time.Instant;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** 仅受控初始化使用的写入口；正常 API 不调用这些方法。 */
@Mapper
public interface DemoDataMapper {
    boolean termExists(@Param("id") String id);
    boolean currentTermExists();
    boolean courseExists(@Param("code") String code);
    int insertTerm(@Param("term") TermSeed term);
    int insertCourse(@Param("course") CourseSeed course);

    record TermSeed(String id, String label, Instant startsAt, Instant endsAt,
                    boolean current, Instant now) { }
    record CourseSeed(String id, String code, String mark, String title,
                      String description, Instant now) { }
}
