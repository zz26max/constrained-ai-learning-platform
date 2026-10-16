# P1-D 前端 UI：首页、学习记录、公告与边界场景

> 状态：已实现（2026-10-16，`f4a1e1a`），`npm --prefix frontend run verify` 通过（17 个测试文件、170 个用例）；未做浏览器级走查，不得据此标 `verified`。字段一律以 `docs/openapi.yaml` 1.1.0 与 `frontend/src/api/generated/schema.d.ts` 为准，本文不重复定义 DTO；业务口径见 DEVELOPMENT.md 第 9、10 节，交互规则见 FRONTEND.md 第 4、6、9 节。`docs/features/p1d-aggregation.md` 已作废，不得参考。

## 1. 目标与完成线

完成线就是 DEVELOPMENT.md 的 P1-D 验收：**首页、消息、历史、归档与期限场景通过**。达到即停，以下明确不做：

- 教师发布公告页（后端定向公告暂不支持，教师端发公告留到后续）。
- 教师作业统计页、教师查看学生学习记录页（FRONTEND.md 将后者列为 P2）。
- 知识点证据、下一步推荐的展示（P2-B）；`knowledgeEvidence` 为空数组、`nextRecommendation` 为 null 时显示"P2 开放"的阶段说明，不显示为 0。

## 2. 范围总览

| 编号 | 交付 | 读取接口 | 类型 |
| --- | --- | --- | --- |
| U1 | 学生首页 `StudentHomePage` | `getDashboard` | 新页面 |
| U2 | 学习记录 `LearningRecordsPage` | `getMyLearningRecords` | 新页面 |
| U3 | 课程公告列表与详情 | `listNotices`、`getNotice` | 新页面 ×2 |
| U4 | 教师工作台统计卡片 | `getOfferingStats` | 现有页面加卡片 |
| U5 | 消息目标跳转 | 无新接口 | 改 `NotificationCenter` |
| U6 | 归档与期限边界核查 | 现有接口 | 改现有页面 + 测试 |

API 客户端（`dashboardApi()`、`noticesApi()`、`statsApi()`）、注册与 mock 已在 `51b000f` 完成，本包只写页面、路由、样式与测试，不改 API 层；如发现客户端与契约不符，先报告。

## 3. 路由

沿用现有 `/student/...`、`/teacher/...` 约定（FRONTEND.md 第 4 节已同步修订）。新增：

| name | path | 组件 | meta |
| --- | --- | --- | --- |
| `student-home` | `/student/home` | `features/dashboard/StudentHomePage.vue` | 学生，`首页 · 学习空间` |
| `student-progress-select` | `/student/progress` | `features/dashboard/LearningRecordsPage.vue` | 学生，`学习记录 · 学习空间` |
| `student-progress` | `/student/progress/:offeringId` | 同上 | 同上 |
| `student-notices` | `/student/offerings/:offeringId/notices` | `features/notices/NoticeListPage.vue` | 学生，`课程公告 · 学习空间` |
| `student-notice` | `/student/notices/:noticeId` | `features/notices/NoticeDetailPage.vue` | 学生，`公告详情 · 学习空间` |

- `defaultEntry()`：学生改为 `/student/home`；教师不变。`router.ts` 的 `/` 重定向随之生效。现有测试中断言 `/course` 为学生默认入口的用例同步修改。
- `App.vue` 学生导航顺序：首页、我的课程、我的作业、学习记录、消息。
- 路由参数在页面内用 `features/assignments/format.ts` 的 `isUuid` 校验（`AssignmentDetail.vue` 已有用法）；非法参数显示"链接无效"并给返回入口，不发请求。时间格式化同样复用该文件的 `formatDueTime`，不另写。

## 4. 通用约束（所有页面）

- 数据加载统一用 `features/courses/use-page-query.ts`，路由参数变化即新 generation，旧响应丢弃。
- 四态分离：加载中、错误（显示 message 与 requestId，提供"重试"）、空、正常。错误不得渲染成空状态。
- 文本一律插值渲染，禁止 `v-html`；公告 `content` 用 `white-space: pre-wrap` 保留换行。
- 页面切换后聚焦 `h1`；交互元素最小 44px；颜色：蓝=操作、绿=完成、橙=逾期、红=错误，状态同时有文字，不只靠颜色。
- 时间按 `Asia/Shanghai` 展示；"逾期"以后端 `overdue` 为准，前端不用本机时钟重算。
- 任何 GET 都不改变已读状态；本包不在页面加载时调用 `markMessagesAsRead`。

## 5. U1 学生首页

数据：一次 `getDashboard()`（不传 termId，取当前学期）。布局自上而下：

1. 标题栏：`h1` "首页"，副标题 `termLabel`；`termId` 为 null 时显示"当前没有进行中的学期"，下方各区按空状态展示，不报错。
2. 汇总条：`courseCount` 门课程、`pendingAssignmentCount` 项待完成、`unreadMessageCount` 条未读（链接到 `/student/messages`）。
3. 当前学习（主区域，按 `currentLearning.type` 分支）：
   - `assignment`：标题、作业类型、截止时间、状态文字；`overdue` 为 true 时橙色"已逾期"标签。主按钮"继续作业"→ `/student/assignments/:assignmentId`；`resume` 非 null 时文案改为"继续上次的工作"。
   - `chapter`：章节标题与描述，按钮"继续学习"→ `/course/:offeringId/chapter/:chapterId`。
   - null：空状态"暂无待完成任务"，按钮"查看我的课程"→ `/course`。
4. 其他待办：`otherPendingAssignments`（≤2 条）列表，每条标题、截止时间、逾期标签，链接到作业详情；为空则整块不显示。"全部作业"链接到 `/student/assignments`。
5. 最近反馈：`recentFeedback` 非 null 时显示作业名、发布时间与摘要（只取契约已有字段，不拼接未定义字段），链接到该作业详情；null 时显示"暂无已发布的评价"。
6. 课程总览：`courses`（≤6）紧凑卡片：标题、`groupName`、教师名、进度条。进度：`progress.notConfigured` 为 true 显示"未配置学习内容"，不显示 0%；否则显示 `completed/total` 与 `percent%`。`pendingAssignmentCount`、`unreadFeedbackCount` 大于 0 时显示角标。卡片链接到 `/course/:offeringId`，另带"学习记录"链接到 `/student/progress/:offeringId`、"公告"链接到 `/student/offerings/:offeringId/notices`。`courseCount` 大于 6 时显示"查看全部课程"。
7. 公告摘要：`recentNotice` 非 null 时显示标题、发送者、时间，未读（`readAt` 为 null）加"未读"文字标签；点击按 §9 的 target 映射跳转，target 为 null 时跳 `/student/messages`。

## 6. U2 学习记录

- `/student/progress`（无参数）：用 `CoursesApi` 现有的我的教学班列表接口列出本学期教学班，点选后 `router.replace` 到 `/student/progress/:offeringId`；只有一个教学班时直接 replace。列表为空显示"尚未加入教学班"并链接 `/course`。
- `/student/progress/:offeringId`：`getMyLearningRecords(offeringId)`。契约该操作无分页参数，`feedbackPage` 由后端一次返回；前端按每页 10 条对 `feedbackPage.items` 本地切片，页码存在 query 的 `page` 中，翻页只改 query、不重新请求。（原稿写 `{ page, pageSize }`，与契约不符，2026-10-16 更正。）
- 内容：
  1. 汇总：`completedLabCount` 个实验已完成、`publishedFeedbackCount` 份评价已发布；`needsPracticeCount` 为 null 时显示"P2 开放"，不显示 0。
  2. 最近反馈：同 U1 第 5 项。
  3. 评价历史：`feedbackPage.items` 列表，每条链接到作业详情；分页复用现有分页组件写法（`teacher/TeacherPagination.vue` 或 `NotificationCenter` 的翻页），总数为 0 时显示"暂无评价"。
  4. 知识点证据与下一步推荐：`knowledgeEvidence` 为空数组、`nextRecommendation` 为 null 时显示阶段说明"知识点掌握分析将在 P2 开放"；本包不渲染非空情况（后端 P1 恒为空）。
- 403/404：显示"无法查看该教学班的学习记录"，链接回 `/student/progress`。

## 7. U3 课程公告

- 列表 `/student/offerings/:offeringId/notices`：`listNotices(offeringId, { page, pageSize: 20 })`，按后端顺序（createdAt DESC）展示标题、时间、正文前 120 字（前端截断，纯文本）。点击进入详情。空：显示"本课程暂无公告"。顶部返回链接到 `/course/:offeringId`。
- 详情 `/student/notices/:noticeId`：`getNotice(noticeId)`，显示标题、时间、`content`（pre-wrap）；`target` 非 null 时显示"查看相关内容"按钮，按 §9 映射跳转。返回链接到该公告所属 `offeringId` 的列表。
- `recipientCount` 是教师视角字段，学生页不显示。
- 学生课程详情页 `OfferingPage.vue` 增加"课程公告"入口链接（仅加链接，不改其他逻辑）。
- 打开公告详情不自动标记相关消息已读。

## 8. U4 教师工作台统计卡片

- 在 `teacher/TeacherOfferingPage.vue` 标题区下方加四张卡片，数据来自 `getOfferingStats(id)`，独立 `usePageQuery`，失败只在卡片区显示错误与重试，不影响工作台其余部分。
- 卡片：学生 `studentCount`、进行中作业 `activeAssignmentCount`、待批阅 `pendingReviewCount`（大于 0 时链接到 `/teacher/offerings/:offeringId/assignments`）、待处理求助 `pendingHelpCount`（P1 恒为 0，标注"P2 开放"）。
- 归档教学班照常显示统计。

## 9. U5 消息目标跳转

抽出纯函数 `features/notifications/target-route.ts`：`targetRoute(target: TargetDTO): RouteLocationRaw | 'needs-feedback-lookup' | null`，供 `NotificationCenter`、首页公告摘要、公告详情共用。映射：

| target.type | 路由 |
| --- | --- |
| `offering` | `{ name: 'course', params: { offeringId: id } }` |
| `chapter` | `{ name: 'chapter', params: { offeringId, chapterId: id } }` |
| `resource` | `{ name: 'resource', params: { resourceId: id } }` |
| `assignment` | `{ name: 'student-assignment', params: { id } }` |
| `feedback` | 先 `getFeedback(id)` 取 `assignmentId`，再到 `student-assignment`（沿用现有逻辑） |
| `help_request` | null（P2），按钮不显示 |

- `id`、`offeringId` 不是 UUID 时返回 null，不拼接任何字符串 URL。
- `NotificationCenter.canOpen` 改为以 `targetRoute` 结果是否非 null 判断；跳转目标返回 403/404 时显示"该内容已不可访问"并保留在消息页（现有 `navigateError` 写法）。
- 不改消息的已读逻辑。

## 10. U6 归档与期限边界核查

不新增功能，只核对现有页面并补测试；发现不符就改到符合，改动写进交付摘要：

- 归档教学班（`offeringStatus === 'archived'`）的作业详情、工作区：只读提示可见；保存、提交按钮的禁用与文案以后端 `canSave`、`canSubmit`、`blockedReason` 为准，前端不自行推断。
- 归档作业（`publicationState === 'archived'`）在列表与首页中带"已归档"文字标签，仍可打开查看历史提交与评价。
- 逾期：`overdue` 为 true 显示橙色"已逾期"；未逾期显示截止时间。契约中 `dueAt` 为必填 Timestamp，不会为 null；前端 `dueText` 对空值做防御显示"无截止时间"，不是契约场景（2026-10-16 更正）。
- 已归档教学班的公告列表、学习记录仍可读。
- 已读：首页、公告页、学习记录页加载后，transport 中不得出现任何已读写请求。

## 11. 测试

新增 `frontend/tests/p1d-ui.test.ts`（ScriptedTransport + 现有 helpers，不连真实后端）。至少覆盖：

1. 学生登录后 `/` 重定向到 `/student/home`；`router.test.ts:64` 断言同步改为 `/student/home`。
2. 首页三种 `currentLearning`（assignment / chapter / null）各渲染正确按钮与链接；`overdue` 出现"已逾期"文字。
3. `termId` 为 null 显示无学期提示；`notConfigured` 不显示 0%。
4. 首页接口失败显示错误与 requestId 和重试，不显示空状态文案。
5. 学习记录：P2 字段显示阶段说明；翻页更新 query 并发新请求；非法 offeringId 不发请求。
6. 公告列表空状态、详情 content 中的 `<script>` 以文本出现。
7. `targetRoute` 六种 type 与非法 UUID 的单元测试。
8. 教师工作台统计卡片：失败只影响卡片区。
9. 首页、公告、学习记录加载后无已读写请求。
10. 归档作业显示"已归档"、按钮遵循 `canSubmit`。

mock（`src/mocks/dashboard.ts`）缺场景时可补数据，但不改 API 层。完成标准：`npm --prefix frontend run verify` 通过（含 `check:no-mock`）。

## 12. 修改文件清单

- 新增：`features/dashboard/StudentHomePage.vue`、`LearningRecordsPage.vue`；`features/notices/NoticeListPage.vue`、`NoticeDetailPage.vue`；`features/notifications/target-route.ts`、`features/notifications/use-open-target.ts`（首页公告摘要与公告详情共用的跳转 composable，实现时新增）；`tests/p1d-ui.test.ts`；必要时 `styles/dashboard.css`（在 `main.ts` 引入）。
- 修改：`app/router.ts`（新路由、`defaultEntry`）、`app/App.vue`（导航）、`features/notifications/NotificationCenter.vue`、`features/teacher/TeacherOfferingPage.vue`、`features/courses/OfferingPage.vue`（公告入口）、`tests/router.test.ts`，以及 U6 核查中需修正的页面。
- 不改：`src/api/**`、`src/api/generated/**`、backend、契约。

## 13. 实现分工

纯前端包，派一个 Sonnet 子代理实现，只读写 `frontend/`；主会话审查 diff 并重跑 verify 后以 `frontend:` 前缀提交。跨端联调与 `verified` 标记不在本包内，见 STATUS。
