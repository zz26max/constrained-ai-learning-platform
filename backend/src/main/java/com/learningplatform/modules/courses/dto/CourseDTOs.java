package com.learningplatform.modules.courses.dto;
import java.time.Instant;
import java.util.List;
/** 课程接口的独立视图；存储对象、邀请码摘要和内部权限信息不直接返回。 */
public final class CourseDTOs {
    private CourseDTOs() {}
    public record Page<T>(List<T> items,int page,int pageSize,int total) {}
    public record BaseCourseDTO(String id,String title,String mark) {}
    public record TeacherBrief(String id,String displayName) {}
    public record OfferingDTO(String id,String courseId,String title,String mark,String groupName,
            String termId,String termLabel,String status,String progressUnit,List<TeacherBrief> teachers) {}
    public record MemberDTO(String userId,String displayName,String username,String role,Instant joinedAt) {}
    public record InviteDTO(String id,Instant expiresAt,Integer maxUses,int usedCount,Instant revokedAt,Instant createdAt) {}
    public record InviteCreatedDTO(String id,Instant expiresAt,Integer maxUses,int usedCount,Instant revokedAt,
            Instant createdAt,String inviteCode) {}
    public record InviteRevokedDTO(String id,Instant revokedAt) {}
    public record EnrollmentDTO(String offeringId,Instant enrolledAt,boolean created) {}
    public record ProgressDTO(String unit,int completed,int total,int percent,boolean notConfigured,Instant asOf) {}
    public record CurrentChapter(String id,int number,String title) {}
    public record CourseSummaryDTO(String offeringId,String courseId,String title,String mark,String groupName,
            String termId,String termLabel,String status,List<TeacherBrief> teachers,CurrentChapter currentChapter,
            ProgressDTO progress,Instant lastStudiedAt,int pendingAssignmentCount,int unreadFeedbackCount) {}
}

