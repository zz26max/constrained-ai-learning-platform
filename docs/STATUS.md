# 当前状态与交接

本文件记录会随交付变化的进度、交接与验证结果。**实现任务可以直接更新本文件**，无需另行授权；架构、业务规则与契约仍按 [AGENTS.md](../AGENTS.md) 的规则修改。设计基线见 [DEVELOPMENT](DEVELOPMENT.md)。

## 1. 当前真实状态

契约基线 1.1.0（2026-10-13 按课程演示规模简化，见 [DEVELOPMENT 第 14 节](DEVELOPMENT.md#14-决策与变更记录)）。截至 2026-10-13，P0-A 已交付：契约 83 个操作中，5 个认证操作（getCsrfToken、login、logout、getMe、getConfig）标为 verified，2 个健康检查为 implemented，其余 76 个为 planned。已有账户初始化、数据库会话、认证 HTTP 链、登录限流、审计和 Flyway V1～V4；正式 Vue 工程 frontend/ 已建立，包含登录、会话联调页、身份恢复、退出、同源代理与 mock。website-prototype/ 仅保留静态原型。

已有通过前端代理连接真实数据库的接口联调记录，尚未完成真实浏览器 UI 验收。P1 教学业务与 P2/P3 功能尚未实现；定向检查发现的认证异常恢复和并发限流问题见下方交接。

接口实现状态以 OpenAPI `x-implementation-status` 为准，不在此处另维护计数。

<a id="handoff"></a>

## 2. 交接说明（2026-10-13）

- **接手方式**：先读本节，再按任务阅读本端手册及契约切片。前端只实现 frontend/，后端只实现 backend/。
- **代码基点**：前端首包 `12205b6`，后端首包 `fa72b3f`，启动脚本修复 `0aa9856`，CI 扩充 `6935b6e`。当前处于 P0-A 收尾，P1 尚未开工。
- **已有证据**：本地报告为后端 93 项单元/HTTP 测试、98 项数据库集成测试通过；前端交付记录为 verify 与 39 项用例通过；五个认证操作经代理联调通过。浏览器 UI、远程 CI 未确认。工具链基线与历史实测版本存在记录冲突，接手前记录 node/npm 实际版本，按锁定基线重新验证。
- **建议下一步**：前后端分别处理下表问题，再做浏览器登录→刷新→退出与异常恢复验收；修复后在本文件更新状态。

| 待处理 | 归属 / 入口 | 已复现的现象及验收目标 |
| --- | --- | --- |
| 登录后身份失效 | 前端 [auth.ts](../frontend/src/stores/auth.ts) | login 200 后 /me 401，仍返回登录成功并保留 authenticated；应进入身份恢复 |
| CSRF 刷新失败提示错误 | 前端 auth.ts | 刷新请求失败仍提示“令牌已刷新”，旧 token 保留；区分成功与失败 |
| 退出恢复不完整 | 前端 auth.ts / csrf-refresh.ts | 三次退出 CSRF 失败触发三次刷新、零次身份核对；按契约 1.1.0 的简化规则（[DEVELOPMENT 10.2](DEVELOPMENT.md#102-会话csrf-与请求边界)）改为共用一次刷新并核对 /me、再次失败提示重新登录；现有令牌代次/用户代次追踪可删除 |
| 会话查询异常无统一响应 | 后端 [SessionCookieAuthFilter](../backend/src/main/java/com/learningplatform/common/security/SessionCookieAuthFilter.java) | 模拟数据库异常直接逃出过滤器，未写入业务错误信封；按现有契约处理服务端故障 |
| 并发登录限流空档 | 后端 [LoginRateLimiter](../backend/src/main/java/com/learningplatform/modules/auth/security/LoginRateLimiter.java) / AuthController | 模拟先检查后回报失败的并发时序，上限 5 仍放行 20 次校验；补原子的请求准入或在途限制并验证 |

上表来自 2026-10-13 对现有代码的定向模拟验证，不是真实浏览器或并发压测；临时探针未提交。接手者先补可重复的回归测试，再修复并分别提交。

后端 [GlobalExceptionHandler.java:49](../backend/src/main/java/com/learningplatform/common/exception/GlobalExceptionHandler.java) 的注释仍提到已删除的 REQUEST_IN_PROGRESS，429 的 Retry-After 不受影响，后端任务顺手更新即可。

下一包优先收尾上述认证异常路径，再按 [DEVELOPMENT 第 11 节](DEVELOPMENT.md#11-开发顺序与工作包) 进入 P1-A；不重新创建已有工程或重复实现认证接口。

## 3. 验证记录（P0-A，2026-10-13）

以下为当时的交付记录与本地报告，不是自动更新的进度表。契约、校验器或相关测试变更后，交付者须重新执行并更新本节。

| 执行位置与命令 | 已有记录的结果 | 能证明与不能证明的内容 |
| --- | --- | --- |
| 项目根目录：`python scripts/validate_contract.py` | PASS：81 个业务 + 2 个健康操作，327 个 schema；29 个示例、40 个结构回归用例、74 处文档链接 | 验证结构、引用与静态样例，不验证实际权限、SQL 查询或并发 |
| backend 目录：`./mvnw.cmd --batch-mode test` | BUILD SUCCESS；Tests run: 93, Failures: 0, Errors: 0, Skipped: 0 | 单元与 MockMvc HTTP 契约；不是真实数据库或跨端联调 |
| backend 目录：`./mvnw.cmd --batch-mode verify` | BUILD SUCCESS；Tests run: 98, Failures: 0, Errors: 0, Skipped: 0（Testcontainers `mysql:8.4.11`：AuditLog 3 / Database 7 / UserMapper 33 / DatabaseSession 32 / LocalAccountInit 9 / LoginCredential 14） | 真实 MySQL 的方言、约束与事务行为 |
| frontend 目录：`npm run verify`（typecheck + build + check:no-mock + vitest） | 全部通过：`vue-tsc` 无错误；`vite build` 38 模块；`check-no-mock` PASS；vitest 4 个文件 39 条用例通过 | 前端类型、构建与模拟传输下的行为；不证明真实后端联调或浏览器 UI |
| P0-A 跨端联调（本机 `127.0.0.1:4173` 同源代理 → `8080` → MySQL `3307`） | 通过。正常流程：`GET /api/v1/auth/csrf-token` 200 且下发 `lp_pre_auth`（Max-Age=600）；`POST /auth/login` 200 且下发 `lp_session`（7 天）、清除 `lp_pre_auth`、响应不含密码字段；`GET /me` 200；`GET /me/config` 200（无学期时 `currentTermId:null`、`terms:[]`，三个 feature 均 false）；`POST /auth/logout` 200 且清除 `lp_session`；退出后 `GET /me` 401 `UNAUTHENTICATED`。负例：错误密码 401 `INVALID_CREDENTIALS`；缺 `X-CSRF-Token`、缺 `Origin`、非白名单 `Origin` 均 403 `CSRF_INVALID`。全部响应的 `X-Request-ID` 与正文 `requestId` 一致且带 `Cache-Control: no-store` | 证明这五个操作经前端同源代理与真实数据库可用；不证明浏览器 UI 交互、并发与限流边界 |

Maven 报告位于 `backend/target/surefire-reports/` 与 `backend/target/failsafe-reports/`（本地生成、不提交）。

尚未确认：真实浏览器 UI、P1 业务联调与远程 CI。工具链方面，前端提交 12205b6 声称实测 Node 24.21.0 / npm 11.19.0，后续审计文字却记录 Node 24.17.0 / npm 11.13.0；接手者记录实际 `node --version` / `npm --version`，再按 frontend/.nvmrc 与 packageManager 重现 npm ci 和 verify。

后端已有功能的历史运行证据见 [历史开发记录](archive/2026-10-08_DEVELOPMENT.md#112-实施进度与代码阅读)。

## 4. 已知限制

以下竞态在课程演示规模下发生概率极低，按设计不加防护；如果出现，在此记录现象再决定是否补强。

| 场景 | 可能结果 | 为何接受 |
| --- | --- | --- |
| 教学班/作业归档的检查与更新之间恰好有学生提交 | 归档后存在一份待批阅提交，P1 无法在归档后发布评价 | 归档是低频教师操作，窗口为毫秒级；需要时由管理员处理 |
| 写入校验通过后教学班恰好被归档 | 该次草稿保存或位置更新落在归档之后 | 不公开任何草稿，后续请求一律拒绝 |
| 同一学生并发发起多个 AI 请求（不同作业） | 每日/每分钟预算偶发超出 1 次 | 预算是用量保护，不是计费；在途唯一约束仍阻止同作业并发 |
| AI 请求已完成但响应丢失，客户端重新发送 | 新建一次请求，多计一次预算 | 删除通用幂等键后的代价，用户可见且无数据错误 |
| 死锁或锁等待超时 | 返回服务端错误，用户手动重试 | 无全局锁顺序，但保留的行锁只有 submission 一处，死锁面很小 |
