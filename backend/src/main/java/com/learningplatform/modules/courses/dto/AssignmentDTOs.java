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
    /** 学生视图（契约 SubmissionDetailDTO）：feedbackStatus 仅 none/published，只含已发布评价。 */
    public record SubmissionDetailDTO(String id,String assignmentId,String offeringId,int attemptNumber,
            int workspaceRevision,Instant submittedAt,boolean late,boolean superseded,String feedbackStatus,
            List<FileDTO> files,String reflection,AssignmentSnapshot assignmentSnapshot,StudentFeedbackViewDTO publishedFeedback) {}
    public record StudentBrief(String id,String username,String displayName) {}
    /** 教师视图（契约 TeacherSubmissionDetailDTO）：附学生信息与草稿评价，feedbackStatus 为 none/draft/published。 */
    public record TeacherSubmissionDetailDTO(String id,String assignmentId,String offeringId,int attemptNumber,
            int workspaceRevision,Instant submittedAt,boolean late,boolean superseded,String feedbackStatus,
            StudentBrief student,List<FileDTO> files,String reflection,AssignmentSnapshot assignmentSnapshot,
            TeacherFeedbackDTO publishedFeedback,TeacherFeedbackDTO draftFeedback) {}
    public record TeacherSubmissionSummaryDTO(String id,String assignmentId,String offeringId,int attemptNumber,
            int workspaceRevision,Instant submittedAt,boolean late,boolean superseded,String feedbackStatus,StudentBrief student) {}
    public record TeacherAssignmentDTO(String chapterId,String title,String type,boolean isRequired,String description,
            List<String> requirements,int estimatedMinutes,List<String> knowledgePointIds,Instant dueAt,Instant lateUntil,
            boolean allowResubmit,int maxAttempts,BigDecimal maxScore,List<RubricCriterion> rubric,List<FileDTO> initialFiles,
            Integer aiPolicyVersion,String id,String offeringId,String publicationState,Instant publishedAt,
            int submittedStudentCount,int pendingReviewCount) {}
    // P1-C 契约 RubricResult / TeacherFeedbackDTO / StudentFeedbackDTO。学生视图在 Java 中命名为 StudentFeedbackViewDTO
    // （避免与下一批教师端旧记录混淆），JSON 形状以契约 StudentFeedbackDTO 为准。
    public record RubricResultDTO(String criterionId,BigDecimal score,String comment) {}
    public record TeacherFeedbackDTO(String id,String submissionId,String offeringId,String assignmentId,String assignmentTitle,
            int version,String status,BigDecimal score,BigDecimal maxScore,List<RubricResultDTO> rubricResults,String comment,
            List<Object> knowledgeEvaluations,List<String> issueTags,Integer issueTagVersion,
            CourseDTOs.TeacherBrief teacher,Instant publishedAt,String messageId) {}
    public record StudentFeedbackViewDTO(String id,String submissionId,String offeringId,String assignmentId,String assignmentTitle,
            int version,String status,BigDecimal score,BigDecimal maxScore,List<RubricResultDTO> rubricResults,String comment,
            List<Object> knowledgeEvaluations,List<String> issueTags,Integer issueTagVersion,
            CourseDTOs.TeacherBrief teacher,Instant publishedAt,String messageId) {}
    /** 契约 TargetDTO；type 取 offering/chapter/resource/assignment/feedback/help_request。 */
    public record TargetDTO(String type,String id,String offeringId) {}
    /** 契约 NotificationDTO：type 为对外枚举（feedback_published 对外为 feedback，offering_archived 为 system）。 */
    public record NotificationDTO(String id,String offeringId,String type,String title,String content,
            CourseDTOs.TeacherBrief sender,Instant createdAt,Instant readAt,TargetDTO target) {}
    /** 契约 MessageReadDTO：readAt 为首次阅读时间。 */
    public record MessageReadDTO(String id,Instant readAt) {}
    // P1-D 契约 DashboardDTO；courses 复用 CourseDTOs.CourseSummaryDTO（与 listMyCourses 同一结构）。
    // currentLearning 为 CurrentAssignment、CurrentLearningChapter 或 null。
    public record DashboardDTO(String termId,String termLabel,Instant serverTime,int courseCount,
            int pendingAssignmentCount,int unreadMessageCount,Object currentLearning,
            List<AssignmentSummaryDTO> otherPendingAssignments,StudentFeedbackViewDTO recentFeedback,
            List<CourseDTOs.CourseSummaryDTO> courses,NotificationDTO recentNotice) {}
    public record ResumeDTO(String activeFile,Instant savedAt,int workspaceRevision) {}
    public record CurrentAssignment(String type,String offeringId,String chapterId,String assignmentId,String title,
            String description,String assignmentType,String assignmentState,Instant dueAt,boolean overdue,ResumeDTO resume) {}
    public record CurrentLearningChapter(String type,String offeringId,String chapterId,String title,String description) {}
    // P1-D 契约 LearningRecordsDTO / LearningSummary / FeedbackPage / MarkedReadDTO。
    public record LearningRecordsDTO(String offeringId,LearningSummary summary,StudentFeedbackViewDTO recentFeedback,
            FeedbackPage feedbackPage,List<Object> knowledgeEvidence,Object nextRecommendation) {}
    public record LearningSummary(int completedLabCount,int publishedFeedbackCount,Integer needsPracticeCount) {}
    public record FeedbackPage(List<StudentFeedbackViewDTO> items,int page,int pageSize,int total) {}
    public record MarkedReadDTO(Instant markedAt) {}
    // P1-D 契约 TeacherLearningRecordsDTO / TeacherFeedbackPage：与学生 LearningRecordsDTO 同一结构，
    // 评价用教师视图并另含 student。
    public record TeacherFeedbackPage(List<TeacherFeedbackDTO> items,int page,int pageSize,int total) {}
    public record TeacherLearningRecordsDTO(String offeringId,LearningSummary summary,TeacherFeedbackDTO recentFeedback,
            TeacherFeedbackPage feedbackPage,List<Object> knowledgeEvidence,Object nextRecommendation,StudentBrief student) {}
    public record OfferingStatsDTO(int studentCount,int activeAssignmentCount,
            int pendingReviewCount,int pendingHelpCount) {}
    /** 契约 AssignmentStatsDTO。 */
    public record AssignmentStatsDTO(int studentCount,int submittedStudentCount,int pendingReviewCount,
            int reviewedStudentCount,List<Object> commonIssues) {}
    /** 契约 NoticeDTO：target 是可选跳转对象（TargetDTO），不是收件人；存于 notices.target_type/target_id，为空时为 null。 */
    public record NoticeDTO(String id,String offeringId,String title,String content,TargetDTO target,
            Instant createdAt,int recipientCount) {}
    /** 契约 NoticePage。 */
    public record NoticePage(List<NoticeDTO> items,int page,int pageSize,int total) {}
}
