package com.learningplatform.modules.courses.mapper;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import com.learningplatform.modules.courses.dto.AssignmentDTOs.*;
import com.learningplatform.modules.courses.model.AssignmentRows;
import com.learningplatform.modules.courses.model.AssignmentRows.*;
import com.learningplatform.modules.courses.model.CourseRows.Chapter;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
/** P1-B 作业与工作区持久化；所有值使用 MyBatis 绑定参数。 */
@Mapper
public interface AssignmentMapper {
    @org.apache.ibatis.annotations.Update("UPDATE feedback SET issue_tag_version=#{version} WHERE id=#{id}")
    void updateFeedbackIssueTagVersion(@Param("id") String id,@Param("version") Integer version);
    @org.apache.ibatis.annotations.Update("UPDATE assignments SET current_ai_policy_id=#{policy},updated_at=#{now,typeHandler=com.learningplatform.common.mybatis.UtcInstantTypeHandler} WHERE id=#{id} AND current_ai_policy_id <=> #{expected} AND status<>'archived'")
    int bindPolicy(@Param("id") String id,@Param("policy") String policy,@Param("expected") String expected,@Param("now") Instant now);
    // 作业查询
    Assignment findAssignment(String id);
    List<AssignmentSummaryDTO> listStudentAssignments(@Param("studentId") String studentId,@Param("offeringId") String offeringId,
            @Param("termId") String termId,@Param("filter") String filter,@Param("now") Instant now,
            @Param("offset") long offset,@Param("size") int size);
    /** 单个作业的学生个人视图（与列表同一派生状态）；draft 或非本班学生返回 null。offeringId/termId 传 null。 */
    AssignmentSummaryDTO findStudentAssignmentSummary(@Param("studentId") String studentId,@Param("offeringId") String offeringId,
            @Param("termId") String termId,@Param("assignmentId") String assignmentId,@Param("now") Instant now);
    AssignmentCounts getAssignmentCounts(@Param("studentId") String studentId,@Param("offeringId") String offeringId,@Param("termId") String termId);
    List<AssignmentRequirement> getRequirements(String assignmentId);
    List<AssignmentRows.RubricCriterion> getRubric(String assignmentId);
    List<String> getKnowledgePointIds(String assignmentId);
    int countSubmissions(@Param("assignmentId") String assignmentId,@Param("studentId") String studentId);

    // 工作区查询与保存
    Workspace findWorkspace(@Param("assignmentId") String assignmentId,@Param("studentId") String studentId);
    /** 提交串行化入口：锁该学生该作业的工作区行（FOR UPDATE），同一学生同一作业的提交在此排队。 */
    Workspace findWorkspaceForUpdate(@Param("assignmentId") String assignmentId,@Param("studentId") String studentId);
    List<WorkspaceFile> getWorkspaceFiles(String workspaceId);
    List<InitialFile> getInitialFiles(String assignmentId);
    int insertWorkspace(@Param("id") String id,@Param("offeringId") String offeringId,@Param("assignmentId") String assignmentId,
            @Param("studentId") String studentId,@Param("activeFile") String activeFile,@Param("now") Instant now);
    int updateWorkspace(@Param("id") String id,@Param("baseRevision") int baseRevision,@Param("activeFile") String activeFile,@Param("now") Instant now);
    int deleteWorkspaceFiles(String workspaceId);
    int insertWorkspaceFile(@Param("workspaceId") String workspaceId,@Param("path") String path,@Param("content") String content);

    // 提交查询与创建
    Submission findSubmission(String id);
    Submission findSubmissionByRevision(@Param("assignmentId") String assignmentId,@Param("studentId") String studentId,@Param("revision") int revision);
    List<SubmissionSummaryDTO> listStudentSubmissions(@Param("assignmentId") String assignmentId,@Param("studentId") String studentId,
            @Param("offset") long offset,@Param("size") int size);
    int countStudentSubmissions(@Param("assignmentId") String assignmentId,@Param("studentId") String studentId);
    /** 锁该学生该作业的当前提交行（FOR UPDATE）；无当前提交返回 null。与 saveFeedback/publishFeedback 的锁同一行。 */
    Submission findCurrentSubmissionForUpdate(@Param("assignmentId") String assignmentId,@Param("studentId") String studentId);
    /** 作业关联知识点的当前标题/描述；P1 没有提交时知识点快照表，详情中按作业当前值读取。 */
    List<KnowledgeSnapshot> listKnowledgeSnapshots(String assignmentId);
    StudentBrief findStudentBrief(String id);
    List<SubmissionFile> getSubmissionFiles(String submissionId);
    List<SubmissionRequirementSnapshot> getSubmissionRequirements(String submissionId);
    List<SubmissionRubricSnapshot> getSubmissionRubric(String submissionId);
    int insertSubmission(@Param("id") String id,@Param("offeringId") String offeringId,@Param("assignmentId") String assignmentId,
            @Param("workspaceId") String workspaceId,@Param("studentId") String studentId,@Param("attemptNo") int attemptNo,
            @Param("workspaceRevision") int workspaceRevision,@Param("reflection") String reflection,@Param("contentVersion") int contentVersion,
            @Param("assignmentTitle") String assignmentTitle,@Param("maxScore") BigDecimal maxScore,@Param("aiPolicyId") String aiPolicyId,
            @Param("dueAt") Instant dueAt,@Param("submittedAt") Instant submittedAt,@Param("isLate") boolean isLate,@Param("now") Instant now);
    int markPreviousSubmissionsAsSuperseded(@Param("assignmentId") String assignmentId,@Param("studentId") String studentId,
            @Param("currentSubmissionId") String currentSubmissionId);
    int insertSubmissionFile(@Param("submissionId") String submissionId,@Param("path") String path,@Param("content") String content);
    int insertSubmissionRequirement(@Param("submissionId") String submissionId,@Param("index") int index,@Param("text") String text);
    int insertSubmissionRubric(@Param("submissionId") String submissionId,@Param("criterionId") String criterionId,
            @Param("title") String title,@Param("description") String description,@Param("maxScore") BigDecimal maxScore);

    // 教师端作业管理
    List<Assignment> listTeacherAssignments(@Param("offeringId") String offeringId,
            @Param("publicationState") String publicationState,@Param("offset") long offset,@Param("size") int size);
    int countTeacherAssignments(@Param("offeringId") String offeringId,@Param("publicationState") String publicationState);
    /** 章节在本班内的状态；章节不存在或不属于本班返回 null。 */
    String findChapterStatus(@Param("chapterId") String chapterId,@Param("offeringId") String offeringId);
    /** 公告跳转目标存在性：目标必须属于本班。feedback 目标全班公告禁用（Service 层拒绝），无需存在性查询。 */
    boolean existsChapterInOffering(@Param("id") String id,@Param("offeringId") String offeringId);
    boolean existsResourceInOffering(@Param("id") String id,@Param("offeringId") String offeringId);
    boolean existsAssignmentInOffering(@Param("id") String id,@Param("offeringId") String offeringId);
    /** 本班内存在的知识点及其关联章节（可为 null）。 */
    List<KnowledgePointRef> listKnowledgePointRefs(@Param("offeringId") String offeringId,@Param("ids") List<String> ids);
    List<String> listActiveStudentIds(String offeringId);
    int insertAssignment(@Param("id") String id,@Param("offeringId") String offeringId,@Param("chapterId") String chapterId,
            @Param("title") String title,@Param("description") String description,@Param("estimatedMinutes") int estimatedMinutes,
            @Param("type") String type,@Param("status") String status,@Param("isRequired") boolean isRequired,@Param("dueAt") Instant dueAt,
            @Param("lateUntil") Instant lateUntil,@Param("allowResubmit") boolean allowResubmit,@Param("maxAttempts") int maxAttempts,
            @Param("maxScore") BigDecimal maxScore,@Param("currentAiPolicyId") String currentAiPolicyId,
            @Param("createdBy") String createdBy,@Param("now") Instant now);
    int insertRequirement(@Param("assignmentId") String assignmentId,@Param("index") int index,@Param("text") String text);
    int insertRubric(@Param("assignmentId") String assignmentId,@Param("criterionId") String criterionId,
            @Param("title") String title,@Param("description") String description,@Param("maxScore") BigDecimal maxScore);
    int insertInitialFile(@Param("assignmentId") String assignmentId,@Param("path") String path,@Param("content") String content);
    int insertKnowledgePoint(@Param("assignmentId") String assignmentId,@Param("offeringId") String offeringId,@Param("knowledgePointId") String knowledgePointId);
    int updateAssignmentDraft(@Param("id") String id,@Param("chapterId") String chapterId,@Param("title") String title,
            @Param("description") String description,@Param("estimatedMinutes") int estimatedMinutes,@Param("type") String type,
            @Param("isRequired") boolean isRequired,@Param("dueAt") Instant dueAt,@Param("lateUntil") Instant lateUntil,
            @Param("allowResubmit") boolean allowResubmit,@Param("maxAttempts") int maxAttempts,@Param("maxScore") BigDecimal maxScore,@Param("now") Instant now);
    int updateAssignmentPublished(@Param("id") String id,@Param("description") String description,
            @Param("dueAt") Instant dueAt,@Param("lateUntil") Instant lateUntil,@Param("now") Instant now);
    int deleteRequirements(String assignmentId);
    int deleteRubric(String assignmentId);
    int deleteInitialFiles(String assignmentId);
    int deleteKnowledgePoints(String assignmentId);
    int publishAssignment(@Param("id") String id,@Param("now") Instant now);
    int archiveAssignment(@Param("id") String id,@Param("now") Instant now);
    int countPendingReviews(String assignmentId);
    /** feedbackStatus 为 null 表示不过滤；latestOnly=true 只含当前提交。 */
    List<TeacherSubmissionRow> listAssignmentSubmissions(@Param("assignmentId") String assignmentId,
            @Param("feedbackStatus") String feedbackStatus,@Param("latestOnly") boolean latestOnly,
            @Param("offset") long offset,@Param("size") int size);
    int countTeacherSubmissions(@Param("assignmentId") String assignmentId,
            @Param("feedbackStatus") String feedbackStatus,@Param("latestOnly") boolean latestOnly);
    /** 当前提交数（教师作业统计用，与列表过滤无关）。 */
    int countAssignmentSubmissions(String assignmentId);

    // P1-C 反馈查询与保存
    Feedback findFeedback(String id);
    Feedback findFeedbackBySubmission(String submissionId);
    List<FeedbackRubricScore> getFeedbackRubricScores(String feedbackId);
    int insertFeedback(@Param("id") String id,@Param("submissionId") String submissionId,@Param("assignmentId") String assignmentId,
            @Param("offeringId") String offeringId,@Param("studentId") String studentId,@Param("teacherId") String teacherId,
            @Param("overallComment") String overallComment,@Param("finalScore") BigDecimal finalScore,@Param("now") Instant now);
    int updateFeedbackDraft(@Param("id") String id,@Param("baseVersion") int baseVersion,@Param("teacherId") String teacherId,
            @Param("overallComment") String overallComment,@Param("finalScore") BigDecimal finalScore,@Param("now") Instant now);
    int publishFeedback(@Param("id") String id,@Param("baseVersion") int baseVersion,@Param("teacherId") String teacherId,@Param("now") Instant now);
    /** 行锁读：保存/发布评价前锁 submission 行与 feedback 行（FOR UPDATE）。 */
    Submission findSubmissionForUpdate(String id);
    Feedback findFeedbackBySubmissionForUpdate(String submissionId);
    /** 学生本人该评价的 feedback_published 站内消息 ID；不存在返回 null。 */
    String findFeedbackMessageId(@Param("recipientId") String recipientId,@Param("feedbackId") String feedbackId);
    String findUserDisplayName(String id);
    int deleteFeedbackRubricScores(String feedbackId);
    int insertFeedbackRubricScore(@Param("feedbackId") String feedbackId,@Param("criterionId") String criterionId,
            @Param("score") BigDecimal score,@Param("comment") String comment);

    // P1-C 通知查询与标记
    Notification findNotification(String id);
    /** type 为数据库类型值（Service 已把契约枚举换算）；read 为 all/unread/read；offeringId/type 可为 null。 */
    List<MessageRow> listMessages(@Param("recipientId") String recipientId,@Param("offeringId") String offeringId,
            @Param("type") String type,@Param("read") String read,@Param("offset") long offset,@Param("size") int size);
    int countMessages(@Param("recipientId") String recipientId,@Param("offeringId") String offeringId,
            @Param("type") String type,@Param("read") String read);
    /** summary.unreadCount：受 offeringId/type 过滤影响，不受 read 与分页影响。 */
    int countUnreadInScope(@Param("recipientId") String recipientId,@Param("offeringId") String offeringId,
            @Param("type") String type);
    int insertNotification(@Param("id") String id,@Param("recipientId") String recipientId,@Param("type") String type,
            @Param("title") String title,@Param("content") String content,@Param("relatedOfferingId") String relatedOfferingId,
            @Param("relatedAssignmentId") String relatedAssignmentId,@Param("relatedFeedbackId") String relatedFeedbackId,
            @Param("targetType") String targetType,@Param("targetId") String targetId,@Param("now") Instant now);
    /** 仅当本人且尚未已读时写入；已读不更新，保留首次 readAt。返回受影响行数。 */
    int markNotificationRead(@Param("id") String id,@Param("recipientId") String recipientId,@Param("now") Instant now);

    // P1-D 首页仪表盘
    // 待办数与待办列表复用 getAssignmentCounts / listStudentAssignments（studentAssignmentBase 派生状态）。
    int countDashboardOfferings(@Param("studentId") String studentId,@Param("termId") String termId);
    List<DashboardOfferingRow> listDashboardOfferings(@Param("studentId") String studentId,@Param("termId") String termId,
            @Param("limit") int limit);
    int countUnreadMessagesInTerm(@Param("recipientId") String recipientId,@Param("termId") String termId);
    int countUnreadFeedbackInOffering(@Param("recipientId") String recipientId,@Param("offeringId") String offeringId);
    /** 最近公告类（notice_published）个人消息；termId 必填。 */
    MessageRow findRecentNotice(@Param("recipientId") String recipientId,@Param("termId") String termId);
    int assignmentProgressTotal(String offeringId);
    int assignmentProgressCompleted(@Param("offeringId") String offeringId,@Param("studentId") String studentId);

    // P1-D 学习记录与最近反馈（offeringId/termId 可为 null）
    List<String> listPublishedFeedbackIds(@Param("studentId") String studentId,@Param("offeringId") String offeringId,
            @Param("termId") String termId,@Param("limit") int limit);
    int countPublishedFeedback(@Param("studentId") String studentId,@Param("offeringId") String offeringId,
            @Param("termId") String termId);
    int countCompletedLabs(@Param("offeringId") String offeringId,@Param("studentId") String studentId);

    /** 教师查看指定学生：已发布评价 ID 分页，顺序 published_at DESC, id DESC；termId 传 null。 */
    List<String> listPublishedFeedbackIdsPage(@Param("studentId") String studentId,@Param("offeringId") String offeringId,
            @Param("termId") String termId,@Param("offset") long offset,@Param("size") int size);

    // P1-D 批量标记消息已读
    int markMessagesRead(@Param("recipientId") String recipientId,@Param("offeringId") String offeringId,
            @Param("type") String type,@Param("readAt") Instant readAt);

    // P1-D 公告系统；studentId 非 null 时只返回全班公告与定向给该学生的公告，null（教师）返回全部。
    int insertNotice(@Param("notice") NoticeRow notice);
    NoticeView findNoticeView(@Param("id") String id);
    List<NoticeView> listNotices(@Param("offeringId") String offeringId,@Param("studentId") String studentId,
            @Param("offset") long offset,@Param("limit") int limit);
    int countNotices(@Param("offeringId") String offeringId,@Param("studentId") String studentId);

    // P1-D 教师统计
    OfferingStatsDTO getOfferingStats(@Param("offeringId") String offeringId);
    AssignmentStatsRow getAssignmentStats(@Param("assignmentId") String assignmentId);

    // 辅助记录
    record AssignmentCounts(int allCount,int todoCount,int doneCount,int archivedIncompleteCount) {}
    record KnowledgePointRef(String id,String chapterId) {}
}
