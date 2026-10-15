package com.learningplatform.modules.courses.dto;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
/** P1-B 作业与工作区的独立视图。 */
public final class AssignmentDTOs {
    private AssignmentDTOs() {}
    public record FileDTO(String path,String content) {}
    public record RubricCriterion(String criterionId,String title,String description,BigDecimal maxScore) {}
    public record AssignmentSummaryDTO(String id,String offeringId,String offeringStatus,String chapterId,String title,
            String type,boolean isRequired,String publicationState,String description,Instant dueAt,String assignmentState,
            boolean overdue,String latestSubmissionId,String publishedFeedbackId,boolean unreadFeedback) {}
    public record AssignmentDetailDTO(String id,String offeringId,String offeringStatus,String chapterId,String title,
            String type,boolean isRequired,String publicationState,String description,Instant dueAt,String assignmentState,
            boolean overdue,String latestSubmissionId,String publishedFeedbackId,boolean unreadFeedback,
            List<String> requirements,int estimatedMinutes,BigDecimal maxScore,List<RubricCriterion> rubric,
            List<String> knowledgePointIds,Instant lateUntil,boolean allowResubmit,int maxAttempts,int attemptsUsed,
            boolean canSubmit,String submissionBlockedReason,Integer aiPolicyVersion) {}
    public record WorkspaceDTO(String assignmentId,int revision,List<FileDTO> files,String activeFile,
            Instant savedAt,boolean canSave,String saveBlockedReason) {}
    public record SubmissionSummaryDTO(String id,String assignmentId,String offeringId,int attemptNumber,
            int workspaceRevision,Instant submittedAt,boolean late,boolean superseded,String feedbackStatus) {}
    public record KnowledgeSnapshot(String id,String title,String description) {}
    public record AssignmentSnapshot(String title,List<String> requirements,List<RubricCriterion> rubric,
            BigDecimal maxScore,List<KnowledgeSnapshot> knowledgePoints,int contentVersion,Instant dueAt,Integer aiPolicyVersion) {}
    public record SubmissionDetailDTO(String id,String assignmentId,String offeringId,int attemptNumber,
            int workspaceRevision,Instant submittedAt,boolean late,boolean superseded,String feedbackStatus,
            List<FileDTO> files,String reflection,AssignmentSnapshot assignmentSnapshot,Object publishedFeedback) {}
    public record StudentBrief(String id,String username,String displayName) {}
    public record TeacherSubmissionSummaryDTO(String id,String assignmentId,String offeringId,int attemptNumber,
            int workspaceRevision,Instant submittedAt,boolean late,boolean superseded,String feedbackStatus,StudentBrief student) {}
    public record TeacherAssignmentDTO(String chapterId,String title,String type,boolean isRequired,String description,
            List<String> requirements,int estimatedMinutes,List<String> knowledgePointIds,Instant dueAt,Instant lateUntil,
            boolean allowResubmit,int maxAttempts,BigDecimal maxScore,List<RubricCriterion> rubric,List<FileDTO> initialFiles,
            Integer aiPolicyVersion,String id,String offeringId,String publicationState,Instant publishedAt,
            int submittedStudentCount,int pendingReviewCount) {}
    public record RubricScore(String criterionId,BigDecimal score,String comment) {}
    public record FeedbackDTO(String id,String submissionId,String status,int baseVersion,String overallComment,
            BigDecimal finalScore,List<RubricScore> rubricScores,Instant publishedAt,Instant updatedAt) {}
    public record NotificationDTO(String id,String type,String title,String content,String relatedOfferingId,
            String relatedAssignmentId,String relatedFeedbackId,boolean isRead,Instant readAt,Instant createdAt) {}
}
