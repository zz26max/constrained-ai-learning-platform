package com.learningplatform.modules.tutoring.service;
import static com.learningplatform.modules.tutoring.mapper.TutoringSql.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.stereotype.Component;
import org.springframework.context.event.EventListener;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import jakarta.annotation.PreDestroy;
import com.learningplatform.modules.tutoring.mapper.TutoringMapper;
import com.learningplatform.modules.tutoring.provider.TutoringProvider;
import static com.learningplatform.modules.tutoring.service.TutoringJson.map;
/** Bounded in-process dispatcher. Every database transaction ends before network calls. */
@Component
@EnableScheduling
public class TutoringWorker {
 private final com.learningplatform.modules.courses.mapper.AssignmentMapper assignments;private final TutoringService service;private final TutoringMapper db;private final TutoringJson json;private final Clock clock;private final TutoringProvider provider;private final TransactionTemplate tx;private final boolean cleanup;
 private final ThreadPoolExecutor pool=new ThreadPoolExecutor(2,2,0,TimeUnit.SECONDS,new ArrayBlockingQueue<>(16),r->{Thread t=new Thread(r,"tutoring-worker");t.setDaemon(true);return t;},new ThreadPoolExecutor.AbortPolicy());
 private volatile boolean ready;
 @Value("${AI_WORKER_ENABLED:true}") private boolean enabled=true;
 private final com.learningplatform.modules.analytics.service.LearningEventService events;
 public TutoringWorker(TutoringService service,TutoringMapper db,TutoringJson json,Clock clock,com.learningplatform.modules.courses.mapper.AssignmentMapper assignments,TutoringProvider provider,PlatformTransactionManager manager,com.learningplatform.modules.analytics.service.LearningEventService events,@Value("${AI_RETENTION_CLEANUP_ENABLED:false}") boolean cleanup){this.assignments=assignments;this.events=events;this.service=service;this.db=db;this.json=json;this.clock=clock;this.provider=provider;this.cleanup=cleanup;tx=new TransactionTemplate(manager);tx.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);}
 @EventListener(ApplicationReadyEvent.class) public void recover(){if(!enabled)return;try{recoverRunning();ready=true;}catch(RuntimeException unavailable){ready=false;org.slf4j.LoggerFactory.getLogger(getClass()).warn("Tutoring startup recovery unavailable; dispatcher remains stopped.");}}
 public int recoverRunning(){return db.update(RECOVER_RUNNING,clock.instant(),clock.instant());}
 @Scheduled(fixedDelayString="${AI_QUEUE_SCAN_MS:1000}") public void scan(){if(!enabled)return;if(!ready){recover();if(!ready)return;}for(var r:db.list(LIST_QUEUED)){try{pool.execute(()->execute((String)r.get("id")));}catch(RejectedExecutionException full){break;}}}
 @PreDestroy public void close(){ready=false;pool.shutdownNow();}
 @Scheduled(fixedDelayString="${AI_RETENTION_SCAN_MS:3600000}") public void retention(){if(cleanup)purgeExpired();}
 public void purgeExpired(){tx.executeWithoutResult(status->{Instant now=clock.instant();db.update(PURGE_MESSAGES,now,now);db.update(PURGE_DISCLOSURE,now,now);db.update(PURGE_REQUESTS,now,now);});}
 @SuppressWarnings("unchecked") public void execute(String id){
  if(db.update(CLAIM_REQUEST,clock.instant(),clock.instant(),id)!=1)return;
  try{
   var request=db.one(FIND_REQUEST,id);var a=service.assignment((String)request.get("assignment_id"));var policy=service.currentPolicy(a);String pid=a.currentAiPolicyId();
   if(service.expired(request)){fail(id,"HISTORY_EXPIRED");return;}
   String blocked=deliveryBlocked(request,a);if(blocked!=null){fail(id,blocked);return;}
   if(!Boolean.TRUE.equals(policy.get("enabled"))||pid==null){fail(id,"POLICY_REJECTED");return;}
   int requestedLevel=((Number)request.get("hint_level")).intValue();String savedAttempt=(String)request.get("student_attempt");
   if(!((List<?>)policy.get("allowedActions")).contains(request.get("action"))||requestedLevel>((Number)policy.get("maxHintLevel")).intValue()||(requestedLevel>=((Number)policy.get("requireAttemptFromLevel")).intValue()&&(savedAttempt==null||savedAttempt.isBlank()))){deliver(id,pid,policy,null,"POLICY_REJECTED");return;}
   var historyRows=db.list(LIST_REVIEWED_HISTORY,request.get("student_id"),request.get("assignment_id"));
   boolean expired=db.count(COUNT_EXPIRED_HISTORY,request.get("student_id"),request.get("assignment_id"),clock.instant())>0;
   var history=new ArrayList<String>();for(var row:historyRows)if(!service.expired(row)){var value=json.read(row.get("result"));if(value!=null&&value.get("content") instanceof String text)history.add(Objects.toString(row.get("content"),"")+"\n"+Objects.toString(row.get("student_attempt"),"")+"\n"+text);}
   String question=(String)request.get("content"),attempt=(String)request.get("student_attempt"),workspace=(String)request.get("workspace_snapshot");
   var materials=new ArrayList<String>();materials.add(a.description());for(var requirement:assignments.getRequirements(a.id()))materials.add(requirement.requirementText());
   String all=String.join("\n",materials)+Objects.toString(question,"")+Objects.toString(attempt,"")+Objects.toString(workspace,"")+String.join("\n",history);
   if(db.count(COUNT_DISCLOSED_CHARACTERS,request.get("student_id"),request.get("assignment_id"))>=12000){deliver(id,pid,policy,null,"OUTPUT_REJECTED");return;}
   if(expired){deliver(id,pid,policy,null,"HISTORY_EXPIRED");return;}
   if(TutoringSafety.prohibited(all)||TutoringSafety.sensitive(all)){deliver(id,pid,policy,null,"POLICY_REJECTED");return;}
   if(!provider.available()){fail(id,"PROVIDER_UNAVAILABLE");return;}
   int level=((Number)request.get("hint_level")).intValue();var modes=(List<String>)policy.get("allowedModes");
   var context=new TutoringProvider.Context((String)request.get("action"),level,((Number)policy.get("maxOutputTokens")).intValue(),modes,TutoringService.boundary(),question,attempt,workspace,materials,history);
   for(int call=0;call<2;call++){
    // Repeat the exact same transmission gate before each controlled generation.
    if(TutoringSafety.sensitive(all)||TutoringSafety.prohibited(all)){deliver(id,pid,policy,null,"POLICY_REJECTED");return;}
    if(db.update(RESERVE_PROVIDER_CALL,pid,clock.instant(),id)!=1)return;
    TutoringProvider.Output output;
    try{output=provider.generate(context);}catch(java.net.http.HttpTimeoutException e){fail(id,"PROVIDER_RESULT_UNKNOWN");return;}catch(Exception e){fail(id,"PROVIDER_UNAVAILABLE");return;}
    if(output!=null)db.update(ACCUMULATE_USAGE,output.inputTokens(),output.inputTokens(),output.inputTokens(),output.outputTokens(),output.outputTokens(),output.outputTokens(),id);
    if(TutoringSafety.acceptable(output,level,modes,context.maxOutputTokens(),history)){deliver(id,pid,policy,output,null);return;}
   }
   deliver(id,pid,policy,null,"OUTPUT_REJECTED");
  }catch(Exception e){fail(id,"INTERNAL_ERROR");}
 }
 private String deliveryBlocked(Map<String,Object> r,com.learningplatform.modules.courses.model.AssignmentRows.Assignment a){
  var membership=db.one(FIND_DELIVERY_MEMBERSHIP,r.get("student_id"),a.offeringId());
  if(membership==null||!"active".equals(membership.get("member_status")))return "MEMBERSHIP_REVOKED";
  if(!"active".equals(membership.get("offering_status")))return "OFFERING_ARCHIVED";
  if(!"published".equals(a.status()))return "ASSIGNMENT_ARCHIVED";return null;
 }
 private void deliver(String id,String generatedPolicyId,Map<String,Object> generatedPolicy,TutoringProvider.Output output,String error){
  tx.executeWithoutResult(status->{var r=db.one(FIND_DELIVERY_REQUEST,id);if(r==null||!"running".equals(r.get("status")))return;
   var a=service.assignment((String)r.get("assignment_id"));String blocked=deliveryBlocked(r,a);if(blocked!=null){fail(id,blocked);return;}
   var policy=service.currentPolicy(a);if(!Boolean.TRUE.equals(policy.get("enabled"))||a.currentAiPolicyId()==null){fail(id,"POLICY_REJECTED");return;}
   // Policy identity is checked again in the final conditional transition. A changed policy permits only fixed fallback.
   boolean changed=!Objects.equals(a.currentAiPolicyId(),generatedPolicyId);String reason=changed?"POLICY_REJECTED":error;
   boolean fallback=reason!=null;int level=Math.min(((Number)r.get("hint_level")).intValue(),((Number)policy.get("maxHintLevel")).intValue());
   String mode=fallback?"fallback":output.mode(),content=fallback?TutoringSafety.TEMPLATE:output.content();Instant now=clock.instant();
   if(!TutoringService.time(r,"content_expires_at").isAfter(now)){fail(id,"HISTORY_EXPIRED");return;}
   var generation=r.get("generation_policy_id");Integer generationVersion=generation==null?null:((Number)db.one(FIND_GENERATION_POLICY_VERSION,generation).get("version")).intValue();
   var result=map("mode",mode,"hintLevel",level,"policyVersion",policy.get("version"),"generationPolicyVersion",generationVersion,"content",content,"nextAction",fallback?"request_teacher_help":output.nextAction(),"contentUnavailableReason",null);
   int changedRows=db.update(DELIVER_REQUEST,fallback?"fallback":"completed",json.write(result),reason,reason,a.currentAiPolicyId(),now,now,now,id,a.currentAiPolicyId());
   if(changedRows!=1){fail(id,"POLICY_REJECTED");return;}
   service.addMessage((String)r.get("session_id"),id,"assistant",content,mode,level,a.currentAiPolicyId(),now);
   if(!fallback){db.update(ADVANCE_PROGRESS,TutoringService.uuid(),r.get("assignment_id"),r.get("student_id"),level,now,now,level,now);events.server((String)r.get("student_id"),a.offeringId(),a.id(),a.chapterId(),"tutoring_completed","tutoring:"+id,now);}
  });
 }
 private void fail(String id,String code){db.update(FAIL_REQUEST,code,clock.instant(),clock.instant(),id);}
}
