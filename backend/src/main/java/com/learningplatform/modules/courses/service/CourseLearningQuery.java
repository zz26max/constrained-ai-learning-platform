package com.learningplatform.modules.courses.service;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import com.learningplatform.modules.courses.dto.CourseDTOs.CurrentChapter;
import com.learningplatform.modules.courses.dto.CourseDTOs.ProgressDTO;
import com.learningplatform.modules.courses.mapper.CourseMapper;
import org.springframework.stereotype.Service;
/** 只读派生，不因 GET 改写学习位置。 */
@Service
public class CourseLearningQuery {
    private final CourseMapper mapper;
    public CourseLearningQuery(CourseMapper mapper) { this.mapper=mapper; }
    public ProgressDTO progress(String offeringId,String memberId,String unit,Instant now) {
        // P1-B/C 接入有效提交后，在这里补作业进度查询；当前没有作业实体，不构造假统计。
        int total="chapter".equals(unit)?mapper.chapterTotal(offeringId):0;
        int completed="chapter".equals(unit)?mapper.chapterCompleted(offeringId,memberId):0;
        int percent=total==0?0:BigDecimal.valueOf(completed).multiply(BigDecimal.valueOf(100))
                .divide(BigDecimal.valueOf(total),0,RoundingMode.HALF_UP).intValueExact();
        return new ProgressDTO(unit,completed,total,percent,total==0,now);
    }
    public CurrentChapter currentChapter(String offeringId,String memberId,String lastChapterId) {
        return mapper.currentChapter(offeringId,memberId,lastChapterId);
    }
}

