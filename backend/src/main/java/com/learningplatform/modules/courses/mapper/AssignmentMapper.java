package com.learningplatform.modules.courses.mapper;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import com.learningplatform.modules.courses.dto.AssignmentDTOs.*;
import com.learningplatform.modules.courses.model.AssignmentRows;
import com.learningplatform.modules.courses.model.AssignmentRows.*;
import com.learningplatform.modules.courses.model.CourseRows.Chapter;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
/** P1-B 作业与工作区持久化；所有值使用 MyBatis 绑定参数。 */
@Mapper
public interface AssignmentMapper {
    // 作业查询
    Assignment findAssignment(String id);
    List<AssignmentSummaryDTO> listStudentAssignments(@Param("studentId") String studentId,@Param("offeringId") String offeringId,
            @Param("termId") String termId,@Param("filter") String filter,@Param("now") Instant now,
            @Param("offset") long offset,@Param("size") int size);
    /** 单个作业的学生个人视图（与列表同一派生状态）；draft 或非本班学生返回 null。offeringId/termId 传 null。 */
    AssignmentSummaryDTO findStudentAssignmentSummary(@Param("studentId") String studentId,@Param("offeringId") String offeringId,
            @Param("termId") String termId,@Param("assignmentId") String assignmentId,@Param("now") Instant now);
    AssignmentCounts getAssignmentCounts(@Param("studentId") String studentId,@Param("offeringId") String offeringId,@Param("termId") String termId);
    List<AssignmentRequirement> getRequirements(String assignmentId);
    List<AssignmentRows.RubricCriterion> getRubric(String assignmentId);
    List<String> getKnowledgePointIds(String assignmentId);
    int countSubmissions(@Param("assignmentId") String assignmentId,@Param("studentId") String studentId);

    // 工作区查询与保存
    Workspace findWorkspace(@Param("assignmentId") String assignmentId,@Param("studentId") String studentId);
    List<WorkspaceFile> getWorkspaceFiles(String workspaceId);
    List<InitialFile> getInitialFiles(String assignmentId);
    int insertWorkspace(@Param("id") String id,@Param("offeringId") String offeringId,@Param("assignmentId") String assignmentId,
            @Param("studentId") String studentId,@Param("activeFile") String activeFile,@Param("now") Instant now);
    int updateWorkspace(@Param("id") String id,@Param("baseRevision") int baseRevision,@Param("activeFile") String activeFile,@Param("now") Instant now);
    int deleteWorkspaceFiles(String workspaceId);
    int insertWorkspaceFile(@Param("workspaceId") String workspaceId,@Param("path") String path,@Param("content") String content);

    // 提交查询与创建
    Submission findSubmission(String id);
    Submission findSubmissionByRevision(@Param("assignmentId") String assignmentId,@Param("studentId") String studentId,@Param("revision") int revision);
    List<SubmissionSummaryDTO> listStudentSubmissions(@Param("assignmentId") String assignmentId,@Param("studentId") String studentId,
            @Param("offset") long offset,@Param("size") int size);
    int countStudentSubmissions(@Param("assignmentId") String assignmentId,@Param("studentId") String studentId);
    List<SubmissionFile> getSubmissionFiles(String submissionId);
    List<SubmissionRequirementSnapshot> getSubmissionRequirements(String submissionId);
    List<SubmissionRubricSnapshot> getSubmissionRubric(String submissionId);
    int insertSubmission(@Param("id") String id,@Param("offeringId") String offeringId,@Param("assignmentId") String assignmentId,
            @Param("workspaceId") String workspaceId,@Param("studentId") String studentId,@Param("attemptNo") int attemptNo,
            @Param("workspaceRevision") int workspaceRevision,@Param("reflection") String reflection,@Param("contentVersion") int contentVersion,
            @Param("assignmentTitle") String assignmentTitle,@Param("maxScore") BigDecimal maxScore,@Param("aiPolicyId") String aiPolicyId,
            @Param("dueAt") Instant dueAt,@Param("submittedAt") Instant submittedAt,@Param("isLate") boolean isLate,@Param("now") Instant now);
    int markPreviousSubmissionsAsSuperseded(@Param("assignmentId") String assignmentId,@Param("studentId") String studentId,
            @Param("currentSubmissionId") String currentSubmissionId);
    int insertSubmissionFile(@Param("submissionId") String submissionId,@Param("path") String path,@Param("content") String content);
    int insertSubmissionRequirement(@Param("submissionId") String submissionId,@Param("index") int index,@Param("text") String text);
    int insertSubmissionRubric(@Param("submissionId") String submissionId,@Param("criterionId") String criterionId,
            @Param("title") String title,@Param("description") String description,@Param("maxScore") BigDecimal maxScore);

    // 教师端作业管理
    List<Assignment> listTeacherAssignments(@Param("offeringId") String offeringId,
            @Param("publicationState") String publicationState,@Param("offset") long offset,@Param("size") int size);
    int countTeacherAssignments(@Param("offeringId") String offeringId,@Param("publicationState") String publicationState);
    /** 章节在本班内的状态；章节不存在或不属于本班返回 null。 */
    String findChapterStatus(@Param("chapterId") String chapterId,@Param("offeringId") String offeringId);
    /** 本班内存在的知识点及其关联章节（可为 null）。 */
    List<KnowledgePointRef> listKnowledgePointRefs(@Param("offeringId") String offeringId,@Param("ids") List<String> ids);
    List<String> listActiveStudentIds(String offeringId);
    int insertAssignment(@Param("id") String id,@Param("offeringId") String offeringId,@Param("chapterId") String chapterId,
            @Param("title") String title,@Param("description") String description,@Param("estimatedMinutes") int estimatedMinutes,
            @Param("type") String type,@Param("status") String status,@Param("isRequired") boolean isRequired,@Param("dueAt") Instant dueAt,
            @Param("lateUntil") Instant lateUntil,@Param("allowResubmit") boolean allowResubmit,@Param("maxAttempts") int maxAttempts,
            @Param("maxScore") BigDecimal maxScore,@Param("currentAiPolicyId") String currentAiPolicyId,
            @Param("createdBy") String createdBy,@Param("now") Instant now);
    int insertRequirement(@Param("assignmentId") String assignmentId,@Param("index") int index,@Param("text") String text);
    int insertRubric(@Param("assignmentId") String assignmentId,@Param("criterionId") String criterionId,
            @Param("title") String title,@Param("description") String description,@Param("maxScore") BigDecimal maxScore);
    int insertInitialFile(@Param("assignmentId") String assignmentId,@Param("path") String path,@Param("content") String content);
    int insertKnowledgePoint(@Param("assignmentId") String assignmentId,@Param("offeringId") String offeringId,@Param("knowledgePointId") String knowledgePointId);
    int updateAssignmentDraft(@Param("id") String id,@Param("chapterId") String chapterId,@Param("title") String title,
            @Param("description") String description,@Param("estimatedMinutes") int estimatedMinutes,@Param("type") String type,
            @Param("isRequired") boolean isRequired,@Param("dueAt") Instant dueAt,@Param("lateUntil") Instant lateUntil,
            @Param("allowResubmit") boolean allowResubmit,@Param("maxAttempts") int maxAttempts,@Param("maxScore") BigDecimal maxScore,@Param("now") Instant now);
    int updateAssignmentPublished(@Param("id") String id,@Param("description") String description,
            @Param("dueAt") Instant dueAt,@Param("lateUntil") Instant lateUntil,@Param("now") Instant now);
    int deleteRequirements(String assignmentId);
    int deleteRubric(String assignmentId);
    int deleteInitialFiles(String assignmentId);
    int deleteKnowledgePoints(String assignmentId);
    int publishAssignment(@Param("id") String id,@Param("now") Instant now);
    int archiveAssignment(@Param("id") String id,@Param("now") Instant now);
    int countPendingReviews(String assignmentId);
    List<TeacherSubmissionSummaryDTO> listAssignmentSubmissions(@Param("assignmentId") String assignmentId,
            @Param("offset") long offset,@Param("size") int size);
    int countAssignmentSubmissions(String assignmentId);

    // P1-C 反馈查询与保存
    Feedback findFeedback(String id);
    Feedback findFeedbackBySubmission(String submissionId);
    List<FeedbackRubricScore> getFeedbackRubricScores(String feedbackId);
    int insertFeedback(@Param("id") String id,@Param("submissionId") String submissionId,@Param("assignmentId") String assignmentId,
            @Param("offeringId") String offeringId,@Param("studentId") String studentId,@Param("teacherId") String teacherId,
            @Param("overallComment") String overallComment,@Param("finalScore") BigDecimal finalScore,@Param("now") Instant now);
    int updateFeedbackDraft(@Param("id") String id,@Param("baseVersion") int baseVersion,@Param("overallComment") String overallComment,
            @Param("finalScore") BigDecimal finalScore,@Param("now") Instant now);
    int publishFeedback(@Param("id") String id,@Param("now") Instant now);
    int deleteFeedbackRubricScores(String feedbackId);
    int insertFeedbackRubricScore(@Param("feedbackId") String feedbackId,@Param("criterionId") String criterionId,
            @Param("score") BigDecimal score,@Param("comment") String comment);

    // P1-C 通知查询与标记
    Notification findNotification(String id);
    List<NotificationDTO> listNotifications(@Param("recipientId") String recipientId,@Param("offset") long offset,@Param("size") int size);
    int countNotifications(@Param("recipientId") String recipientId);
    int countUnreadNotifications(String recipientId);
    int insertNotification(@Param("id") String id,@Param("recipientId") String recipientId,@Param("type") String type,
            @Param("title") String title,@Param("content") String content,@Param("relatedOfferingId") String relatedOfferingId,
            @Param("relatedAssignmentId") String relatedAssignmentId,@Param("relatedFeedbackId") String relatedFeedbackId,@Param("now") Instant now);
    int markNotificationRead(@Param("id") String id,@Param("now") Instant now);

    // P1-D 首页仪表盘
    int countStudentOfferings(@Param("userId") String userId,@Param("termId") String termId);
    int countPendingAssignments(@Param("userId") String userId,@Param("termId") String termId);
    int countUnreadMessages(@Param("userId") String userId);
    AssignmentSummaryDTO findCurrentAssignment(@Param("userId") String userId,@Param("termId") String termId);
    Chapter findCurrentLearningChapter(@Param("userId") String userId,@Param("termId") String termId);
    List<AssignmentSummaryDTO> listOtherPendingAssignments(@Param("userId") String userId,@Param("termId") String termId,
            @Param("excludeId") String excludeId,@Param("limit") int limit);
    StudentFeedbackDTO findRecentFeedback(@Param("userId") String userId);
    List<CourseSummaryDTO> listDashboardCourses(@Param("userId") String userId,@Param("termId") String termId,@Param("limit") int limit);
    NotificationDTO findRecentNotice(@Param("userId") String userId);

    // P1-D 学习记录
    LearningRecordSummary getLearningRecordSummary(@Param("offeringId") String offeringId,@Param("studentId") String studentId);
    List<StudentFeedbackDTO> listStudentFeedback(@Param("offeringId") String offeringId,@Param("studentId") String studentId,
            @Param("offset") int offset,@Param("limit") int limit);
    int countStudentFeedback(@Param("offeringId") String offeringId,@Param("studentId") String studentId);

    // P1-D 批量标记消息已读
    int markMessagesRead(@Param("recipientId") String recipientId,@Param("offeringId") String offeringId,
            @Param("type") String type,@Param("readAt") Instant readAt);

    // P1-D 公告系统
    int insertNotice(@Param("notice") NoticeRow notice);
    NoticeDTO findNoticeById(@Param("id") String id);
    List<NoticeDTO> listNotices(@Param("offeringId") String offeringId,@Param("offset") int offset,@Param("limit") int limit);
    int countNotices(@Param("offeringId") String offeringId);

    // P1-D 教师统计
    OfferingStatsDTO getOfferingStats(@Param("offeringId") String offeringId);
    AssignmentStatsDTO getAssignmentStats(@Param("assignmentId") String assignmentId);

    // 辅助记录
    record AssignmentCounts(int allCount,int todoCount,int doneCount,int archivedIncompleteCount) {}
    record KnowledgePointRef(String id,String chapterId) {}
}
