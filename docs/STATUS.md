# 当前状态与交接

本文件记录会随交付变化的进度、交接与验证结果。**实现任务可以直接更新本文件**，无需另行授权；架构、业务规则与契约仍按 [AGENTS.md](../AGENTS.md) 的规则修改。设计基线见 [DEVELOPMENT](DEVELOPMENT.md)。

## 1. 当前真实状态

契约基线 1.1.0（2026-10-13 按课程演示规模简化，见 [DEVELOPMENT 第 14 节](DEVELOPMENT.md#14-决策与变更记录)）。截至 2026-10-15，**P0-A、P1-A、P1-B、P1-C 已完成**：

- **P0-A**（master `b3c4f0e`）：5 个认证操作为 verified，2 个健康检查为 implemented。已有账户初始化、数据库会话、认证 HTTP 链、原子登录限流、审计和 Flyway V1～V4；前端包含登录、会话联调页、身份恢复、退出、同源代理与 mock。
- **P1-A**（master `4d62379`）：27 个课程操作为 implemented（11 个教学班 + 16 个内容），Flyway V5 建表。教师开班→发布章节→邀请码→学生加入→阅读完成→跨班被拒的验收链路已实现；前端包含教师工作台与学生课程页，mock 与测试覆盖写路径。
- **P1-B**（master `8c4cb52`）：12 个作业与工作区操作为 implemented，Flyway V6 建表。包含作业列表、工作区读写、提交管理；前端包含作业列表、工作区编辑器与提交界面。
- **P1-C**（master `68eb7d3`）：7 个提交评价与通知操作为 implemented，Flyway V7 建表。包含教师评价草稿-发布流程、学生查看评价、通知中心；前端包含教师评价编辑器与学生通知中心。

契约 83 个操作中，48 个已实现（5 认证 + 2 健康 + 25 课程 + 12 作业 + 4 评价），其余 35 个为 planned。P1-D 与 P2/P3 功能尚未实现。接口实现状态以 OpenAPI `x-implementation-status` 为准，不在此处另维护计数。

<a id="handoff"></a>

## 2. 交接说明（2026-10-15）

- **接手方式**：先读本节，再按任务阅读本端手册及契约切片。前端只实现 frontend/，后端只实现 backend/。
- **代码基点**：master `68eb7d3`。P1-B/C 作业与评价模块已完成。
- **下一包**：按 [DEVELOPMENT 第 11 节](DEVELOPMENT.md#11-开发顺序与工作包) 进入 P1-D（多班聚合）或 P2-A（受限式 AI）。不重新创建已有工程或重复实现认证、课程、作业接口。

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

## 4. 已知限制

以下竞态在课程演示规模下发生概率极低，按设计不加防护；如果出现，在此记录现象再决定是否补强。

| 场景 | 可能结果 | 为何接受 |
| --- | --- | --- |
| 教学班/作业归档的检查与更新之间恰好有学生提交 | 归档后存在一份待批阅提交，P1 无法在归档后发布评价 | 归档是低频教师操作，窗口为毫秒级；需要时由管理员处理 |
| 写入校验通过后教学班恰好被归档 | 该次草稿保存或位置更新落在归档之后 | 不公开任何草稿，后续请求一律拒绝 |
| 同一学生并发发起多个 AI 请求（不同作业） | 每日/每分钟预算偶发超出 1 次 | 预算是用量保护，不是计费；在途唯一约束仍阻止同作业并发 |
| AI 请求已完成但响应丢失，客户端重新发送 | 新建一次请求，多计一次预算 | 删除通用幂等键后的代价，用户可见且无数据错误 |
| 死锁或锁等待超时 | 返回服务端错误，用户手动重试 | 无全局锁顺序，但保留的行锁只有 submission 一处，死锁面很小 |
