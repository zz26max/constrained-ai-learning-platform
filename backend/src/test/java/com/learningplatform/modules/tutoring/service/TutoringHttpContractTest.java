package com.learningplatform.modules.tutoring.service;
import java.time.*;
import java.util.*;
import java.util.stream.Stream;
import javax.sql.DataSource;
import jakarta.servlet.http.Cookie;
import com.learningplatform.LearningPlatformApplication;
import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.auth.model.SessionIdentity;
import com.learningplatform.modules.auth.security.CsrfTokenService;
import com.learningplatform.modules.auth.service.DatabaseSessionService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.http.*;
import tools.jackson.databind.json.JsonMapper;
import static com.learningplatform.modules.tutoring.service.TutoringJson.map;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@SpringBootTest(classes=LearningPlatformApplication.class,properties={"spring.flyway.enabled=false","DB_URL=jdbc:mysql://127.0.0.1:1/unused","DB_USERNAME=unused","DB_PASSWORD=unused","AUTH_INVITE_SIGNING_KEY=test-only-invite-signing-key-at-least-32-characters","AI_WORKER_ENABLED=false","auth.http.allowed-origins=http://127.0.0.1:4173"})
@AutoConfigureMockMvc
class TutoringHttpContractTest {
 static final String ID="00000000-0000-4000-8000-000000000091",TOKEN="t".repeat(64),SECRET="x".repeat(64),BASE="/api/v1/";static final Instant NOW=Instant.parse("2026-10-24T08:00:00Z");
 @Autowired MockMvc mvc;@Autowired CsrfTokenService csrf;@MockitoBean DataSource dataSource;@MockitoBean DatabaseSessionService sessions;@MockitoBean TutoringService service;
 record Op(String method,String path,String body,int code){boolean write(){return !method.equals("GET");}}
 static Stream<Op> ops(){return Stream.of(new Op("GET",BASE+"teacher/assignments/"+ID+"/ai-policy",null,200),new Op("PUT",BASE+"teacher/assignments/"+ID+"/ai-policy","{}",200),new Op("GET",BASE+"assignments/"+ID+"/ai-policy",null,200),new Op("GET",BASE+"assignments/"+ID+"/tutoring-sessions",null,200),new Op("POST",BASE+"tutoring/sessions","{\"assignmentId\":\""+ID+"\"}",201),new Op("GET",BASE+"tutoring/sessions/"+ID+"/messages",null,200),new Op("POST",BASE+"tutoring/sessions/"+ID+"/messages","{\"action\":\"ask\",\"content\":\"怎么观察\"}",202),new Op("GET",BASE+"tutoring/requests/"+ID,null,200));}
 static Stream<Op> writes(){return ops().filter(Op::write);}
 @BeforeEach void mock(){when(sessions.resolve(TOKEN)).thenReturn(new SessionIdentity(TOKEN,new UserDTO(ID,"student.test","虚构学生",List.of("student","teacher")),SECRET,NOW.plusSeconds(999999999),NOW.plusSeconds(999999999)));
  when(service.policy(any(),eq(ID),anyBoolean())).thenReturn(TutoringService.defaults(ID));when(service.updatePolicy(any(),eq(ID),anyMap())).thenReturn(TutoringService.defaults(ID));
  when(service.sessions(any(),eq(ID),anyInt(),anyInt())).thenReturn(Map.of("items",List.of(),"page",1,"pageSize",20,"total",0));when(service.messages(any(),eq(ID),anyInt(),anyInt())).thenReturn(Map.of("items",List.of(),"page",1,"pageSize",20,"total",0));
  when(service.create(any(),anyMap())).thenReturn(map("id",ID,"assignmentId",ID,"createdAt",NOW,"policyVersion",1));when(service.send(any(),eq(ID),anyMap())).thenReturn(Map.of("tutoringRequestId",ID,"status","queued"));when(service.request(any(),eq(ID))).thenReturn(map("id",ID,"sessionId",ID,"status","queued","result",null,"error",null,"createdAt",NOW,"completedAt",null));
 }
 MockHttpServletRequestBuilder build(Op op,boolean auth,boolean token){var r=request(HttpMethod.valueOf(op.method),op.path).accept(MediaType.APPLICATION_JSON).header("X-Request-ID","tutoring-test");if(auth)r.cookie(new Cookie("lp_session",TOKEN));if(op.write()){r.contentType(MediaType.APPLICATION_JSON).content(op.body).header("Origin","http://127.0.0.1:4173");if(token)r.header("X-CSRF-Token",csrf.sessionToken(TOKEN,SECRET));}return r;}
 @ParameterizedTest @MethodSource("ops") void succeedsWithEnvelopeAndNoStore(Op op)throws Exception{var result=mvc.perform(build(op,true,true)).andExpect(status().is(op.code)).andExpect(jsonPath("$.data").exists()).andExpect(jsonPath("$.requestId").value("tutoring-test")).andExpect(header().string("Cache-Control","no-store")).andReturn();String schema=op.path.contains("ai-policy")?op.method.equals("PUT")?"Response_updateAiPolicy":op.path.contains("teacher/")?"Response_getTeacherAiPolicy":"Response_getAiPolicy":op.path.endsWith("tutoring-sessions")?"Response_listTutoringSessions":op.path.endsWith("tutoring/sessions")?"Response_createTutoringSession":op.path.endsWith("messages")?op.method.equals("POST")?"Response_sendTutoringMessage":"Response_listTutoringMessages":"Response_getTutoringRequest";TutoringSchemaAssertions.response(schema,result.getResponse().getContentAsString());}
 @ParameterizedTest @MethodSource("ops") void requiresAuthentication(Op op)throws Exception{mvc.perform(build(op,false,false)).andExpect(status().is(op.write()?403:401));verifyNoInteractions(service);}
 @ParameterizedTest @MethodSource("writes") void requiresCsrf(Op op)throws Exception{mvc.perform(build(op,true,false)).andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("CSRF_INVALID"));verifyNoInteractions(service);}
 @ParameterizedTest @MethodSource("writes") void rejectsExternalOrigin(Op op)throws Exception{mvc.perform(build(op,true,true).with(r->{r.removeHeader("Origin");r.addHeader("Origin","https://external.invalid");return r;})).andExpect(status().isForbidden());verifyNoInteractions(service);}
 @Test void pendingRequestCarriesRecoverableId()throws Exception{when(service.send(any(),eq(ID),anyMap())).thenThrow(new BusinessException(HttpStatus.CONFLICT,"AI_REQUEST_IN_PROGRESS","已有任务",Map.of("pendingRequestId",ID)));var op=writes().filter(o->o.path.endsWith("messages")).findFirst().orElseThrow();mvc.perform(build(op,true,true)).andExpect(status().isConflict()).andExpect(jsonPath("$.error.details.pendingRequestId").value(ID));}
 @Test void terminalFailureContainsNoAnswer()throws Exception{when(service.request(any(),eq(ID))).thenReturn(map("id",ID,"sessionId",ID,"status","failed","result",null,"error",Map.of("code","PROVIDER_UNAVAILABLE","message","未启用供应商"),"createdAt",NOW,"completedAt",NOW));var op=ops().filter(o->o.path.contains("requests/")).findFirst().orElseThrow();var result=mvc.perform(build(op,true,false)).andExpect(status().isOk()).andExpect(jsonPath("$.data.result").isEmpty()).andExpect(jsonPath("$.data.error.code").value("PROVIDER_UNAVAILABLE")).andReturn();TutoringSchemaAssertions.response("Response_getTutoringRequest",result.getResponse().getContentAsString());}
}
