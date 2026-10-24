package com.learningplatform.modules.helprequests;

import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.courses.mapper.AssignmentMapper;
import com.learningplatform.modules.courses.service.*;
import com.learningplatform.modules.tutoring.service.TutoringQueryService;
import com.learningplatform.modules.analytics.service.LearningEventService;
import com.learningplatform.modules.analytics.service.IssueTagService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

@Service
@Transactional(rollbackFor=Exception.class)
public class HelpService {
 private static final JsonMapper JSON=JsonMapper.builder().findAndAddModules().build();
 private final HelpMapper mapper; private final AssignmentMapper assignments; private final CourseAccess access;
 private final TutoringQueryService tutoring; private final LearningEventService events; private final Clock clock; private final IssueTagService issueTags;
 public HelpService(HelpMapper mapper,AssignmentMapper assignments,CourseAccess access,TutoringQueryService tutoring,LearningEventService events,Clock clock,IssueTagService issueTags) {this.mapper=mapper;this.assignments=assignments;this.access=access;this.tutoring=tutoring;this.events=events;this.clock=clock;this.issueTags=issueTags;}
 private Instant now(){return clock.instant().truncatedTo(ChronoUnit.MICROS);}
 public Map<String,Object> create(UserDTO user,Map<String,Object> body){
  CourseAccess.role(user,"student"); keys(body,Set.of("assignmentId","title","content","studentAttempt","workspaceRevision","sharedTutoringRequestIds","issueTags"));
  String aid=AssignmentInput.uuid(AssignmentInput.text(body,"assignmentId",36));
  var a=assignments.findAssignment(aid); if(a==null)throw CourseAccess.notFound(); access.requireStudent(user,a.offeringId(),true); writable(a.status());
  if(!"published".equals(a.status()))throw CourseAccess.notFound();
  String title=AssignmentInput.text(body,"title",200),content=AssignmentInput.text(body,"content",8000),attempt=AssignmentInput.text(body,"studentAttempt",8000);
  Integer rev=null;String snapshot=null;Instant expiry=null;Instant time=now();
  if(body.get("workspaceRevision")!=null){ rev=AssignmentInput.integer(body,"workspaceRevision"); if(rev<1)throw AssignmentInput.invalid();
   var w=assignments.findWorkspaceForUpdate(aid,user.id());
   if(w==null||w.revision()!=rev)throw new BusinessException(HttpStatus.CONFLICT,"WORKSPACE_CONFLICT","工作区版本已变化。",Map.of("currentRevision",w==null?0:w.revision()));
   snapshot=JSON.writeValueAsString(assignments.getWorkspaceFiles(w.id()).stream().map(f->Map.of("path",f.filePath(),"content",f.content())).toList()); expiry=time.plus(90,ChronoUnit.DAYS);
  }
  List<String> shared=strings(body,"sharedTutoringRequestIds",36,true),tags=strings(body,"issueTags",64,false);
  tutoring.sharedRequests(user.id(),aid,shared,true);
  Integer version=tags.isEmpty()?null:issueTags.validate(a.offeringId(),tags);
  String id=UUID.randomUUID().toString();var row=new HelpRows.Request(id,a.offeringId(),aid,user.id(),title,content,attempt,rev,snapshot,expiry,null,JSON.writeValueAsString(shared),JSON.writeValueAsString(tags),version,"open",time,time,null,null);
  mapper.insert(row);events.server(user.id(),a.offeringId(),aid,a.chapterId(),"help_request_created","help_request:"+id+":created",time);return dto(mapper.find(id),false);
 }
 @Transactional(readOnly=true)
 public Map<String,Object> list(UserDTO user,String offeringId,String status,int page,int size,boolean teacher){
  CourseAccess.role(user,teacher?"teacher":"student");AssignmentInput.page(page,size); if(status!=null&&!Set.of("open","answered","closed").contains(status))throw AssignmentInput.invalid();
  if(offeringId!=null){AssignmentInput.uuid(offeringId);if(teacher)access.requireTeacher(user,offeringId,false);else access.requireStudent(user,offeringId,false);}
  String student=teacher?null:user.id(); return Map.of("items",mapper.list(student,offeringId,status,(long)(page-1)*size,size).stream().map(r->dto(r,teacher)).toList(),"page",page,"pageSize",size,"total",mapper.count(student,offeringId,status));
 }
 @Transactional(readOnly=true)
 public Map<String,Object> detail(UserDTO user,String id,boolean teacher){var r=authorized(user,id,teacher,false,false);var result=dto(r,teacher);Instant time=now();
  Object snapshot=null;if(r.workspaceRevision()!=null){Map<String,Object> shared=new LinkedHashMap<>();boolean expired=r.sharedSnapshotPurgedAt()!=null||!time.isBefore(r.sharedSnapshotExpiresAt());shared.put("files",expired?null:JSON.readTree(r.sharedSnapshot()));shared.put("expiresAt",r.sharedSnapshotExpiresAt());shared.put("contentUnavailableReason",expired?"retention_expired":null);snapshot=shared;}
  result.put("sharedSnapshot",snapshot);result.put("sharedTutoringResults",tutoring.sharedRequests(r.studentId(),r.assignmentId(),array(r.sharedTutoringRequestIds()),false));
  result.put("replies",mapper.replies(id).stream().map(v->Map.of("id",v.id(),"content",v.content(),"teacher",Map.of("id",v.authorId(),"displayName",v.displayName()),"createdAt",v.createdAt())).toList());return result;
 }
 public Map<String,Object> reply(UserDTO user,String id,Map<String,Object> body){var r=authorized(user,id,true,true,true);keys(body,Set.of("content"));String content=AssignmentInput.text(body,"content",8000);if("closed".equals(r.status()))throw new BusinessException(HttpStatus.CONFLICT,"HELP_REQUEST_CLOSED","求助已关闭。");
  String rid=UUID.randomUUID().toString();Instant time=now();mapper.reply(new HelpRows.Reply(rid,id,user.id(),content,time,user.displayName()));mapper.status(id,"answered",time);
  String message=content.codePointCount(0,content.length())>2000?content.substring(0,content.offsetByCodePoints(0,2000)):content;
  mapper.notify(UUID.randomUUID().toString(),r.studentId(),r.offeringId(),r.assignmentId(),id,rid,message,time);
  return Map.of("id",rid,"content",content,"teacher",Map.of("id",user.id(),"displayName",user.displayName()),"createdAt",time,"status","answered");
 }
 public Map<String,Object> close(UserDTO user,String id,Map<String,Object> body){keys(body,Set.of("status"));if(!"closed".equals(body.get("status")))throw AssignmentInput.invalid();var r=authorized(user,id,true,true,true);if("closed".equals(r.status()))return Map.of("id",id,"status","closed","updatedAt",r.updatedAt());Instant time=now();mapper.status(id,"closed",time);return Map.of("id",id,"status","closed","updatedAt",time);}
 private HelpRows.Request authorized(UserDTO user,String id,boolean teacher,boolean write,boolean lock){CourseAccess.role(user,teacher?"teacher":"student");AssignmentInput.uuid(id);var r=lock?mapper.lock(id):mapper.find(id);if(r==null)throw CourseAccess.notFound();if(teacher)access.requireTeacher(user,r.offeringId(),write);else{if(!user.id().equals(r.studentId()))throw CourseAccess.notFound();access.requireStudent(user,r.offeringId(),write);}if(write){var a=assignments.findAssignment(r.assignmentId());writable(a.status());}return r;}
 private static void writable(String status){if("archived".equals(status))throw new BusinessException(HttpStatus.CONFLICT,"ASSIGNMENT_ARCHIVED","作业已归档。");}
 private static Map<String,Object> dto(HelpRows.Request r,boolean teacher){Map<String,Object> m=new LinkedHashMap<>();m.put("id",r.id());m.put("offeringId",r.offeringId());m.put("assignmentId",r.assignmentId());m.put("title",r.title());m.put("content",r.content());m.put("studentAttempt",r.studentAttempt());m.put("workspaceRevision",r.workspaceRevision());m.put("sharedTutoringRequestIds",array(r.sharedTutoringRequestIds()));m.put("issueTags",array(r.issueTags()));m.put("status",r.status());m.put("createdAt",r.createdAt());m.put("updatedAt",r.updatedAt());if(teacher)m.put("student",Map.of("id",r.studentId(),"username",r.username(),"displayName",r.displayName()));return m;}
 private static List<String> array(String json){List<String> result=new ArrayList<>();for(var item:JSON.readTree(json))result.add(item.asString());return result;}
 private static List<String> strings(Map<String,Object> body,String key,int max,boolean uuid){if(!body.containsKey(key))return List.of();if(!(body.get(key) instanceof List<?> values))throw AssignmentInput.invalid();List<String> result=new ArrayList<>();for(Object v:values){if(!(v instanceof String s)||s.isEmpty()||s.codePointCount(0,s.length())>max)throw AssignmentInput.invalid();if(uuid)AssignmentInput.uuid(s);if(result.contains(s))throw AssignmentInput.invalid();result.add(s);}return result;}
 private static void keys(Map<String,Object> body,Set<String> allowed){if(body==null)throw AssignmentInput.invalid();if(!allowed.containsAll(body.keySet()))throw AssignmentInput.invalidRequest();}
 public void purgeExpiredSnapshots(){mapper.purge(now());}
}
