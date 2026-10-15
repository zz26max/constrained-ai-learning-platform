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
}
