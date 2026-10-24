package com.learningplatform.modules.courses.model;
import java.math.BigDecimal;
import java.time.Instant;
/** Mapper 内部记录，不作为 HTTP 响应。 */
public final class AssignmentRows {
    private AssignmentRows() {}
    public record Assignment(String id,String offeringId,String chapterId,String title,String description,
            int estimatedMinutes,String type,String status,boolean isRequired,Instant dueAt,Instant lateUntil,
            boolean allowResubmit,int maxAttempts,BigDecimal maxScore,int contentVersion,String currentAiPolicyId,
            Instant publishedAt,String createdBy,Instant createdAt,Instant updatedAt) {}
    public record AssignmentRequirement(String assignmentId,int requirementIndex,String requirementText) {}
    public record RubricCriterion(String assignmentId,String criterionId,String title,String description,BigDecimal maxScore) {}
    public record AssignmentKnowledgePoint(String assignmentId,String offeringId,String knowledgePointId) {}
    public record InitialFile(String assignmentId,String filePath,String content) {}
    public record Workspace(String id,String offeringId,String assignmentId,String studentId,int revision,
            String activeFile,Instant createdAt,Instant updatedAt) {}
    public record WorkspaceFile(String workspaceId,String filePath,String content) {}
    public record Submission(String id,String offeringId,String assignmentId,String workspaceId,String studentId,
            int attemptNo,int workspaceRevision,String reflection,int contentVersion,String assignmentTitleSnapshot,
            BigDecimal maxScoreSnapshot,String aiPolicyId,Instant dueAtSnapshot,Instant submittedAt,boolean isLate,
            boolean isCurrent,Instant createdAt) {}
    public record SubmissionFile(String submissionId,String filePath,String content) {}
    public record SubmissionRequirementSnapshot(String submissionId,int requirementIndex,String requirementText) {}
    public record SubmissionRubricSnapshot(String submissionId,String criterionId,String title,String description,BigDecimal maxScore) {}
    public record Feedback(String id,String submissionId,String assignmentId,String offeringId,String studentId,
            String teacherId,String status,int baseVersion,String overallComment,BigDecimal finalScore,
            Instant publishedAt,Instant createdAt,Instant updatedAt) {}
    public record FeedbackRubricScore(String feedbackId,String criterionId,BigDecimal score,String comment) {}
    public record Notification(String id,String recipientId,String type,String title,String content,
            String relatedOfferingId,String relatedAssignmentId,String relatedFeedbackId,
            boolean read,Instant readAt,Instant createdAt) {}
    /** 站内消息扁平行：type 为数据库值；targetType/targetId 仅 notice_published 继承公告目标时非空；发送者仅 feedback_published 可由评价教师推出。 */
    public record MessageRow(String id,String type,String title,String content,String offeringId,String assignmentId,
            String feedbackId,String targetType,String targetId,String senderId,String senderDisplayName,Instant createdAt,Instant readAt) {}
    /** 教师提交列表扁平行（含学生信息），由 Service 组装嵌套 student。 */
    public record TeacherSubmissionRow(String id,String assignmentId,String offeringId,int attemptNumber,int workspaceRevision,
            Instant submittedAt,boolean late,boolean superseded,String feedbackStatus,
            String studentId,String studentUsername,String studentDisplayName) {}
    /** 首页课程行：教学班 + 本人成员信息，Service 再组装进度、教师与当前章节。 */
    public record DashboardOfferingRow(String offeringId,String courseId,String title,String mark,String groupName,
            String termId,String termLabel,String status,String progressUnit,String memberId,
            Instant lastStudiedAt,String lastChapterId) {}
    public record NoticeRow(String id,String offeringId,String authorId,String targetStudentId,
            String targetType,String targetId,String title,String content,Instant createdAt) {}
    /** 公告读取行：recipientCount 在查询时由同次发布生成的通知条数得出（notices 表无存储列）；个人公告恒为 1。 */
    public record NoticeView(String id,String offeringId,String targetStudentId,String targetType,String targetId,
            String title,String content,Instant createdAt,int recipientCount) {}
    /** 作业统计行；commonIssues 在 P1 无数据来源，由 Service 补空数组。 */
    public record AssignmentStatsRow(int studentCount,int submittedStudentCount,int pendingReviewCount,
            int reviewedStudentCount) {}
}
