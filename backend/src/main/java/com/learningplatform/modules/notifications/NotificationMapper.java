package com.learningplatform.modules.notifications;
import java.time.Instant;
import org.apache.ibatis.annotations.*;
@Mapper
public interface NotificationMapper {
 @Insert("INSERT INTO notifications(id,recipient_id,type,title,content,related_offering_id,related_assignment_id,target_type,target_id,related_help_reply_id,source_event_key,created_at) VALUES(#{id},#{recipient},'help_reply','教师回复了你的求助',#{content},#{offering},#{assignment},'help_request',#{help},#{reply},CONCAT('help_reply:',#{reply}),#{now,typeHandler=com.learningplatform.common.mybatis.UtcInstantTypeHandler})")
 void helpReply(@Param("id") String id,@Param("recipient") String recipient,@Param("offering") String offering,@Param("assignment") String assignment,@Param("help") String help,@Param("reply") String reply,@Param("content") String content,@Param("now") Instant now);
}
