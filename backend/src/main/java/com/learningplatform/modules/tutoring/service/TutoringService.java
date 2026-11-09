package com.learningplatform.modules.tutoring.service;
import static com.learningplatform.modules.tutoring.mapper.TutoringSql.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.nio.charset.StandardCharsets;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.transaction.annotation.*;
import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.courses.mapper.AssignmentMapper;
import com.learningplatform.modules.courses.model.AssignmentRows.Assignment;
import com.learningplatform.modules.courses.service.*;
import com.learningplatform.modules.tutoring.mapper.TutoringMapper;
import static com.learningplatform.modules.tutoring.service.TutoringJson.map;
@Service
public class TutoringService {
 final TutoringMapper db;final TutoringJson json;final Clock clock;final AssignmentMapper assignments;final CourseAccess access;
 private final AssignmentPolicyBindingService policyBinding;
 public TutoringService(TutoringMapper db,TutoringJson json,Clock clock,AssignmentMapper assignments,CourseAccess access,AssignmentPolicyBindingService policyBinding){this.db=db;this.json=json;this.clock=clock;this.assignments=assignments;this.access=access;this.policyBinding=policyBinding;}
 public Map<String,Object> policy(UserDTO user,String assignmentId,boolean teacher){var a=assignment(assignmentId);var c=teacher?access.requireTeacher(user,a.offeringId(),false):access.requireReader(user,a.offeringId());if(!teacher&&"student".equals(c.member().role())&&"draft".equals(a.status()))throw CourseAccess.notFound();return currentPolicy(a);}
 public Map<String,Object> currentPolicy(Assignment a){var row=a.currentAiPolicyId()==null?null:db.one(FIND_POLICY,a.currentAiPolicyId());if(row==null)return defaults(a.id());var result=json.read(row.get("config"));result.put("assignmentId",a.id());result.put("version",row.get("version"));result.put("boundaryText",boundary());return result;}
 public static String boundary(){return "允许概念解释、排错方向与引导提问，禁止完整核心实现和代码块。";}
 public static Map<String,Object> defaults(String assignmentId){return map("assignmentId",assignmentId,"version",0,"enabled",false,"allowedActions",List.of("ask","concept","next_hint"),"allowedModes",List.of("concept","debug_hint","guided_question"),"restrictCompleteSolution",true,"allowCodeBlocks",false,"maxHintLevel",3,"requireAttemptFromLevel",2,"dailyUserLimit",30,"dailyAssignmentLimit",12,"perMinuteLimit",3,"maxOutputTokens",800,"boundaryText",boundary());}
 @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
 public Map<String,Object> updatePolicy(UserDTO user,String id,Map<String,Object> body){var a=assignment(id);access.requireTeacher(user,a.offeringId(),true);if("archived".equals(a.status()))throw conflict("ASSIGNMENT_ARCHIVED");
  var current=currentPolicy(a);int base=AssignmentInput.integer(body,"baseVersion");validatePolicy(body);int version=((Number)current.get("version")).intValue();if(base!=version)throw version(version);
  String policyId=uuid();var config=new LinkedHashMap<>(body);config.remove("baseVersion");config.put("dailyUserLimit",30);config.put("perMinuteLimit",3);Instant now=clock.instant();
  try{db.update(INSERT_POLICY,policyId,id,version+1,json.write(config),user.id(),now);}catch(DuplicateKeyException e){throw version(version+1);}
  if(!policyBinding.bind(id,policyId,a.currentAiPolicyId(),now))throw version(version+1);
  config.put("assignmentId",id);config.put("version",version+1);config.put("boundaryText",boundary());return config;
 }
 public static void validatePolicy(Map<String,Object> b){
  if(!Set.of("baseVersion","enabled","allowedActions","allowedModes","restrictCompleteSolution","allowCodeBlocks","maxHintLevel","requireAttemptFromLevel","dailyUserLimit","dailyAssignmentLimit","perMinuteLimit","maxOutputTokens").containsAll(b.keySet()))throw AssignmentInput.invalidRequest();
  boolean enabled=AssignmentInput.bool(b,"enabled");if(!AssignmentInput.bool(b,"restrictCompleteSolution")||AssignmentInput.bool(b,"allowCodeBlocks"))throw AssignmentInput.invalid();
  strings(b,"allowedActions",List.of("ask","concept","next_hint"),enabled);strings(b,"allowedModes",List.of("concept","debug_hint","guided_question"),enabled);
  range(b,"maxHintLevel",1,3);range(b,"requireAttemptFromLevel",1,2);range(b,"dailyAssignmentLimit",1,12);range(b,"maxOutputTokens",1,800);
  if(b.containsKey("dailyUserLimit"))range(b,"dailyUserLimit",30,30);if(b.containsKey("perMinuteLimit"))range(b,"perMinuteLimit",3,3);
 }
 static void strings(Map<String,Object>b,String key,List<String> allowed,boolean required){Object v=b.get(key);if(!(v instanceof List<?> xs)||xs.size()>3||new HashSet<>(xs).size()!=xs.size()||!xs.stream().allMatch(vv->vv instanceof String&&allowed.contains(vv))||(required&&xs.isEmpty()))throw AssignmentInput.invalid();}
 static int range(Map<String,Object>b,String k,int min,int max){int n=AssignmentInput.integer(b,k);if(n<min||n>max)throw AssignmentInput.invalid();return n;}
 public Map<String,Object> sessions(UserDTO user,String id,int page,int size){AssignmentInput.page(page,size);var a=assignment(id);access.requireStudent(user,a.offeringId(),false);if("draft".equals(a.status()))throw CourseAccess.notFound();
  var rows=db.list(LIST_SESSIONS,id,user.id(),size,offset(page,size));
  var items=rows.stream().map(r->map("id",r.get("id"),"assignmentId",r.get("assignment_id"),"createdAt",time(r,"created_at"),"status",r.get("status"),"pendingRequestId",r.get("pending_request_id"),"lastMessageAt",time(r,"last_message_at"))).toList();
  return map("items",items,"page",page,"pageSize",size,"total",db.count(COUNT_SESSIONS,id,user.id()));
 }
 @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
 public Map<String,Object> create(UserDTO user,Map<String,Object> body){if(!Set.of("assignmentId").containsAll(body.keySet()))throw AssignmentInput.invalidRequest();if(!(body.get("assignmentId") instanceof String))throw AssignmentInput.invalid();String aid=AssignmentInput.uuid((String)body.get("assignmentId"));var a=assignment(aid);var policy=writeAccess(user,a);String id=uuid();Instant now=clock.instant();db.update(INSERT_SESSION,id,aid,user.id(),now,now);return map("id",id,"assignmentId",aid,"createdAt",now,"policyVersion",policy.get("version"));}
 public Map<String,Object> messages(UserDTO user,String id,int page,int size){AssignmentInput.page(page,size);ownedSession(user,id);var rows=db.list(LIST_MESSAGES,id,size,offset(page,size));
  var items=rows.stream().map(r->{boolean expired=expired(r);var delivered=json.read(r.get("result"));return map("id",r.get("id"),"sequence",r.get("sequence"),"role",r.get("role"),"content",expired?null:r.get("content"),"createdAt",time(r,"created_at"),"tutoringRequestId",r.get("tutoring_request_id"),"mode",r.get("mode"),"hintLevel",r.get("hint_level"),"policyVersion",r.get("version"),"contentUnavailableReason",expired?"retention_expired":null,"citations",expired||delivered==null||!(delivered.get("citations") instanceof List<?> c)?List.of():c);}).toList();return map("items",items,"page",page,"pageSize",size,"total",db.count(COUNT_MESSAGES,id));
 }
 @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
 public Map<String,Object> send(UserDTO user,String sessionId,Map<String,Object> body){
  var s=ownedSession(user,sessionId);String aid=(String)s.get("assignment_id");var a=assignment(aid);var policy=writeAccess(user,a);if(!"active".equals(s.get("status")))throw conflict("SESSION_CLOSED");validateWrite(body);
  String action=(String)body.get("action");if(!((List<?>)policy.get("allowedActions")).contains(action))throw AssignmentInput.invalid();
  var pending=db.one(FIND_PENDING_REQUEST,user.id(),aid);if(pending!=null)throw pending((String)pending.get("id"));
  var progress=db.one(FIND_PROGRESS,user.id(),aid);int highest=progress==null?0:((Number)progress.get("highest_delivered_hint_level")).intValue();
  int level="concept".equals(action)?1:"next_hint".equals(action)?highest+1:Math.max(1,highest);if(level>((Number)policy.get("maxHintLevel")).intValue())throw conflict("HINT_LIMIT_REACHED");
  String attempt=(String)body.get("studentAttempt");if(level>=((Number)policy.get("requireAttemptFromLevel")).intValue()&&(attempt==null||attempt.isBlank()))throw new BusinessException(HttpStatus.UNPROCESSABLE_ENTITY,"ATTEMPT_REQUIRED","请描述实际尝试。");
  Instant now=clock.instant(),day=now.atZone(ZoneId.of("Asia/Shanghai")).toLocalDate().atStartOfDay(ZoneId.of("Asia/Shanghai")).toInstant();
  if(db.count(COUNT_USER_BUDGET,user.id(),day)>=30||db.count(COUNT_ASSIGNMENT_BUDGET,user.id(),aid,day)>=((Number)policy.get("dailyAssignmentLimit")).intValue()||db.count(COUNT_MINUTE_BUDGET,user.id(),now.minusSeconds(60))>=3)throw new BusinessException(HttpStatus.TOO_MANY_REQUESTS,"RATE_LIMITED","辅导额度已用完，请稍后再试。",Map.of(),60);
  Integer revision=body.get("workspaceRevision")==null?null:AssignmentInput.integer(body,"workspaceRevision");String snapshot=null;
  if(revision!=null){var w=assignments.findWorkspaceForUpdate(aid,user.id());if(w==null||w.revision()!=revision)throw new BusinessException(HttpStatus.CONFLICT,"WORKSPACE_CONFLICT","工作区版本已变化。",Map.of("currentRevision",w==null?0:w.revision()));var files=assignments.getWorkspaceFiles(w.id());snapshot=json.write(files.stream().map(f->map("path",f.filePath(),"content",f.content())).toList());if(snapshot.getBytes(StandardCharsets.UTF_8).length>16384)throw AssignmentInput.invalid();}
  String id=uuid();try{db.update(INSERT_REQUEST,id,sessionId,user.id(),aid,action,body.get("content"),attempt,revision,snapshot,level,now.plus(90,ChronoUnit.DAYS),now,now);}catch(DuplicateKeyException e){var p=db.one(FIND_PENDING_AFTER_CONFLICT,user.id(),aid);if(p==null)throw e;throw pending((String)p.get("id"));}
  addMessage(sessionId,id,"student",(String)body.get("content"),null,null,null,now);return map("tutoringRequestId",id,"status","queued");
 }
 public static void validateWrite(Map<String,Object>b){if(!Set.of("action","content","studentAttempt","workspaceRevision").containsAll(b.keySet()))throw AssignmentInput.invalidRequest();if(!(b.get("action") instanceof String action)||!List.of("ask","concept","next_hint").contains(action))throw AssignmentInput.invalid();Object c=b.get("content");if(!(c instanceof String t)||t.codePointCount(0,t.length())>4000||("ask".equals(b.get("action"))&&t.isBlank()))throw AssignmentInput.invalid();Object attempt=b.get("studentAttempt");if(attempt!=null&&(!(attempt instanceof String at)||at.codePointCount(0,at.length())>8000))throw AssignmentInput.invalid();if(b.get("workspaceRevision")!=null)range(b,"workspaceRevision",1,Integer.MAX_VALUE);}
 public Map<String,Object> request(UserDTO user,String id){AssignmentInput.uuid(id);var r=db.one(FIND_OWNED_REQUEST,id,user.id());if(r==null)throw CourseAccess.notFound();ownedSession(user,(String)r.get("session_id"));var result=json.read(r.get("result"));if(result!=null&&!(result.get("citations") instanceof List<?>))result.put("citations",List.of());if(result!=null&&expired(r)){result.put("content",null);result.put("citations",List.of());result.put("contentUnavailableReason","retention_expired");}return map("id",id,"sessionId",r.get("session_id"),"status",r.get("status"),"result",result,"error",r.get("error_code")==null?null:map("code",r.get("error_code"),"message","本次辅导未生成个性化回复，请重试或向教师求助。"),"createdAt",time(r,"created_at"),"completedAt",time(r,"completed_at"));}
 Map<String,Object> writeAccess(UserDTO user,Assignment a){access.requireStudent(user,a.offeringId(),true);if("draft".equals(a.status()))throw CourseAccess.notFound();if("archived".equals(a.status()))throw conflict("ASSIGNMENT_ARCHIVED");var p=currentPolicy(a);if(!Boolean.TRUE.equals(p.get("enabled")))throw conflict("AI_DISABLED");return p;}
 Map<String,Object> ownedSession(UserDTO user,String id){CourseAccess.role(user,"student");AssignmentInput.uuid(id);var s=db.one(FIND_OWNED_SESSION,id,user.id());if(s==null)throw CourseAccess.notFound();var a=assignment((String)s.get("assignment_id"));access.requireStudent(user,a.offeringId(),false);return s;}
 public Assignment assignment(String id){AssignmentInput.uuid(id);var a=assignments.findAssignment(id);if(a==null)throw CourseAccess.notFound();return a;}
 void addMessage(String sid,String rid,String role,String content,String mode,Integer level,String policy,Instant now){
  // Optimistic sequence allocation; database uniqueness is the final guard.
  var s=db.one(FIND_NEXT_SEQUENCE,sid);int seq=((Number)s.get("next_message_sequence")).intValue();if(db.update(ADVANCE_SEQUENCE,now,sid,seq)!=1)throw new IllegalStateException("Concurrent sequence allocation");db.update(INSERT_MESSAGE,uuid(),sid,rid,seq,role,content,mode,level,policy,now);
 }
 public boolean expired(Map<String,Object>r){return r.get("content_purged_at")!=null||!time(r,"content_expires_at").isAfter(clock.instant());}
 static Instant time(Map<String,Object>r,String k){return r.get(k)==null?null:TutoringMapper.instant(r.get(k));}
 static long offset(int page,int size){return (long)(page-1)*size;}static String uuid(){return UUID.randomUUID().toString();}
 static BusinessException conflict(String code){return new BusinessException(HttpStatus.CONFLICT,code,"当前状态不允许此操作。");}
 static BusinessException version(int v){return new BusinessException(HttpStatus.CONFLICT,"AI_POLICY_VERSION_CONFLICT","政策版本已变化。",Map.of("currentVersion",v));}
 static BusinessException pending(String id){return new BusinessException(HttpStatus.CONFLICT,"AI_REQUEST_IN_PROGRESS","已有辅导请求正在处理。",Map.of("pendingRequestId",id));}
}
