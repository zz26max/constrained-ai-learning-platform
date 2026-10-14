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
}

