# P1-D: 多班聚合与完整边界

> **已作废（2026-10-16）**：本文档为实现前自写的设计稿，其中 DTO、路径与错误码与 `docs/openapi.yaml` 1.1.0 冲突，且按此实现的后端经全量核对不符合契约。字段、路径与错误码一律以契约为准（用 `scripts/contract_slice.py` 取切片）；本文仅可作为业务场景参考，不得据此编码。

## 目标

实现跨教学班的数据聚合视图，补齐 P1 阶段的完整教学边界：首页仪表盘、学习记录、公告系统、教师统计，以及归档场景的验证。

**验收标准**：首页、消息、历史、归档与期限场景通过。

## 范围

### 学生端聚合（3 个路由）

1. **GET /api/v1/me/dashboard** - 首页仪表盘
   - 跨班聚合：课程数、待办作业数、未读消息数
   - 当前学习定位：按截止时间升序选择最紧急任务，无待办时返回最近学习章节
   - 其他待办（最多 2 项）、最近反馈、课程列表（最多 6 门）、最新公告

2. **GET /api/v1/me/learning-records** - 学习记录
   - 单班维度：作业完成统计、最近评价分页、知识证据（P2）、学习建议（P2）
   - P1 实现：summary + feedbackPage，P2 字段返回 null

3. **POST /api/v1/me/messages/read-all** - 批量标记消息已读
   - 可选按 offeringId 或 type 过滤
   - 幂等操作，已读消息不重复标记

### 教学班公告（4 个路由）

4. **POST /api/v1/teacher/offerings/{offeringId}/notices** - 教师发布公告
   - target 可选：null（全班）或特定 studentId
   - 全班公告原子派发个人消息给发布时的当前学生成员
   - 后续加入学生从公告列表读取，不补发个人消息

5. **GET /api/v1/teacher/offerings/{offeringId}/notices** - 教师查看公告列表
   - 分页，按创建时间降序
   - 返回 NoticeDTO（含 target）

6. **GET /api/v1/offerings/{offeringId}/notices** - 学生查看公告列表
   - 本班成员权限
   - 分页，按创建时间降序
   - 晚加入学生可读取既往公告

7. **GET /api/v1/notices/{noticeId}** - 查看公告详情
   - 本班成员权限
   - 返回完整 NoticeDTO

### 教师统计（3 个路由）

8. **GET /api/v1/teacher/offerings/{offeringId}/stats** - 教学班统计
   - studentCount：当前学生成员数
   - activeAssignmentCount：未归档的已发布作业数
   - pendingReviewCount：当前有效提交且未发布评价的数量
   - pendingHelpCount：P1 返回 0（P2 实现）

9. **GET /api/v1/teacher/assignments/{assignmentId}/stats** - 作业统计
   - submittedStudentCount：至少一次有效提交的不同学生数
   - pendingReviewCount：当前有效提交且未发布评价的数量
   - avgScore：已发布评价的平均分（P1 可选实现）

10. **GET /api/v1/teacher/offerings/{offeringId}/students/{studentId}/learning-records** - 学生学习记录
    - 教师视角查看指定学生的学习记录
    - 结构同学生端 getLearningRecords，但无知识证据字段

### 已实现但需验证的归档功能

11. **POST /api/v1/teacher/offerings/{offeringId}/archive** - 归档教学班（已实现）
12. **POST /api/v1/teacher/assignments/{assignmentId}/archive** - 归档作业（已实现）

## 数据库设计

P1-D 不需要新增表，复用现有表：
- `notifications`（已有，V7）：个人消息记录
- `course_offerings`（已有，V5）：教学班 is_archived 字段
- `assignments`（已有，V6）：作业 is_archived 字段
- `submissions`（已有，V6）：提交记录
- `feedback`（已有，V7）：评价记录
- `offering_members`（已有，V5）：成员关系

### 新增表：notices（教学班公告）

```sql
-- Flyway V8: 教学班公告表
CREATE TABLE notices (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    offering_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    author_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    target_student_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    title VARCHAR(200) NOT NULL,
    content VARCHAR(8000) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    KEY ix_notices_offering_created (offering_id, created_at DESC, id),
    CONSTRAINT fk_notices_offering FOREIGN KEY (offering_id) REFERENCES course_offerings(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_notices_author FOREIGN KEY (offering_id, author_id) REFERENCES offering_members(offering_id, user_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_notices_target FOREIGN KEY (offering_id, target_student_id) REFERENCES offering_members(offering_id, user_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE notices COMMENT '教学班公告：教师发布的班级通知或个人消息';
ALTER TABLE notices MODIFY COLUMN target_student_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'null=全班公告, 非null=个人消息目标学生';
```

### 索引策略

**现有索引复用（无需新增）：**
- `notifications.ix_notifications_recipient_created`：支持学生消息列表与未读计数
- `course_offerings` 主键：支持按 offering 查询
- `assignments.ix_assignments_offering_created`：支持作业统计
- `submissions.ix_submissions_assignment_student`：支持提交统计
- `feedback.ix_feedback_student_published`：支持学习记录中的反馈分页

**新增索引（notices 表）：**
- `ix_notices_offering_created (offering_id, created_at DESC, id)`：支持公告列表分页

## 后端实现

### 1. 实体与 DTO

**新增实体（domain model）：**
```java
// backend/src/main/java/com/learningplatform/modules/courses/model/AssignmentRows.java
public record NoticeRow(
    String id,
    String offeringId,
    String authorId,
    String targetStudentId,  // nullable
    String title,
    String content,
    Instant createdAt
) {}
```

**新增 DTO：**
```java
// backend/src/main/java/com/learningplatform/modules/courses/dto/AssignmentDTOs.java
public record DashboardDTO(
    String termId,           // nullable
    String termLabel,        // nullable
    Instant serverTime,
    int courseCount,
    int pendingAssignmentCount,
    int unreadMessageCount,
    Object currentLearning,  // CurrentAssignment | CurrentLearningChapter | null
    List<AssignmentSummaryDTO> otherPendingAssignments,  // max 2
    StudentFeedbackDTO recentFeedback,                   // nullable
    List<CourseSummaryDTO> courses,                       // max 6
    NotificationDTO recentNotice                          // nullable
) {}

public record CourseSummaryDTO(
    String offeringId,
    String courseName,
    String offeringLabel,
    int completedCount,
    int totalCount,
    String progressUnit,     // "chapter" | "assignment"
    int percent
) {}

public record CurrentAssignment(
    String type,             // "assignment"
    String assignmentId,
    String title,
    Instant dueAt,           // nullable
    String status            // NOT_STARTED | IN_PROGRESS
) {}

public record CurrentLearningChapter(
    String type,             // "chapter"
    String offeringId,
    String chapterId,
    String chapterTitle
) {}

public record LearningRecordsDTO(
    String offeringId,
    LearningRecordSummary summary,
    List<StudentFeedbackDTO> recentFeedback,
    PaginationInfo feedbackPage,
    Object knowledgeEvidence,    // P2, null in P1
    Object nextRecommendation    // P2, null in P1
) {}

public record LearningRecordSummary(
    int completedChapterCount,
    int totalChapterCount,
    int completedLabCount,
    int totalLabCount,
    int feedbackCount
) {}

public record OfferingStatsDTO(
    int studentCount,
    int activeAssignmentCount,
    int pendingReviewCount,
    int pendingHelpCount         // P1: always 0
) {}

public record AssignmentStatsDTO(
    int submittedStudentCount,
    int pendingReviewCount,
    BigDecimal avgScore          // nullable
) {}

public record NoticeDTO(
    String id,
    String offeringId,
    String authorId,
    String authorName,
    String targetStudentId,      // nullable, null=全班公告
    String targetStudentName,    // nullable
    String title,
    String content,
    Instant createdAt
) {}

public record NoticeWrite(
    String targetStudentId,      // nullable
    String title,
    String content
) {}
```

### 2. Mapper 接口

```java
// backend/src/main/java/com/learningplatform/modules/courses/mapper/AssignmentMapper.java
@Mapper
public interface AssignmentMapper {
    // 首页仪表盘
    int countStudentOfferings(@Param("userId") String userId, @Param("termId") String termId);
    int countPendingAssignments(@Param("userId") String userId, @Param("termId") String termId);
    int countUnreadMessages(@Param("userId") String userId);
    
    @Nullable AssignmentSummaryDTO findCurrentAssignment(@Param("userId") String userId, @Param("termId") String termId);
    @Nullable ChapterRow findCurrentLearningChapter(@Param("userId") String userId, @Param("termId") String termId);
    
    List<AssignmentSummaryDTO> listOtherPendingAssignments(
        @Param("userId") String userId,
        @Param("termId") String termId,
        @Param("excludeId") String excludeId,
        @Param("limit") int limit
    );
    
    @Nullable StudentFeedbackDTO findRecentFeedback(@Param("userId") String userId);
    
    List<CourseSummaryDTO> listDashboardCourses(
        @Param("userId") String userId,
        @Param("termId") String termId,
        @Param("limit") int limit
    );
    
    @Nullable NotificationDTO findRecentNotice(@Param("userId") String userId);
    
    // 学习记录
    LearningRecordSummary getLearningRecordSummary(
        @Param("offeringId") String offeringId,
        @Param("studentId") String studentId
    );
    
    List<StudentFeedbackDTO> listStudentFeedback(
        @Param("offeringId") String offeringId,
        @Param("studentId") String studentId,
        @Param("offset") int offset,
        @Param("limit") int limit
    );
    
    int countStudentFeedback(@Param("offeringId") String offeringId, @Param("studentId") String studentId);
    
    // 批量标记消息已读
    int markMessagesRead(
        @Param("recipientId") String recipientId,
        @Param("offeringId") String offeringId,
        @Param("type") String type,
        @Param("readAt") Instant readAt
    );
    
    // 公告系统
    void insertNotice(NoticeRow notice);
    NoticeRow findNoticeById(@Param("id") String id);
    List<NoticeDTO> listNotices(
        @Param("offeringId") String offeringId,
        @Param("offset") int offset,
        @Param("limit") int limit
    );
    int countNotices(@Param("offeringId") String offeringId);
    
    // 教师统计
    OfferingStatsDTO getOfferingStats(@Param("offeringId") String offeringId);
    AssignmentStatsDTO getAssignmentStats(@Param("assignmentId") String assignmentId);
}
```

### 3. Service 层

**新增 Service：**
```java
// backend/src/main/java/com/learningplatform/modules/courses/service/DashboardService.java
@Service
public class DashboardService {
    public DashboardDTO getDashboard(String userId, String termId) {
        // 1. 获取当前学期（若未指定）
        // 2. 查询聚合计数
        // 3. 查询当前学习定位（currentLearning）
        // 4. 查询其他待办（最多 2 项，排除 currentLearning）
        // 5. 查询最近反馈（最多 1 条）
        // 6. 查询课程列表（最多 6 门）
        // 7. 查询最新公告（最多 1 条）
        // 8. 组装返回
    }
    
    public LearningRecordsDTO getLearningRecords(
        String userId,
        String offeringId,
        int page,
        int pageSize
    ) {
        // 1. 验证权限（本班学生本人）
        // 2. 查询 summary
        // 3. 分页查询 feedbackPage
        // 4. P1 返回 null for knowledgeEvidence & nextRecommendation
    }
    
    public void markMessagesRead(
        String userId,
        String offeringId,
        String type
    ) {
        // 幂等更新 notifications.is_read = 1, read_at = NOW()
        // WHERE recipient_id = userId AND is_read = 0
        // AND (offeringId IS NULL OR related_offering_id = offeringId)
        // AND (type IS NULL OR type = type)
    }
}

// backend/src/main/java/com/learningplatform/modules/courses/service/NoticeService.java
@Service
public class NoticeService {
    @Transactional
    public NoticeDTO createNotice(
        String offeringId,
        String authorId,
        NoticeWrite input
    ) {
        // 1. 验证权限（授课教师）
        // 2. 验证 targetStudentId（如果非 null，必须是本班学生）
        // 3. 插入 notices 表
        // 4. 如果 target=null（全班公告），原子派发个人消息
        //    - 查询当前学生成员
        //    - 批量插入 notifications（type=notice_published）
        // 5. 返回 NoticeDTO
    }
    
    public Page<NoticeDTO> listNotices(
        String offeringId,
        String userId,
        int page,
        int pageSize
    ) {
        // 1. 验证权限（本班成员）
        // 2. 分页查询
        // 3. 返回
    }
    
    public NoticeDTO getNotice(String noticeId, String userId) {
        // 1. 查询 notice
        // 2. 验证权限（本班成员）
        // 3. 返回
    }
}

// backend/src/main/java/com/learningplatform/modules/courses/service/TeacherStatsService.java
@Service
public class TeacherStatsService {
    public OfferingStatsDTO getOfferingStats(String offeringId, String teacherId) {
        // 1. 验证权限（授课教师）
        // 2. 查询统计（mapper 一次性返回）
        // 3. pendingHelpCount = 0（P1）
    }
    
    public AssignmentStatsDTO getAssignmentStats(String assignmentId, String teacherId) {
        // 1. 验证权限（授课教师）
        // 2. 查询统计
        // 3. 返回
    }
    
    public LearningRecordsDTO getStudentLearningRecords(
        String offeringId,
        String studentId,
        String teacherId,
        int page,
        int pageSize
    ) {
        // 1. 验证权限（授课教师）
        // 2. 验证学生是本班成员
        // 3. 复用 DashboardService.getLearningRecords 的查询逻辑
    }
}
```

### 4. Controller 层

**扩展现有 Controller：**
```java
// backend/src/main/java/com/learningplatform/modules/courses/controller/AssignmentController.java
@RestController
@RequestMapping("/api/v1")
public class AssignmentController {
    // 学生端聚合
    @GetMapping("/me/dashboard")
    public DashboardDTO getDashboard(
        @AuthenticationPrincipal UserPrincipal principal,
        @RequestParam(required = false) String termId
    ) {
        return dashboardService.getDashboard(principal.userId(), termId);
    }
    
    @GetMapping("/me/learning-records")
    public LearningRecordsDTO getLearningRecords(
        @AuthenticationPrincipal UserPrincipal principal,
        @RequestParam String offeringId,
        @RequestParam(defaultValue = "1") int page,
        @RequestParam(defaultValue = "20") int pageSize
    ) {
        return dashboardService.getLearningRecords(
            principal.userId(),
            offeringId,
            page,
            pageSize
        );
    }
    
    @PostMapping("/me/messages/read-all")
    public void markMessagesRead(
        @AuthenticationPrincipal UserPrincipal principal,
        @RequestParam(required = false) String offeringId,
        @RequestParam(required = false) String type
    ) {
        dashboardService.markMessagesRead(principal.userId(), offeringId, type);
    }
    
    // 公告系统（学生端）
    @GetMapping("/offerings/{offeringId}/notices")
    public Page<NoticeDTO> listNotices(
        @PathVariable String offeringId,
        @AuthenticationPrincipal UserPrincipal principal,
        @RequestParam(defaultValue = "1") int page,
        @RequestParam(defaultValue = "20") int pageSize
    ) {
        return noticeService.listNotices(offeringId, principal.userId(), page, pageSize);
    }
    
    @GetMapping("/notices/{noticeId}")
    public NoticeDTO getNotice(
        @PathVariable String noticeId,
        @AuthenticationPrincipal UserPrincipal principal
    ) {
        return noticeService.getNotice(noticeId, principal.userId());
    }
    
    // 教师端统计
    @GetMapping("/teacher/offerings/{offeringId}/stats")
    public OfferingStatsDTO getOfferingStats(
        @PathVariable String offeringId,
        @AuthenticationPrincipal UserPrincipal principal
    ) {
        return teacherStatsService.getOfferingStats(offeringId, principal.userId());
    }
    
    @GetMapping("/teacher/assignments/{assignmentId}/stats")
    public AssignmentStatsDTO getAssignmentStats(
        @PathVariable String assignmentId,
        @AuthenticationPrincipal UserPrincipal principal
    ) {
        return teacherStatsService.getAssignmentStats(assignmentId, principal.userId());
    }
    
    @GetMapping("/teacher/offerings/{offeringId}/students/{studentId}/learning-records")
    public LearningRecordsDTO getStudentLearningRecords(
        @PathVariable String offeringId,
        @PathVariable String studentId,
        @AuthenticationPrincipal UserPrincipal principal,
        @RequestParam(defaultValue = "1") int page,
        @RequestParam(defaultValue = "20") int pageSize
    ) {
        return teacherStatsService.getStudentLearningRecords(
            offeringId,
            studentId,
            principal.userId(),
            page,
            pageSize
        );
    }
    
    // 公告系统（教师端）
    @PostMapping("/teacher/offerings/{offeringId}/notices")
    public NoticeDTO createNotice(
        @PathVariable String offeringId,
        @AuthenticationPrincipal UserPrincipal principal,
        @RequestBody @Valid NoticeWrite input
    ) {
        return noticeService.createNotice(offeringId, principal.userId(), input);
    }
    
    @GetMapping("/teacher/offerings/{offeringId}/notices")
    public Page<NoticeDTO> listTeacherNotices(
        @PathVariable String offeringId,
        @AuthenticationPrincipal UserPrincipal principal,
        @RequestParam(defaultValue = "1") int page,
        @RequestParam(defaultValue = "20") int pageSize
    ) {
        return noticeService.listNotices(offeringId, principal.userId(), page, pageSize);
    }
}
```

### 5. MyBatis XML 映射

**关键查询设计：**

```xml
<!-- backend/src/main/resources/mapper/courses/AssignmentMapper.xml -->

<!-- 首页仪表盘：当前学习定位（按截止时间升序，无待办时返回最近学习章节） -->
<select id="findCurrentAssignment" resultType="AssignmentSummaryDTO">
    SELECT a.id as assignmentId,
           a.title,
           a.due_at as dueAt,
           /* 计算个人状态 */
    FROM assignments a
    INNER JOIN course_offerings co ON a.offering_id = co.id
    INNER JOIN offering_members om ON co.id = om.offering_id AND om.user_id = #{userId}
    WHERE co.is_archived = 0
      AND a.is_archived = 0
      AND a.status = 'published'
      AND (#{termId} IS NULL OR co.term_id = #{termId})
      AND /* 个人状态为 NOT_STARTED 或 IN_PROGRESS */
    ORDER BY a.due_at ASC, a.id ASC
    LIMIT 1
</select>

<!-- 首页仪表盘：课程列表（按最近学习时间或创建时间排序，最多 6 门） -->
<select id="listDashboardCourses" resultType="CourseSummaryDTO">
    SELECT co.id as offeringId,
           bc.name as courseName,
           co.label as offeringLabel,
           /* 计算完成进度 */
    FROM course_offerings co
    INNER JOIN base_courses bc ON co.base_course_id = bc.id
    INNER JOIN offering_members om ON co.id = om.offering_id AND om.user_id = #{userId}
    LEFT JOIN learning_positions lp ON lp.user_id = #{userId} AND lp.offering_id = co.id
    WHERE co.is_archived = 0
      AND (#{termId} IS NULL OR co.term_id = #{termId})
    ORDER BY lp.last_studied_at DESC NULLS LAST, co.created_at DESC
    LIMIT #{limit}
</select>

<!-- 学习记录：summary 统计 -->
<select id="getLearningRecordSummary" resultType="LearningRecordSummary">
    SELECT
        (SELECT COUNT(*) FROM chapter_progress cp
         INNER JOIN chapters c ON cp.chapter_id = c.id
         WHERE c.offering_id = #{offeringId}
           AND cp.student_id = #{studentId}
           AND c.is_archived = 0
           AND c.status = 'published'
           AND c.is_required = 1
           AND cp.completed_at IS NOT NULL) as completedChapterCount,
        
        (SELECT COUNT(*) FROM chapters c
         WHERE c.offering_id = #{offeringId}
           AND c.is_archived = 0
           AND c.status = 'published'
           AND c.is_required = 1) as totalChapterCount,
        
        (SELECT COUNT(DISTINCT a.id) FROM assignments a
         INNER JOIN submissions s ON a.id = s.assignment_id AND s.student_id = #{studentId}
         WHERE a.offering_id = #{offeringId}
           AND a.is_archived = 0
           AND a.status = 'published'
           AND a.is_required = 1
           AND a.type = 'lab'
           AND s.submitted_at IS NOT NULL) as completedLabCount,
        
        (SELECT COUNT(*) FROM assignments a
         WHERE a.offering_id = #{offeringId}
           AND a.is_archived = 0
           AND a.status = 'published'
           AND a.is_required = 1
           AND a.type = 'lab') as totalLabCount,
        
        (SELECT COUNT(*) FROM feedback f
         WHERE f.offering_id = #{offeringId}
           AND f.student_id = #{studentId}
           AND f.status = 'published') as feedbackCount
</select>

<!-- 教师统计：教学班统计 -->
<select id="getOfferingStats" resultType="OfferingStatsDTO">
    SELECT
        (SELECT COUNT(*) FROM offering_members om
         WHERE om.offering_id = #{offeringId}
           AND om.role = 'student') as studentCount,
        
        (SELECT COUNT(*) FROM assignments a
         WHERE a.offering_id = #{offeringId}
           AND a.is_archived = 0
           AND a.status = 'published') as activeAssignmentCount,
        
        (SELECT COUNT(*) FROM submissions s
         WHERE s.offering_id = #{offeringId}
           AND s.submitted_at IS NOT NULL
           AND NOT EXISTS (
               SELECT 1 FROM feedback f
               WHERE f.submission_id = s.id
                 AND f.status = 'published'
           )) as pendingReviewCount,
        
        0 as pendingHelpCount
</select>
```

### 6. 测试

**单元测试（MockMvc）：**
```java
// backend/src/test/java/com/learningplatform/common/api/DashboardHttpContractTest.java
@Test
void getDashboard_returnsAggregatedView() {
    // 1. 准备：学生加入多个教学班，有待办作业和未读消息
    // 2. 调用 GET /api/v1/me/dashboard
    // 3. 验证：courseCount、pendingAssignmentCount、unreadMessageCount 正确
    // 4. 验证：currentLearning 按截止时间升序选择
    // 5. 验证：otherPendingAssignments 最多 2 项且排除 currentLearning
}

@Test
void getLearningRecords_returnsSummaryAndFeedback() {
    // 1. 准备：学生有章节进度、作业提交、教师评价
    // 2. 调用 GET /api/v1/me/learning-records?offeringId=xxx
    // 3. 验证：summary 统计正确
    // 4. 验证：feedbackPage 分页正确
    // 5. 验证：knowledgeEvidence 和 nextRecommendation 为 null（P1）
}

@Test
void createNotice_broadcastsToCurrentStudents() {
    // 1. 准备：教学班有 3 个学生
    // 2. 教师发布全班公告（target=null）
    // 3. 验证：notices 表插入 1 条
    // 4. 验证：notifications 表插入 3 条（type=notice_published）
    // 5. 新学生加入后查询公告列表，能看到既往公告
    // 6. 验证：不会补发个人消息
}

@Test
void archiveOffering_blocksNewSubmissions() {
    // 1. 准备：教学班有未批阅提交
    // 2. 调用归档，返回 409 ARCHIVE_PENDING_REVIEWS
    // 3. 批阅完所有提交
    // 4. 再次归档，成功返回 200
    // 5. 验证：学生保存工作区返回 canSave=false, saveBlockedReason=OFFERING_ARCHIVED
    // 6. 验证：学生提交返回 canSubmit=false, blockedReason=OFFERING_ARCHIVED
}
```

**集成测试（Testcontainers）：**
```java
// backend/src/test/java/com/learningplatform/modules/courses/service/DashboardIntegrationIT.java
@Test
void dashboard_aggregatesAcrossOfferings() {
    // 1. 创建 2 个教学班，学生加入两个班
    // 2. 第一个班：发布 2 个作业（1 个过期，1 个未过期）
    // 3. 第二个班：发布 1 个作业，学生已提交
    // 4. 调用 getDashboard
    // 5. 验证：courseCount=2, pendingAssignmentCount=2（过期作业仍算待办）
    // 6. 验证：currentLearning 选择最近截止的未完成作业
}
```

## 前端实现

### 1. API 客户端

```typescript
// frontend/src/api/dashboard.ts
export interface DashboardDTO {
  termId: string | null
  termLabel: string | null
  serverTime: string
  courseCount: number
  pendingAssignmentCount: number
  unreadMessageCount: number
  currentLearning: CurrentAssignment | CurrentLearningChapter | null
  otherPendingAssignments: AssignmentSummaryDTO[]
  recentFeedback: StudentFeedbackDTO | null
  courses: CourseSummaryDTO[]
  recentNotice: NotificationDTO | null
}

export interface CurrentAssignment {
  type: 'assignment'
  assignmentId: string
  title: string
  dueAt: string | null
  status: 'NOT_STARTED' | 'IN_PROGRESS'
}

export interface CurrentLearningChapter {
  type: 'chapter'
  offeringId: string
  chapterId: string
  chapterTitle: string
}

export interface CourseSummaryDTO {
  offeringId: string
  courseName: string
  offeringLabel: string
  completedCount: number
  totalCount: number
  progressUnit: 'chapter' | 'assignment'
  percent: number
}

export interface LearningRecordsDTO {
  offeringId: string
  summary: LearningRecordSummary
  recentFeedback: StudentFeedbackDTO[]
  feedbackPage: PaginationInfo
  knowledgeEvidence: null  // P1
  nextRecommendation: null  // P1
}

export interface LearningRecordSummary {
  completedChapterCount: number
  totalChapterCount: number
  completedLabCount: number
  totalLabCount: number
  feedbackCount: number
}

export const dashboardApi = {
  getDashboard: (termId?: string) =>
    request<DashboardDTO>({
      method: 'GET',
      url: '/api/v1/me/dashboard',
      params: { termId }
    }),
  
  getLearningRecords: (offeringId: string, page = 1, pageSize = 20) =>
    request<LearningRecordsDTO>({
      method: 'GET',
      url: '/api/v1/me/learning-records',
      params: { offeringId, page, pageSize }
    }),
  
  markMessagesRead: (offeringId?: string, type?: string) =>
    request<void>({
      method: 'POST',
      url: '/api/v1/me/messages/read-all',
      params: { offeringId, type }
    })
}

// frontend/src/api/notices.ts
export interface NoticeDTO {
  id: string
  offeringId: string
  authorId: string
  authorName: string
  targetStudentId: string | null
  targetStudentName: string | null
  title: string
  content: string
  createdAt: string
}

export interface NoticeWrite {
  targetStudentId?: string | null
  title: string
  content: string
}

export const noticeApi = {
  listNotices: (offeringId: string, page = 1, pageSize = 20) =>
    request<Page<NoticeDTO>>({
      method: 'GET',
      url: `/api/v1/offerings/${offeringId}/notices`,
      params: { page, pageSize }
    }),
  
  getNotice: (noticeId: string) =>
    request<NoticeDTO>({
      method: 'GET',
      url: `/api/v1/notices/${noticeId}`
    }),
  
  createNotice: (offeringId: string, input: NoticeWrite) =>
    request<NoticeDTO>({
      method: 'POST',
      url: `/api/v1/teacher/offerings/${offeringId}/notices`,
      data: input
    }),
  
  listTeacherNotices: (offeringId: string, page = 1, pageSize = 20) =>
    request<Page<NoticeDTO>>({
      method: 'GET',
      url: `/api/v1/teacher/offerings/${offeringId}/notices`,
      params: { page, pageSize }
    })
}

// frontend/src/api/stats.ts
export interface OfferingStatsDTO {
  studentCount: number
  activeAssignmentCount: number
  pendingReviewCount: number
  pendingHelpCount: number
}

export interface AssignmentStatsDTO {
  submittedStudentCount: number
  pendingReviewCount: number
  avgScore: number | null
}

export const statsApi = {
  getOfferingStats: (offeringId: string) =>
    request<OfferingStatsDTO>({
      method: 'GET',
      url: `/api/v1/teacher/offerings/${offeringId}/stats`
    }),
  
  getAssignmentStats: (assignmentId: string) =>
    request<AssignmentStatsDTO>({
      method: 'GET',
      url: `/api/v1/teacher/assignments/${assignmentId}/stats`
    }),
  
  getStudentLearningRecords: (
    offeringId: string,
    studentId: string,
    page = 1,
    pageSize = 20
  ) =>
    request<LearningRecordsDTO>({
      method: 'GET',
      url: `/api/v1/teacher/offerings/${offeringId}/students/${studentId}/learning-records`,
      params: { page, pageSize }
    })
}
```

### 2. Vue 组件

**学生首页：**
```vue
<!-- frontend/src/features/dashboard/StudentDashboard.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { dashboardApi } from '@/api/dashboard'
import type { DashboardDTO } from '@/api/dashboard'

const dashboard = ref<DashboardDTO | null>(null)
const loading = ref(false)

onMounted(async () => {
  loading.value = true
  try {
    dashboard.value = await dashboardApi.getDashboard()
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div v-if="loading">加载中...</div>
  <div v-else-if="dashboard" class="dashboard">
    <!-- 顶部统计卡片 -->
    <div class="stats">
      <div class="stat-card">
        <span>课程数</span>
        <span>{{ dashboard.courseCount }}</span>
      </div>
      <div class="stat-card">
        <span>待办作业</span>
        <span>{{ dashboard.pendingAssignmentCount }}</span>
      </div>
      <div class="stat-card">
        <span>未读消息</span>
        <span>{{ dashboard.unreadMessageCount }}</span>
      </div>
    </div>

    <!-- 当前学习 -->
    <section v-if="dashboard.currentLearning" class="current-learning">
      <h2>继续学习</h2>
      <div v-if="dashboard.currentLearning.type === 'assignment'" class="assignment-card">
        <h3>{{ dashboard.currentLearning.title }}</h3>
        <p v-if="dashboard.currentLearning.dueAt">
          截止时间：{{ formatDate(dashboard.currentLearning.dueAt) }}
        </p>
      </div>
      <div v-else class="chapter-card">
        <h3>{{ dashboard.currentLearning.chapterTitle }}</h3>
      </div>
    </section>

    <!-- 其他待办 -->
    <section v-if="dashboard.otherPendingAssignments.length > 0" class="other-pending">
      <h2>其他待办</h2>
      <ul>
        <li v-for="item in dashboard.otherPendingAssignments" :key="item.assignmentId">
          {{ item.title }}
        </li>
      </ul>
    </section>

    <!-- 最近反馈 -->
    <section v-if="dashboard.recentFeedback" class="recent-feedback">
      <h2>最近反馈</h2>
      <!-- 展示评价内容 -->
    </section>

    <!-- 课程列表 -->
    <section class="courses">
      <h2>我的课程</h2>
      <ul>
        <li v-for="course in dashboard.courses" :key="course.offeringId">
          <span>{{ course.courseName }} - {{ course.offeringLabel }}</span>
          <span>进度：{{ course.percent }}%</span>
        </li>
      </ul>
    </section>

    <!-- 最新公告 -->
    <section v-if="dashboard.recentNotice" class="recent-notice">
      <h2>最新公告</h2>
      <p>{{ dashboard.recentNotice.title }}</p>
    </section>
  </div>
</template>
```

**学习记录页：**
```vue
<!-- frontend/src/features/dashboard/LearningRecords.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { dashboardApi } from '@/api/dashboard'
import type { LearningRecordsDTO } from '@/api/dashboard'

const route = useRoute()
const offeringId = route.params.offeringId as string
const records = ref<LearningRecordsDTO | null>(null)
const page = ref(1)

onMounted(async () => {
  records.value = await dashboardApi.getLearningRecords(offeringId, page.value)
})
</script>

<template>
  <div v-if="records" class="learning-records">
    <!-- 统计摘要 -->
    <section class="summary">
      <h2>学习进度</h2>
      <p>已完成章节：{{ records.summary.completedChapterCount }} / {{ records.summary.totalChapterCount }}</p>
      <p>已完成实验：{{ records.summary.completedLabCount }} / {{ records.summary.totalLabCount }}</p>
      <p>教师评价数：{{ records.summary.feedbackCount }}</p>
    </section>

    <!-- 最近评价（分页） -->
    <section class="feedback-list">
      <h2>教师评价</h2>
      <ul>
        <li v-for="fb in records.recentFeedback" :key="fb.feedbackId">
          <!-- 展示评价内容 -->
        </li>
      </ul>
      <!-- 分页控件 -->
    </section>
  </div>
</template>
```

**公告列表：**
```vue
<!-- frontend/src/features/notices/NoticeList.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { noticeApi } from '@/api/notices'
import type { Page, NoticeDTO } from '@/api/notices'

const route = useRoute()
const offeringId = route.params.offeringId as string
const notices = ref<Page<NoticeDTO> | null>(null)

onMounted(async () => {
  notices.value = await noticeApi.listNotices(offeringId)
})
</script>

<template>
  <div v-if="notices" class="notice-list">
    <h1>课程公告</h1>
    <ul>
      <li v-for="notice in notices.items" :key="notice.id">
        <h3>{{ notice.title }}</h3>
        <p>{{ notice.authorName }} · {{ formatDate(notice.createdAt) }}</p>
        <p v-if="notice.targetStudentName">（私信：{{ notice.targetStudentName }}）</p>
      </li>
    </ul>
  </div>
</template>
```

**教师统计看板：**
```vue
<!-- frontend/src/features/teacher/OfferingStats.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { statsApi } from '@/api/stats'
import type { OfferingStatsDTO } from '@/api/stats'

const route = useRoute()
const offeringId = route.params.offeringId as string
const stats = ref<OfferingStatsDTO | null>(null)

onMounted(async () => {
  stats.value = await statsApi.getOfferingStats(offeringId)
})
</script>

<template>
  <div v-if="stats" class="offering-stats">
    <h2>班级统计</h2>
    <div class="stats-grid">
      <div class="stat-card">
        <span>学生人数</span>
        <span>{{ stats.studentCount }}</span>
      </div>
      <div class="stat-card">
        <span>活跃作业</span>
        <span>{{ stats.activeAssignmentCount }}</span>
      </div>
      <div class="stat-card">
        <span>待批阅</span>
        <span>{{ stats.pendingReviewCount }}</span>
      </div>
    </div>
  </div>
</template>
```

## 关键业务规则

### 1. 首页 currentLearning 计算规则

按以下优先级选择：
1. **最紧急待办作业**：未完成（NOT_STARTED 或 IN_PROGRESS）且截止时间最近（dueAt ASC），无截止时间排最后
2. **最近学习章节**：无待办时返回 learning_positions 记录的最近章节
3. **首个未完成章节**：无学习位置时返回首个未完成的已发布章节
4. **首个已发布章节**：无未完成章节时返回首个已发布章节
5. **null**：均无内容时返回 null

### 2. 归档边界规则

**教学班归档（POST /api/v1/teacher/offerings/{offeringId}/archive）：**
- 前置检查：有未批阅当前提交时返回 409 `ARCHIVE_PENDING_REVIEWS`
- 幂等操作：已归档时直接返回 200
- 归档后阻断：
  - 章节/资料/作业的 PATCH/POST 操作返回 409 `OFFERING_ARCHIVED`
  - 学生保存工作区：canSave=false, saveBlockedReason=`OFFERING_ARCHIVED`
  - 学生提交：canSubmit=false, blockedReason=`OFFERING_ARCHIVED`
  - 教师发布评价：允许（归档不影响批阅）

**作业归档（POST /api/v1/teacher/assignments/{assignmentId}/archive）：**
- 前置检查：有未批阅当前提交时返回 409 `ARCHIVE_PENDING_REVIEWS`
- 幂等操作：已归档时直接返回 200
- 归档后阻断：
  - 学生保存工作区：canSave=false, saveBlockedReason=`ASSIGNMENT_ARCHIVED`
  - 学生提交：canSubmit=false, blockedReason=`ASSIGNMENT_ARCHIVED`
  - 教师发布评价：允许
  - 历史读取：允许（getAssignment、getWorkspace、getSubmission 仍返回数据）

### 3. 公告派发规则

**全班公告（targetStudentId=null）：**
- 插入 notices 表（1 条记录）
- 原子派发：查询当前学生成员，批量插入 notifications（type=`notice_published`）
- 后续加入学生：从 notices 表读取既往公告，不补发个人消息

**个人消息（targetStudentId 非空）：**
- 插入 notices 表（1 条记录，标记 target）
- 不派发到 notifications（或只派发给目标学生，契约待确认）

### 4. 学习记录统计规则

**章节进度：**
- 分子：已完成的必修章节数（chapter_progress.completed_at 非空）
- 分母：已发布的必修章节数（status='published', is_required=1, is_archived=0）

**实验进度：**
- 分子：至少一次有效提交的必修实验数（type='lab', 有 submission.submitted_at）
- 分母：已发布的必修实验数（status='published', is_required=1, type='lab', is_archived=0）

**教师评价数：**
- 当前已发布评价数（feedback.status='published'），不重复计数

## 验收场景

### 场景 1：学生首页聚合

1. 学生加入 3 个教学班（班 A、班 B、班 C）
2. 班 A：有 2 个待办作业（作业 1 截止明天，作业 2 截止后天）
3. 班 B：有 1 个待办作业（作业 3 截止下周）
4. 班 C：无待办，最近学习了章节 5
5. 学生有 5 条未读消息（3 条来自班 A，2 条来自班 B）
6. 打开首页
7. **验证**：
   - courseCount = 3
   - pendingAssignmentCount = 3
   - unreadMessageCount = 5
   - currentLearning = 作业 1（截止时间最近）
   - otherPendingAssignments = [作业 2, 作业 3]（最多 2 项）
   - courses 包含 3 门课程，按学习时间排序

### 场景 2：教学班归档阻断

1. 教师开班并发布作业
2. 学生提交作业
3. 教师尝试归档教学班，返回 409 `ARCHIVE_PENDING_REVIEWS`（有未批阅提交）
4. 教师发布评价
5. 再次归档，成功返回 200
6. **验证**：
   - 学生打开工作区，canSave = false, saveBlockedReason = `OFFERING_ARCHIVED`
   - 学生尝试提交，canSubmit = false, blockedReason = `OFFERING_ARCHIVED`
   - 教师仍可查看历史提交和评价

### 场景 3：公告原子派发

1. 教学班有 3 个学生（Alice、Bob、Charlie）
2. 教师发布全班公告（target=null）
3. **验证**：
   - notices 表插入 1 条
   - notifications 表插入 3 条（type=`notice_published`，分别给 Alice、Bob、Charlie）
4. 新学生 David 加入教学班
5. David 查询公告列表
6. **验证**：
   - David 能看到既往公告
   - David 的 notifications 表无该公告的个人消息（不补发）

### 场景 4：学习记录统计

1. 教学班发布 5 个必修章节、3 个必修实验
2. 学生完成 3 个章节、提交 2 个实验
3. 教师发布 2 份评价
4. 学生查看学习记录
5. **验证**：
   - completedChapterCount = 3, totalChapterCount = 5
   - completedLabCount = 2, totalLabCount = 3
   - feedbackCount = 2
   - knowledgeEvidence = null（P1）
   - nextRecommendation = null（P1）

## 技术细节

### 性能优化

1. **首页查询优化**：
   - 使用单次复合查询计算聚合计数，避免 N+1
   - currentLearning 查询限制 LIMIT 1
   - otherPendingAssignments 限制 LIMIT 2
   - courses 限制 LIMIT 6

2. **索引覆盖**：
   - 复用现有索引，不新增（除 notices 表）
   - 统计查询尽量使用索引覆盖扫描

3. **批量派发优化**：
   - 公告派发使用批量 INSERT，不逐条插入
   - 单事务完成 notices + notifications 的原子写入

### 安全检查

1. **权限验证**：
   - 所有路由验证当前用户是否为本班成员
   - 教师路由验证授课教师权限
   - 跨用户访问（如查看他人学习记录）必须是授课教师

2. **归档幂等性**：
   - 重复归档请求不报错，直接返回 200
   - 归档检查在事务内完成，避免竞态

3. **公告目标验证**：
   - targetStudentId 非空时，必须验证是本班学生
   - 非法 target 返回 400 `VALIDATION_ERROR`

## 实施顺序

1. **后端优先**（并行实现）：
   - Flyway V8（notices 表）
   - Mapper + XML（查询逻辑）
   - Service 层（业务逻辑）
   - Controller 层（路由）
   - 单元测试（MockMvc）
   - 集成测试（Testcontainers）

2. **前端跟进**（后端完成后）：
   - API 客户端生成（TypeScript）
   - Vue 组件实现
   - 路由配置
   - E2E 测试（可选）

3. **联调验证**：
   - 启动前后端服务
   - 执行验收场景
   - 更新 OpenAPI x-implementation-status

## 注意事项

1. **P2 字段占位**：getLearningRecords 的 knowledgeEvidence 和 nextRecommendation 在 P1 返回 null，P2 实现时填充
2. **归档不可逆**：归档操作无撤销接口，需在 UI 提示用户确认
3. **公告不可编辑**：notices 表无 updated_at，发布后不可修改（契约未定义 PATCH 接口）
4. **消息批量标记**：readAllMessages 是幂等操作，已读消息不重复标记
5. **统计实时性**：教师统计不缓存，每次查询实时计算（课程演示规模下性能可接受）
