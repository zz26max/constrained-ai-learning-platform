package com.learningplatform.modules.tutoring.service;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.courses.service.*;
import com.learningplatform.modules.tutoring.provider.TutoringProvider;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import org.springframework.test.annotation.DirtiesContext;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.mysql.MySQLContainer;
import static org.assertj.core.api.Assertions.*;
@SpringBootTest(properties={"AUTH_INVITE_SIGNING_KEY=test-only-invite-signing-key-at-least-32-characters","AI_WORKER_ENABLED=false"})
@org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
@Testcontainers @Import(TutoringIntegrationIT.Config.class) @DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
class TutoringIntegrationIT {
 static final Instant NOW=Instant.parse("2026-10-24T08:00:00Z");
 @Container static final MySQLContainer mysql=new MySQLContainer("mysql:8.4.11").withDatabaseName("tutoring_it").withUsername("tutor").withPassword(UUID.randomUUID().toString()).withCommand("--default-time-zone=+00:00","--transaction-isolation=READ-COMMITTED");
 @DynamicPropertySource static void properties(DynamicPropertyRegistry r){r.add("spring.datasource.url",mysql::getJdbcUrl);r.add("spring.datasource.username",mysql::getUsername);r.add("spring.datasource.password",mysql::getPassword);}
 @Autowired TutoringService service;@Autowired TutoringWorker worker;@Autowired TutoringQueryService query;@Autowired JdbcTemplate jdbc;@Autowired CourseService courses;@Autowired AssignmentService assignments;@Autowired FakeProvider provider;@Autowired org.springframework.transaction.PlatformTransactionManager transactions;
 UserDTO student,teacher;String assignment,offering,session;Map<String,Object> assignmentBody;
 @Autowired org.springframework.test.web.servlet.MockMvc mvc;
 @Autowired com.learningplatform.modules.auth.service.DatabaseSessionService authSessions;
 @Autowired com.learningplatform.modules.auth.security.CsrfTokenService csrf;
 @Autowired org.springframework.security.crypto.password.PasswordEncoder passwords;
 @BeforeEach void seed(){provider.delegate=null;provider.calls=0;provider.available=true;provider.bad=false;provider.timeout=false;provider.onCall=null;provider.last=null;
  student=user("student");teacher=user("teacher");for(var u:List.of(student,teacher))jdbc.update("INSERT INTO users(id,username,display_name,password_hash,roles,status,created_at,updated_at) VALUES(?,?,?,'TEST_ONLY',CAST(? AS JSON),'active',?,?)",u.id(),u.username(),u.displayName(),"[\""+u.roles().getFirst()+"\"]",ts(NOW),ts(NOW));
  String term=id(),course=id();jdbc.update("INSERT INTO terms(id,label,starts_at,ends_at,is_current,created_at,updated_at) VALUES(?,?,?, ?,0,?,?)",term,"测试学期",ts(NOW.minusSeconds(10000)),ts(NOW.plusSeconds(900000)),ts(NOW),ts(NOW));
  jdbc.update("INSERT INTO courses(id,code,mark,title,description,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,'active',?,?,?)",course,id(),"AI","辅导测试","虚构数据",teacher.id(),ts(NOW),ts(NOW));
  offering=courses.createOffering(teacher,Map.of("courseId",course,"termId",term,"title","AI测试班","groupName","一班","progressUnit","chapter"),"it").id();
  var invite=courses.createInvite(teacher,offering,Map.of("expiresAt",NOW.plusSeconds(5000).toString(),"maxUses",10),"it");courses.enroll(student,Map.of("inviteCode",invite.inviteCode()),"it");
  var body=new HashMap<String,Object>();body.put("chapterId",null);body.put("title","问题分析");body.put("description","解释布局");body.put("estimatedMinutes",30);body.put("type","text");body.put("isRequired",true);body.put("dueAt",NOW.plusSeconds(80000).toString());body.put("lateUntil",null);body.put("allowResubmit",true);body.put("maxAttempts",3);body.put("maxScore",100);body.put("requirements",List.of("解释"));body.put("rubric",List.of(Map.of("criterionId","analysis","title","分析","description","概念解释","maxScore",100)));body.put("initialFiles",List.of(Map.of("path","answer.md","content","")));body.put("knowledgePointIds",List.of());
  assignmentBody=body;assignment=assignments.createAssignment(teacher,offering,body,"it").id();assignments.publishAssignment(teacher,assignment,"it");service.updatePolicy(teacher,assignment,policy(0));session=(String)service.create(student,Map.of("assignmentId",assignment)).get("id");
 }
 Map<String,Object> policy(int version){var p=TutoringRulesTest.policy();p.put("baseVersion",version);return p;}
 String send(String action,String content,String attempt){var b=new HashMap<String,Object>();b.put("action",action);b.put("content",content);if(attempt!=null)b.put("studentAttempt",attempt);return (String)service.send(student,session,b).get("tutoringRequestId");}
 String complete(){String r=send("ask","如何分析布局",null);worker.execute(r);TutoringSchemaAssertions.response("Response_getTutoringRequest",tools.jackson.databind.json.JsonMapper.builder().findAndAddModules().build().writeValueAsString(Map.of("data",service.request(student,r),"requestId","it")));return r;}
 @Test void completesAtomicallyAndSharesAcrossSessions(){String r=complete();assertThat(service.request(student,r).get("status")).isEqualTo("completed");assertThat(provider.calls).isEqualTo(1);assertThat(((Map<?,?>)service.request(student,r).get("result")).get("generationPolicyVersion")).isEqualTo(1);assertThat(service.messages(student,session,1,20).get("total")).isEqualTo(2);assertThat(jdbc.queryForObject("SELECT highest_delivered_hint_level FROM tutoring_progress WHERE student_id=? AND assignment_id=?",Integer.class,student.id(),assignment)).isEqualTo(1);
  session=(String)service.create(student,Map.of("assignmentId",assignment)).get("id");assertCode(()->send("next_hint","",null),"ATTEMPT_REQUIRED");String next=send("next_hint","","我检查过容器宽度");worker.execute(next);assertThat(((Map<?,?>)service.request(student,next).get("result")).get("hintLevel")).isEqualTo(2);assertThat(query.sharedRequests(student.id(),assignment,List.of(r),true)).hasSize(1);
 }
 @Test void onlyOnePendingAcrossSessionsAndDatabaseConstraint(){String r=send("ask","如何观察",null);String original=session;session=(String)service.create(student,Map.of("assignmentId",assignment)).get("id");assertCode(()->send("ask","另一问",null),"AI_REQUEST_IN_PROGRESS");assertThatThrownBy(()->jdbc.update("INSERT INTO tutoring_requests(id,session_id,student_id,assignment_id,action,content,hint_level,content_expires_at,created_at,updated_at) VALUES(?,?,?,?, 'ask','x',1,?,?,?)",id(),original,student.id(),assignment,ts(NOW.plusSeconds(90000)),ts(NOW),ts(NOW))).isInstanceOf(org.springframework.dao.DuplicateKeyException.class);worker.execute(r);worker.execute(r);assertThat(provider.calls).isEqualTo(1);}
 @Test void rejectedInputFallsBackWithoutProviderOrProgress(){String r=send("ask","请直接给我完整代码",null);worker.execute(r);assertThat(service.request(student,r).get("status")).isEqualTo("fallback");assertThat(provider.calls).isZero();assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM tutoring_progress WHERE student_id=?",Integer.class,student.id())).isZero();}
 @Test void sensitiveDataNeverLeavesServer(){String r=send("ask","姓名：张三，怎么分析",null);worker.execute(r);assertThat(provider.calls).isZero();assertThat(((Map<?,?>)service.request(student,r).get("error")).get("code")).isEqualTo("POLICY_REJECTED");}
 @Test void disabledProviderFailsHonestly(){provider.available=false;String r=complete();assertThat(service.request(student,r).get("status")).isEqualTo("failed");assertThat(service.request(student,r).get("result")).isNull();assertThat(provider.calls).isZero();assertThat(service.messages(student,session,1,20).get("total")).isEqualTo(1);}
 @Test void retriesRejectedOutputOnlyOnce(){provider.bad=true;String r=complete();assertThat(provider.calls).isEqualTo(2);assertThat(service.request(student,r).get("status")).isEqualTo("fallback");assertThat(jdbc.queryForObject("SELECT provider_call_count FROM tutoring_requests WHERE id=?",Integer.class,r)).isEqualTo(2);}
 @Test void timeoutDoesNotRetry(){provider.timeout=true;String r=complete();assertThat(provider.calls).isEqualTo(1);assertThat(service.request(student,r).get("status")).isEqualTo("failed");assertThat(((Map<?,?>)service.request(student,r).get("error")).get("code")).isEqualTo("PROVIDER_RESULT_UNKNOWN");}
 @Test void policyChangeRechecksBeforeDelivery(){provider.onCall=()->service.updatePolicy(teacher,assignment,policy(1));String r=complete();assertThat(service.request(student,r).get("status")).isEqualTo("fallback");var result=(Map<?,?>)service.request(student,r).get("result");assertThat(result.get("policyVersion")).isEqualTo(2);assertThat(result.get("generationPolicyVersion")).isEqualTo(1);}
 @Test void archiveWhileRunningDiscardsGeneratedAnswer(){provider.onCall=()->jdbc.update("UPDATE assignments SET status='archived' WHERE id=?",assignment);String r=complete();assertThat(service.request(student,r).get("status")).isEqualTo("failed");assertThat(service.messages(student,session,1,20).get("total")).isEqualTo(1);}
 @Test void membershipRevocationDiscardsGeneratedAnswer(){provider.onCall=()->jdbc.update("UPDATE offering_members SET status='inactive' WHERE offering_id=? AND user_id=?",offering,student.id());String r=send("ask","如何分析",null);worker.execute(r);assertThat(jdbc.queryForObject("SELECT error_code FROM tutoring_requests WHERE id=?",String.class,r)).isEqualTo("MEMBERSHIP_REVOKED");}
 @Test void expiryIsEnforcedBeforePhysicalPurge(){String r=complete();jdbc.update("UPDATE tutoring_requests SET content_expires_at=? WHERE id=?",ts(NOW),r);var result=(Map<?,?>)service.request(student,r).get("result");assertThat(result.get("content")).isNull();assertThat(result.get("contentUnavailableReason")).isEqualTo("retention_expired");assertCode(()->query.sharedRequests(student.id(),assignment,List.of(r),true),"VALIDATION_ERROR");assertThat(query.sharedRequests(student.id(),assignment,List.of(r),false).getFirst().get("content")).isNull();worker.purgeExpired();assertThat(jdbc.queryForObject("SELECT content FROM tutoring_requests WHERE id=?",String.class,r)).isNull();String next=send("next_hint","","我观察过布局");worker.execute(next);assertThat(((Map<?,?>)service.request(student,next).get("error")).get("code")).isEqualTo("HISTORY_EXPIRED");}
 @Test void startupRecoveryReleasesSlotAndLateWorkCannotOverwrite(){String r=send("ask","如何观察",null);jdbc.update("UPDATE tutoring_requests SET status='running' WHERE id=?",r);assertThat(worker.recoverRunning()).isGreaterThanOrEqualTo(1);worker.execute(r);assertThat(service.request(student,r).get("status")).isEqualTo("failed");assertThat(provider.calls).isZero();assertThat(send("ask","再问一次",null)).isNotEqualTo(r);}
 @Test void budgetsAndReadOwnershipAreEnforced(){complete();complete();complete();assertCode(()->send("ask","第四问",null),"RATE_LIMITED");var stranger=user("student");assertCode(()->service.messages(stranger,session,1,20),"NOT_FOUND");assertCode(()->service.updatePolicy(teacher,assignment,policy(0)),"AI_POLICY_VERSION_CONFLICT");}
 @Test void policyForeignKeysRejectCrossAssignmentAndRequestMessageSessionMismatch(){String r=complete();String second=(String)service.create(student,Map.of("assignmentId",assignment)).get("id");assertThatThrownBy(()->jdbc.update("INSERT INTO tutoring_messages(id,session_id,tutoring_request_id,sequence,role,content,created_at) VALUES(?,?,?,1,'student','x',?)",id(),second,r,ts(NOW))).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);}
 @Test void tightenedQueuedPolicyNeverGeneratesAtOldLevel(){complete();String r=send("next_hint","","检查过容器宽度");var p=policy(1);p.put("maxHintLevel",1);service.updatePolicy(teacher,assignment,p);int calls=provider.calls;worker.execute(r);assertThat(provider.calls).isEqualTo(calls);assertThat(service.request(student,r).get("status")).isEqualTo("fallback");assertThat(((Map<?,?>)service.request(student,r).get("result")).get("hintLevel")).isEqualTo(1);}
 @Test void tightenedAttemptGateRejectsQueuedRequest(){String r=send("ask","如何分析",null);var p=policy(1);p.put("requireAttemptFromLevel",1);service.updatePolicy(teacher,assignment,p);worker.execute(r);assertThat(provider.calls).isZero();assertThat(service.request(student,r).get("status")).isEqualTo("fallback");}
 @Test void disabledQueuedActionNeverCallsProvider(){String r=send("concept","",null);var p=policy(1);p.put("allowedActions",List.of("ask"));service.updatePolicy(teacher,assignment,p);worker.execute(r);assertThat(provider.calls).isZero();assertThat(service.request(student,r).get("status")).isEqualTo("fallback");}
 @Test void queuedWorkspaceSnapshotDoesNotFollowLaterSave(){assignments.saveWorkspace(student,assignment,Map.of("baseRevision",0,"files",List.of(Map.of("path","answer.md","content","first version")),"activeFile","answer.md"),"it");String r=(String)service.send(student,session,Map.of("action","ask","content","如何观察","workspaceRevision",1)).get("tutoringRequestId");assignments.saveWorkspace(student,assignment,Map.of("baseRevision",1,"files",List.of(Map.of("path","answer.md","content","later version")),"activeFile","answer.md"),"it");worker.execute(r);assertThat(provider.last.workspace()).contains("first version").doesNotContain("later version");}
 @Test void concurrentWorkspaceSaveCannotMislabeledSnapshot()throws Exception{assignments.saveWorkspace(student,assignment,Map.of("baseRevision",0,"files",List.of(Map.of("path","answer.md","content","first version")),"activeFile","answer.md"),"it");var tx=new org.springframework.transaction.support.TransactionTemplate(transactions);var started=new CountDownLatch(1);try(var pool=Executors.newVirtualThreadPerTaskExecutor()){var future=new java.util.concurrent.atomic.AtomicReference<Future<String>>();tx.executeWithoutResult(t->{jdbc.queryForMap("SELECT id FROM workspaces WHERE assignment_id=? AND student_id=? FOR UPDATE",assignment,student.id());future.set(pool.submit(()->{started.countDown();try{service.send(student,session,Map.of("action","ask","content","如何观察","workspaceRevision",1));return "accepted";}catch(BusinessException e){return e.getCode();}}));try{assertThat(started.await(3,TimeUnit.SECONDS)).isTrue();}catch(InterruptedException e){throw new RuntimeException(e);}assignments.saveWorkspace(student,assignment,Map.of("baseRevision",1,"files",List.of(Map.of("path","answer.md","content","second version")),"activeFile","answer.md"),"it");});assertThat(future.get().get(5,TimeUnit.SECONDS)).isEqualTo("WORKSPACE_CONFLICT");}assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM tutoring_requests WHERE student_id=?",Integer.class,student.id())).isZero();}
 @Test void concurrentEnqueueHasExactlyOneWinner()throws Exception{String second=(String)service.create(student,Map.of("assignmentId",assignment)).get("id");var start=new CountDownLatch(1);try(var pool=Executors.newVirtualThreadPerTaskExecutor()){List<Future<String>> futures=new ArrayList<>();for(String sid:List.of(session,second))futures.add(pool.submit(()->{start.await();try{return (String)service.send(student,sid,Map.of("action","ask","content","如何观察")).get("tutoringRequestId");}catch(BusinessException e){return e.getCode();}}));start.countDown();List<String> outcomes=new ArrayList<>();for(var f:futures)outcomes.add(f.get(8,TimeUnit.SECONDS));assertThat(outcomes.stream().filter("AI_REQUEST_IN_PROGRESS"::equals).count()).isEqualTo(1);assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM tutoring_requests WHERE student_id=? AND status IN ('queued','running')",Integer.class,student.id())).isEqualTo(1);}}
 @Test void policyCompositeForeignKeysRejectCrossAssignment(){String second=assignments.createAssignment(teacher,offering,assignmentBody,"it").id();String firstPolicy=jdbc.queryForObject("SELECT current_ai_policy_id FROM assignments WHERE id=?",String.class,assignment);assertThatThrownBy(()->jdbc.update("UPDATE assignments SET current_ai_policy_id=? WHERE id=?",firstPolicy,second)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);service.updatePolicy(teacher,second,policy(0));String otherPolicy=jdbc.queryForObject("SELECT current_ai_policy_id FROM assignments WHERE id=?",String.class,second);assignments.saveWorkspace(student,assignment,Map.of("baseRevision",0,"files",List.of(Map.of("path","answer.md","content","reflection")),"activeFile","answer.md"),"it");var submission=assignments.submitAssignment(student,assignment,Map.of("workspaceRevision",1,"reflection","分析空间"),"it").submission();assertThatThrownBy(()->jdbc.update("UPDATE submissions SET ai_policy_id=? WHERE id=?",otherPolicy,submission.id())).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);}
 @Test void expiredQueuedBodyIsNeverTransmitted(){String r=send("ask","如何观察",null);jdbc.update("UPDATE tutoring_requests SET content_expires_at=? WHERE id=?",ts(NOW),r);worker.execute(r);assertThat(provider.calls).isZero();assertThat(service.request(student,r).get("status")).isEqualTo("failed");}
 @Test void configuredHttpProviderCompletesThroughAuthenticatedPolling() throws Exception {
  configuredProviderRoundTrip(200,false,"completed",null);
 }
 @Test void configuredHttpProviderFailureExposesNoAnswerOrUpstreamBody() throws Exception {
  configuredProviderRoundTrip(503,false,"failed","PROVIDER_UNAVAILABLE");
 }
 @Test void malformedProviderReplyFailsWithoutRetryOrAssistantMessage() throws Exception {
  configuredProviderRoundTrip(200,true,"failed","PROVIDER_UNAVAILABLE");
 }
 private void configuredProviderRoundTrip(int upstreamStatus,boolean malformed,String expectedStatus,String errorCode) throws Exception {
  var json=tools.jackson.databind.json.JsonMapper.builder().findAndAddModules().build();
  var calls=new java.util.concurrent.atomic.AtomicInteger();
  var received=new java.util.concurrent.atomic.AtomicReference<String>();
  var server=com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1",0),0);
  String answer="先比较容器可用空间，再记录现象。";
  String output=json.writeValueAsString(Map.of("mode","concept","hintLevel",1,"content",answer,"nextAction","try_and_report"));
  String response=upstreamStatus!=200?"UPSTREAM_PRIVATE_DIAGNOSTIC":malformed?"not-json":json.writeValueAsString(Map.of("choices",List.of(Map.of("message",Map.of("content",output))),"usage",Map.of("prompt_tokens",20,"completion_tokens",10)));
  server.createContext("/chat",exchange->{calls.incrementAndGet();received.set(new String(exchange.getRequestBody().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8));byte[] bytes=response.getBytes(java.nio.charset.StandardCharsets.UTF_8);exchange.getResponseHeaders().add("Content-Type","application/json");exchange.sendResponseHeaders(upstreamStatus,bytes.length);try(var body=exchange.getResponseBody()){body.write(bytes);}exchange.close();});
  server.start();
  try {
   provider.delegate=new com.learningplatform.modules.tutoring.provider.ConfiguredTutoringProvider(json,true,true,"http://127.0.0.1:"+server.getAddress().getPort()+"/chat","test-only-provider-key","test-model","");
   String password="tutoring-http-test-only-password";
   jdbc.update("UPDATE users SET password_hash=? WHERE id=?",passwords.encode(password),student.id());
   var grant=authSessions.login(student.username(),password,null,"tutoring-http");
   var cookie=new jakarta.servlet.http.Cookie("lp_session",grant.token());
   var accepted=mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/tutoring/sessions/"+session+"/messages").cookie(cookie).header("Origin","http://127.0.0.1:4173").header("X-CSRF-Token",csrf.sessionToken(grant.id(),grant.csrfSecret())).contentType("application/json").content("{\"action\":\"ask\",\"content\":\"如何分析布局\"}"))
    .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isAccepted()).andReturn();
   String requestId=json.readTree(accepted.getResponse().getContentAsString()).path("data").path("tutoringRequestId").asText();
   worker.execute(requestId);
   var polled=mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/tutoring/requests/"+requestId).cookie(cookie))
    .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk()).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.data.status").value(expectedStatus)).andReturn();
   String body=polled.getResponse().getContentAsString();
   TutoringSchemaAssertions.response("Response_getTutoringRequest",body);
   assertThat(body).doesNotContain("UPSTREAM_PRIVATE_DIAGNOSTIC","test-only-provider-key",password);
   assertThat(calls.get()).isEqualTo(1);
   assertThat(received.get()).contains("test-model").doesNotContain(student.id(),student.username(),grant.token());
   assertThat(jdbc.queryForObject("SELECT provider_call_count FROM tutoring_requests WHERE id=?",Integer.class,requestId)).isEqualTo(1);
   var data=json.readTree(body).path("data");
   if(errorCode==null){
    assertThat(data.path("result").path("content").asText()).isEqualTo(answer);
    assertThat(data.path("error").isNull()).isTrue();
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM learning_events WHERE source_event_key=?",Integer.class,"tutoring:"+requestId)).isEqualTo(1);
   } else {
    assertThat(data.path("result").isNull()).isTrue();
    assertThat(data.path("error").path("code").asText()).isEqualTo(errorCode);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM tutoring_messages WHERE tutoring_request_id=? AND role='assistant'",Integer.class,requestId)).isZero();
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM tutoring_progress WHERE student_id=? AND assignment_id=?",Integer.class,student.id(),assignment)).isZero();
   }
  } finally {provider.delegate=null;server.stop(0);}
 }
 static void assertCode(Runnable r,String code){assertThatThrownBy(r::run).isInstanceOfSatisfying(BusinessException.class,e->assertThat(e.getCode()).isEqualTo(code));}
 static String id(){return UUID.randomUUID().toString();}static java.sql.Timestamp ts(Instant i){return java.sql.Timestamp.from(i);}static UserDTO user(String role){String id=id();return new UserDTO(id,role+id.substring(0,8),"虚构测试用户",List.of(role));}
 @TestConfiguration(proxyBeanMethods=false) static class Config {@Bean @Primary Clock clock(){return Clock.fixed(NOW,ZoneOffset.UTC);}@Bean @Primary FakeProvider fake(){return new FakeProvider();}}
 static class FakeProvider implements TutoringProvider {TutoringProvider delegate;Context last;int calls;boolean available=true,bad,timeout;Runnable onCall;public boolean available(){return delegate!=null?delegate.available():available;}public Output generate(Context c)throws Exception{last=c;calls++;if(delegate!=null)return delegate.generate(c);if(onCall!=null){var task=onCall;onCall=null;task.run();}if(timeout)throw new java.net.http.HttpTimeoutException("test");return new Output(c.allowedModes().getFirst(),c.hintLevel(),bad?"```js code```":"先比较容器可用空间，再记录现象。","try_and_report",20,10);}}
}
