package com.learningplatform.common.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;

import com.learningplatform.LearningPlatformApplication;
import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.auth.model.SessionIdentity;
import com.learningplatform.modules.auth.security.CsrfTokenService;
import com.learningplatform.modules.auth.service.DatabaseSessionService;
import com.learningplatform.modules.courses.dto.AssignmentDTOs.*;
import com.learningplatform.modules.courses.dto.CourseDTOs;
import com.learningplatform.modules.helprequests.HelpService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** P1-D 学生聚合：getDashboard / getMyLearningRecords / markMessagesAsRead 的 HTTP 契约测试。 */
@SpringBootTest(classes = LearningPlatformApplication.class, properties = {
        "spring.flyway.enabled=false", "spring.sql.init.mode=never",
        "DB_URL=jdbc:mysql://127.0.0.1:1/unused", "DB_USERNAME=unused", "DB_PASSWORD=unused",
        "auth.http.pre-login-signing-key=test-signing-key",
        "auth.http.allowed-origins=http://127.0.0.1:4173",
        "AUTH_INVITE_SIGNING_KEY=test-only-invite-signing-key-at-least-32-characters"
})
@AutoConfigureMockMvc
class HelpHttpContractTest {

    private static final String ID = "00000000-0000-4000-8000-000000000091";
    private static final String OFFERING = "00000000-0000-4000-8000-000000000092";
    private static final String CHAPTER = "00000000-0000-4000-8000-000000000093";
    private static final String TERM = "00000000-0000-4000-8000-000000000094";
    private static final String TEACHER_ID = "00000000-0000-4000-8000-000000000096";
    private static final String ORIGIN = "http://127.0.0.1:4173";
    private static final String STUDENT_TOKEN = "s".repeat(64);
    private static final String TEACHER_TOKEN = "t".repeat(64);
    private static final String SECRET = "x".repeat(64);
    private static final String REQUEST_ID = "req-p1d-dashboard-test";
    private static final Instant FUTURE = Instant.parse("2099-01-01T00:00:00Z");
    private static final Instant T = Instant.parse("2026-10-14T00:00:00Z");

    @Autowired private MockMvc mvc;
    @Autowired private CsrfTokenService csrf;
    @MockitoBean private DataSource dataSource;
    @MockitoBean private DatabaseSessionService sessions;
    @MockitoBean private HelpService service;


 @BeforeEach void arrange(){when(sessions.resolve(STUDENT_TOKEN)).thenReturn(identity("student"));when(sessions.resolve(TEACHER_TOKEN)).thenReturn(identity("teacher"));
 when(service.create(any(),anyMap())).thenReturn(Map.of("id",ID,"status","open"));when(service.list(any(),nullable(String.class),nullable(String.class),anyInt(),anyInt(),anyBoolean())).thenReturn(Map.of("items",List.of(),"page",1,"pageSize",20,"total",0));when(service.detail(any(),anyString(),anyBoolean())).thenReturn(Map.of("id",ID));when(service.reply(any(),anyString(),anyMap())).thenReturn(Map.of("id",ID,"status","answered"));when(service.close(any(),anyString(),anyMap())).thenReturn(Map.of("id",ID,"status","closed"));}
 @Test void sevenRoutesUseSessionAndEnvelope() throws Exception {
  mvc.perform(read("/api/v1/me/help-requests",STUDENT_TOKEN)).andExpect(status().isOk()).andExpect(jsonPath("$.data.items").isArray());
  mvc.perform(read("/api/v1/me/help-requests/"+ID,STUDENT_TOKEN)).andExpect(status().isOk());
  mvc.perform(read("/api/v1/teacher/offerings/"+OFFERING+"/help-requests",TEACHER_TOKEN)).andExpect(status().isOk());
  mvc.perform(read("/api/v1/teacher/help-requests/"+ID,TEACHER_TOKEN)).andExpect(status().isOk());
  mvc.perform(write(HttpMethod.POST,"/api/v1/me/help-requests",STUDENT_TOKEN,true)).andExpect(status().isCreated()).andExpect(jsonPath("$.data.status").value("open"));
  mvc.perform(write(HttpMethod.POST,"/api/v1/teacher/help-requests/"+ID+"/replies",TEACHER_TOKEN,true)).andExpect(status().isCreated());
  mvc.perform(write(HttpMethod.PUT,"/api/v1/teacher/help-requests/"+ID+"/status",TEACHER_TOKEN,true)).andExpect(status().isOk());
 }
 @Test void csrfAndAnonymousRequestsRejected() throws Exception {
  mvc.perform(write(HttpMethod.POST,"/api/v1/me/help-requests",STUDENT_TOKEN,false)).andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("CSRF_INVALID"));
  mvc.perform(write(HttpMethod.POST,"/api/v1/teacher/help-requests/"+ID+"/replies",TEACHER_TOKEN,false)).andExpect(status().isForbidden());
  mvc.perform(write(HttpMethod.PUT,"/api/v1/teacher/help-requests/"+ID+"/status",TEACHER_TOKEN,false)).andExpect(status().isForbidden());
  mvc.perform(request(HttpMethod.GET,"/api/v1/me/help-requests").accept(MediaType.APPLICATION_JSON)).andExpect(status().isUnauthorized());
 }
 private MockHttpServletRequestBuilder read(String path,String token){return request(HttpMethod.GET,path).cookie(new Cookie("lp_session",token)).accept(MediaType.APPLICATION_JSON);}
 private MockHttpServletRequestBuilder write(HttpMethod method,String path,String token,boolean valid){var r=request(method,path).cookie(new Cookie("lp_session",token)).header("Origin",ORIGIN).accept(MediaType.APPLICATION_JSON).contentType(MediaType.APPLICATION_JSON).content("{}");if(valid)r.header("X-CSRF-Token",csrf.sessionToken(token,SECRET));return r;}
 private SessionIdentity identity(String role){return new SessionIdentity(role.equals("student")?STUDENT_TOKEN:TEACHER_TOKEN,new UserDTO(ID,role+".test","测试",List.of(role)),SECRET,FUTURE,FUTURE);}
}
