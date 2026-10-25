package com.learningplatform.modules.helprequests;
import java.time.Instant;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
@Mapper
public interface HelpMapper {
 HelpRows.Request find(String id);
 HelpRows.Request lock(String id);
 List<HelpRows.Request> list(@Param("studentId") String studentId,@Param("offeringId") String offeringId,@Param("status") String status,@Param("offset") long offset,@Param("size") int size);
 long count(@Param("studentId") String studentId,@Param("offeringId") String offeringId,@Param("status") String status);
 int insert(HelpRows.Request row);
 int status(@Param("id") String id,@Param("status") String status,@Param("now") Instant now);
 int reply(HelpRows.Reply row);
 List<HelpRows.Reply> replies(String id);
 int purge(Instant now);
}
