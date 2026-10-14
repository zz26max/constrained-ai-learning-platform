package com.learningplatform.modules.courses.model;
import java.time.Instant;
import com.fasterxml.jackson.annotation.JsonIgnore;
/** Mapper 内部记录，不作为 HTTP 响应。 */
public final class CourseRows {
    private CourseRows() {}
    public record Offering(String id,String courseId,String termId,String title,String mark,String groupName,
            String termLabel,String progressUnit,String status,String createdBy,Instant createdAt) {}
    public record Member(String id,String offeringId,String userId,String role,String status,
            Instant joinedAt,Instant lastStudiedAt,String lastChapterId) {}
    public record Invite(String id,String offeringId,@JsonIgnore String codeDigest,Instant expiresAt,Integer maxUses,
            int usedCount,Instant revokedAt,Instant createdAt,String createdBy) {
        @Override public String toString() { return "Invite[id="+id+", offeringId="+offeringId+"]"; }
    }
    public record Chapter(String id,String offeringId,int position,String title,String summary,String status,
            boolean isRequired,int contentVersion,Instant publishedAt) {}
    public record Resource(String id,String offeringId,String chapterId,String knowledgePointId,String title,
            String contentMarkdown,int position,String status) {}
    public record KnowledgePoint(String id,String offeringId,String chapterId,String title,String description,int position) {}
    public record ChapterProgress(String id,String offeringId,String memberId,String chapterId,String status,
            Instant completedAt,Instant lastOpenedAt) {}
}
