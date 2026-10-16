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
    /** 公共作业详情端点的教师视图：学生个人字段全部显式为 null（契约 TeacherAssignmentViewDTO）。 */
    public record TeacherAssignmentViewDTO(String id,String offeringId,String offeringStatus,String chapterId,String title,
            String type,boolean isRequired,String publicationState,String description,Instant dueAt,String assignmentState,
            Boolean overdue,String latestSubmissionId,String publishedFeedbackId,Boolean unreadFeedback,
            List<String> requirements,int estimatedMinutes,BigDecimal maxScore,List<RubricCriterion> rubric,
            List<String> knowledgePointIds,Instant lateUntil,boolean allowResubmit,int maxAttempts,Integer attemptsUsed,
            Boolean canSubmit,String submissionBlockedReason,Integer aiPolicyVersion) {}
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
    public record PaginationInfo(int page,int pageSize,int totalItems,int totalPages) {}
    public record DashboardDTO(String termId,String termLabel,Instant serverTime,int courseCount,
            int pendingAssignmentCount,int unreadMessageCount,Object currentLearning,
            List<AssignmentSummaryDTO> otherPendingAssignments,StudentFeedbackDTO recentFeedback,
            List<CourseSummaryDTO> courses,NotificationDTO recentNotice) {}
    public record CourseSummaryDTO(String offeringId,String courseName,String offeringLabel,
            int completedCount,int totalCount,String progressUnit,int percent) {}
    public record CurrentAssignment(String type,String assignmentId,String title,Instant dueAt,String status) {}
    public record CurrentLearningChapter(String type,String offeringId,String chapterId,String chapterTitle) {}
    public record LearningRecordsDTO(String offeringId,LearningRecordSummary summary,
            List<StudentFeedbackDTO> recentFeedback,PaginationInfo feedbackPage,
            Object knowledgeEvidence,Object nextRecommendation) {}
    public record LearningRecordSummary(int completedChapterCount,int totalChapterCount,
            int completedLabCount,int totalLabCount,int feedbackCount) {}
    public record StudentFeedbackDTO(String feedbackId,String assignmentId,String assignmentTitle,
            String overallComment,BigDecimal finalScore,Instant publishedAt) {}
    public record OfferingStatsDTO(int studentCount,int activeAssignmentCount,
            int pendingReviewCount,int pendingHelpCount) {}
    public record AssignmentStatsDTO(int submittedStudentCount,int pendingReviewCount,BigDecimal avgScore) {}
    public record NoticeDTO(String id,String offeringId,String authorId,String authorName,
            String targetStudentId,String targetStudentName,String title,String content,Instant createdAt) {}
    public record NoticeWrite(String targetStudentId,String title,String content) {}
    public record PagedResult<T>(List<T> items,int page,int pageSize,int total,int totalPages,Object metadata) {}
}
