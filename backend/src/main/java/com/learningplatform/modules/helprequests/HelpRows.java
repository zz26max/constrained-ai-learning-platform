package com.learningplatform.modules.helprequests;
import java.time.Instant;
public final class HelpRows {
 private HelpRows() {}
 public record Request(String id,String offeringId,String assignmentId,String studentId,String title,String content,String studentAttempt,Integer workspaceRevision,String sharedSnapshot,Instant sharedSnapshotExpiresAt,Instant sharedSnapshotPurgedAt,String sharedTutoringRequestIds,String issueTags,Integer issueTagVersion,String status,Instant createdAt,Instant updatedAt,String username,String displayName) {}
 public record Reply(String id,String helpRequestId,String authorId,String content,Instant createdAt,String displayName) {}
}
