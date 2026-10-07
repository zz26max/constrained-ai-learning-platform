# 后端接口设计与前端联调约定

版本：0.6 · 日期：2026-10-07 · 状态：已实现两项健康检查与业务响应、请求标识及 MVC 异常处理基础，其余端点待开发。

本文是依据现有前端页面反推的接口契约。**当前 GET /health/live 和 GET /health/ready 已实现；业务成功/错误 DTO、请求标识与 Spring MVC 异常处理已建立，登录等业务端点待开发**。健康接口已通过测试与真实 HTTP 验证，统一响应的验证范围见 [实施进度](DEVELOPMENT.md#112-实施进度与代码阅读)。技术方案、开发阶段与业务规则见 [后端开发文档](DEVELOPMENT.md)，表结构与约束见 [后端数据模型](DATA_MODEL.md)。

当前 `website-prototype/src` 没有真实 `fetch` / API 调用；`learning-ui.js` 的课程、任务和选课集合，`course-ui.js` 的章节与资料，`records-ui.js` 的反馈和学习证据，以及 `main.js` 的教师统计、实验室和 AI 对话均为示例。本文中的请求地址是新设计，不是对已有服务的说明。

## 1. 通用约定

### 1.1 地址、字段与时间

| 项目 | 约定 |
| --- | --- |
| 基础地址 | `/api/v1`；P0改造当前serve.mjs固定代理到127.0.0.1:8080，浏览器入口4173；当前静态服务尚无代理 |
| 传输 | JSON 请求与响应；字段用 `camelCase`；资源 ID 用 UUID 字符串 |
| 时间 | `UTC ISO 8601`，如 `2026-10-09T15:59:59Z`；页面按 `Asia/Shanghai` 显示 |
| 分页 | `page` 从 1 开始；`pageSize` 默认 20，范围 1～100；未特别注明的列表按 `createdAt` 降序、ID 降序稳定排序 |
| 空值 | 列表返回 `[]`，可为空的字段返回 `null`；没有资源与加载失败必须区分 |
| 请求标识 | 业务响应头 `X-Request-ID` 与正文 `requestId` 一致；客户端可提供一个 1～64 字符的合法标识，否则服务端生成 |
| 版本冲突 | 使用整数 `baseRevision` / `baseVersion`；过期版本返回 HTTP 409，禁止静默覆盖 |
| 权限对象 | “我的课程”指学生已加入的 `course_offering`；基础课程 `course` 不等于教学班实例 |

`offeringId` 是课程在某学期、某教学班的实例 ID。章节、资料、知识点、作业与成员都属于该实例。前端不得再用 `web` / `db` 等样例字符串充当真实资源 ID。

`X-Request-ID` 只接受一个头值，格式为 `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`，不做首尾空白修剪。缺失、重复、空值、超长或不符合格式时，服务端生成 `req-<UUID>` 并继续处理请求。该值用于定位请求，不作为身份凭证或幂等键。当前过滤器仅处理 `/api/v1` 及其下级路径；日志线程上下文在请求结束时恢复，避免复用线程造成标识串联。

### 1.2 会话与 CSRF

使用不透明会话 ID，服务端保存会话，浏览器使用 `HttpOnly` Cookie。生产环境 Cookie 使用 `Secure`，会话失效后返回 401。跨域开发只有在明确白名单与凭据配置后才允许；优先使用同源代理。

联调顺序：

1. `GET /auth/csrf-token`：允许匿名访问，设置短期签名预登录 Cookie 并返回登录用令牌，不创建匿名数据库会话。
2. `POST /auth/login`：附带 Cookie 和 `X-CSRF-Token`；登录成功轮换会话，响应包含新 CSRF 令牌。
3. 后续有业务修改的请求，即 `POST` / `PUT` / `PATCH` / `DELETE`，均附带 `X-CSRF-Token`。会话轮换或页面刷新后可再次获取令牌。
4. `POST /auth/logout`：校验 CSRF 后销毁会话。

预登录请求以签名 Cookie 和 `X-CSRF-Token` 共同验证；登录成功后才创建绑定用户的数据库会话，后续 CSRF 令牌绑定该会话。浏览器请求使用 `credentials: 'include'`。会话 Cookie 不放入响应 JSON，不写入 `localStorage`。不存在公开自助教师注册接口，教师身份由管理员预置或导入。

学生只能访问自己的工作区、提交、消息、辅导与记录，且必须是对应教学班的学生成员。教师接口同时校验账户教师身份和 `offering_members` 中的授课成员关系。仅知道 UUID、修改 hash 路由或前端隐藏按钮不授予权限。

教学班归档后全部教学业务写入停止，包括内容维护、进度、草稿、提交、邀请、公告、AI、求助和批阅。本人历史数据仍可读取，消息标记已读、登录和退出等账户操作仍可用。归档作业也停止该作业的新草稿、提交、检查、AI、求助与批阅，不影响同班其他作业。以上状态由服务端校验，不能只依赖前端按钮禁用。

### 1.3 响应格式

单个资源或操作成功：

```json
{
  "data": { "id": "00000000-0000-4000-8000-000000000001" },
  "requestId": "req-example"
}
```

分页列表：

```json
{
  "data": {
    "items": [],
    "page": 1,
    "pageSize": 20,
    "total": 0,
    "summary": { "unreadCount": 0 }
  },
  "requestId": "req-example"
}
```

`summary` 可选，其计数表示当前权限范围和业务筛选范围的统计，不是本页条数。例如作业状态计数基于 `offeringId`，在切换 `todo` / `done` 时保持一致。空列表是 HTTP 200；超出最后一页也返回空列表和真实 `total`。

错误：

```json
{
  "error": {
    "code": "WORKSPACE_CONFLICT",
    "message": "工作区已在其他窗口更新，请重新加载后合并。",
    "details": { "currentRevision": 8 }
  },
  "requestId": "req-example"
}
```

| HTTP | 典型错误码 | 含义 |
| --- | --- | --- |
| 400 | `INVALID_REQUEST`、`INVALID_INVITE_CODE`、`INVALID_FILE_PATH` | JSON 正文缺失、格式损坏、未知字段或无法反序列化；或业务输入无效 |
| 401 | `UNAUTHENTICATED`、`INVALID_CREDENTIALS` | 会话失效或登录失败 |
| 403 | `FORBIDDEN`、`CSRF_INVALID` | 已登录但权限不足，或 CSRF 不匹配 |
| 404 | `NOT_FOUND` | 对象不存在；对其他学生的私有资源也返回此错误，避免泄露存在性 |
| 405 | `METHOD_NOT_ALLOWED` | 接口不支持当前请求方法；保留 `Allow` 响应头 |
| 406 | `NOT_ACCEPTABLE` | 接口不能提供 `Accept` 要求的响应格式 |
| 409 | `WORKSPACE_CONFLICT`、`FEEDBACK_VERSION_CONFLICT`、`IDEMPOTENCY_KEY_REUSED`、`EVENT_CONFLICT` | 乐观锁、幂等参数或客户端事件正文冲突 |
| 409 | `SUBMISSION_CLOSED`、`RESUBMIT_NOT_ALLOWED`、`ATTEMPT_LIMIT_REACHED`、`RESUBMIT_AFTER_REVIEW`、`SUBMISSION_SUPERSEDED` | 提交、补交、重交或评价状态不允许当前操作 |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | 请求正文的 `Content-Type` 不受支持 |
| 422 | `VALIDATION_ERROR` | 必填请求参数缺失、请求参数类型错误、已解析字段的范围或跨对象归属校验失败 |
| 429 | `RATE_LIMITED` | 登录、邀请码尝试、AI 或检查额度受限；附带 `Retry-After` |
| 500 | `INTERNAL_ERROR` | 未预期服务端错误；只返回请求标识和通用说明，内部日志保留细节 |
| 503 | `SERVICE_UNAVAILABLE` | 外部依赖或队列不可用；不得返回正常业务空列表 |

业务 API 的异常应转换为上述错误信封，错误响应设置 `Cache-Control: no-store`。没有附加信息时 `details` 为 `{}`；请求 DTO 字段校验失败时 `details.fields` 是 `{field,message}` 数组，只返回字段名和通用说明，不回显被拒绝的值或可能包含输入内容的自定义校验消息。Controller 返回值校验失败属于服务端错误，返回 500，不归为输入错误 422。

当前成功响应由业务 Controller 显式创建 `ApiResponse<T>`，不自动包裹全部返回值；`BusinessException` 只保存允许公开的状态、错误码、文案与详情。`@RestControllerAdvice` 继承 `ResponseEntityExceptionHandler`，已映射 Spring MVC / Jakarta Bean Validation 的输入校验、JSON 解析、404、405 等异常；未预期异常仅公开通用 500 文案，内部日志保留请求标识和堆栈，不额外记录请求正文、Cookie 或环境变量。健康路径继续使用独立约定。

Spring Security 过滤链的认证失败、权限拒绝和 CSRF 拒绝仍随认证功能实现，届时由 `AuthenticationEntryPoint` / `AccessDeniedHandler` 使用同一错误 DTO，不能只依赖 Controller 层异常处理。当前尚无登录、课程等生产业务端点，成功与主动抛错场景通过仅在测试中注册的 Controller 验证。

### 1.4 幂等与乐观锁

创建提交、发送 AI 消息必须带 `Idempotency-Key`，使用客户端生成的 UUID。幂等范围为“当前用户 + 路径中的目标对象 + 操作 + key”，保留至少 24 小时。

- 相同 key 和相同请求内容返回首次成功响应，不创建第二次提交或重复 AI 请求。
- 相同 key 配不同请求内容返回 409 `IDEMPOTENCY_KEY_REUSED`。
- 幂等重复命中优先于执行新的次数、期限与状态校验，避免网络重试再次消耗次数。
- 工作区保存和教师评价用版本校验控制多窗口冲突；客户端不能通过更大版本号直接覆盖。

重放也先检查当前会话与对象读取权限，不能通过缓存绕过账户禁用/越权。相同键仍在处理时返回409 `REQUEST_IN_PROGRESS`及Retry-After；事务已回滚则允许以原键重试。500/网络超时不能自动换新键再创建。响应中的requestId标识本次HTTP请求，可用 `Idempotency-Replayed:true` 标记重放。可重试数据库冲突最多内部重试两次，维持同键；不重试结果未知的外部模型调用。

### 1.5 可见性、配置与校验边界

学生作业列表/详情、学习记录和推荐均要求 `publishedAt != null`，不能仅凭 archived 状态公开教师草稿。作业归档只允许 published → archived；班级归档后的draft子对象仍仅教师可见。权限检查与生命周期锁在同一写事务中完成，具体锁模式见数据模型。

所有私有响应设置 `Cache-Control: no-store`，不跨账号缓存。输入DTO拒绝未知字段；标题最多200字符，说明/普通反馈最多8000字符，Markdown资源最多64 KiB UTF-8，文件使用后文100/256 KiB限制，整个JSON请求上限2 MiB。评分精度最多两位小数、满分上限9999.99；不接受NaN/Infinity。普通文本不作为HTML，前端安全渲染与路由规则见[前端接入设计](DEVELOPMENT.md#10-前端接入方案)。

字段、错误和示例是实施契约；Spring Boot 通过兼容版本的 springdoc-openapi 导出 OpenAPI，纳入契约变更校验。P1未启用能力由config.features显式给出，不能使用空分析数组误示“能力已实现但没有数据”。

## 2. 阶段与核心数据对象

| 阶段 | 本文覆盖的范围 |
| --- | --- |
| P0 | 账户导入或初始化、登录、会话、权限与统一响应 |
| P1 | 选课、章节、作业、草稿、提交、教师批阅、消息和学生反馈闭环 |
| P2 | 受限 AI、学习行为与知识证据分析、学生求助 |
| P3 | 独立隔离服务中的异步运行检查 |

后续表中的 DTO 是响应字段约定，`List<T>` 表示第 1.3 节的分页信封。

| DTO | 必须返回的字段 |
| --- | --- |
| `UserDTO` | `id`、`username`、`displayName`、`roles`（`student` / `teacher` / `admin` 数组） |
| `OfferingDTO` | `id`、`courseId`、`title`、`mark`、`groupName`、`termId`、`termLabel`、`status`（`active` / `archived`）、`progressUnit`（`chapter` / `assignment`）、`teachers:[{id,displayName}]` |
| `CourseSummaryDTO` | `offeringId`、`courseId`、`title`、`mark`、`groupName`、`termId`、`termLabel`、`status`（`active` / `archived`）、`teachers`、`currentChapter`（`{id,number,title}` 或 `null`）、`progress:{unit,completed,total,percent,notConfigured,asOf}`、`lastStudiedAt`（可空）、`pendingAssignmentCount`、`unreadFeedbackCount` |
| `ChapterSummaryDTO` | `id`、`offeringId`、`number`、`title`、`summary`、`isRequired`、`publicationState`（`draft` / `published` / `archived`）、`studentProgress:{status,completedAt}`（教师侧为 `null`）、`contentVersion`、`resourceCount`、`assignmentCount`；个人 `status` 为 `not_started` / `in_progress` / `completed` |
| `ChapterDetailDTO` | `ChapterSummaryDTO` 所有字段，加 `resources`、`knowledgePoints`、`assignments`（`AssignmentSummaryDTO[]`） |
| `ResourceDTO` | `id`、`offeringId`、`chapterId`、`knowledgePointId`（可空）、`title`、`type:'markdown'`、`content`（Markdown 正文）、`url:null`、`order`、`archived` |
| `KnowledgePointDTO` | `id`、`offeringId`、`chapterId`（可空）、`title`、`description`、`order` |
| `AssignmentSummaryDTO` | `id`、`offeringId`、`offeringStatus`（`active` / `archived`）、`chapterId`（可空）、`title`、`type`（`web_lab` / `sql_text` / `text`）、`isRequired`、`publicationState`（`published` / `archived`，教师另可见 `draft`）、`description`、`dueAt`、`assignmentState`、`overdue`、`latestSubmissionId`（可空）、`publishedFeedbackId`（可空）、`unreadFeedback` |
| `AssignmentDetailDTO` | `AssignmentSummaryDTO` 所有字段，加 `requirements`（字符串数组）、`estimatedMinutes`、`maxScore`、`rubric:[{criterionId,title,description,maxScore}]`、`knowledgePointIds`、`lateUntil`、`allowResubmit`、`maxAttempts`、`attemptsUsed`、`canSubmit`、`submissionBlockedReason`（可空）、`aiPolicyVersion` |
| `WorkspaceDTO` | `assignmentId`、`revision`、`files:[{path,content}]`、`activeFile`、`savedAt`（模板为 `null`）、`canSave`、`saveBlockedReason`（可空） |
| `SubmissionSummaryDTO` | `id`、`assignmentId`、`offeringId`、`attemptNumber`、`workspaceRevision`、`submittedAt`、`late`、`superseded`、`feedbackStatus`（`none` / `draft` / `published`）；学生看到未发布 draft 时只返回 `none` |
| `SubmissionDetailDTO` | `SubmissionSummaryDTO`所有字段，加不可变files、reflection、assignmentSnapshot:{title,requirements,rubric,maxScore,knowledgePoints,contentVersion,dueAt,aiPolicyVersion}、publishedFeedback；教师另外返回student:{id,username,displayName}和draftFeedback，学生不返回草稿字段 |
| `FeedbackDTO` | `id`、`submissionId`、`offeringId`、`assignmentId`、`assignmentTitle`、`version`、`status`（`draft` / `published`）、`score`、`maxScore`、`rubricResults:[{criterionId,score,comment}]`、`comment`、`knowledgeEvaluations`、`issueTags`（P1为[]）、`issueTagVersion`（P1为null）、`teacher:{id,displayName}`、`publishedAt`、`messageId`（本人已发布评价为有效消息ID，教师/草稿为null） |
| `NotificationDTO` | `id`、`offeringId`（系统消息可空）、`type`（`course_notice` / `assignment_published` / `feedback` / `system`，P2增加`help_reply`）、`title`、`content`、`sender:{id,displayName}`（系统消息可空）、`createdAt`、`readAt`（可空）、`target:{type,id,offeringId}`（无跳转可空） |

教师读写响应不能直接复用学生响应而泄露未发布评价。涉及某教学班的资源、章节、知识点和作业关联必须校验全部 `offeringId` 一致。章节 `number` 对应数据库 `position`，不另设章节 `order`；资料和知识点的 `order` 对应各自的 `position`。

NotificationDTO.id与FeedbackDTO.messageId均对应本人notification_recipients.id，供/me/messages/{messageId}/read使用；通知内容实体notifications.id只用于内部关联与公告详情，二者不得混用。反馈中的assignmentTitle来自提交冻结标题，不随教师澄清文本漂移。

## 3. 账户与学生接口

路径均省略共同前缀 `/api/v1`。学生接口除匿名 CSRF 和登录外，都要求有效会话；涉及教学班的接口还要求学生成员身份。

### 3.1 会话、首页与选课

| 阶段 | 方法与路径 | 权限 | 请求字段 | 成功响应 / 状态 |
| --- | --- | --- | --- | --- |
| P0 | `GET /auth/csrf-token` | 匿名或登录用户 | 无 | 200 `{csrfToken}`；匿名时设置签名预登录 Cookie，登录后返回会话绑定令牌 |
| P0 | `POST /auth/login` | 匿名，需 CSRF | `{username,password}` | 200 `{user:UserDTO,csrfToken}`；轮换会话 |
| P0 | `POST /auth/logout` | 已登录，需 CSRF | `{}` | 200 `{loggedOut:true}`；清除 Cookie |
| P0 | `GET /me` | 已登录 | 无 | 200 `UserDTO` |
| P0 | `GET /me/config` | 已登录 | 无 | 200 `{apiVersion:'v1',serverTime,timezone:'Asia/Shanghai',currentTermId,terms:[{id,label,startsAt,endsAt}],features:{aiTutoring,learningAnalytics,serverChecks}}` |
| P1 | `GET /me/dashboard` | 学生 | 可选 `termId` | 200 `DashboardDTO`，字段见示例 |
| P1 | `GET /me/courses` | 学生 | 可选 `termId,status=active\|archived\|all`（默认 active）；`page,pageSize` | 200 `List<CourseSummaryDTO>` |
| P1 | `POST /me/enrollments` | 学生，需 CSRF | `{inviteCode}` | 新加入 201 `{offeringId,enrolledAt,created:true}`；已加入幂等 200，同对象且 `created:false` |
| P1 | `GET /offerings/{offeringId}` | 本班学生或授课教师 | 无 | 200 `OfferingDTO` |
| P1 | `GET /offerings/{offeringId}/chapters` | 本班成员 | 无 | 200 `{offeringId,items:ChapterSummaryDTO[]}`，按 `number` 升序；公共目录只列已发布章节 |
| P1 | `GET /chapters/{chapterId}` | 本班成员 | 无 | 200 `ChapterDetailDTO`；公共详情只读 published，draft 返回 404 |
| P1 | `GET /resources/{resourceId}` | 本班成员 | 无 | 200 `ResourceDTO`；学生只看未归档且章节已发布的资料，历史证据只保留引用与摘要 |
| P1 | `PUT /chapters/{chapterId}/progress` | 本班学生，需 CSRF | `{status:'in_progress'\|'completed'}` | 200 `{chapterId,studentProgress:{status,completedAt},courseProgress:{unit,completed,total,percent,notConfigured,asOf}}`；只允许已发布章节 |
| P1 | `POST /me/learning-position` | 本班学生，需 CSRF | `{offeringId,chapterId?,assignmentId?}`；必须且仅指定一种目标 | 200 `{offeringId,lastChapterId,lastStudiedAt}`，服务端校验已发布且可访问目标，不接受客户端时间 |

P0 运维健康接口位于共同前缀之外：`GET /health/live` 返回 200 `{status:'ok'}`（HTTP 进程可响应）；`GET /health/ready` 检查真实数据库连接，可用时返回 200 `{status:'ready'}`，不可用时返回 503 `{status:'unavailable'}`。两者均已实现，匿名可读、无 CSRF，设置 `Cache-Control: no-store`，不暴露连接信息，也不使用业务 `data` 信封。启动时 Flyway 连接或迁移失败会阻止应用启动；ready 的 503 描述已启动应用的运行期依赖故障。AI 不参与此检查。

config.currentTermId无配置时为null；terms按开始时间降序、ID排序。课程/首页/作业查询未给termId时默认当前学期；指定offeringId的查询以该班学期为准，同时指定不匹配的termId返回422。无当前学期且未指定时返回正常空结果和明确未配置状态，不猜测本机日期。P1三项features均false；P2按实际启用状态返回，AI仍需另查作业政策。学期ID统一UUID，termLabel只展示。

learning-position只在页面实际展示后调用，预取GET不更新位置；连续重复访问同一目标按服务端时间更新，不声称阅读完成。章内任务更新对应章节，独立任务只更新班级最近时间。currentChapter依次取最后可读章节、首个未完成已发布章节、首个已发布章节、null。仅 active 班级下仍为 published 的章节或作业可更新位置；历史阅读不改变归档数据。

邀请码先去首尾空格并转大写，由服务端校验有效期、撤销状态与教学班状态。已成为目标班学生的重复加入返回原有成员关系，不新增记录。无效、过期或撤销邀请码统一返回 400 `INVALID_INVITE_CODE`。

进度 `unit` 由教学班配置决定。分母分别为已发布的必修章节或必做作业，草稿、选做和归档项不进入分母；分子为这些项目中本人已确认完成的章节或已有有效提交的作业。百分比用 `completed / total × 100` 四舍五入，正数 .5 向上；`total=0` 时为 0 且 `notConfigured:true`，否则为 `false`。`asOf` 是本次计算时间。完成阅读或提交均不代表知识点已经掌握。行为事件不能直接改写进度。

首页 `currentLearning` 优先返回截止时间最近的 `todo` 作业，无待办时返回最近学习的已发布章节；排序相同时按稳定 ID 排序。归档作业/教学班不进入首页课程与待办推荐。所有课程、作业和消息必须来自同一用户权限范围。最近访问行为不能使未加入的教学班出现在首页。

### 3.2 作业、工作区与提交

| 阶段 | 方法与路径 | 权限 | 请求字段 | 成功响应 / 状态 |
| --- | --- | --- | --- | --- |
| P1 | `GET /me/assignments` | 学生 | 可选 `offeringId,termId`；`filter=all\|todo\|done`（默认 `all`）；`page,pageSize` | 200 `List<AssignmentSummaryDTO>`；`summary:{allCount,todoCount,doneCount,archivedIncompleteCount}`；按 `dueAt` 升序、ID 升序 |
| P1 | `GET /assignments/{assignmentId}` | 本班学生或授课教师 | 无 | 200 `AssignmentDetailDTO`；教师查看时学生字段可空，不能返回其他学生状态 |
| P1 | `GET /assignments/{assignmentId}/workspace` | 本班学生本人 | 无 | 200 `WorkspaceDTO`；未保存时返回 `revision:0` 的模板，不创建假保存记录 |
| P1 | `PUT /assignments/{assignmentId}/workspace` | 本班学生本人，需 CSRF | `{baseRevision,files:[{path,content}],activeFile}` | 200 `WorkspaceDTO`；保存后 revision 加 1，过期 revision 返回 409 |
| P1 | `POST /assignments/{assignmentId}/submissions` | 本班学生本人，需 CSRF、`Idempotency-Key` | `{workspaceRevision,reflection}` | 201 `SubmissionSummaryDTO`；创建代码与评价标准不可变快照 |
| P1 | `GET /assignments/{assignmentId}/submissions` | 本班学生本人 | `page,pageSize` | 200 `List<SubmissionSummaryDTO>`，按 `attemptNumber` 降序 |
| P1 | `GET /submissions/{submissionId}` | 提交本人或该班授课教师 | 无 | 200 `SubmissionDetailDTO`；教师附加学生信息和草稿评价，学生只可见已发布评价 |

作业筛选 `todo` 限定 `NOT_STARTED` + `IN_PROGRESS`，并只包括当前 active 教学班的 published 作业；`done` 限定 `SUBMITTED` + `REVIEWED`，可包括已归档历史作品。`all` 包括本人可读的已发布和归档作业，draft 始终不可见。`archivedIncompleteCount` 仅统计因教学班或作业归档而不再属于 todo 的未完成项，它们只在 all 中显示；`allCount = todoCount + doneCount + archivedIncompleteCount`，不能把归档未完成改成已完成。状态只用英文枚举；“待完成”“已评价”等中文由前端转换。`overdue` 为独立时间字段：仅任务属于 todo 且当前服务端时间超过 `dueAt` 时为 `true`，其余为 `false`；归档未完成不再显示为当前逾期待办，不改个人作业状态枚举。已提交是否迟交使用提交上的 `late` 表示。

只有首次成功持久化工作区才将 `NOT_STARTED` 转为 `IN_PROGRESS`；读取模板、更新最近学习位置和发起 AI 辅导均不自动改变作业状态。成功提交转为 `SUBMITTED`；教师发布评价后转为 `REVIEWED`，草稿评价不会改变学生状态。

**工作区保存规则：**

- `PUT` 为全量替换文件内容，不允许删掉模板文件。文件路径必须唯一，`activeFile` 必须存在于 `files` 中。
- P1 `web_lab` 作业必须包含 `index.html`、`style.css`、`script.js` 三个模板文件，内容可为空；`sql_text` 必须包含 `answer.sql`；`text` 必须包含 `answer.md`。文件集合与模板完全一致，不接受额外文件、目录、绝对路径、`..`、可执行服务器文件或任意附件。
- P1 一次保存最多 3 个文件，单文件 UTF-8 文本不超过 100 KiB，总量不超过 256 KiB。服务端按字节数校验，超限返回 422。
- `baseRevision:0` 用于首次保存；返回 revision 为正整数。客户端收到 409 后保留本地编辑，再加载服务端版本进行合并，禁止直接重试覆盖。
- `workspaceRevision` 必须对应已保存的当前工作区版本，且大于 0。提交旧版本返回 409 `WORKSPACE_CONFLICT`。代码、反思、作业要求、评价量规和 `aiPolicyVersion` 在同一事务中形成快照。
- 已提交、截止或已评价后仍可保存草稿用于练习；这些条件只限制正式提交。保存草稿不修改已提交快照，也不使 `SUBMITTED` 或 `REVIEWED` 倒退。归档作业禁止新草稿保存，历史工作区仍可读取。
- 教学班或作业归档时 `canSave:false`，`saveBlockedReason` 返回 `OFFERING_ARCHIVED` 或 `ASSIGNMENT_ARCHIVED`；保存请求同时返回对应 409。其他正常在读成员的工作区返回 `canSave:true,saveBlockedReason:null`。

**服务端提交规则：**

- 取得全部必要锁后，在同一 MySQL 事务中另发独立 `SELECT UTC_TIMESTAMP(6)` 语句取样一次，同值用于 now、submittedAt 与 late；`now <= dueAt` 属正常提交。不能在等待锁的 SELECT 中顺带取当前时间，因为 MySQL 当前时间函数按语句开始时取样；客户端时间不能延长期限。
- `now > dueAt` 时，仅 `lateUntil != null` 且 `now <= lateUntil` 允许补交。`lateUntil:null` 表示禁止补交，不是无限延期。
- `allowResubmit:false` 时已有有效提交就拒绝第二次提交；`maxAttempts` 包含首次提交，并且只计成功创建的快照。
- 有已发布评价后首版禁止重交，返回 409 `RESUBMIT_AFTER_REVIEW`。改进练习由教师另发任务。
- 未批阅重交允许时，新提交替代上一提交成为当前有效版本；历史快照仍可查看。教师保存或发布旧提交评价须返回 409 `SUBMISSION_SUPERSEDED`，避免评价与学生最新作品错配。
- 提交校验、次数递增、快照创建与幂等记录原子完成，重复点击或多窗口并发不能绕过规则。
- 归档作业返回 409 `ASSIGNMENT_ARCHIVED`，禁止新提交、新辅导、新运行检查和新批阅；已存在历史资源、结果和通知仍可读取。

### 3.3 学习记录与消息

| 阶段 | 方法与路径 | 权限 | 请求字段 | 成功响应 / 状态 |
| --- | --- | --- | --- | --- |
| P1/P2 | `GET /me/learning-records` | 本班学生本人 | **必须** `offeringId`；`page,pageSize` 仅用于反馈列表 | 200 `{offeringId,summary,recentFeedback,feedbackPage,knowledgeEvidence,nextRecommendation}`，字段见下文 |
| P1 | `GET /me/feedback/{feedbackId}` | 评价归属学生本人 | 无 | 200 已发布`FeedbackDTO`；不存在、草稿或他人评价返回404，供消息/首页直达 |
| P1 | `GET /me/messages` | 学生或教师本人 | 可选 `offeringId,type,read=all\|unread\|read`；`page,pageSize` | 200 `List<NotificationDTO>`；`summary:{unreadCount}`；按 `createdAt` 降序 |
| P1 | `PUT /me/messages/{messageId}/read` | 收件人本人，需 CSRF | `{}` | 200 `{id,readAt}`；重复调用保留首次阅读时间 |
| P1 | `PUT /me/messages/read-all` | 当前用户，需 CSRF | `{offeringId?}` | 200 `{updatedCount}`；只更新本人、可选教学班范围内的消息 |
| P1 | `GET /offerings/{offeringId}/notices` | 本班成员 | `page,pageSize` | 200 通知分页，字段同教师创建公告响应；按 `createdAt` 降序 |
| P1 | `GET /notices/{noticeId}` | 本班成员 | 无 | 200 `{id,offeringId,title,content,target,createdAt,recipientCount}`；不是个人提醒的阅读状态 |
| P2 | `POST /me/learning-events` | 本人，需 CSRF | `{events:[{eventId,type,sessionId,occurredAt,offeringId,assignmentId?,chapterId?,payload}]}`；最多 50 条 | 200 `{acceptedCount,duplicateCount}`；按 `eventId` 幂等去重 |

`learning-records` 响应约定：

- `summary:{completedLabCount,publishedFeedbackCount,needsPracticeCount}`；`completedLabCount` 只统计 `web_lab` 类已有有效提交的实验，不把 SQL/文字练习当实验；P1 `needsPracticeCount:null`，P2 为分析状态 `needs_practice` 的知识点数。
- `recentFeedback` 是当前教学班本人最近一条已发布 `FeedbackDTO`，没有时为 `null`；`feedbackPage:{items,page,pageSize,total}` 为已发布评价列表。
- P1 `knowledgeEvidence:[]`、`nextRecommendation:null`，不能把原型里的四条学习判断当成真实分析结果。
- P2 `knowledgeEvidence`每项为`{knowledgePointId,title,assessmentState,ruleVersion,asOf,latestEvidenceAt,evidenceCount,freshness,evidenceIds,explanation,evidence:[{id,submissionId,feedbackId,assignmentId,assignmentTitle,result,note,occurredAt}]}`。assessmentState为basically_mastered/needs_practice/learning/insufficient_evidence；证据result为教师原始结论，二者独立。
- P2 `nextRecommendation` 可为 `{knowledgePointId,title,reason,sourceFeedbackId,evidenceIds,target:{type,id,offeringId}}`；优先关联本班已发布、学生可访问的待完成任务或资料，缺少有效依据时返回 `null`。前端可把“证据不足”显示为空证据状态，不能换算成零分。

知识规则knowledge-v2按时间和ID选最近三个不同作业的当前已发布证据：最新insufficient_evidence→不足；最新needs_practice→巩固；最新meets且至少两个不同作业meets→基本掌握；其余仅有关联未完成IN_PROGRESS任务时→learning；否则证据不足。一份合格历史记录不永久显示“正在学习”。evidenceCount为本次所用不同作业数，latestEvidenceAt无证据为null；距asOf≤90天fresh、超过90天stale、无证据none。asOf是计算时刻，不是最新证据时间；stale的基本掌握展示为带日期的历史判断，不当作当前测量，也不自动推翻教师结论。

消息与建议target.type使用chapter/resource/assignment/feedback/offering，P2增加help_request。前端将对象映射为明确详情路由，feedback走/me/feedback/{id}，求助走/me/help-requests/{id}。成功展示反馈后调用其messageId标已读，GET本身不改已读；P1站内消息与评价发布同步提交，正常本人已发布评价不等待异步投递。

课程公告独立于个人消息保存。晚加入学生能通过公告列表和详情阅读本班旧公告，不补发旧公告对应的个人提醒，也不增加历史未读计数。归档教学班成员仍可读取旧公告。

行为事件只接受前端事实记录，`studentId` 从会话派生，不接受客户端指定学生、分数、判题结果、知识掌握结论或 AI 政策。允许的事件类型和 payload：

| type | payload | 说明 |
| --- | --- | --- |
| `chapter_opened` | `{}` | 外层必须有 `chapterId`，且为本人可访问的同班章节 |
| `resource_opened` | `{resourceId}` | 阅读资料；必须校验资料归属 |
| `editor_opened` | `{activeFile}` | 外层必须有 `assignmentId`；文件属于作业模板，不上传代码内容 |
| `preview_opened` | `{viewport:'desktop'\|'mobile'}` | 外层必须有 `assignmentId`；报告预览打开或切换尺寸 |
| `active_heartbeat` | `{visible:true}` | 仅前台有近期操作时报告；不接受 `visible:false` 或任意时长 |

每条 `eventId` / `sessionId` 用 UUID。`occurredAt` 允许过去 24 小时至未来 5 分钟，超出范围返回 422，另记录服务端 `receivedAt`；重复 event ID 若正文不同返回 409 `EVENT_CONFLICT`。外层 `assignmentId` / `chapterId` 若同时提供，必须相互关联且属于 `offeringId`；只接受上述固定 payload 字段。整个批次先校验后原子写入，包括批次内重复 ID 的校验，不能部分保存后仍给全批成功。保存、提交、评价、AI、求助和运行检查事件由服务端业务事务或任务生成，客户端不能伪造这些事件。求助与 AI 请求次数不直接扣分或判定能力不足。

## 4. 教师接口

以下所有写接口需要 CSRF。教师创建教学班后由服务端自动建立教师成员关系，不接受请求中传入任意教师或学生身份。基础 `courses` 在 P0/P1 由管理员导入；教师从可使用的基础课程创建教学班。管理员账户维护与批量导入首版通过受控管理流程，不开放公共注册接口。

### 4.1 教学班、章节、知识点与资料

| 阶段 | 方法与路径 | 权限 | 请求字段 | 成功响应 / 状态 |
| --- | --- | --- | --- | --- |
| P1 | `GET /teacher/courses` | 教师 | `page,pageSize` | 200 `List<{id,title,mark}>`，仅列出允许开班的基础课程 |
| P1 | `GET /teacher/offerings` | 教师 | 可选 `termId`；`page,pageSize` | 200 `List<OfferingDTO>`，仅自己授课的教学班；默认当前学期 |
| P1 | `POST /teacher/offerings` | 教师，可使用该基础课程 | `{courseId,title,groupName,termId,progressUnit:'chapter'\|'assignment'}` | 201 `OfferingDTO`，自动授课成员关系；termId须为配置中存在的学期 |
| P1 | `POST /teacher/offerings/{offeringId}/archive` | 本班授课教师 | `{}` | 200 `OfferingDTO`；幂等归档，停止本班全部教学写入；有未批阅当前提交时返回 409 `ARCHIVE_PENDING_REVIEWS` |
| P1 | `GET /teacher/offerings/{offeringId}/members` | 本班授课教师 | `page,pageSize` | 200 `List<{userId,displayName,username,role,joinedAt}>` |
| P1 | `GET /teacher/offerings/{offeringId}/chapters` | 本班授课教师 | 无 | 200 `{offeringId,items:ChapterSummaryDTO[]}`；含 draft / published / archived，按 `number` 排序 |
| P1 | `GET /teacher/chapters/{chapterId}` | 本班授课教师 | 无 | 200 `ChapterDetailDTO`；可查看 draft，学生进度字段为 `null` |
| P1 | `POST /teacher/offerings/{offeringId}/chapters` | 本班授课教师 | `{number,title,summary,isRequired}` | 201 `ChapterSummaryDTO`，默认 `publicationState:'draft'`、`studentProgress:null` |
| P1 | `PATCH /teacher/chapters/{chapterId}` | 本班授课教师 | `{title?,summary?,number?,isRequired?}` | 200 `ChapterSummaryDTO`；章节号在教学班内唯一，已发布字段限制见下文 |
| P1 | `POST /teacher/chapters/{chapterId}/publish` | 本班授课教师 | `{}` | 200 `ChapterSummaryDTO`；draft → published，重复发布返回原结果 |
| P1 | `POST /teacher/offerings/{offeringId}/knowledge-points` | 本班授课教师 | `{chapterId?,title,description,order}` | 201 `KnowledgePointDTO` |
| P1 | `GET /teacher/offerings/{offeringId}/knowledge-points` | 本班授课教师 | 无 | 200 `{offeringId,items:KnowledgePointDTO[]}`，按 `order` 排序 |
| P1 | `PATCH /teacher/knowledge-points/{knowledgePointId}` | 本班授课教师 | `{chapterId?,title?,description?,order?}` | 200 `KnowledgePointDTO`；已有关联资源或作业时不得移动到不同章节 |
| P1 | `POST /teacher/chapters/{chapterId}/resources` | 本班授课教师 | `{knowledgePointId?,title,type:'markdown',content,url:null,order}` | 201 `ResourceDTO`，由章节派生 `offeringId` |
| P1 | `PATCH /teacher/resources/{resourceId}` | 本班授课教师 | `{knowledgePointId?,title?,content?,order?}` | 200 `ResourceDTO`；P1 不支持链接类型或任意附件 |
| P1 | `DELETE /teacher/resources/{resourceId}` | 本班授课教师 | 无 | 200 `{id,archived:true}`，软删除，不清除历史关联证据 |
| P1 | `POST /teacher/offerings/{offeringId}/invites` | 本班授课教师 | `{expiresAt,maxUses?}` | 201 `{id,inviteCode,expiresAt,maxUses,usedCount:0,revokedAt:null,createdAt}`；只在此响应返回明文邀请码 |
| P1 | `GET /teacher/offerings/{offeringId}/invites` | 本班授课教师 | `page,pageSize` | 200 `List<{id,expiresAt,maxUses,usedCount,revokedAt,createdAt}>`；不返回明文邀请码 |
| P1 | `POST /teacher/invites/{inviteId}/revoke` | 本班授课教师 | `{}` | 200 `{id,revokedAt}`，幂等撤销；不移除已有成员 |

章节 `publicationState` 是教师内容生命周期，`studentProgress.status` 是本人学习状态，两者独立；学生不能读取 draft，章节首次发布后才进入学生目录及必修章节分母。已发布章节 PATCH 只允许不改变训练目标的 `title` / `summary` 澄清并留审计，不允许修改 `number` / `isRequired`，后者返回 409 `CHAPTER_ALREADY_PUBLISHED`。章节与资料变更递增 `contentVersion`；归档章节禁止新进度或内容写入，学生目录不再列出，已有作品关联只显示历史摘要。

章节详情中的知识点为直接绑定该 `chapterId` 的知识点，加章内资料和作业关联的教学班级知识点。教师知识点列表同时包含未关联章节、资料或作业的知识点。知识点 `chapterId` 非空时，关联资料与作业必须属于同一章节；为空时可被同班多个章节引用。P1 资料仅受控 Markdown，`url` 固定为 `null`，不开放任意链接/上传。未归档资料随其章节发布可见；创建在 draft 章中不自动发布章节，归档资料不再出现在学生章详情和推荐中，历史证据不被级联删除。

邀请码 `expiresAt` 必须在未来，`maxUses` 省略或为 `null` 表示不限制名额，非空为正整数；首次成功加入才递增 `usedCount`，重复加入不消耗名额。名额判断、成员创建和计数递增在同一事务中锁定邀请码。数据库只存邀请码 HMAC 摘要；创建响应的明文丢失后需撤销旧邀请并创建新邀请，列表和任何详情接口都不能恢复原值。

首版不提供删除已发布章节、已开班基础课程或退课接口，避免破坏提交与学习证据关联；这些管理操作需单独定义归档规则。

### 4.2 作业、提交与评价

| 阶段 | 方法与路径 | 权限 | 请求字段 | 成功响应 / 状态 |
| --- | --- | --- | --- | --- |
| P1 | `GET /teacher/offerings/{offeringId}/assignments` | 本班授课教师 | 可选 `publicationState=draft\|published\|archived`（不传则为全部）；`page,pageSize` | 200 `List<TeacherAssignmentDTO>`，包含提交与待评价计数 |
| P1 | `POST /teacher/offerings/{offeringId}/assignments` | 本班授课教师 | `AssignmentWriteDTO`，默认 draft | 201 `TeacherAssignmentDTO` |
| P1 | `GET /teacher/assignments/{assignmentId}` | 本班授课教师 | 无 | 200 完整`TeacherAssignmentDTO`，含initialFiles与draft/published/archived，支持刷新直达编辑页 |
| P1 | `PATCH /teacher/assignments/{assignmentId}` | 本班授课教师 | draft 可更新 `AssignmentWriteDTO` 字段；published 仅 `{dueAt?,lateUntil?,description?}` | 200 `TeacherAssignmentDTO`；不得缩短窗口或修改已发布核心字段，否则 409 |
| P1 | `POST /teacher/assignments/{assignmentId}/publish` | 本班授课教师 | `{}` | 200 `TeacherAssignmentDTO`；冻结要求、量规与 AI 规则版本，并对本班生成作业通知 |
| P1 | `POST /teacher/assignments/{assignmentId}/archive` | 本班授课教师 | `{}` | 200 `TeacherAssignmentDTO`；幂等归档，保留历史读取；有未批阅当前提交时返回 409 `ARCHIVE_PENDING_REVIEWS` |
| P1 | `GET /teacher/assignments/{assignmentId}/submissions` | 本班授课教师 | 可选 `feedbackStatus=none\|draft\|published`；`latestOnly` 默认 `true`；`page,pageSize` | 200 `List<SubmissionSummaryDTO + {student:{id,username,displayName}}>` |
| P1 | `GET /teacher/submissions/{submissionId}/feedback` | 本班授课教师 | 无 | 200 `{feedback:FeedbackDTO\|null,baseVersion}`；未创建时 `baseVersion:0` |
| P1/P2 | `POST /teacher/submissions/{submissionId}/feedback` | 本班授课教师 | `{baseVersion,score,rubricResults,comment,knowledgeEvaluations,issueTags?}` | 初次创建 201 / 更新 200 `FeedbackDTO`，保持 draft，version 加 1；P2 支持受控问题标签 |
| P1 | `POST /teacher/submissions/{submissionId}/feedback/publish` | 本班授课教师 | `{baseVersion}` | 200 `FeedbackDTO`，version加1；同事务写公开评价、站内消息和接收记录，学生转REVIEWED |
| P1 | `GET /teacher/offerings/{offeringId}/stats` | 本班授课教师 | 无 | 200 `{studentCount,activeAssignmentCount,pendingReviewCount,pendingHelpCount}`；P1 `pendingHelpCount:0` |
| P1/P2 | `GET /teacher/assignments/{assignmentId}/stats` | 本班授课教师 | 无 | 200 `{studentCount,submittedStudentCount,pendingReviewCount,reviewedStudentCount,commonIssues}`；P1 `commonIssues:[]` |
| P2 | `GET /teacher/offerings/{offeringId}/students/{studentId}/learning-records` | 本班授课教师，目标是本班学生 | `page,pageSize` | 200 学习记录DTO另含student:{id,username,displayName}；仅本班证据，不含未提交代码/私有AI对话 |

`AssignmentWriteDTO` 字段：

```json
{
  "chapterId": "00000000-0000-4000-8000-000000000004",
  "title": "响应式导航栏",
  "type": "web_lab",
  "isRequired": true,
  "description": "Flex 布局 / 媒体查询",
  "requirements": ["完成桌面与窄屏导航布局", "解释一项关键布局选择"],
  "estimatedMinutes": 40,
  "knowledgePointIds": ["00000000-0000-4000-8000-000000000005"],
  "dueAt": "2026-10-09T15:59:59Z",
  "lateUntil": null,
  "allowResubmit": true,
  "maxAttempts": 3,
  "maxScore": 100,
  "rubric": [
    {
      "criterionId": "responsive-layout",
      "title": "响应式布局",
      "description": "窄屏下内容不超出容器",
      "maxScore": 100
    }
  ],
  "initialFiles": [
    {"path": "index.html", "content": "<nav class=\"navbar\"></nav>"},
    {"path": "style.css", "content": ".navbar { display: flex; }"},
    {"path": "script.js", "content": ""}
  ],
  "aiPolicyVersion": null
}
```

`TeacherAssignmentDTO` 返回以上字段，加 `id,offeringId,publicationState,publishedAt,submittedStudentCount,pendingReviewCount`。`publicationState` 为 `draft` / `published` / `archived`。`chapterId` 可为 `null`，表示未绑定章节的独立作业。草稿对学生不可见。发布是幂等操作，重复发布返回原结果，不重复通知。

`estimatedMinutes` 为正整数；`maxAttempts >= 1`；`maxScore > 0`；量规 `criterionId` 唯一、各项 `maxScore >= 0` 且总和等于作业 `maxScore`。有 `lateUntil` 时必须大于 `dueAt`。所有关联 ID 必须属于同一教学班且遵循知识点章节范围。作业有 `chapterId` 时，发布前关联章节须已发布。P1 `aiPolicyVersion:null` 表示尚未开放 AI；P2 通过政策 API 配置，不由作业写入接口任意指定版本，创建政策时 `baseVersion:0`，后续绑定服务端返回版本。提交快照保存提交时的有效政策版本，P1 为 `null`。

已发布 PATCH 只能延长 `dueAt` / `lateUntil`，或澄清不参与评分的 `description`，保存审计并保持旧提交快照不变。`lateUntil:null` 可改为晚于 `dueAt` 的时间以开放补交；已有补交窗口不能改回 `null` 或提前。`requirements`、`rubric`、`maxScore`、模板、核心知识点、`type`、`chapterId`、`isRequired`、重交及次数设置冻结，含这些字段的 published PATCH 返回 409 `ASSIGNMENT_ALREADY_PUBLISHED`。AI 政策变更使用专门的版本接口，不通过该 PATCH。归档不能复原为 published，已排队操作在发布结果前也须重新检查归档状态。

教学写事务先对班级FOR SHARE，再按需要对作业FOR SHARE/UPDATE；班归档先取班级FOR UPDATE，作业归档取班级FOR SHARE与作业FOR UPDATE，持锁检查待批阅并更新。有待批阅返回ARCHIVE_PENDING_REVIEWS；已归档幂等返回；draft归档返回ASSIGNMENT_NOT_PUBLISHED。所有学生读取仍校验publishedAt，班级归档不得暴露草稿。这些锁必须处于 MySQL/InnoDB 的显式短事务中；相关服务明确使用 READ COMMITTED，并按固定顺序锁定。

评价校验：`0 <= score <= submissionSnapshot.maxScore`；`rubricResults` 必须覆盖提交快照的全部量规项，项分数不超过该项上限，总和等于 `score`。`knowledgeEvaluations` 可为空；若提供，每项为 `{knowledgePointId,result,note}`，ID 不重复且属于作业快照中的知识点，`result` 只能为 `meets_expectation` / `needs_practice` / `insufficient_evidence`。分数可用小数，按固定两位小数精度保存。

P1 `issueTags` 省略或为空数组，`issueTagVersion:null`；P2 可提交受平台词表限制的 `string[]`，去重且不接受任意自由文本标签。标签词表由服务端课程配置初始化至教学班配置并版本化。客户端只提交标签、不指定版本；服务端派生 `issueTagVersion`，发布评价 payload 保存 `issueTags` 与所用词表版本。教师评价和学生求助使用同一受控问题标签规则，供共性问题按不同学生归纳，不把标签次数直接换算分数。

首版同一提交只保留一份可编辑draft，baseVersion:0首次创建；已发布不可覆盖，返回FEEDBACK_ALREADY_PUBLISHED。发布检查当前提交，公开评价、服务端事件、唯一通知与接收记录同事务完成；P2加知识证据。source_event_key与接收者唯一约束保证重复发布不增版本/消息。发布后重试仅在baseVersion等于该次发布前版本或当前已发布版本时返回原结果，其他旧版本409，不能静默忽略另一教师的更新。正式计分前需要另行完成可审计成绩更正流程。

提交人数与待批阅数按学生当前有效提交计数。P2共性问题每项为`{issueTag,title,reportedStudentCount,confirmedStudentCount,distinctStudentCount,description,sources,timeRange:{from,to},knowledgePointId}`。reported是学生求助自报集合，confirmed是已发布教师标签（P3可加可信检查），distinct为两集合并集大小；同一学生多次/多来源不重复计总人数。不得把自报人数显示成已确认问题，不按自由文本聚合。

### 4.3 课程通知、AI 政策与学生求助

| 阶段 | 方法与路径 | 权限 | 请求字段 | 成功响应 / 状态 |
| --- | --- | --- | --- | --- |
| P1 | `POST /teacher/offerings/{offeringId}/notices` | 本班授课教师 | `{title,content,target?}` | 201 `{id,offeringId,title,content,createdAt,recipientCount}`，向当前班学生生成通知 |
| P1 | `GET /teacher/offerings/{offeringId}/notices` | 本班授课教师 | `page,pageSize` | 200 通知分页，字段同创建响应 |
| P2 | `GET /teacher/assignments/{assignmentId}/ai-policy` | 本班授课教师 | 无 | 200 `AiPolicyDTO` |
| P2 | `PUT /teacher/assignments/{assignmentId}/ai-policy` | 本班授课教师 | `{baseVersion,...AiPolicyWriteDTO}`，字段见第 5 节 | 200 `AiPolicyDTO` 新版本；draft / published 可更新并立即生效，archived 拒绝 |
| P2 | `GET /teacher/offerings/{offeringId}/help-requests` | 本班授课教师 | 可选 `status=open\|answered\|closed`；`page,pageSize` | 200 `List<HelpRequestDTO>`，按创建时间降序 |
| P2 | `GET /teacher/help-requests/{helpRequestId}` | 本班授课教师 | 无 | 200 `HelpRequestDetailDTO` |
| P2 | `POST /teacher/help-requests/{helpRequestId}/replies` | 本班授课教师 | `{content}` | 201 `{id,content,teacher:{id,displayName},createdAt,status:'answered'}`，生成学生消息 |
| P2 | `PUT /teacher/help-requests/{helpRequestId}/status` | 本班授课教师 | `{status:'closed'}` | 200 `{id,status,updatedAt}` |

通知 `target` 若提供必须指向该班学生可见的已发布对象，正文为纯文本或受控 Markdown，不接受任意 HTML。求助详情中只包括该学生主动关联的任务、尝试与对话，不向教师开放其他班级或无关会话。

## 5. 受限 AI 与学生求助（P2）

### 5.1 AI 端点

| 方法与路径 | 权限 | 请求字段 | 成功响应 / 状态 |
| --- | --- | --- | --- |
| `GET /assignments/{assignmentId}/ai-policy` | 本班学生或授课教师 | 无 | 200 `AiPolicyDTO` |
| `GET /offerings/{offeringId}/issue-tags` | 本班成员 | 无 | 200 `{version,items:[{tag,title,description}]}`；受控词表只读，供教师评价与学生求助表单使用 |
| `GET /assignments/{assignmentId}/tutoring-sessions` | 本班学生本人 | `page,pageSize` | 200 `List<{id,assignmentId,createdAt,status,pendingRequestId,lastMessageAt}>`；按 `lastMessageAt` 降序，空时按 `createdAt`，支持刷新恢复 |
| `POST /tutoring/sessions` | 本班学生本人，需 CSRF | `{assignmentId}` | 201 `{id,assignmentId,createdAt,policyVersion}` |
| `GET /tutoring/sessions/{sessionId}/messages` | 会话本人 | `page,pageSize` | 200 `List<TutoringMessageDTO>`，按序号升序 |
| `POST /tutoring/sessions/{sessionId}/messages` | 会话本人，需 CSRF、`Idempotency-Key` | `{action:'ask'\|'concept'\|'next_hint',content,studentAttempt?,workspaceRevision?}` | 202 `{tutoringRequestId,status:'queued'}` |
| `GET /tutoring/requests/{tutoringRequestId}` | 请求本人 | 无 | 200 `{id,sessionId,status,result,error,createdAt,completedAt}` |

`AiPolicyDTO` 默认字段值：

```json
{
  "assignmentId": "00000000-0000-4000-8000-000000000006",
  "version": 1,
  "enabled": true,
  "allowedActions": ["ask", "concept", "next_hint"],
  "allowedModes": ["concept", "debug_hint", "guided_question"],
  "restrictCompleteSolution": true,
  "allowCodeBlocks": false,
  "maxHintLevel": 3,
  "requireAttemptFromLevel": 2,
  "dailyUserLimit": 30,
  "dailyAssignmentLimit": 12,
  "perMinuteLimit": 3,
  "maxOutputTokens": 800,
  "boundaryText": "允许概念解释、排错方向与引导提问，禁止完整核心实现和代码块。"
}
```

尚未配置作业政策时，GET 返回 `version:0,enabled:false` 及平台默认字段，不生成政策记录；教师以 `baseVersion:0` 创建首个正式版本。P1 中相关端点尚未启用，由 features 隐藏入口。

`AiPolicyWriteDTO` 为以上可配置字段，排除 `assignmentId` / `version` / `boundaryText`；请求额外带 `baseVersion`，新建政策为 0。`allowedActions` 是请求动作子集，`allowedModes` 是输出模式子集，不得混用。平台上限固定 `restrictCompleteSolution:true`、默认 `allowCodeBlocks:false`，教师只能收紧，不能授权完整答案或突破无代码输出上限；`maxHintLevel` 为 1～3，`requireAttemptFromLevel` 默认 2，可收紧至 1。

enabled=false或平台能力关闭时创建辅导请求返回409 AI_DISABLED；不消耗模型配额。层次与预算字段必须为受限正整数，enabled=true时allowedActions/allowedModes不得为空。策略规则不接受任意system prompt。

默认用户每日30次、每作业每日12次、每用户每分钟3次、每次最多800输出token。教师只能收紧当前作业的限制；dailyUserLimit/perMinuteLimit展示平台值，教师PUT省略或原值回传，不修改其他课程额度。每日按北京时间自然日计算。事务按班级→作业→独立 ai_budget_locks 学生行 FOR UPDATE→学生成员→tutoring_progress 顺序锁定并预占；预算串行化不锁 users 行。预算锁行在 P2 迁移及学生建立时预创建，缺行修复在进入教学业务事务之前独立完成；具体规则见数据模型。提示进度独立于草稿，客户端不能指定层次。

draft/published政策更新新增不可变版本，版本冲突AI_POLICY_VERSION_CONFLICT。生成时与审核时policy分别记录；最终发布事务持班级/作业共享锁，确认审核版本仍为当前且worker领取代次有效。不符合时重新审核或回退，不在事务外检查后无条件发布。result.policyVersion为审核版本，generationPolicyVersion为最后一次实际模型调用所用版本，尚未调用为null；每次调用的历史政策单独保留；不用覆盖一个policyId抹去生成审计。

`ask` 要求非空 `content`，长度不超过 4000 字符；`concept` / `next_hint` 的 `content` 可为空字符串。`studentAttempt` 可空，长度不超过 8000 字符；`workspaceRevision` 若提供必须是本人当前已保存 revision。服务端按作业政策选择需要的代码与任务快照，不接受客户端传入系统提示词、政策版本、完整答案授权、学生身份或任意其他学生代码。

`TutoringMessageDTO`为`{id,sequence,role,content,createdAt,tutoringRequestId,mode,hintLevel,policyVersion,contentUnavailableReason}`；role student/assistant。稳定持久消息ID与会话sequence不能刷新重排；入队写学生消息，完成/回退最多一条已审核助手消息，failed不创建假助手回复。学生mode/hintLevel/policyVersion为null。内容正常时reason为null，到期content为null、reason为retention_expired。

同一(studentId,assignmentId)跨会话最多一个queued/running请求，MySQL 可空生成列上的唯一约束兜底；新键冲突409 AI_REQUEST_IN_PROGRESS，details返回仅本人的pendingRequestId。同键返回原请求。会话status为active/closed，pendingRequestId/lastMessageAt可空；闭合会话不可再发送。

ask不自动升级（初始1，否则已交付最高层），concept为1，next_hint为最高已交付层+1（初始1）。超过政策上限返回409 HINT_LIMIT_REACHED；达到requireAttemptFromLevel需studentAttempt。只有completed交付推进highestDeliveredHintLevel，fallback/failed不推进。上下文取同任务跨会话的已审核历史及披露摘要；历史过期后采用固定知识卡/教师求助回退，不因换会话或清理历史重新升级。

查询状态为 `queued` / `running` / `completed` / `fallback` / `failed`：

- `queued` / `running`：`result:null,error:null`。
- `completed`：`result:{mode,hintLevel,policyVersion,generationPolicyVersion,content,nextAction,contentUnavailableReason}`，error:null。mode为concept/debug_hint/guided_question，hintLevel为1～3；正常内容reason=null。
- `fallback`：已提供固定受控提示，result.mode=fallback，其余字段同上；未调用模型时generationPolicyVersion=null。error为有限原因码，不泄露原始提示；hintLevel不提升已交付进度。
- `failed`：没有可用结果，`result:null`，`error:{code,message}`。额度或政策拒绝在入队前返回对应业务错误，不伪造成功对话。
- `nextAction` 为 `try_and_report` / `review_concept` / `request_teacher_help` / `none`。模型响应须经服务端规则校验，限制完整核心解法；规则拦截可返回引导或降级内容，并留存政策审计。
- 达到政策 `requireAttemptFromLevel`（默认第二层）必须有非空 `studentAttempt`，否则入队前返回 422 `ATTEMPT_REQUIRED`，不由客户端将 `hintLevel` 置高跳过。已受理或调用结果未知的外部请求仍占用预算，不能对未知超时盲目重复调用；能确认未调用提供商的系统失败才释放预占。

前端建议首次间隔 1 秒查询，随后逐步退避至 5 秒；离开页面停止轮询，重进时按请求 ID 恢复。HTTP 200 查询响应只说明状态查询成功，`failed` 仍需显示失败与重试入口。

外部调用每次有provider_call记录，attemptNo只允许1或2，最多一次明确收到违规输出后的重生成。started结果未知不重新生成/不释放预算。worker续租和终态写入用claimToken/leaseVersion条件更新；旧worker结果丢弃。90天后请求与消息保留ID/状态/时间等元数据，正文、代码、披露文本和共享副本按数据模型清理；终态completed不会因清理伪装成新失败，result.content=null且contentUnavailableReason=retention_expired。队列仅存ID，幂等缓存不复制正文。

### 5.2 学生求助端点

| 方法与路径 | 权限 | 请求字段 | 成功响应 / 状态 |
| --- | --- | --- | --- |
| `POST /me/help-requests` | 本班学生，需 CSRF | `{assignmentId,title,content,studentAttempt,workspaceRevision?,sharedTutoringRequestIds?,issueTags?}` | 201 `HelpRequestDTO` |
| `GET /me/help-requests` | 本人 | 可选 `offeringId,status`；`page,pageSize` | 200 `List<HelpRequestDTO>` |
| `GET /me/help-requests/{helpRequestId}` | 本人 | 无 | 200 `HelpRequestDetailDTO` |

`HelpRequestDTO`：`{id,offeringId,assignmentId,title,content,studentAttempt,workspaceRevision,sharedTutoringRequestIds,issueTags,status,createdAt,updatedAt}`，未分享的 revision 为 `null`、数组为 `[]`。`HelpRequestDetailDTO` 加 `sharedSnapshot`（只含主动选择的代码版本，未分享为 `null`）、`sharedTutoringResults`（只含主动选择且已审核的请求结果）和 `replies:[{id,content,teacher,createdAt}]`。

教师求助列表和详情额外返回student:{id,username,displayName}；学生不能指定/替换该身份。sharedTutoringResults每项包含requestId,content,expiresAt,contentUnavailableReason；到期content=null，不能用共享副本延长原AI内容保留期。sharedSnapshot包含files,expiresAt,contentUnavailableReason，代码副本90天后files=null。创建共享前展示保留期；普通求助正文和教师回复依课程归档策略。

状态为 `open` / `answered` / `closed`。`workspaceRevision` 必须为本人该作业的当前保存版本，创建时冻结共享快照，后续保存不会改变求助共享内容。选中的请求必须属于本人同作业且 `completed` / `fallback` 有已审核输出，不分享整个会话、后续新增消息或未选择的代码。`issueTags` 是本班允许的问题标签，不能传其他班或个人敏感信息。归档教学班或作业拒绝新求助/回复，历史本人求助仍可读取，教师回复只由授课范围内用户发送。

## 6. 隔离运行检查（P3）

| 方法与路径 | 权限 | 请求字段 | 成功响应 / 状态 |
| --- | --- | --- | --- |
| `POST /assignments/{assignmentId}/checks` | 本班学生本人，需 CSRF | `{workspaceRevision}`；建议附 `Idempotency-Key` | 202 `{checkId,status:'queued'}` |
| `GET /checks/{checkId}` | 检查本人 | 无 | 200 `{id,assignmentId,workspaceRevision,checkerVersion,status,result,error,createdAt,completedAt}` |

检查状态为 `queued` / `running` / `completed` / `error`。`result` 在完成时为 `{passed,total,items:[{ruleId,status:'pass'|'fail',message}],output,truncated}`，外层另返回 `checkerVersion`。规则确实完成才产生 `pass` / `fail`，基础设施超时、执行服务故障或无法形成可靠判断使用 `status:'error',result:null,error:{code,message}`，不能把服务故障记成学生 `fail`。资源限制类错误需区分学生程序触发与基础设施异常，并保留独立错误码。输出截断不得被当作完整结果。

API 进程只校验、保存快照与入队，**不执行学生代码**。独立执行服务限制 CPU、内存、运行时间、文件系统和网络权限。P1 网页预览是浏览器沙箱中的效果预览，不应显示为可信后端检查；P3 判定来自服务端执行和版本化规则，客户端上传的“检查通过”不能作为成绩或证据。

## 7. 核心联调 JSON 示例

示例 ID 仅展示 UUID 格式；真实值以创建接口返回为准。下列日期均为 UTC。

### 7.1 学生课程与首页聚合

`GET /api/v1/me/courses?page=1&pageSize=20`：

```json
{
  "data": {
    "items": [
      {
        "offeringId": "00000000-0000-4000-8000-000000000003",
        "courseId": "00000000-0000-4000-8000-000000000002",
        "title": "Web 前端开发技术",
        "mark": "WEB",
        "groupName": "计算机 2301 班",
        "termId": "00000000-0000-4000-8000-000000000011",
        "termLabel": "2026 秋季学期",
        "status": "active",
        "teachers": [
          {
            "id": "00000000-0000-4000-8000-000000000001",
            "displayName": "李老师"
          }
        ],
        "currentChapter": {
          "id": "00000000-0000-4000-8000-000000000004",
          "number": 3,
          "title": "CSS 布局与响应式设计"
        },
        "progress": {
          "unit": "assignment",
          "completed": 3,
          "total": 5,
          "percent": 60,
          "notConfigured": false,
          "asOf": "2026-10-02T02:00:00Z"
        },
        "lastStudiedAt": "2026-10-02T01:20:00Z",
        "pendingAssignmentCount": 2,
        "unreadFeedbackCount": 0
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 1
  },
  "requestId": "req-courses"
}
```

`GET /api/v1/me/dashboard` 的 `data`：

```json
{
  "termId": "00000000-0000-4000-8000-000000000011",
  "termLabel": "2026 秋季学期",
  "serverTime": "2026-10-02T02:00:00Z",
  "courseCount": 1,
  "pendingAssignmentCount": 2,
  "unreadMessageCount": 0,
  "currentLearning": {
    "type": "assignment",
    "offeringId": "00000000-0000-4000-8000-000000000003",
    "chapterId": "00000000-0000-4000-8000-000000000004",
    "assignmentId": "00000000-0000-4000-8000-000000000006",
    "title": "响应式导航栏",
    "description": "Flex 布局 / 媒体查询",
    "assignmentType": "web_lab",
    "assignmentState": "IN_PROGRESS",
    "dueAt": "2026-10-09T15:59:59Z",
    "overdue": false,
    "resume": {
      "activeFile": "style.css",
      "savedAt": "2026-10-02T01:20:00Z",
      "workspaceRevision": 2
    }
  },
  "otherPendingAssignments": [
    {
      "id": "00000000-0000-4000-8000-000000000012",
      "offeringId": "00000000-0000-4000-8000-000000000003",
      "offeringStatus": "active",
      "chapterId": "00000000-0000-4000-8000-000000000004",
      "title": "商品卡片布局",
      "type": "web_lab",
      "isRequired": true,
      "publicationState": "published",
      "description": "盒模型与Flex布局",
      "dueAt": "2026-10-12T15:59:59Z",
      "assignmentState": "NOT_STARTED",
      "overdue": false,
      "latestSubmissionId": null,
      "publishedFeedbackId": null,
      "unreadFeedback": false
    }
  ],
  "recentFeedback": null,
  "courses": [
    {
      "offeringId": "00000000-0000-4000-8000-000000000003",
      "courseId": "00000000-0000-4000-8000-000000000002",
      "title": "Web 前端开发技术",
      "mark": "WEB",
      "groupName": "计算机 2301 班",
      "termId": "00000000-0000-4000-8000-000000000011",
      "termLabel": "2026 秋季学期",
      "status": "active",
      "teachers": [
        {
          "id": "00000000-0000-4000-8000-000000000001",
          "displayName": "李老师"
        }
      ],
      "currentChapter": {
        "id": "00000000-0000-4000-8000-000000000004",
        "number": 3,
        "title": "CSS 布局与响应式设计"
      },
      "progress": {
        "unit": "assignment",
        "completed": 3,
        "total": 5,
        "percent": 60,
        "notConfigured": false,
        "asOf": "2026-10-02T02:00:00Z"
      },
      "lastStudiedAt": "2026-10-02T01:20:00Z",
      "pendingAssignmentCount": 2,
      "unreadFeedbackCount": 0
    }
  ],
  "recentNotice": null
}
```

首页返回 `courses:CourseSummaryDTO[]`，完整列表仍用 `/me/courses` 分页；首页最多 6 门，`otherPendingAssignments` 最多 2 项且不重复当前任务，最多一条 `recentFeedback:FeedbackDTO|null` 与一条 `recentNotice:NotificationDTO|null`。若当前是章节，`currentLearning` 返回 `{type:'chapter',offeringId,chapterId,title,description}`；无可继续资源时为 `null`。

### 7.2 保存草稿、提交与批阅发布

`PUT /api/v1/assignments/{assignmentId}/workspace`，请求：

```json
{
  "baseRevision": 2,
  "files": [
    {"path": "index.html", "content": "<nav class=\"navbar\">Studio</nav>"},
    {"path": "style.css", "content": ".navbar { display: flex; flex-wrap: wrap; }"},
    {"path": "script.js", "content": ""}
  ],
  "activeFile": "style.css"
}
```

响应的 `data` 为 `WorkspaceDTO`，包含 `revision:3`、原文件内容与 `savedAt`。后续提交：

```http
POST /api/v1/assignments/{assignmentId}/submissions
Content-Type: application/json
X-CSRF-Token: <令牌>
Idempotency-Key: 00000000-0000-4000-8000-000000000010
```

```json
{
  "workspaceRevision": 3,
  "reflection": "窄屏时允许菜单换行，避免总宽度超过容器。"
}
```

201 响应：

```json
{
  "data": {
    "id": "00000000-0000-4000-8000-000000000007",
    "assignmentId": "00000000-0000-4000-8000-000000000006",
    "offeringId": "00000000-0000-4000-8000-000000000003",
    "attemptNumber": 1,
    "workspaceRevision": 3,
    "submittedAt": "2026-10-02T02:05:00Z",
    "late": false,
    "superseded": false,
    "feedbackStatus": "none"
  },
  "requestId": "req-submit"
}
```

教师 `POST /api/v1/teacher/submissions/{submissionId}/feedback` 保存请求：

```json
{
  "baseVersion": 0,
  "score": 85,
  "rubricResults": [{"criterionId": "responsive-layout", "score": 85, "comment": "基本完成，建议继续检查间距。"}],
  "comment": "导航已能适应窄屏，请解释断点选择依据。",
  "knowledgeEvaluations": [
    {"knowledgePointId": "00000000-0000-4000-8000-000000000005", "result": "needs_practice", "note": "布局正确，断点依据还需要说明。"}
  ]
}
```

首次保存得到 `status:'draft',version:1`。再调用 `POST /api/v1/teacher/submissions/{submissionId}/feedback/publish`，请求 `{"baseVersion":1}`，得到 `status:'published',version:2`；学生此时可见FeedbackDTO，作业状态变为REVIEWED；同一事务已生成本人消息记录，messageId立即可读。

### 7.3 AI 异步提示

`POST /api/v1/tutoring/sessions/{sessionId}/messages`，附 `Idempotency-Key` 与 CSRF，请求：

```json
{
  "action": "ask",
  "content": "窄屏时菜单溢出，应该检查哪里？",
  "studentAttempt": "我已经减小 gap，但仍然超出容器。",
  "workspaceRevision": 3
}
```

202 响应：

```json
{
  "data": {"tutoringRequestId": "00000000-0000-4000-8000-000000000008", "status": "queued"},
  "requestId": "req-ai-submit"
}
```

查询完成时的 `data`：

```json
{
  "id": "00000000-0000-4000-8000-000000000008",
  "sessionId": "00000000-0000-4000-8000-000000000009",
  "status": "completed",
  "result": {
    "mode": "debug_hint",
    "hintLevel": 1,
    "policyVersion": 1,
    "generationPolicyVersion": 1,
    "contentUnavailableReason": null,
    "content": "先检查菜单是否允许换行，再比较菜单总宽度和容器可用空间。",
    "nextAction": "try_and_report"
  },
  "error": null,
  "createdAt": "2026-10-02T02:10:00Z",
  "completedAt": "2026-10-02T02:10:03Z"
}
```

## 8. 前端接线与验收边界

| 前端位置 | 需要替换的数据或交互 | 对接接口 |
| --- | --- | --- |
| `learning-ui.js:6–23` | 课程、选课、任务、待办、反馈计数内存样例 | `/me/courses`、`/me/assignments`、`/me/dashboard` |
| `learning-ui.js:121–140` | 邀请码常量字典、`joined.add` | `POST /me/enrollments`；成功后刷新真实课程与首页数据 |
| `course-ui.js:6–22`、`main.js:19,30` | 固定第 3 章、不可切换章节、固定资料 | 章节目录、章节详情、`PUT /chapters/{id}/progress` |
| `learning-ui.js:87–118` | 作业要求、`done/state/route` 与示例逾期计算 | 作业 DTO；前端状态映射与服务端 `overdue/canSubmit` |
| `main.js:21–24,32–35` | 只读代码、固定提示、静态预览、演示提交 | 工作区保存/读取、提交、P2 AI、P3 检查 |
| `records-ui.js:3–44` | 固定知识证据、教师反馈与下一步建议 | `/me/learning-records?offeringId=...` |
| `records-ui.js:51–71` | 固定消息数量、未读与已读标签 | 消息列表与标记已读 |
| `main.js:26` | 教师硬编码统计、布置/批阅/求助演示按钮 | 教师教学班、作业、提交、评价、统计、通知与 P2 求助 |

以下原型行为不能进入接口字段：

- `?scenario=empty|clear|error` 是原型状态预览；真实空态来自 200 空列表，失败来自错误响应。
- `sampleDate='2026-10-01'` 只服务于示例；真实截止时间、补交边界与统计使用服务端时间。
- 中文 `state`、布尔 `done` 和 `route:'lab'|'progress'` 是原型表示，不是持久业务模型。
- 教师/学生视角由页面路由切换，不代表真实身份。登录后按账户与教学班权限显示入口。
- “已提交”不等于“已掌握”，“章节已阅读”不等于能力评价；分数与知识证据必须在教师发布后可见。

P1 联调最低验收：匿名拿 CSRF → 学生登录 → 邀请码加入 → 查看章节和作业 → 保存草稿并处理版本冲突 → 提交不可变快照 → 教师保存 draft → 学生看不到 draft → 教师发布 → 学生看到反馈和未读消息 → 标记已读。再验证其他学生不能读取该提交、非授课教师不能批阅、补交关闭或已评价重交被拒绝。P2/P3 的按钮在对应服务未实现时应明确显示未开放，不能给出模拟成功结果。
