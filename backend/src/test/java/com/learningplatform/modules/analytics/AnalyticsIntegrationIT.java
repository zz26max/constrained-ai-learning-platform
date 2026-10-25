package com.learningplatform.modules.analytics;
import com.learningplatform.modules.analytics.service.*;
import com.learningplatform.modules.analytics.mapper.KnowledgeMapper;
import com.learningplatform.modules.courses.service.*;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.auth.dto.UserDTO;
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

/** Real MySQL tests for event ingestion, published evidence, learning queries and HTTP boundaries. */
@SpringBootTest(properties = {"AI_WORKER_ENABLED=false", "AUTH_INVITE_SIGNING_KEY=test-only-invite-signing-key-at-least-32-characters"})
@Testcontainers
@org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
@Import(AnalyticsIntegrationIT.FixedClockConfiguration.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class AnalyticsIntegrationIT {
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
    @Autowired private LearningEventService events;
    @Autowired private KnowledgeService knowledge;
    @Autowired private DashboardService dashboard;
    @Autowired private TeacherStatsService stats;
    @Autowired private org.springframework.test.web.servlet.MockMvc mvc;
    @Autowired private com.learningplatform.modules.auth.service.DatabaseSessionService sessions;
    @Autowired private org.springframework.security.crypto.password.PasswordEncoder passwords;
    @Autowired private com.learningplatform.modules.auth.security.CsrfTokenService csrf;
    
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
                TERM, "fixture", ts(NOW.minus(Duration.ofDays(30))), ts(NOW.plus(Duration.ofDays(100))), ts(NOW), ts(NOW));
        jdbc.update("INSERT INTO courses(id,code,mark,title,description,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,'active',?,?,?)",
                COURSE, "ns-course", "NSC", "fixture", "fixture", TEACHER.id(), ts(NOW), ts(NOW));
    }



    private Map<String,Object> event(String offering,String assignment) {
        return new HashMap<>(Map.of("eventId",UUID.randomUUID().toString(),"sessionId",UUID.randomUUID().toString(),"occurredAt",NOW.toString(),"offeringId",offering,"assignmentId",assignment,"type","editor_opened","payload",Map.of("activeFile","answer.md")));
    }
    @Test void clientDedupConflictAndBatchRollback() {
        var o=createOffering();enrollStudent(o.id(),STUDENT);var a=publishAssignment(o.id(),"fixture");
        var e=event(o.id(),a.id());var body=Map.<String,Object>of("events",List.of(e,e));
        assertThat(events.record(STUDENT,body)).containsEntry("acceptedCount",1).containsEntry("duplicateCount",1);
        var changed=new HashMap<>(e);changed.put("sessionId",UUID.randomUUID().toString());
        assertThatThrownBy(()->events.record(STUDENT,Map.of("events",List.of(event(o.id(),a.id()),changed)))).satisfies(t->assertCode(t,409,"EVENT_CONFLICT"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM learning_events WHERE source='client'",Integer.class)).isEqualTo(1);
    }
    @Test void clientRejectsForeignObjectsUnknownPayloadAndSkew() {
        var o=createOffering();enrollStudent(o.id(),STUDENT);var a=publishAssignment(o.id(),"fixture");
        var e=event(o.id(),a.id());e.put("payload",Map.of("activeFile","answer.md","score",100));
        assertThatThrownBy(()->events.record(STUDENT,Map.of("events",List.of(e)))).isInstanceOf(BusinessException.class);
        e.put("payload",Map.of("activeFile","answer.md"));e.put("occurredAt",NOW.minus(Duration.ofHours(25)).toString());
        assertThatThrownBy(()->events.record(STUDENT,Map.of("events",List.of(e)))).satisfies(t->assertCode(t,422,"VALIDATION_ERROR"));
        e.put("occurredAt",NOW.toString());
        assertThatThrownBy(()->events.record(OUTSIDER,Map.of("events",List.of(e)))).satisfies(t->assertCode(t,404,"NOT_FOUND"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM learning_events WHERE source='client'",Integer.class)).isZero();
    }
    private String knowledgePoint(String offering) {
        String id=UUID.randomUUID().toString();jdbc.update("INSERT INTO knowledge_points(id,offering_id,chapter_id,title,description,position,created_at,updated_at) VALUES(?,?,NULL,'fixture','fixture',1,?,?)",id,offering,ts(NOW),ts(NOW));return id;
    }
    private String submission(String offering,String kp) {
        var draft=createDraft(offering,"fixture");jdbc.update("INSERT INTO assignment_knowledge_points VALUES(?,?,?)",draft.id(),offering,kp);
        assignmentService.publishAssignment(TEACHER,draft.id(),"publish");return saveAndSubmit(STUDENT,draft.id());
    }
    private Map<String,Object> feedback(String kp,String result) {
        return new HashMap<>(Map.of("baseVersion",0,"score",100,"rubricResults",List.of(Map.of("criterionId","layout","score",60,"comment","fixture"),Map.of("criterionId","quality","score",40,"comment","fixture")),"comment","fixture","knowledgeEvaluations",List.of(Map.of("knowledgePointId",kp,"result",result,"note","fixture")),"issueTags",List.of("box_model")));
    }
    @Test void publishedEvidenceIsAtomicAndReplayDoesNotDuplicate() {
        var o=createOffering();enrollStudent(o.id(),STUDENT);String kp=knowledgePoint(o.id()),sid=submission(o.id(),kp);
        var saved=assignmentService.saveFeedback(TEACHER,sid,feedback(kp,"needs_practice"),"save");
        assertThat(knowledge.analyze(STUDENT.id(),o.id()).needsPracticeCount()).isZero();
        assertThat(assignmentService.getFeedbackDraft(TEACHER,sid).feedback().issueTags()).containsExactly("box_model");
        assignmentService.publishFeedback(TEACHER,sid,Map.of("baseVersion",saved.feedback().version()),"publish");
        assignmentService.publishFeedback(TEACHER,sid,Map.of("baseVersion",saved.feedback().version()),"retry");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM knowledge_evidence",Integer.class)).isEqualTo(1);
        assertThat(knowledge.analyze(STUDENT.id(),o.id()).needsPracticeCount()).isEqualTo(1);
        assertThat(dashboard.getLearningRecords(STUDENT,o.id()).summary().needsPracticeCount()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM learning_events WHERE type='feedback_published'",Integer.class)).isEqualTo(1);
    }
    @Test void badKnowledgeAndTagsRollbackWholeDraft() {
        var o=createOffering();enrollStudent(o.id(),STUDENT);String kp=knowledgePoint(o.id()),sid=submission(o.id(),kp);
        var body=feedback(UUID.randomUUID().toString(),"meets_expectation");
        assertThatThrownBy(()->assignmentService.saveFeedback(TEACHER,sid,body,"bad")).isInstanceOf(BusinessException.class);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM feedback",Integer.class)).isZero();
        var invalid=feedback(kp,"meets_expectation");invalid.put("issueTags",List.of("unknown"));
        assertThatThrownBy(()->assignmentService.saveFeedback(TEACHER,sid,invalid,"bad")).isInstanceOf(BusinessException.class);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM feedback",Integer.class)).isZero();
    }
    @Test void knowledgeSnapshotAndTwoIndependentTeacherResults() {
        var o=createOffering();enrollStudent(o.id(),STUDENT);String kp=knowledgePoint(o.id());
        for(int i=0;i<2;i++) {String sid=submission(o.id(),kp);var save=assignmentService.saveFeedback(TEACHER,sid,feedback(kp,"meets_expectation"),"save");assignmentService.publishFeedback(TEACHER,sid,Map.of("baseVersion",save.feedback().version()),"publish");}
        var analysis=knowledge.analyze(STUDENT.id(),o.id());assertThat(analysis.assessments().toString()).contains("basically_mastered");
        jdbc.update("UPDATE knowledge_points SET title='renamed',description='changed description' WHERE id=?",kp);
        assertThat(jdbc.queryForList("SELECT title FROM submission_knowledge_snapshot",String.class)).containsOnly("fixture");
        String first=jdbc.queryForList("SELECT id FROM submissions ORDER BY id",String.class).get(0);
        var detail=(SubmissionDetailDTO)assignmentService.getSubmission(STUDENT,first);
        assertThat(detail.assignmentSnapshot().knowledgePoints().get(0).title()).isEqualTo("fixture");
        assertThat(detail.assignmentSnapshot().knowledgePoints().get(0).description()).isEqualTo("fixture");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM learning_events WHERE type='assignment_submitted'",Integer.class)).isEqualTo(2);
    }
    @Test void notificationFailureRollsBackEvidenceAndPublishedState() {
        var o=createOffering();enrollStudent(o.id(),STUDENT);String kp=knowledgePoint(o.id()),sid=submission(o.id(),kp);
        var save=assignmentService.saveFeedback(TEACHER,sid,feedback(kp,"needs_practice"),"save");
        jdbc.execute("ALTER TABLE notifications ADD CONSTRAINT ck_test_publish_failure CHECK(type <> 'feedback_published')");
        try {assertThatThrownBy(()->assignmentService.publishFeedback(TEACHER,sid,Map.of("baseVersion",save.feedback().version()),"publish")).isInstanceOf(Exception.class);}
        finally {jdbc.execute("ALTER TABLE notifications DROP CONSTRAINT ck_test_publish_failure");}
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM knowledge_evidence",Integer.class)).isZero();
        assertThat(assignmentService.getFeedbackDraft(TEACHER,sid).feedback().status()).isEqualTo("draft");
    }

    @Test void realHttpEventsAndLearningRecordsRespectCsrfAndOwnership() throws Exception {
        var o=createOffering();enrollStudent(o.id(),STUDENT);var a=publishAssignment(o.id(),"HTTP task");
        String password="analytics-http-test-only-password";
        jdbc.update("UPDATE users SET password_hash=? WHERE id=?",passwords.encode(password),STUDENT.id());
        var grant=sessions.login(STUDENT.username(),password,null,"analytics-http");
        var cookie=new jakarta.servlet.http.Cookie("lp_session",grant.token());
        String body=JSON.writeValueAsString(Map.of("events",List.of(event(o.id(),a.id()))));
        var post=org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/me/learning-events").cookie(cookie).contentType("application/json").header("Origin","http://127.0.0.1:4173").content(body);
        mvc.perform(post).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isForbidden());
        var result=mvc.perform(post.header("X-CSRF-Token",csrf.sessionToken(grant.id(),grant.csrfSecret())))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk()).andReturn();
        var accepted=JSON.readTree(result.getResponse().getContentAsString());
        assertThat(accepted.path("data").propertyNames()).containsExactlyInAnyOrder("acceptedCount","duplicateCount");
        assertThat(accepted.path("data").path("acceptedCount").asInt()).isEqualTo(1);
        for(String path:List.of("/api/v1/me/learning-records?offeringId="+o.id(),"/api/v1/me/offerings/"+o.id()+"/learning-records")) {
            var response=mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(path).cookie(cookie))
                    .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk()).andReturn();
            assertThat(JSON.readTree(response.getResponse().getContentAsString()).path("data").propertyNames()).containsExactlyInAnyOrder("offeringId","summary","recentFeedback","feedbackPage","knowledgeEvidence","nextRecommendation");
        }
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/me/learning-records").cookie(cookie))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().is(422))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.error.code").value("VALIDATION_ERROR"));
        var foreign=createOffering();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/me/learning-records?offeringId="+foreign.id()).cookie(cookie))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isNotFound());
    }

    private int offeringSeq = 0;

    @Test void knowledgeFeedbackHttpWritePublishesFrozenEvidenceAndStudentView() throws Exception {
        var o=createOffering();enrollStudent(o.id(),STUDENT);
        String kp=knowledgePoint(o.id()),sid=submission(o.id(),kp);
        var teacherGrant=httpLogin(TEACHER);
        var studentGrant=httpLogin(STUDENT);
        var teacherCookie=new jakarta.servlet.http.Cookie("lp_session",teacherGrant.token());
        var studentCookie=new jakarta.servlet.http.Cookie("lp_session",studentGrant.token());
        var detail=mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/submissions/"+sid).cookie(teacherCookie))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk()).andReturn();
        assertThat(JSON.readTree(detail.getResponse().getContentAsString()).path("data").path("assignmentSnapshot").path("knowledgePoints").get(0).path("id").asText()).isEqualTo(kp);
        // A later catalog edit cannot change the submitted definition used for review.
        jdbc.update("UPDATE knowledge_points SET title='renamed after submission' WHERE id=?",kp);
        String path="/api/v1/teacher/submissions/"+sid+"/feedback";
        var write=org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(path).cookie(teacherCookie).header("Origin","http://127.0.0.1:4173").contentType("application/json").content(JSON.writeValueAsString(feedback(kp,"needs_practice")));
        mvc.perform(write).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isForbidden());
        var saved=mvc.perform(write.header("X-CSRF-Token",csrf.sessionToken(teacherGrant.id(),teacherGrant.csrfSecret())))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isCreated()).andReturn();
        var draft=JSON.readTree(saved.getResponse().getContentAsString()).path("data");
        String feedbackId=draft.path("id").asText();int version=draft.path("version").asInt();
        assertThat(draft.path("knowledgeEvaluations").get(0).path("result").asText()).isEqualTo("needs_practice");
        assertThat(draft.path("issueTags").get(0).asText()).isEqualTo("box_model");
        assertThat(draft.path("issueTagVersion").asInt()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM knowledge_evidence",Integer.class)).isZero();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/me/feedback/"+feedbackId).cookie(studentCookie))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isNotFound());
        for(int replay=0;replay<2;replay++) {
            mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(path+"/publish").cookie(teacherCookie).header("Origin","http://127.0.0.1:4173").header("X-CSRF-Token",csrf.sessionToken(teacherGrant.id(),teacherGrant.csrfSecret())).contentType("application/json").content(JSON.writeValueAsString(Map.of("baseVersion",version))))
                    .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());
        }
        var visible=mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/me/feedback/"+feedbackId).cookie(studentCookie))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk()).andReturn();
        var published=JSON.readTree(visible.getResponse().getContentAsString()).path("data");
        assertThat(published.path("knowledgeEvaluations").get(0).path("knowledgePointId").asText()).isEqualTo(kp);
        assertThat(published.path("issueTags").get(0).asText()).isEqualTo("box_model");
        assertThat(published.path("messageId").asText()).isNotBlank();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM knowledge_evidence WHERE feedback_id=?",Integer.class,feedbackId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notifications WHERE related_feedback_id=?",Integer.class,feedbackId)).isEqualTo(1);
        var record=mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/me/learning-records").param("offeringId",o.id()).cookie(studentCookie))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk()).andReturn();
        assertThat(JSON.readTree(record.getResponse().getContentAsString()).path("data").path("summary").path("needsPracticeCount").asInt()).isEqualTo(1);
        assertThat(((SubmissionDetailDTO)assignmentService.getSubmission(STUDENT,sid)).assignmentSnapshot().knowledgePoints().getFirst().title()).isEqualTo("fixture");
    }

    private com.learningplatform.modules.auth.model.SessionGrant httpLogin(UserDTO user) {
        String password="knowledge-http-test-only-password";
        jdbc.update("UPDATE users SET password_hash=? WHERE id=?",passwords.encode(password),user.id());
        return sessions.login(user.username(),password,null,"knowledge-http");
    }

    @Test void allClientEventTypesUseWhitelistedObjectsAndPayloads() {
        var o=createOffering();enrollStudent(o.id(),STUDENT);var a=publishAssignment(o.id(),"Events task");
        String chapter=UUID.randomUUID().toString(),resource=UUID.randomUUID().toString();
        jdbc.update("INSERT INTO chapters(id,offering_id,position,title,summary,status,is_required,content_version,published_at,created_at,updated_at) VALUES(?,?,1,'Chapter','Summary','published',1,1,?,?,?)",chapter,o.id(),ts(NOW),ts(NOW),ts(NOW));
        jdbc.update("INSERT INTO resources(id,offering_id,chapter_id,title,content_markdown,position,status,created_at,updated_at) VALUES(?,?,?,'Resource','Text',1,'active',?,?)",resource,o.id(),chapter,ts(NOW),ts(NOW));
        var opened=event(o.id(),a.id());opened.remove("assignmentId");opened.put("chapterId",chapter);opened.put("type","chapter_opened");opened.put("payload",Map.of());
        var material=new HashMap<>(opened);material.put("eventId",UUID.randomUUID().toString());material.put("type","resource_opened");material.put("payload",Map.of("resourceId",resource));
        var preview=event(o.id(),a.id());preview.put("type","preview_opened");preview.put("payload",Map.of("viewport","mobile"));
        assertThat(events.record(STUDENT,Map.of("events",List.of(opened,material,event(o.id(),a.id()),preview)))).containsEntry("acceptedCount",4);
        material.put("eventId",UUID.randomUUID().toString());material.put("payload",Map.of("resourceId",UUID.randomUUID().toString()));
        assertThatThrownBy(()->events.record(STUDENT,Map.of("events",List.of(material)))).satisfies(t->assertCode(t,404,"NOT_FOUND"));
    }

    @Test void staleEvidenceStillShowsTeacherFindingAndClientRetentionKeepsTrustedFacts() {
        var o=createOffering();enrollStudent(o.id(),STUDENT);String kp=knowledgePoint(o.id()),sid=submission(o.id(),kp);
        var save=assignmentService.saveFeedback(TEACHER,sid,feedback(kp,"needs_practice"),"save");
        assignmentService.publishFeedback(TEACHER,sid,Map.of("baseVersion",save.feedback().version()),"publish");
        jdbc.update("UPDATE knowledge_evidence SET occurred_at=?",ts(NOW.minus(Duration.ofDays(91))));
        assertThat(knowledge.analyze(STUDENT.id(),o.id()).assessments().toString()).contains("stale","needs_practice","knowledge-v2");
        events.record(STUDENT,Map.of("events",List.of(event(o.id(),save.feedback().assignmentId()))));
        jdbc.update("UPDATE learning_events SET received_at=? WHERE source='client'",ts(NOW.minus(Duration.ofDays(91))));
        assertThat(events.purgeExpiredClients()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM learning_events WHERE source='server'",Integer.class)).isGreaterThanOrEqualTo(3);
    }
    @Test void commonIssueUnionCountsSelfReportSeparatelyFromConfirmation() {
        var o=createOffering();enrollStudent(o.id(),STUDENT);enrollStudent(o.id(),OTHER_STUDENT);
        String kp=knowledgePoint(o.id()),sid=submission(o.id(),kp);
        var save=assignmentService.saveFeedback(TEACHER,sid,feedback(kp,"needs_practice"),"save");
        assignmentService.publishFeedback(TEACHER,sid,Map.of("baseVersion",save.feedback().version()),"publish");
        String assignment=save.feedback().assignmentId();
        for(var student:List.of(STUDENT,OTHER_STUDENT)) {
            jdbc.update("INSERT INTO help_requests(id,offering_id,assignment_id,student_id,title,content,student_attempt,shared_tutoring_request_ids,issue_tags,issue_tag_version,status,created_at,updated_at) VALUES(?,?,?,?,'Question','Content','Attempt',JSON_ARRAY(),JSON_ARRAY('box_model'),1,'open',?,?)",UUID.randomUUID().toString(),o.id(),assignment,student.id(),ts(NOW),ts(NOW));
        }
        var result=stats.getAssignmentStats(assignment,TEACHER).commonIssues();
        assertThat(result).hasSize(1);
        var issue=(Map<?,?>)result.get(0);
        assertThat(issue.get("reportedStudentCount")).isEqualTo(2);
        assertThat(issue.get("confirmedStudentCount")).isEqualTo(1);
        assertThat(issue.get("distinctStudentCount")).isEqualTo(2);
        assertThat(issue.get("knowledgePointId")).isNull();
        assertThat(stats.getOfferingStats(o.id(),TEACHER).pendingHelpCount()).isEqualTo(2);
    }

    private OfferingDTO createOffering() {
        return courseService.createOffering(TEACHER, Map.of("courseId", COURSE, "termId", TERM,
                "title", "fixture" + (++offeringSeq), "groupName", "fixture", "progressUnit", "chapter"), "offering");
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
        body.put("description", title + "fixture");
        body.put("estimatedMinutes", 30);
        body.put("type", type);
        body.put("isRequired", true);
        body.put("dueAt", NOW.plus(Duration.ofDays(3)).toString());
        body.put("lateUntil", NOW.plus(Duration.ofDays(6)).toString());
        body.put("allowResubmit", true);
        body.put("maxAttempts", 3);
        body.put("maxScore", new BigDecimal("100.00"));
        body.put("requirements", List.of("fixture"));
        body.put("rubric", List.of(
                Map.of("criterionId", "layout", "title", "fixture", "description", "fixture", "maxScore", new BigDecimal("60.00")),
                Map.of("criterionId", "quality", "title", "fixture", "description", "fixture", "maxScore", new BigDecimal("40.00"))));
        body.put("initialFiles", List.of(Map.of("path", "web_lab".equals(type) ? "index.html" : "answer.md", "content", "fixture")));
        body.put("knowledgePointIds", List.of());
        return assignmentService.createAssignment(TEACHER, offeringId, body, "create");
    }

    /** fixture */
    private String saveAndSubmit(UserDTO student, String assignmentId) {
        String type = jdbc.queryForObject("SELECT type FROM assignments WHERE id=?", String.class, assignmentId);
        String path = "web_lab".equals(type) ? "index.html" : "answer.md";
        Map<String, Object> save = new HashMap<>();
        save.put("baseRevision", 0);
        save.put("files", List.of(Map.of("path", path, "content", "V1")));
        save.put("activeFile", path);
        assignmentService.saveWorkspace(student, assignmentId, save, "save");
        return assignmentService.submitAssignment(student, assignmentId,
                new HashMap<>(Map.of("workspaceRevision", 1, "reflection", "fixture")), "submit").submission().id();
    }

    private static void assertCode(Throwable t, int status, String code) {
        assertThat(t).isInstanceOfSatisfying(BusinessException.class, e -> {
            assertThat(e.getCode()).isEqualTo(code);
            assertThat(e.getStatus().value()).isEqualTo(status);
        });
    }

    /** 422 VALIDATION_ERROR fixture details.fields fixture */
    private static void assertField(Throwable t, String field) {
        assertCode(t, 422, "VALIDATION_ERROR");
        assertThat(t.toString() + ((BusinessException) t).getDetails()).contains(field);
    }

    private static java.sql.Timestamp ts(Instant i) { return java.sql.Timestamp.from(i); }

    private static UserDTO user(String suffix, String username, String role) {
        return new UserDTO("00000000-0000-4000-8000-0000000000" + suffix, username, "fixture", List.of(role));
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FixedClockConfiguration {
        @Bean @Primary Clock clock() { return Clock.fixed(NOW, ZoneOffset.UTC); }
    }
}
