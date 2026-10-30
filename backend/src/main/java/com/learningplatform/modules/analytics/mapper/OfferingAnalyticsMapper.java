package com.learningplatform.modules.analytics.mapper;

import java.time.Instant;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OfferingAnalyticsMapper {
    record MasteryEvidence(String studentId, String knowledgePointId, String assignmentId, String result,
            Instant occurredAt, String id) {}
    record InProgressRow(String studentId, String knowledgePointId) {}
    record ActivityEvent(String userId, String type, Instant receivedAt) {}

    List<String> activeStudentIds(@Param("offeringId") String offeringId);

    List<MasteryEvidence> currentEvidence(@Param("offeringId") String offeringId);

    List<InProgressRow> inProgress(@Param("offeringId") String offeringId);

    List<ActivityEvent> activityEvents(@Param("offeringId") String offeringId, @Param("from") Instant from,
            @Param("to") Instant to);
}
