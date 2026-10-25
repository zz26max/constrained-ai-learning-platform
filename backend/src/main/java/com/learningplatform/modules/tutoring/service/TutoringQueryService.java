package com.learningplatform.modules.tutoring.service;
import static com.learningplatform.modules.tutoring.mapper.TutoringSql.*;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import com.learningplatform.modules.tutoring.mapper.TutoringMapper;
import com.learningplatform.modules.courses.service.AssignmentInput;
import static com.learningplatform.modules.tutoring.service.TutoringJson.map;
@Service
public class TutoringQueryService {
 private final TutoringMapper db;private final TutoringJson json;private final Clock clock;
 public TutoringQueryService(TutoringMapper db,TutoringJson json,Clock clock){this.db=db;this.json=json;this.clock=clock;}
 public Integer policyVersion(String policyId){if(policyId==null)return null;var p=db.one(FIND_POLICY_VERSION,policyId);return p==null?null:((Number)p.get("version")).intValue();}
 public Integer currentPolicyVersion(String assignmentId){var p=db.one(FIND_CURRENT_POLICY_VERSION,assignmentId);return p==null?null:((Number)p.get("version")).intValue();}
 public List<Map<String,Object>> sharedRequests(String studentId,String assignmentId,List<String> ids,boolean requireAvailable){
  var results=new ArrayList<Map<String,Object>>();
  for(String id:ids){AssignmentInput.uuid(id);var r=db.one(FIND_OWNED_DELIVERED_REQUEST,id,studentId,assignmentId);
   if(r==null)throw AssignmentInput.invalid();var expiry=TutoringMapper.instant(r.get("content_expires_at"));boolean expired=!expiry.isAfter(clock.instant())||r.get("content_purged_at")!=null;
   if(requireAvailable&&expired)throw AssignmentInput.invalid();var value=json.read(r.get("result"));
   results.add(map("requestId",id,"content",expired?null:value.get("content"),"expiresAt",expiry,"contentUnavailableReason",expired?"retention_expired":null));
  }return results;
 }
}
