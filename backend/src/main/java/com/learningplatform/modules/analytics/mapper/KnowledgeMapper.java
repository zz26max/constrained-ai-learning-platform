package com.learningplatform.modules.analytics.mapper;

import java.time.Instant;
import java.util.*;
import org.apache.ibatis.annotations.*;
import com.learningplatform.modules.courses.dto.AssignmentDTOs.KnowledgeSnapshot;

@Mapper
public interface KnowledgeMapper {
    record Evaluation(String knowledgePointId,String result,String note) {}
    record Evidence(String id,String submissionId,String feedbackId,String assignmentId,String assignmentTitle,String result,String note,Instant occurredAt) {}
    @Select("SELECT knowledge_point_id AS knowledgePointId,result,note FROM feedback_knowledge_evaluations WHERE feedback_id=#{id} ORDER BY knowledge_point_id")
    List<Evaluation> evaluations(String id);
    @Select("SELECT tag FROM feedback_issue_tags WHERE feedback_id=#{id} ORDER BY tag") List<String> tags(String id);
    @Select("SELECT issue_tag_version FROM feedback WHERE id=#{id}") Integer tagVersion(String id);
    @Delete("DELETE FROM feedback_knowledge_evaluations WHERE feedback_id=#{id}") void deleteEvaluations(String id);
    @Delete("DELETE FROM feedback_issue_tags WHERE feedback_id=#{id}") void deleteTags(String id);
    @Insert("INSERT INTO feedback_knowledge_evaluations VALUES(#{feedbackId},#{knowledgePointId},#{result},#{note})")
    void evaluation(String feedbackId,String knowledgePointId,String result,String note);
    @Insert("INSERT INTO feedback_issue_tags VALUES(#{feedbackId},#{tag})") void tag(String feedbackId,String tag);
    @Insert("INSERT INTO submission_knowledge_snapshot SELECT #{submissionId},kp.id,kp.title,kp.description FROM assignment_knowledge_points ak JOIN knowledge_points kp ON kp.id=ak.knowledge_point_id WHERE ak.assignment_id=#{assignmentId}")
    void freeze(String submissionId,String assignmentId);
    @Select("SELECT knowledge_point_id AS id,title,description FROM submission_knowledge_snapshot WHERE submission_id=#{id} ORDER BY knowledge_point_id")
    List<KnowledgeSnapshot> snapshot(String id);
    @Update("UPDATE knowledge_evidence SET is_current=0 WHERE student_id=#{student} AND assignment_id=#{assignment} AND knowledge_point_id=#{knowledge}")
    void supersede(String student,String assignment,String knowledge);
    @Insert("INSERT INTO knowledge_evidence(id,student_id,offering_id,knowledge_point_id,assignment_id,submission_id,feedback_id,feedback_published_version,result,note,occurred_at,is_current,rule_version) VALUES(#{id},#{student},#{offering},#{knowledge},#{assignment},#{submission},#{feedback},#{version},#{result},#{note},#{now},1,'knowledge-v2')")
    void evidence(String id,String student,String offering,String knowledge,String assignment,String submission,String feedback,int version,String result,String note,Instant now);
    @Select("SELECT COUNT(*) FROM knowledge_evidence WHERE feedback_id=#{id}") int sourceCount(String id);
    @Select("SELECT e.id,e.submission_id AS submissionId,e.feedback_id AS feedbackId,e.assignment_id AS assignmentId,s.assignment_title_snapshot AS assignmentTitle,e.result,e.note,e.occurred_at AS occurredAt FROM knowledge_evidence e JOIN submissions s ON s.id=e.submission_id WHERE e.student_id=#{student} AND e.offering_id=#{offering} AND e.knowledge_point_id=#{knowledge} AND e.is_current=1 ORDER BY e.occurred_at DESC,e.id DESC LIMIT 3")
    List<Evidence> recent(String student,String offering,String knowledge);
    @Select("SELECT COUNT(*) FROM assignments a JOIN assignment_knowledge_points ak ON ak.assignment_id=a.id JOIN workspaces w ON w.assignment_id=a.id AND w.student_id=#{student} JOIN course_offerings o ON o.id=a.offering_id WHERE a.offering_id=#{offering} AND ak.knowledge_point_id=#{knowledge} AND a.status='published' AND o.status='active' AND a.published_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM submissions s WHERE s.assignment_id=a.id AND s.student_id=#{student} AND s.is_current=1)")
    int inProgress(String student,String offering,String knowledge);
    @Select("SELECT r.id FROM resources r JOIN chapters c ON c.id=r.chapter_id WHERE r.offering_id=#{offering} AND r.knowledge_point_id=#{knowledge} AND r.status='active' AND c.status='published' ORDER BY r.position,r.id LIMIT 1")
    String resource(String offering,String knowledge);
    @Select("SELECT a.id FROM assignments a JOIN assignment_knowledge_points ak ON ak.assignment_id=a.id JOIN course_offerings o ON o.id=a.offering_id WHERE a.offering_id=#{offering} AND ak.knowledge_point_id=#{knowledge} AND a.status='published' AND o.status='active' AND a.published_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM submissions s WHERE s.assignment_id=a.id AND s.student_id=#{student} AND s.is_current=1) ORDER BY a.due_at,a.id LIMIT 1")
    String task(String student,String offering,String knowledge);
    @Select("SELECT f.student_id AS studentId,t.tag,f.issue_tag_version AS version,f.published_at AS occurredAt FROM feedback f JOIN feedback_issue_tags t ON t.feedback_id=f.id WHERE f.assignment_id=#{assignment} AND f.status='published'")
    List<Map<String,Object>> confirmed(String assignment);
    @Select("SELECT student_id AS studentId,issue_tags AS tags,issue_tag_version AS version,created_at AS occurredAt FROM help_requests WHERE assignment_id=#{assignment}")
    List<Map<String,Object>> reported(String assignment);
    @Select("SELECT t.tag AS tag,e.knowledge_point_id AS knowledgePointId,k.title AS title,COUNT(*) AS matches FROM feedback f JOIN feedback_issue_tags t ON t.feedback_id=f.id JOIN feedback_knowledge_evaluations e ON e.feedback_id=f.id JOIN knowledge_points k ON k.id=e.knowledge_point_id WHERE f.assignment_id=#{assignment} AND f.status='published' AND f.issue_tag_version=#{version} GROUP BY t.tag,e.knowledge_point_id,k.title ORDER BY t.tag,matches DESC,e.knowledge_point_id")
    List<Map<String,Object>> knowledgeByTag(String assignment,int version);
}
