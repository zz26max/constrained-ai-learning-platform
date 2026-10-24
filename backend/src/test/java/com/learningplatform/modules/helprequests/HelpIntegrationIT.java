package com.learningplatform.modules.helprequests;
import com.learningplatform.modules.courses.service.*;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.HashSet;
import java.util.UUID;

import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.auth.model.SessionGrant;
import com.learningplatform.modules.auth.service.DatabaseSessionService;
import com.learningplatform.modules.auth.security.CsrfTokenService;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import jakarta.servlet.http.Cookie;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import com.learningplatform.modules.courses.dto.AssignmentDTOs.*;
import com.learningplatform.modules.courses.dto.CourseDTOs.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mysql.MySQLContainer;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 求助授权、分享、保留期限、通知事务与真实 HTTP 字段契约。 */
@SpringBootTest(properties = {"AI_WORKER_ENABLED=false", "AUTH_INVITE_SIGNING_KEY=test-only-invite-signing-key-at-least-32-characters"})
@Testcontainers
@AutoConfigureMockMvc
@Import(HelpIntegrationIT.FixedClockConfiguration.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class HelpIntegrationIT {
    private static final Instant NOW = Instant.parse("2026-10-15T08:00:00.123456Z");
    private static final String COURSE = "00000000-0000-4000-8000-0000000000c1";
    private static final String TERM = "00000000-0000-4000-8000-0000000000c2";
    private static final UserDTO TEACHER = user("c3", "ns.teacher", "teacher");
    private static final UserDTO STUDENT = user("c4", "ns.student", "student");
    private static final UserDTO OTHER_STUDENT = user("c5", "ns.other", "student");
    private static final UserDTO OUTSIDER = user("c6", "ns.outsider", "student");
    private static final UserDTO OTHER_TEACHER = user("c7", "ns.teacher2", "teacher");
    private static final JsonMapper JSON = JsonMapper.builder().findAndAddModules().build();

    @Container
    static final MySQLContainer mysql = new MySQLContainer("mysql:8.4.11")
            .withDatabaseName("learning_platform_notice_stats_test")
            .withUsername("ns_test").withPassword(UUID.randomUUID().toString())
            .withCommand("--character-set-server=utf8mb4", "--collation-server=utf8mb4_0900_ai_ci",
                    "--default-time-zone=+00:00", "--transaction-isolation=READ-COMMITTED");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", mysql::getJdbcUrl);
        r.add("spring.datasource.username", mysql::getUsername);
        r.add("spring.datasource.password", mysql::getPassword);
    }

    @Autowired private CourseService courseService;
    @Autowired private AssignmentService assignmentService;
    @Autowired private HelpService help;
    @Autowired private MockMvc mvc;
    @Autowired private DatabaseSessionService sessions;
    @Autowired private PasswordEncoder passwords;
    @Autowired private CsrfTokenService csrf;
    
    @Autowired private JdbcTemplate jdbc;

    @BeforeEach
    void reset() {
        for (String table : List.of("knowledge_evidence", "feedback_knowledge_evaluations", "feedback_issue_tags", "submission_knowledge_snapshot", "learning_events", "notifications", "help_replies", "help_requests", "tutoring_messages", "tutoring_requests", "tutoring_sessions", "notices", "feedback_rubric_scores", "feedback",
                "submission_rubric_snapshot", "submission_requirements_snapshot", "submission_files", "submissions",
                "workspace_files", "workspaces", "assignment_knowledge_points", "assignment_initial_files",
                "assignment_rubric_criteria", "assignment_requirements", "assignments", "chapter_progress")) {
            jdbc.update("DELETE FROM " + table);
        }
        jdbc.update("UPDATE offering_members SET last_chapter_id=NULL");
        for (String table : List.of("resources", "knowledge_points", "chapters", "course_invites", "offering_members",
                "course_offerings", "courses", "terms", "audit_logs", "auth_sessions", "users")) {
            jdbc.update("DELETE FROM " + table);
        }
        for (UserDTO u : List.of(TEACHER, STUDENT, OTHER_STUDENT, OUTSIDER, OTHER_TEACHER)) {
            jdbc.update("INSERT INTO users(id,username,display_name,password_hash,roles,status,created_at,updated_at) VALUES(?,?,?,?,CAST(? AS JSON),'active',?,?)",
                    u.id(), u.username(), u.displayName(), "TEST_ONLY_NOT_A_REAL_HASH", JSON.writeValueAsString(u.roles()), ts(NOW), ts(NOW));
        }
        jdbc.update("INSERT INTO terms(id,label,starts_at,ends_at,is_current,created_at,updated_at) VALUES(?,?,?,?,1,?,?)",
                TERM, "当前学期", ts(NOW.minus(Duration.ofDays(30))), ts(NOW.plus(Duration.ofDays(100))), ts(NOW), ts(NOW));
        jdbc.update("INSERT INTO courses(id,code,mark,title,description,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,'active',?,?,?)",
                COURSE, "ns-course", "NSC", "公告统计测试课程", "测试", TEACHER.id(), ts(NOW), ts(NOW));
    }


    private static final Set<String> REQUEST_FIELDS=Set.of("id","offeringId","assignmentId","title","content","studentAttempt","workspaceRevision","sharedTutoringRequestIds","issueTags","status","createdAt","updatedAt");

    @Test void defaultIssueTagsAndRealHttpResponsesMatchContract() throws Exception {
        var offering=createOffering();enrollStudent(offering.id(),STUDENT);
        String assignment=publishAssignment(offering.id(),"盒模型任务").id();
        assertThat(jdbc.queryForObject("SELECT issue_tags_config FROM course_offerings WHERE id=?",String.class,offering.id())).isNull();
        SessionGrant student=login(STUDENT),teacher=login(TEACHER);
        var tags=http(HttpMethod.GET,"/api/v1/offerings/"+offering.id()+"/issue-tags",student,null,200);
        assertThat(tags.keySet()).containsExactlyInAnyOrder("version","items");
        @SuppressWarnings("unchecked") var items=(List<Map<String,Object>>)tags.get("items");
        String tag=items.stream().map(v->(String)v.get("tag")).filter("box_model"::equals).findFirst().orElseThrow();
        var body=request(assignment);body.put("issueTags",List.of(tag));
        var created=http(HttpMethod.POST,"/api/v1/me/help-requests",student,body,201);
        assertThat(created.keySet()).containsExactlyInAnyOrderElementsOf(REQUEST_FIELDS);
        assertThat(created.get("issueTags")).isEqualTo(List.of("box_model"));
        assertThat(created.get("workspaceRevision")).isNull();
        assertThat(created.get("sharedTutoringRequestIds")).isEqualTo(List.of());
        String id=(String)created.get("id");
        assertThat(jdbc.queryForObject("SELECT issue_tag_version FROM help_requests WHERE id=?",Integer.class,id)).isEqualTo(((Number)tags.get("version")).intValue());
        var detail=http(HttpMethod.GET,"/api/v1/me/help-requests/"+id,student,null,200);
        var detailFields=new HashSet<>(REQUEST_FIELDS);detailFields.addAll(Set.of("sharedSnapshot","sharedTutoringResults","replies"));
        assertThat(detail.keySet()).containsExactlyInAnyOrderElementsOf(detailFields);
        assertThat(detail.get("sharedSnapshot")).isNull();assertThat(detail.get("sharedTutoringResults")).isEqualTo(List.of());assertThat(detail.get("replies")).isEqualTo(List.of());
        var teacherDetail=http(HttpMethod.GET,"/api/v1/teacher/help-requests/"+id,teacher,null,200);
        detailFields.add("student");assertThat(teacherDetail.keySet()).containsExactlyInAnyOrderElementsOf(detailFields);
        assertThat(((Map<?,?>)teacherDetail.get("student")).keySet()).isEqualTo(Set.of("id","username","displayName"));
        var replied=http(HttpMethod.POST,"/api/v1/teacher/help-requests/"+id+"/replies",teacher,Map.of("content","检查box-sizing"),201);
        // HelpReplyCreatedDTO includes status; historical HelpReplyDTO does not.
        assertThat(replied.keySet()).containsExactlyInAnyOrder("id","content","teacher","createdAt","status");
        assertThat(replied.get("status")).isEqualTo("answered");
        assertThat(((Map<?,?>)replied.get("teacher")).keySet()).isEqualTo(Set.of("id","displayName"));
        var afterReply=http(HttpMethod.GET,"/api/v1/me/help-requests/"+id,student,null,200);
        @SuppressWarnings("unchecked") var replies=(List<Map<String,Object>>)afterReply.get("replies");
        assertThat(replies).hasSize(1);assertThat(replies.getFirst().keySet()).containsExactlyInAnyOrder("id","content","teacher","createdAt");
        var closed=http(HttpMethod.PUT,"/api/v1/teacher/help-requests/"+id+"/status",teacher,Map.of("status","closed"),200);
        assertThat(closed.keySet()).containsExactlyInAnyOrder("id","status","updatedAt");assertThat(closed.get("status")).isEqualTo("closed");
        assertThat(http(HttpMethod.PUT,"/api/v1/teacher/help-requests/"+id+"/status",teacher,Map.of("status","closed"),200)).isEqualTo(closed);
        String untagged=(String)help.create(STUDENT,request(assignment)).get("id");
        assertThat(jdbc.queryForObject("SELECT issue_tag_version FROM help_requests WHERE id=?",Integer.class,untagged)).isNull();
    }

    private SessionGrant login(UserDTO user) {
        String password="help-http-test-only-password";
        jdbc.update("UPDATE users SET password_hash=? WHERE id=?",passwords.encode(password),user.id());
        return sessions.login(user.username(),password,null,"help-http-login");
    }

    @SuppressWarnings("unchecked")
    private Map<String,Object> http(HttpMethod method,String path,SessionGrant grant,Map<String,Object> body,int expected) throws Exception {
        MockHttpServletRequestBuilder builder=MockMvcRequestBuilders.request(method,path).cookie(new Cookie("lp_session",grant.token())).accept(MediaType.APPLICATION_JSON);
        if(body!=null) builder.contentType(MediaType.APPLICATION_JSON).header("Origin","http://127.0.0.1:4173")
                .header("X-CSRF-Token",csrf.sessionToken(grant.token(),grant.csrfSecret())).content(JSON.writeValueAsString(body));
        String raw=mvc.perform(builder).andExpect(status().is(expected)).andReturn().getResponse().getContentAsString();
        Map<String,Object> envelope=JSON.readValue(raw,Map.class);
        assertThat(envelope.keySet()).containsExactlyInAnyOrder("data","requestId");
        return (Map<String,Object>)envelope.get("data");
    }

    private Map<String,Object> request(String aid) {return new HashMap<>(Map.of("assignmentId",aid,"title","布局问题","content","无法对齐","studentAttempt","调整过flex"));}
    @Test void createReplyCloseAndAuthorization() {
      var o=createOffering();enrollStudent(o.id(),STUDENT);enrollStudent(o.id(),OTHER_STUDENT);String aid=publishAssignment(o.id(),"任务").id();
      var created=help.create(STUDENT,request(aid));String id=(String)created.get("id");
      assertThat(created.get("status")).isEqualTo("open");assertThat(help.list(STUDENT,null,null,1,20,false).get("total")).isEqualTo(1L);
      assertThat(help.detail(STUDENT,id,false)).containsKeys("sharedSnapshot","sharedTutoringResults","replies");
      assertThat(help.detail(TEACHER,id,true)).containsKey("student");
      assertThatThrownBy(()->help.detail(OTHER_STUDENT,id,false)).satisfies(t->assertCode(t,404,"NOT_FOUND"));
      assertThatThrownBy(()->help.detail(OTHER_TEACHER,id,true)).satisfies(t->assertCode(t,404,"NOT_FOUND"));
      var reply=help.reply(TEACHER,id,Map.of("content","检查父元素"));assertThat(reply.get("status")).isEqualTo("answered");assertThat((List<?>)help.detail(STUDENT,id,false).get("replies")).hasSize(1);
      assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notifications WHERE type='help_reply' AND target_id=?",Integer.class,id)).isEqualTo(1);
      assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM learning_events WHERE type='help_request_created'",Integer.class)).isEqualTo(1);
      var closed=help.close(TEACHER,id,Map.of("status","closed"));assertThat(help.close(TEACHER,id,Map.of("status","closed"))).isEqualTo(closed);
      assertThatThrownBy(()->help.reply(TEACHER,id,Map.of("content","再回复"))).satisfies(t->assertCode(t,409,"HELP_REQUEST_CLOSED"));
    }
    @Test void snapshotFrozenAndExpiresIndependently() {
      var o=createOffering();enrollStudent(o.id(),STUDENT);String aid=publishAssignment(o.id(),"任务").id();saveAndSubmit(STUDENT,aid);
      var body=request(aid);body.put("workspaceRevision",1);String id=(String)help.create(STUDENT,body).get("id");
      assignmentService.saveWorkspace(STUDENT,aid,Map.of("baseRevision",1,"files",List.of(Map.of("path","answer.md","content","V2")),"activeFile","answer.md"),"save2");
      var snapshot=(Map<?,?>)help.detail(STUDENT,id,false).get("sharedSnapshot");assertThat(snapshot.get("files").toString()).contains("V1").doesNotContain("V2");
      assertThatThrownBy(()->help.create(STUDENT,body)).satisfies(t->assertCode(t,409,"WORKSPACE_CONFLICT"));
      jdbc.update("UPDATE help_requests SET shared_snapshot_expires_at=? WHERE id=?",ts(NOW.minusSeconds(1)),id);
      snapshot=(Map<?,?>)help.detail(TEACHER,id,true).get("sharedSnapshot");assertThat(snapshot.get("files")).isNull();assertThat(snapshot.get("contentUnavailableReason")).isEqualTo("retention_expired");
      help.purgeExpiredSnapshots();assertThat(jdbc.queryForObject("SELECT shared_snapshot IS NULL FROM help_requests WHERE id=?",Boolean.class,id)).isTrue();
      assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM submission_files",Integer.class)).isEqualTo(1);
    }
    @Test void tagsAndArchiveAndNotificationRollback() {
      var o=createOffering();enrollStudent(o.id(),STUDENT);String aid=publishAssignment(o.id(),"任务").id();var body=request(aid);body.put("issueTags",List.of("unknown"));
      assertThatThrownBy(()->help.create(STUDENT,body)).satisfies(t->assertCode(t,422,"VALIDATION_ERROR"));body.remove("issueTags");
      String id=(String)help.create(STUDENT,body).get("id");
      jdbc.execute("ALTER TABLE notifications ADD CONSTRAINT ck_test_help_notification CHECK(type!='help_reply')");
      try {assertThatThrownBy(()->help.reply(TEACHER,id,Map.of("content","建议"))).isInstanceOf(RuntimeException.class);} finally {jdbc.execute("ALTER TABLE notifications DROP CHECK ck_test_help_notification");}
      assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM help_replies",Integer.class)).isZero();assertThat(help.detail(STUDENT,id,false).get("status")).isEqualTo("open");
      jdbc.update("UPDATE course_offerings SET status='archived' WHERE id=?",o.id());
      assertThat(help.detail(TEACHER,id,true)).isNotEmpty();
      assertThatThrownBy(()->help.create(STUDENT,body)).satisfies(t->assertCode(t,409,"OFFERING_ARCHIVED"));
      assertThatThrownBy(()->help.reply(TEACHER,id,Map.of("content","建议"))).satisfies(t->assertCode(t,409,"OFFERING_ARCHIVED"));
    }

    @Test void aiSharingOnlyAllowsOwnedDeliveredRequestsAndKeepsOriginalExpiry() {
      var o=createOffering();enrollStudent(o.id(),STUDENT);enrollStudent(o.id(),OTHER_STUDENT);String aid=publishAssignment(o.id(),"任务").id();
      String accepted=ai(aid,STUDENT,"completed"),other=ai(aid,OTHER_STUDENT,"completed"),pending=ai(aid,STUDENT,"queued");
      var body=request(aid);body.put("sharedTutoringRequestIds",List.of(other));assertThatThrownBy(()->help.create(STUDENT,body)).satisfies(t->assertCode(t,422,"VALIDATION_ERROR"));
      body.put("sharedTutoringRequestIds",List.of(pending));assertThatThrownBy(()->help.create(STUDENT,body)).satisfies(t->assertCode(t,422,"VALIDATION_ERROR"));
      body.put("sharedTutoringRequestIds",List.of(accepted));String id=(String)help.create(STUDENT,body).get("id");
      assertThat(help.detail(TEACHER,id,true).get("sharedTutoringResults").toString()).contains("审核提示");
      jdbc.update("UPDATE tutoring_requests SET content_expires_at=? WHERE id=?",ts(NOW),accepted);
      assertThat(help.detail(TEACHER,id,true).get("sharedTutoringResults").toString()).contains("retention_expired").doesNotContain("审核提示");
      assertThatThrownBy(()->help.create(STUDENT,body)).satisfies(t->assertCode(t,422,"VALIDATION_ERROR"));
    }
    private String ai(String aid,UserDTO student,String status){String sid=UUID.randomUUID().toString(),rid=UUID.randomUUID().toString();
      jdbc.update("INSERT INTO tutoring_sessions(id,assignment_id,student_id,created_at,updated_at) VALUES(?,?,?,?,?)",sid,aid,student.id(),ts(NOW),ts(NOW));
      jdbc.update("INSERT INTO tutoring_requests(id,session_id,student_id,assignment_id,action,hint_level,status,result,content_expires_at,created_at,updated_at) VALUES(?,?,?,?,'ask',1,?,CAST(? AS JSON),?,?,?)",rid,sid,student.id(),aid,status,"{\"content\":\"审核提示\"}",ts(NOW.plus(Duration.ofDays(90))),ts(NOW),ts(NOW));return rid;
    }

    private int offeringSeq = 0;

    private OfferingDTO createOffering() {
        return courseService.createOffering(TEACHER, Map.of("courseId", COURSE, "termId", TERM,
                "title", "公告统计班" + (++offeringSeq), "groupName", "一班", "progressUnit", "chapter"), "offering");
    }

    private void enrollStudent(String offeringId, UserDTO student) {
        InviteCreatedDTO invite = courseService.createInvite(TEACHER, offeringId,
                Map.of("expiresAt", NOW.plusSeconds(3600).toString(), "maxUses", 10), "invite");
        courseService.enroll(student, Map.of("inviteCode", invite.inviteCode()), "enroll");
    }

    private static Map<String, Object> body(String title, String content) {
        Map<String, Object> m = new HashMap<>();
        m.put("title", title);
        m.put("content", content);
        return m;
    }

    private TeacherAssignmentDTO publishAssignment(String offeringId, String title) {
        return assignmentService.publishAssignment(TEACHER, createDraft(offeringId, title, "text").id(), "publish");
    }

    private TeacherAssignmentDTO publishLab(String offeringId, String title) {
        return assignmentService.publishAssignment(TEACHER, createDraft(offeringId, title, "web_lab").id(), "publish");
    }

    private TeacherAssignmentDTO createDraft(String offeringId, String title) {
        return createDraft(offeringId, title, "text");
    }

    private TeacherAssignmentDTO createDraft(String offeringId, String title, String type) {
        Map<String, Object> body = new HashMap<>();
        body.put("chapterId", null);
        body.put("title", title);
        body.put("description", title + "说明");
        body.put("estimatedMinutes", 30);
        body.put("type", type);
        body.put("isRequired", true);
        body.put("dueAt", NOW.plus(Duration.ofDays(3)).toString());
        body.put("lateUntil", NOW.plus(Duration.ofDays(6)).toString());
        body.put("allowResubmit", true);
        body.put("maxAttempts", 3);
        body.put("maxScore", new BigDecimal("100.00"));
        body.put("requirements", List.of("完成"));
        body.put("rubric", List.of(
                Map.of("criterionId", "layout", "title", "布局", "description", "布局", "maxScore", new BigDecimal("60.00")),
                Map.of("criterionId", "quality", "title", "质量", "description", "质量", "maxScore", new BigDecimal("40.00"))));
        body.put("initialFiles", List.of(Map.of("path", "web_lab".equals(type) ? "index.html" : "answer.md", "content", "初始内容")));
        body.put("knowledgePointIds", List.of());
        return assignmentService.createAssignment(TEACHER, offeringId, body, "create");
    }

    /** 学生保存并提交；文件路径按作业类型选择。 */
    private String saveAndSubmit(UserDTO student, String assignmentId) {
        String type = jdbc.queryForObject("SELECT type FROM assignments WHERE id=?", String.class, assignmentId);
        String path = "web_lab".equals(type) ? "index.html" : "answer.md";
        Map<String, Object> save = new HashMap<>();
        save.put("baseRevision", 0);
        save.put("files", List.of(Map.of("path", path, "content", "V1")));
        save.put("activeFile", path);
        assignmentService.saveWorkspace(student, assignmentId, save, "save");
        return assignmentService.submitAssignment(student, assignmentId,
                new HashMap<>(Map.of("workspaceRevision", 1, "reflection", "完成")), "submit").submission().id();
    }

    private static void assertCode(Throwable t, int status, String code) {
        assertThat(t).isInstanceOfSatisfying(BusinessException.class, e -> {
            assertThat(e.getCode()).isEqualTo(code);
            assertThat(e.getStatus().value()).isEqualTo(status);
        });
    }

    /** 422 VALIDATION_ERROR 且 details.fields 含指定字段。 */
    private static void assertField(Throwable t, String field) {
        assertCode(t, 422, "VALIDATION_ERROR");
        assertThat(t.toString() + ((BusinessException) t).getDetails()).contains(field);
    }

    private static java.sql.Timestamp ts(Instant i) { return java.sql.Timestamp.from(i); }

    private static UserDTO user(String suffix, String username, String role) {
        return new UserDTO("00000000-0000-4000-8000-0000000000" + suffix, username, "公告测试用户", List.of(role));
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FixedClockConfiguration {
        @Bean @Primary Clock clock() { return Clock.fixed(NOW, ZoneOffset.UTC); }
    }
}
