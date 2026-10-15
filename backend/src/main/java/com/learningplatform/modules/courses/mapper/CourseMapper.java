package com.learningplatform.modules.courses.mapper;
import java.time.Instant;
import java.util.List;
import com.learningplatform.modules.courses.dto.CourseDTOs.*;
import com.learningplatform.modules.courses.model.CourseRows.*;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
/** 所有值使用 MyBatis 绑定参数；Mapper 不承担身份与生命周期判断。 */
@Mapper
public interface CourseMapper {
    List<BaseCourseDTO> baseCourses(@Param("offset") long offset,@Param("size") int size);
    int countBaseCourses();
    BaseCourseDTO activeCourse(String id);
    String currentTermId();
    int termExists(String id);
    Offering findOffering(String id);
    Member findMember(@Param("offeringId") String offeringId,@Param("userId") String userId);
    List<Offering> offerings(@Param("userId") String userId,@Param("role") String role,@Param("termId") String termId,
            @Param("status") String status,@Param("offset") long offset,@Param("size") int size);
    int countOfferings(@Param("userId") String userId,@Param("role") String role,@Param("termId") String termId,@Param("status") String status);
    List<TeacherBrief> teachers(String offeringId);
    List<MemberDTO> members(@Param("offeringId") String offeringId,@Param("offset") long offset,@Param("size") int size);
    int countMembers(String offeringId);
    List<String> findStudentIdsByOffering(String offeringId);
    int insertOffering(@Param("id") String id,@Param("courseId") String courseId,@Param("termId") String termId,
            @Param("title") String title,@Param("groupName") String groupName,@Param("unit") String unit,@Param("userId") String userId,@Param("now") Instant now);
    int insertMember(@Param("id") String id,@Param("offeringId") String offeringId,@Param("userId") String userId,@Param("role") String role,@Param("now") Instant now);
    int archive(@Param("id") String id,@Param("now") Instant now);
    Invite invite(String id);
    Invite inviteByDigest(String digest);
    List<Invite> invites(@Param("offeringId") String offeringId,@Param("offset") long offset,@Param("size") int size);
    int countInvites(String offeringId);
    int insertInvite(@Param("id") String id,@Param("offeringId") String offeringId,@Param("digest") String digest,
            @Param("expiresAt") Instant expiresAt,@Param("maxUses") Integer maxUses,@Param("userId") String userId,@Param("now") Instant now);
    int consumeInvite(@Param("id") String id,@Param("now") Instant now);
    int revokeInvite(@Param("id") String id,@Param("now") Instant now);
    int chapterTotal(String offeringId);
    int chapterCompleted(@Param("offeringId") String offeringId,@Param("memberId") String memberId);
    CurrentChapter currentChapter(@Param("offeringId") String offeringId,@Param("memberId") String memberId,@Param("lastChapterId") String lastChapterId);

    List<Chapter> chapters(@Param("offeringId") String offeringId,@Param("publicOnly") boolean publicOnly);
    Chapter chapter(String id);
    List<Resource> resources(@Param("chapterId") String chapterId,@Param("publicOnly") boolean publicOnly);
    List<KnowledgePoint> knowledgePoints(@Param("offeringId") String offeringId,@Param("chapterId") String chapterId);
    Resource resource(String id);
    KnowledgePoint knowledgePoint(String id);
    int resourceCountForKnowledgePoint(String knowledgePointId);
    com.learningplatform.modules.courses.model.CourseRows.ChapterProgress chapterProgress(@Param("memberId") String memberId,@Param("chapterId") String chapterId);
    int insertChapter(@Param("id") String id,@Param("offeringId") String offeringId,@Param("position") int position,@Param("title") String title,
            @Param("summary") String summary,@Param("required") boolean required,@Param("now") Instant now);
    int updateChapter(@Param("id") String id,@Param("position") int position,@Param("title") String title,@Param("summary") String summary,
            @Param("required") boolean required,@Param("version") int version,@Param("now") Instant now);
    int publishChapter(@Param("id") String id,@Param("now") Instant now);
    int insertKnowledgePoint(@Param("id") String id,@Param("offeringId") String offeringId,@Param("chapterId") String chapterId,@Param("title") String title,
            @Param("description") String description,@Param("position") int position,@Param("now") Instant now);
    int updateKnowledgePoint(@Param("id") String id,@Param("chapterId") String chapterId,@Param("title") String title,@Param("description") String description,
            @Param("position") int position,@Param("now") Instant now);
    int insertResource(@Param("id") String id,@Param("offeringId") String offeringId,@Param("chapterId") String chapterId,@Param("knowledgePointId") String knowledgePointId,
            @Param("title") String title,@Param("content") String content,@Param("position") int position,@Param("now") Instant now);
    int updateResource(@Param("id") String id,@Param("knowledgePointId") String knowledgePointId,@Param("title") String title,@Param("content") String content,
            @Param("position") int position,@Param("now") Instant now);
    int archiveResource(@Param("id") String id,@Param("now") Instant now);
    int insertProgress(@Param("id") String id,@Param("offeringId") String offeringId,@Param("memberId") String memberId,@Param("chapterId") String chapterId,
            @Param("status") String status,@Param("completedAt") Instant completedAt,@Param("now") Instant now);
    int updateProgress(@Param("memberId") String memberId,@Param("chapterId") String chapterId,@Param("status") String status,@Param("completedAt") Instant completedAt,@Param("now") Instant now);
    int touchProgress(@Param("memberId") String memberId,@Param("chapterId") String chapterId,@Param("now") Instant now);
    int updateLearningPosition(@Param("offeringId") String offeringId,@Param("userId") String userId,@Param("chapterId") String chapterId,@Param("now") Instant now);
}
