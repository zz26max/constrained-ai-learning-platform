package com.learningplatform.modules.analytics.mapper;

import java.time.Instant;
import java.util.Map;
import org.apache.ibatis.annotations.*;

@Mapper
public interface LearningEventMapper {
    @Select("SELECT payload FROM learning_events WHERE user_id=#{userId} AND client_event_id=#{eventId}")
    String clientPayload(String userId,String eventId);
    @Insert("INSERT INTO learning_events(id,user_id,offering_id,assignment_id,chapter_id,client_event_id,source_event_key,session_id,type,source,occurred_at,received_at,payload) VALUES(#{id},#{userId},#{offeringId},#{assignmentId},#{chapterId},#{eventId},#{sourceKey},#{sessionId},#{type},#{source},#{occurredAt},#{receivedAt},#{payload})")
    void insert(Map<String,Object> event);
    @Select("SELECT COUNT(*) FROM learning_events WHERE source_event_key=#{key}")
    int sourceExists(String key);
    @Select("SELECT issue_tags_config FROM course_offerings WHERE id=#{offeringId}")
    String tags(String offeringId);
}
