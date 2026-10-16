# 当前状态与交接

本文件记录会随交付变化的进度、交接与验证结果。**实现任务可以直接更新本文件**，无需另行授权；架构、业务规则与契约仍按 [AGENTS.md](../AGENTS.md) 的规则修改。设计基线见 [DEVELOPMENT](DEVELOPMENT.md)。

## 1. 当前真实状态

契约基线 1.1.0（2026-10-13 按课程演示规模简化，见 [DEVELOPMENT 第 14 节](DEVELOPMENT.md#14-决策与变更记录)）。

> **2026-10-16 全量核对与后端对齐（以 openapi.yaml 1.1.0 为准）**：核对发现下列"已完成"自述不实，P1-B 核对的 10 个操作中 9 个与契约不符，P1-C 的 9 个、P1-D 的 9 个全部不符。同日已按契约逐项修复后端并分批提交：`3008f19`、`5f5fa22`（P1-B）、`e716dde`、`443a5f9`（P1-C）、`2dac32e`、`b4fcf42`（P1-D）；契约占位响应修复见 `82977c9`。最近一次 `./mvnw.cmd --batch-mode verify`（`b4fcf42` 工作区）结果：379 个单测/契约测试、198 个 IT（Testcontainers + MySQL）全部通过，BUILD SUCCESS。
>
> 可信度：P0-A 高（有真实联调）；P1-A 基本符合（抽样 18 个操作中 11 个一致，其余为 `assignmentCount` 恒为 0、空 `summary`/`content` 被 422 拒绝、`createOffering` 学期不存在返回 404 等小差异，未修）；P1-B/C/D 后端已对齐并有逐字段断言与真实数据库用例，但 `x-implementation-status` 仍为 `implemented`，未做跨端联调，不得标为 `verified`。
>
> 已修复的运行时错误：`publishFeedback` 通知类型违反 `ck_notifications_type`（现为 `feedback_published`，并有真实库用例）；`listMyAssignments` 的 `#{now}` 缺参；`createNotice` 的 12 参 `insertNotification` 死重载；看板 SQL 引用不存在的 `base_courses`、`cp.student_id`、`a.type='lab'`；`findCurrentLearningChapter` JOIN 位置；`listTeacherAssignments` 默认 `all` 被当作 `status='all'`。
>
> 其他已修复：错误码改为契约登记值；`DashboardDTO`、`LearningRecordsDTO`、`AssignmentStatsDTO`、`NoticeDTO` 等按契约重写；`getAssignment`、`getSubmission` 增加教师视图；`publishedFeedbackId`、`feedbackStatus`、`pendingReviewCount` 改为真实值；评价保存/发布、提交增加行锁与幂等；个人公告不再对全班可见；`getMyLearningRecords`/`markMessagesAsRead` 的 200 响应占位已替换。
>
> **迁移遗留处置（2026-10-16 已决定，V9 待用户回复"执行 V9"后实施，放在跨端联调之前）**：
> - 公告 `target`：原描述有误。契约 `NoticeDTO.target` 是关联内容（`TargetDTO`：type/id/offeringId），不是定向学生，不能复用 `target_student_id`。V9 给 `notices` 加可空的 `target_type`、`target_id`，CHECK 两列同为空或同非空，type 取值与 `TargetDTO.type` 一致；后端取消"非 null 返回 422"，写入时校验目标属于本班。实现前先用 `contract_slice.py createNotice` 核对请求体。
> - 量规评语长度：V9 把 `feedback_rubric_scores.comment` 改为 `VARCHAR(8000)`，后端校验同步改为 8000。
> - `knowledgeEvaluations` / `issueTags`：推迟到 P2-B，与知识证据、规则版本一起设计存储；P1 继续只接受空数组，P1 验收不依赖它们。
> - 实施方式：派一个 Sonnet 子代理写 V9、后端校验与真实库 IT；主会话在 backend/ 下跑 `./mvnw.cmd --batch-mode verify` 通过后，以 `backend:` 前缀提交，并更新下方遗留清单。
>
> **后端遗留（未改）**：
> - `createNotice` 部分对齐：`notices` 表没有 target 列，`target` 只接受 null，非 null 返回 422，定向公告目前无法通过 API 创建；`recipientCount` 靠通知记录推算；通知内容截断到 2000 字（`notifications.content` 为 VARCHAR(2000)）。
> - `saveFeedback`：`knowledgeEvaluations`、`issueTags` 无存储列，只接受空数组；量规项 comment 按 2000 校验（契约 8000）；`issueTagVersion` 恒为 null。
> - 恒为空或 null：`needsPracticeCount`、`aiPolicyVersion`、`commonIssues`、`pendingHelpCount`；`course_notice`、`help_reply` 类消息 P1 无数据来源。
> - 快照里的 `knowledgePoints` 读的是作业当前关联，未真正冻结。
> - 行锁只按设计加上，没有并发压测用例。
> - P1-A 的上述小差异与章节序号并发重复会变成 500 的隐患未处理。
>
> **前端（`9578059`、`51b000f`）**：已按契约 1.1.0 重新生成 `schema.d.ts`；`dashboard.ts`/`notices.ts`/`stats.ts` 改用生成类型，方法名、路径和分页字段与契约一致，删除了契约中为 planned 的 `listTeacherNotices`；`main.ts` 注册了 Auth、Courses、Assignments、Dashboard、Notices、Stats 六个客户端；mock 补全了 P1-C 缺失操作和 P1-D 全部 9 个操作；`NotificationCenter` 接入 `/student/messages`，`TeacherFeedbackEditor` 接入 `/teacher/submissions/:submissionId/feedback`，`getFeedback` 接入 `AssignmentDetail`；新增 `p1d-api`、`p1d-mocks`、`p1d-pages` 三个测试文件。`npm --prefix frontend run verify`：16 个测试文件、152 个用例通过，`check:no-mock` PASS。
>
> **前端仍缺**：P1-D 页面（学生看板、公告列表、教师统计页）尚未实现；`p1b` 测试夹具仍用小写 `not_started`/`pending`，契约是大写；路由约定已定（2026-10-16）：沿用 `/student/...`、`/teacher/...`，FRONTEND.md §4 已同步；`getSubmission` 的 oneOf 没有 discriminator，前端靠 `'student' in data` 判断教师视图；尚未做前后端真实联调，所有操作仍不能标 `verified`。`ImplementationStatusContractTest` 只校验路由存在，不校验响应字段。
>
> 处置原则：以契约为准；`docs/features/p1d-aggregation.md` 已标注作废。执行顺序已改为先完成 P1 闭环再做 P2-A（DEVELOPMENT 第 11、14 节）：① P1-B/C 主链路跨端联调；② 按 [p1d-frontend-ui.md](features/p1d-frontend-ui.md) 实现 P1-D 最小 UI；③ 按验收场景走通后标 `verified`；④ 进入 P2-A。

截至 2026-10-15 的提交自述如下（仅作历史记录）：

- **P0-A**（master `b3c4f0e`）：5 个认证操作为 verified，2 个健康检查为 implemented。已有账户初始化、数据库会话、认证 HTTP 链、原子登录限流、审计和 Flyway V1～V4；前端包含登录、会话联调页、身份恢复、退出、同源代理与 mock。
- **P1-A**（master `4d62379`）：27 个课程操作为 implemented（11 个教学班 + 16 个内容），Flyway V5 建表。教师开班→发布章节→邀请码→学生加入→阅读完成→跨班被拒的验收链路已实现；前端包含教师工作台与学生课程页，mock 与测试覆盖写路径。
- **P1-B**（master `8c4cb52`）：12 个作业与工作区操作为 implemented，Flyway V6 建表。包含作业列表、工作区读写、提交管理；前端包含作业列表、工作区编辑器与提交界面。
- **P1-C**（master `68eb7d3`）：7 个提交评价与通知操作为 implemented，Flyway V7 建表。包含教师评价草稿-发布流程、学生查看评价、通知中心；前端包含教师评价编辑器与学生通知中心。
- **P1-D**（master `9e594a6`）：9 个多班聚合操作为 implemented，Flyway V8 建表。包含学生仪表盘、学习记录、批量标记消息已读、公告系统（教师创建与学生查看）、教师统计（班级概览、作业统计、学生学习记录）；前端包含 API 客户端层（dashboard.ts、notices.ts、stats.ts），UI 组件待补充。

契约 83 个业务操作与 2 个健康检查中，57 个已实现（5 认证 + 2 健康 + 27 课程 + 12 作业 + 7 评价 + 9 聚合），23 个为 planned，5 个为 verified。P1 阶段后端全部完成，前端 P1-D UI 组件（仪表盘页面、公告列表、教师统计页面）待补充。P2/P3 功能尚未实现。接口实现状态以 OpenAPI `x-implementation-status` 为准，不在此处另维护计数。

<a id="handoff"></a>

## 2. 交接说明（2026-10-15）

- **接手方式**：先读本节，再按任务阅读本端手册及契约切片。前端只实现 frontend/，后端只实现 backend/。
- **代码基点**：master `4b76e1a`（文档结构重整；P1-D 功能代码基点仍为 `9e594a6`）。P1-D 多班聚合模块后端已完成，前端 API 客户端已就绪，UI 组件待补充。
- **下一包**（2026-10-16 核对后修订）：
  - 先把 P1-B / P1-C / P1-D 后端按契约对齐（顺序：P1-B → P1-C → P1-D；每个操作用 `scripts/contract_slice.py` 取切片，补响应字段断言测试）
  - 接通前端：`main.ts` 注册 `AssignmentsApi`，通知中心与教师评价编辑器接入路由，P1-D 客户端改用生成类型
  - 之后才做 P1-D 前端 UI 或进入 P2
  - 不重新创建已有工程或重复实现认证、课程接口。

2026-10-13 定向检查发现的 5 个认证问题均已修复，各有先失败后通过的回归测试：

| 问题 | 修复 | 回归测试 |
| --- | --- | --- |
| 登录后 /me 401 仍算成功 | `/me` 成功才确认登录，否则清除身份 | frontend/tests/auth-recovery.test.ts |
| CSRF 刷新失败仍提示成功 | 先失效旧 token，成功与失败分别提示；协调器向所有调用方传播失败 | 同上 |
| 退出恢复不完整 | 共用一次刷新并核对 /me，userId 变化清空旧数据，再次失败提示重新登录；删除代次追踪 | 同上（7 条） |
| 会话查询异常无统一响应 | 过滤器捕获后经 ApiSecurityErrorWriter 返回 500 `INTERNAL_ERROR` 信封，日志不含 SQL | SessionCookieAuthFilterContractTest |
| 并发登录限流空档 | 准入时原子预占名额，在途请求计入上限；系统故障释放名额、不计为错误密码 | AuthControllerConcurrencyTest、LoginRateLimiterTest |

遗留小项（不阻塞 P1）：

- 前端退出的“已恢复一次”标记只在退出成功或重新登录后重置；同一页面会话中隔很久再遇到 CSRF 失败会直接要求重新登录。行为偏保守但安全。
- 后端 `LoginRateLimiter.onSuccess(String key)` 现在只被测试 `AuthHttpContractTest` 用来重置状态，宜改为测试专用方法，避免生产代码误用。

<a id="verification"></a>

## 3. 验证记录

以下为记录当时的实际结果，不是自动更新的进度表。契约、校验器或相关测试变更后，交付者须重新执行并更新本节。

### 3.1 P0-A 认证收尾（2026-10-14，master `b3c4f0e`）

| 执行位置与命令 | 结果 | 能证明与不能证明的内容 |
| --- | --- | --- |
| backend：`./mvnw.cmd --batch-mode test`（#4 与 #5 本地合并树） | Tests run: 97, Failures: 0, Errors: 0, Skipped: 0 | 单元与 MockMvc HTTP 契约 |
| backend：`./mvnw.cmd verify`（#4 交付记录） | 单元/HTTP 97 项 + Testcontainers `mysql:8.4.11` 集成 98 项，全部通过 | 真实 MySQL 行为 |
| frontend：`npm run verify`（合并树） | vue-tsc 通过；vite build；check:no-mock PASS；vitest 5 文件 45 用例通过 | 前端类型、构建与模拟传输下的行为 |
| GitHub Actions（#4、#5） | Contract and documents / Backend tests / Frontend typecheck, build and tests 均通过 | 远程 CI 已确认 |
| HTTP 验收脚本（`localhost` 4173 代理 → 8080 → MySQL 3307） | 16/16 通过：取 CSRF → 登录（下发 `lp_session`、清除 `lp_pre_auth`、响应无密码字段）→ `/me` → `/me/config` → 重新取 CSRF 后身份不变；缺 CSRF、错误 CSRF、非白名单 Origin 的退出均 403 `CSRF_INVALID` 且会话保留；退出 200 清除 `lp_session`，之后 `/me` 401 `UNAUTHENTICATED`；错误密码 401 `INVALID_CREDENTIALS`；全部响应 `X-Request-ID` 与正文一致且 `no-store` | 五个认证操作经真实代理与数据库可用 |
| 同上：12 个并发错误密码登录（同一用户名 + IP，此前已失败 1 次） | 4 个进入凭据校验（累计正好 5）、8 个 429 `RATE_LIMITED` 且带 `Retry-After` | 限流修复在真实运行时生效 |
| 浏览器 UI（Browser 预览，`http://localhost:4173`） | 错误密码显示“用户名或密码错误。”及 requestId；用户手动以 student.demo 登录后，会话页显示姓名、用户名、角色与服务配置；整页刷新后身份恢复；点击退出回到 `#/login`；再访问 `#/` 被拦回登录页，`/me` 401；`lp_session` 对页面脚本不可读，localStorage/sessionStorage 为空 | 登录→刷新→退出的真实浏览器链路 |

未在浏览器中人为制造 CSRF 失败或会话故障；这些异常路径由上表的单元测试与 HTTP 验收覆盖。

工具链：本开发机 `node --version` v24.17.0、`npm --version` 11.13.0，低于 frontend/.nvmrc 与 packageManager 锁定的 24.21.0 / 11.19.0；本地 verify 结果不等同 CI 基线，以 GitHub Actions 为准。

### 3.2 P0-A 首次交付（2026-10-13）

| 执行位置与命令 | 已有记录的结果 |
| --- | --- |
| 项目根目录：`python scripts/validate_contract.py` | PASS（当时 327 个 schema；契约 1.1.0 后为 322） |
| backend：`./mvnw.cmd --batch-mode test` / `verify` | 93 项 / 98 项集成测试通过 |
| frontend：`npm run verify` | 4 文件 39 用例通过 |
| 跨端联调（`127.0.0.1:4173` → 8080 → MySQL） | 五个认证操作正常与负例通过 |

Maven 报告位于 `backend/target/surefire-reports/` 与 `backend/target/failsafe-reports/`（本地生成、不提交）。后端更早的运行证据见 [历史开发记录](archive/2026-10-08_DEVELOPMENT.md#112-实施进度与代码阅读)。

### 3.3 文档结构重整（2026-10-15，master `4b76e1a`）

| 执行位置与命令 | 结果 | 能证明与不能证明的内容 |
| --- | --- | --- |
| 项目根目录：`.contract-venv\Scripts\python.exe scripts/validate_contract.py` | PASS；83 个业务操作 + 2 个健康检查、322 个 schema、90 个当前文档链接可达，退出码 0 | 契约结构、示例与当前文档引用未被本次改动破坏 |
| 非归档 `.md` 本地链接逐一解析 | 无失效链接 | 文档内部引用自洽 |

本次仅调整文档结构与事实描述，未改动业务代码、契约字段与业务规则。README 中与代码不符的两处描述（教学业务端点状态、Flyway 版本范围）已修正；原 README 的 IDEA 调试内容迁至 [DEBUGGING](DEBUGGING.md)，新增 [文档索引](README.md)。

## 4. 已知限制

以下竞态在课程演示规模下发生概率极低，按设计不加防护；如果出现，在此记录现象再决定是否补强。

| 场景 | 可能结果 | 为何接受 |
| --- | --- | --- |
| 教学班/作业归档的检查与更新之间恰好有学生提交 | 归档后存在一份待批阅提交，P1 无法在归档后发布评价 | 归档是低频教师操作，窗口为毫秒级；需要时由管理员处理 |
| 写入校验通过后教学班恰好被归档 | 该次草稿保存或位置更新落在归档之后 | 不公开任何草稿，后续请求一律拒绝 |
| 同一学生并发发起多个 AI 请求（不同作业） | 每日/每分钟预算偶发超出 1 次 | 预算是用量保护，不是计费；在途唯一约束仍阻止同作业并发 |
| AI 请求已完成但响应丢失，客户端重新发送 | 新建一次请求，多计一次预算 | 删除通用幂等键后的代价，用户可见且无数据错误 |
| 死锁或锁等待超时 | 返回服务端错误，用户手动重试 | 无全局锁顺序，但保留的行锁只有 submission 一处，死锁面很小 |
