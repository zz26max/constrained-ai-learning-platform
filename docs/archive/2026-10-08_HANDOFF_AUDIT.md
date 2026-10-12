> 历史快照：2026-10-11 整理前的工作区内容，含当时未提交修改。仅供追溯，不是现行开发依据；当前入口见 [开发方案](../DEVELOPMENT.md)。

# 交接审计报告：现状核查、缺口清单与设计输入

> **本文件的性质**：一次性交接材料，**不属于** [README](../../README.md#文档维护) 维护的三份设计文档（DEVELOPMENT / API / DATA_MODEL）。它是为下一轮架构设计与规范文档设计准备的**输入**，不是规范本身。
>
> **使用方式**：请先读 [DEVELOPMENT.md](2026-10-08_DEVELOPMENT.md)、[API.md](2026-10-08_API.md)、[DATA_MODEL.md](2026-10-08_DATA_MODEL.md) 三份原文，再把本文件当作"已知事实基线 + 已发现问题清单 + 待决策项"使用。第 5 节的数据表可直接引用，**但不要把它复制进新的规范文档**——那会制造第四份真相来源（见第 3.1 节）。
>
> **核查日期**：2026-10-08（与三份文档标注日期一致）
> **核查方式**：全文通读三份文档 + README + 归档；对文档声明的"已实现/未实现"边界、行号引用、端点数量、DTO 覆盖、错误码分布做了逐项代码与文本比对。核查方法见附录 A。

---

## 0. 给架构设计者的摘要

**一句话结论**：这个项目的文档**深度远超一般课程项目**，缺的不是"设计"，而是三层东西——① 机器可读的单一权威契约；② 注册表化的横切规范（错误码 / 枚举 / 字段级类型）；③ 支持两个不同模型并行开发而不漂移的冻结与变更流程。

**关键数量事实**（全部经核查，详见第 5 节）：

| 事实 | 数值 |
| --- | --- |
| 已设计端点总数 | **81**（P0 5 / P1 53 / P1-P2 共用 3 / P2 18 / P3 2） |
| 已实现的业务端点 | **0**（生产代码仅有 `/health/live`、`/health/ready` 两个运维端点） |
| §2 注册表登记的具名 DTO | **14** |
| 未进入注册表的复合类型 | **22** |
| 正文中的一次性内联对象字面量 | 约 **15** 处 |
| 有完整响应 JSON 示例的端点 | **5 / 81** |
| 错误码总数 | **约 36–37**，其中 **13 个不在 §1.3 登记表内**，3 个未标注 HTTP 状态 |
| 仓库中的 OpenAPI / Swagger 文件 | **0**（尽管 DEVELOPMENT §3.4 已承诺生成并入库） |
| 生产代码中的 Controller | **1 个**（`common/health/HealthController`） |

**最高危的三个具体问题**（详见第 4 节）：
1. `submissionBlockedReason` 的取值集合在全部文档中**从未定义**，却是前端必须分支处理的字段。
2. PATCH 端点的"省略 vs 显式 null"语义**未定义**，导致 `PATCH /teacher/resources/{resourceId}` 无法表达"解绑知识点"。
3. 前后端会拿到的**不是同一份可执行契约**，而是同一段中文散文的不同理解。

---

## 1. 可信度分级

本文件的所有陈述分为三级，请区别对待：

- **【已核实】**——我逐字比对过文档或代码，可直接采信。
- **【文档声明】**——文档如此声明，我未独立验证（例如测试用例数、耗时数据）。
- **【本文推断】**——我从文档中推导出的结论，可能有误，需项目方确认。

---

## 2. 已核实的事实基线

### 2.1 工程实现真实状态 【已核实】

生产代码结构（`backend/src/main/java/com/learningplatform/`）：

```text
LearningPlatformApplication.java
common/
  api/          ApiResponse, ApiErrorResponse
  config/       PasswordConfiguration
  exception/    BusinessException, GlobalExceptionHandler
  health/       HealthController, DatabaseReadinessService, LivenessResponse, ReadinessResponse
  mybatis/      UtcInstantTypeHandler
  web/          RequestIdFilter
modules/
  auth/
    bootstrap/  LocalAccountInitializationRunner
    config/     AuthSessionConfiguration, AuthSessionProperties
    dto/        UserDTO
    mapper/     UserMapper, AuthSessionMapper, typehandler/UserRolesTypeHandler
    model/      User, AuthSession, SessionGrant, SessionIdentity
    security/   SessionTokenCodec
    service/    DatabaseSessionService, LocalAccountInitializationService, LoginCredentialService
```

- **唯一的生产 Controller 是 `HealthController`**，提供 `GET /health/live`、`GET /health/ready`。【已核实：全仓库 `@RestController` / `@RequestMapping` / `@GetMapping` 等注解仅出现在该类与 `@RestControllerAdvice`】
- **81 个业务端点全部未实现**，包括 P0 的 `/auth/login`、`/me`、`/me/config`。【已核实】
- 已完成的是**内部能力**：MyBatis 用户读写、Argon2id 密码哈希、本地账户初始化、登录凭据校验（`LoginCredentialService.verifyCredentials()`）、数据库会话管理（`DatabaseSessionService.login()/resolve()/revoke()`）。这些均**没有对外 HTTP 入口**。【已核实】
- 数据库迁移：`V1__create_terms.sql`、`V2__create_users.sql`、`V3__create_auth_sessions.sql` 存在；`audit_logs` 及其余业务表未迁移。【已核实】
- 前端 `website-prototype/src/` **没有任何真实网络调用**：全仓库检索 `fetch(`、`XMLHttpRequest`、`localStorage`、`sessionStorage`、`/api/v1` **零匹配**。页面数据全部是内存样例。【已核实】
- `scripts/serve.mjs` 是纯静态服务，只允许 `/`、`/index.html`、`/src/*`，其余路径返回 404，**没有 API 代理**。【已核实】

### 2.2 文档资产盘点 【已核实】

| 文件 | 行数 | 标注版本 | 覆盖内容 |
| --- | --- | --- | --- |
| `README.md` | 176 | — | 入口、启动方法、目录约定、开发阶段 |
| `docs/DEVELOPMENT.md` | 771 | 0.13 | 范围、架构、业务规则、技术选型、前端接入（第 10 节）、任务拆分与实施进度（第 11.2 节）、运维与隐私 |
| `docs/API.md` | 759 | 0.10 | 通用约定、错误码表、响应信封、幂等与乐观锁、81 个端点、DTO 字段表、联调示例、前端接线表 |
| `docs/DATA_MODEL.md` | 447 | 0.8 | 表结构、列名、生成列 DDL、复合外键、锁顺序、核心事务步骤、索引、保留与清理策略 |
| `docs/archive/ARCHITECTURE_REVIEW.md` | 70 | 0.3（2026-10-03） | 历史架构评审 |
| `docs/archive/UI_DESIGN_HISTORY.md` | 68 | — | 历史视觉调整 |

合计约 2290 行设计文档。

### 2.3 文档质量抽查：以下方面**做得很好**【已核实】

- **行号引用全部准确**。API.md §8（第 738–749 行）与 DEVELOPMENT.md §10.1（第 420–432 行）引用的所有原型坐标——`learning-ui.js:6–23`、`learning-ui.js:87–118`、`learning-ui.js:121–140`、`course-ui.js:6–22`、`records-ui.js:3–44`、`records-ui.js:51–71`、`main.js:19,21–24,26,29,30,32–35`、`serve.mjs:14–17`——**逐条对到了实际内容，无一错位**。
- **"未实现"声明诚实**。文档多处明确标注登录 HTTP、Cookie、CSRF、前端代理、AI、分析均未实现，且与代码一致。
- **并发与一致性设计相当扎实**：锁顺序（教学班→作业→预算行→成员→进度→工作区→提交→评价→会话→请求→调用→任务）、锁后独立 `SELECT UTC_TIMESTAMP(6)` 取样、可空生成列唯一约束、幂等记录与业务同事务、worker 领取代次与租约——这些在课程项目级别属于罕见水准。
- **业务规则闭合度高**：进度公式、`archivedIncompleteCount` 守恒式、knowledge-v2 五级判定、AI 提示层次推进规则、90 天正文保留与 tombstone 语义，都写到了可实现的颗粒度。

**结论：不要重写业务规则。** 缺口只在"横切规范层"和"机器可读层"。

---

## 3. 现有文档体系的 5 个结构性问题

### 3.1 多份叙述文档互相复制字段名 → 漂移源 【已核实】

README 第 174–176 行的维护规则要求"跨文档规则修改时同步相关内容，避免复制出另一套接口或业务口径"。但实际已经出现跨文档重述：

| 被重述的内容 | 出现在 |
| --- | --- |
| `aiPolicyVersion`、`initialFiles`、`canSubmit` | `DATA_MODEL.md`（第 128、263–265、370 行） |
| `canSave` / `saveBlockedReason` | `DEVELOPMENT.md`（第 268 行） |
| `localEditSeq` / `serverRevision` 等前端内部字段 | `DEVELOPMENT.md`（第 510 行） |
| 进度公式与百分比规则 | `API.md`（第 198 行）、`DEVELOPMENT.md`（第 398 行）、`DATA_MODEL.md`（第 431 行）**三处** |
| 会话期限（空闲 12h / 绝对 7d） | `API.md`（第 39 行）、`README.md`（第 110 行）、`DEVELOPMENT.md`（第 751 行）、`DATA_MODEL.md`（第 79–81 行）**四处** |
| 用户名规范 | `API.md`（第 165 行）、`DATA_MODEL.md`（第 63–64 行）、`README.md`（第 98 行）**三处** |

**风险**：两个不同模型各自读到不同副本的旧版本，就会实现出两套口径。

### 3.2 版本号各自演进，没有变更记录 【已核实】

`API.md` 0.10 / `DEVELOPMENT.md` 0.13 / `DATA_MODEL.md` 0.8，三个版本号互相独立，**没有 changelog，没有冻结标记，也没有声明"字段级以谁为准"**。

### 3.3 没有机器可读契约 【已核实】

- 仓库中不存在任何 `openapi*` / `swagger*` 文件。
- 但 `DEVELOPMENT.md` 第 181 行已承诺："使用 springdoc-openapi 从 Controller / DTO 导出 OpenAPI……实际生成的版本进入仓库并进行契约差异检查"。
- `DEVELOPMENT.md` 第 104 行也提到 springdoc-openapi 将随 API 文档功能核对兼容版本。

**这是最根本的问题**：契约目前是 759 行中文散文。两个模型对同一段散文的理解必然产生字段名、嵌套结构、可空性的分歧。

### 3.4 端点没有"当前是否可用"标记 【已核实】

端点表只有 `P0 / P1 / P2 / P3` 阶段列，**没有实现状态列**。前端今天开工时无法从文档判断"哪些现在就能联调"——答案是**零个业务端点**。该信息只散落在 API.md 第 3、5、7 行的正文里。

### 3.5 文档体量 vs 模型上下文 【本文推断】

三份文档约 1977 行（不含 README 与归档）。任何单一模型都难以在有限上下文内完整、可靠地吸收，实际会发生"选择性阅读"。**文档越长、越叙述化，两个模型的读取偏差越大**——这本身就是漂移的结构性成因。

---

## 4. 会导致前后端不一致的 9 个接口级缺口

按危险度排序。每条给出坐标，便于逐条修。

---

### 缺口 1：`submissionBlockedReason` 的取值集合从未定义 ★★★★★

- `AssignmentDetailDTO` 定义了该字段为"（可空）"——`API.md` 第 150 行。
- `DEVELOPMENT.md` 第 451 行说它"由服务端判定"。
- **但全部文档中没有给出任何一个合法取值**。
- 对照组：`saveBlockedReason` 明确给了 `OFFERING_ARCHIVED` / `ASSIGNMENT_ARCHIVED`——`API.md` 第 226 行。

**后果**：前端必须依据该字段禁用提交按钮并展示原因，一定会自行发明取值；后端也会自行发明另一套。**这是必然不一致**。

**需要补的内容**：取值集合（至少覆盖：已截止且无补交窗口 / 补交窗口已过 / 次数用尽 / 已有已发布评价禁止重交 / 作业归档 / 教学班归档），以及与 `canSubmit` 的互斥关系。

---

### 缺口 2：错误码登记不全，13 个码只散落在正文 ★★★★★

`API.md` §1.3 的表（第 88–102 行）登记了 **24 个**错误码。**另有 13 个只出现在正文**：

| 错误码 | 出现位置 | HTTP 状态 |
| --- | --- | --- |
| `REQUEST_IN_PROGRESS` | 第 119 行 | 409（正文写明） |
| `ARCHIVE_PENDING_REVIEWS` | 第 288、322 行 | 409（正文写明） |
| `CHAPTER_ALREADY_PUBLISHED` | 第 305 行 | 409（正文写明） |
| `ASSIGNMENT_ALREADY_PUBLISHED` | 第 369 行 | 409（正文写明） |
| `ASSIGNMENT_ARCHIVED` | 第 236 行 | 409（正文写明） |
| `OFFERING_ARCHIVED` | 第 226 行 | **从未被称作错误码**，只作为 `saveBlockedReason` 取值出现 |
| `ASSIGNMENT_NOT_PUBLISHED` | 第 371 行 | **未标注**（推断 409），且无反引号 |
| `FEEDBACK_ALREADY_PUBLISHED` | 第 377 行 | **未标注**（推断 409），且无反引号 |
| `AI_DISABLED` | 第 435 行 | 409（正文写明） |
| `AI_POLICY_VERSION_CONFLICT` | 第 439 行 | **未标注**（推断 409），且无反引号 |
| `AI_REQUEST_IN_PROGRESS` | 第 445 行 | 409（正文写明） |
| `HINT_LIMIT_REACHED` | 第 447 行 | 409（正文写明） |
| `ATTEMPT_REQUIRED` | 第 456 行 | 422（正文写明） |

**附加问题**：§1.3 第 97 行把 `SUBMISSION_CLOSED` / `RESUBMIT_NOT_ALLOWED` / `ATTEMPT_LIMIT_REACHED` 三个码并列，但正文只解释了 `RESUBMIT_AFTER_REVIEW` 与 `SUBMISSION_SUPERSEDED` 的触发条件。**"什么算已截止、什么算不允许重交、什么算次数用尽"三者边界未定义**。

**后果**：前端要按 `error.code` 分支（尤其 409 家族要区分"可重试"与"不可重试"），后端各自造码。

---

### 缺口 3：PATCH 端点的"省略 vs 显式 null"语义未定义 ★★★★★

四个 PATCH 端点使用 `{field?}` 写法，但**没有一处说明可选字段的缺省语义**：

| 端点 | 请求字段 | 位置 |
| --- | --- | --- |
| `PATCH /teacher/chapters/{chapterId}` | `{title?,summary?,number?,isRequired?}` | 第 293 行 |
| `PATCH /teacher/knowledge-points/{knowledgePointId}` | `{chapterId?,title?,description?,order?}` | 第 297 行 |
| `PATCH /teacher/resources/{resourceId}` | `{knowledgePointId?,title?,content?,order?}` | 第 299 行 |
| `PATCH /teacher/assignments/{assignmentId}`（published） | `{dueAt?,lateUntil?,description?}` | 第 320 行 |

全文只有三处明确写了可选字段语义（`maxUses` 第 309 行、`issueTags` 第 375 行、`dailyUserLimit` 第 437 行），**证明作者意识到了这个问题，但没有体系化**。

**最致命的实例**：`PATCH /teacher/resources/{resourceId}` 的 `knowledgePointId?`——**无法表达"把资料与知识点解绑"**。省略表示不变？传 `null` 表示清空？文档没说。后端会实现"缺省即不变"，前端可能传 `null` 想清空 → 要么被未知字段校验拒成 400/422，要么被静默忽略。

**同类问题**：`PATCH /teacher/assignments/{assignmentId}` 的 `lateUntil?` —— 第 369 行说"`lateUntil:null` 可改为晚于 `dueAt` 的时间以开放补交；已有补交窗口不能改回 `null`"，**这里用到了 `null` 作为显式取值，但没说 `null` 与"字段缺失"是否等价**。

---

### 缺口 4：字段级类型系统缺失，DTO 注册表只覆盖 14/36+ ★★★★☆

- `API.md` §2 的表（第 140–155 行）标题是"DTO 必须返回的字段"，**登记 14 个具名 DTO**。
- 标题第 138 行的约定是："后续表中的 DTO 是响应字段约定，`List<T>` 表示第 1.3 节的分页信封"。
- **问题**：该表是"字段名清单"，**没有任何一处标注类型、必填/可空、嵌套结构**。例如 `roles`（数组？）、`overdue`（布尔？）、`score`（数字？字符串？）、`number`（整数？）全部靠读者从示例或常识推断。

**未进入注册表的 22 个复合类型**（详见第 5.2 节）：定义位置分散在四处——正文 bullet、JSON 示例、"以上字段加…"式引用描述、端点表格内联。

**后果**：前端要渲染，必须知道每个字段的确切类型与可空性。这是当前最大的信息空洞。

---

### 缺口 5：枚举大小写在同文档内不统一 ★★★★☆

文档**确实写了**取值，但存在两个必须显式声明才能避免误用的陷阱：

| 字段 | 取值 | 大小写 |
| --- | --- | --- |
| `assignmentState`（作业状态） | `NOT_STARTED` / `IN_PROGRESS` / `SUBMITTED` / `REVIEWED` | **全大写** |
| `studentProgress.status`（章节进度） | `not_started` / `in_progress` / `completed` | **全小写** |
| `saveBlockedReason` | `OFFERING_ARCHIVED` / `ASSIGNMENT_ARCHIVED` | **全大写** |
| `publicationState` / `status` / `type` / 全部业务枚举 | 小写 snake_case | 小写 |

`assignmentState` 与 `studentProgress.status` **语义相近、大小写相反**，且都含 `IN_PROGRESS` 概念。两个模型混用的概率极高。完整枚举表见第 5.4 节。

---

### 缺口 6：81 个端点只有 5 个有响应 JSON 示例 ★★★★☆

`API.md` 全文共 14 个 ` ```json ` 代码块，其中**只有 5 个是端点响应**：

| 示例 | 位置 |
| --- | --- |
| `GET /me/courses` | 第 495–538 行 |
| `GET /me/dashboard` | 第 542–623 行 |
| `POST /assignments/{id}/submissions` 的 201 | 第 661–676 行 |
| `POST /tutoring/sessions/{id}/messages` 的 202 | 第 709–714 行 |
| AI 请求完成时的 `data` | 第 718–736 行 |

其余 9 个是请求体或 schema：响应信封（第 51–56 行）、分页信封（第 60–71 行）、错误信封（第 77–86 行）、`AssignmentWriteDTO`（第 333–363 行）、`AiPolicyDTO`（第 412–429 行）、`PUT workspace` 请求（第 631–641 行）、提交请求（第 652–657 行）、评价保存请求（第 680–690 行）、AI 请求（第 698–705 行）。

**教师侧端点几乎零示例**：章节、知识点、资料、邀请码、公告、作业、提交列表、统计、求助——全部没有示例响应。前端只能猜字段名与嵌套。

---

### 缺口 7：列表信封不统一，且未说明 `data` 的解包规则 ★★★☆☆

文档中存在**三种不同的列表形状**：

| 形状 | 说明 | 出现位置 |
| --- | --- | --- |
| `{items, page, pageSize, total, summary?}` | 标准分页信封 | §1.3 第 58–73 行；`List<T>` 约定第 138 行 |
| `{offeringId, items:[...]}` | 无分页字段的领域包装 | 第 184 行（学生章节）、第 290 行（教师章节）、第 296 行（教师知识点） |
| `{offeringId, ..., feedbackPage:{items,page,pageSize,total}, ...}` | 嵌套分页 | 第 242 行、第 254 行（learning-records） |

**文档没有说明**：这三种是否都直接放进 `data`？前端按什么规则选择解包方式？是否有统一判据？

另有一处不一致：第 73 行说"`summary` 可选"，但 §1.3 的分页示例中 `summary` 出现在 `data` 内部（与 `items` 同级），而第 206 行的 assignment summary 又写成 `200 List<AssignmentSummaryDTO>` + `summary:{...}` 的并列描述，读起来像两个同级对象。

---

### 缺口 8：端点无实现状态标记 ★★★☆☆

见第 3.4 节。81 个端点全部未实现，但文档没有任何逐行标记。**前端若按 API.md 开工，会以为可以联调**。

---

### 缺口 9：关键小项缺失 ★★☆☆☆

| 项 | 位置 | 说明 |
| --- | --- | --- |
| Cookie 名称 | 第 30–41 行 | 预登录 Cookie 与会话 Cookie 只说 `HttpOnly`/`Secure`/`SameSite=Lax`，**从未给出名称**。联调、排错、写测试都要用 |
| `Idempotency-Replayed` 头 | 第 119 行 | 只说"可用……标记重放"，未确认是否为契约的一部分 |
| `details.fields` 结构 | 第 104 行 | 说是 `{field,message}` 数组，字段名是 `field` 还是 `name`——已写 `field`，但未给示例 |
| `score` 的 JSON 类型 | 第 150、154 行 | 数据模型是 `DECIMAL(6,2)` + Java `BigDecimal`，但 JSON 中是数字还是字符串未声明（示例中为数字 `85`、`85.5`） |
| 时区 | 第 17 行 | 写了 UTC ISO 8601 与 `Asia/Shanghai` 展示，但 `serverTime`、`asOf`、`dueAt` 是否统一带 `Z` 未逐字段声明 |

---

## 5. 原始数据登记表

> **警告（重复第 3.1 节的提醒）**：本节的表是**快照数据**，用于让设计者看到全貌。**不要把这些表原样复制进新的规范文档**——那正是当前文档体系的问题。正确的做法是：让这些内容只有**一份**产生源（建议 OpenAPI + 一个小的生成/校验环节），叙述文档只引用、不重述。

### 5.1 端点总表（81 个）【已核实】

阶段分布：**P0 = 5，P1 = 53，P1/P2 共用 = 3，P2 = 18，P3 = 2**。

> 注：§5 与 §6 的端点表没有"阶段"列（因为整节同属一个阶段），本文按节补齐：§5 的 10 个为 P2，§6 的 2 个为 P3。

| # | 方法与路径（省略 `/api/v1`） | 阶段 | 需 CSRF | 需 Idempotency-Key | 请求体根 | 响应 `data` 根 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `GET /auth/csrf-token` | P0 | 否 | 否 | — | `{csrfToken}` |
| 2 | `POST /auth/login` | P0 | 是 | 否 | `{username,password}` | `{user:UserDTO,csrfToken}` |
| 3 | `POST /auth/logout` | P0 | 是 | 否 | `{}` | `{loggedOut}` |
| 4 | `GET /me` | P0 | 否 | 否 | — | `UserDTO` |
| 5 | `GET /me/config` | P0 | 否 | 否 | — | 配置对象（未具名，见 5.2） |
| 6 | `GET /me/dashboard` | P1 | 否 | 否 | — | `DashboardDTO`（仅示例） |
| 7 | `GET /me/courses` | P1 | 否 | 否 | — | `List<CourseSummaryDTO>` |
| 8 | `POST /me/enrollments` | P1 | 是 | 否 | `{inviteCode}` | `{offeringId,enrolledAt,created}` |
| 9 | `GET /offerings/{offeringId}` | P1 | 否 | 否 | — | `OfferingDTO` |
| 10 | `GET /offerings/{offeringId}/chapters` | P1 | 否 | 否 | — | `{offeringId,items}` |
| 11 | `GET /chapters/{chapterId}` | P1 | 否 | 否 | — | `ChapterDetailDTO` |
| 12 | `GET /resources/{resourceId}` | P1 | 否 | 否 | — | `ResourceDTO` |
| 13 | `PUT /chapters/{chapterId}/progress` | P1 | 是 | 否 | `{status}` | `{chapterId,studentProgress,courseProgress}` |
| 14 | `POST /me/learning-position` | P1 | 是 | 否 | `{offeringId,chapterId?,assignmentId?}` | `{offeringId,lastChapterId,lastStudiedAt}` |
| 15 | `GET /me/assignments` | P1 | 否 | 否 | — | `List<AssignmentSummaryDTO>` |
| 16 | `GET /assignments/{assignmentId}` | P1 | 否 | 否 | — | `AssignmentDetailDTO` |
| 17 | `GET /assignments/{assignmentId}/workspace` | P1 | 否 | 否 | — | `WorkspaceDTO` |
| 18 | `PUT /assignments/{assignmentId}/workspace` | P1 | 是 | 否 | `{baseRevision,files,activeFile}` | `WorkspaceDTO` |
| 19 | `POST /assignments/{assignmentId}/submissions` | P1 | 是 | **是** | `{workspaceRevision,reflection}` | `SubmissionSummaryDTO` |
| 20 | `GET /assignments/{assignmentId}/submissions` | P1 | 否 | 否 | — | `List<SubmissionSummaryDTO>` |
| 21 | `GET /submissions/{submissionId}` | P1 | 否 | 否 | — | `SubmissionDetailDTO` |
| 22 | `GET /me/learning-records` | P1/P2 | 否 | 否 | — | 学习记录对象（见 5.2） |
| 23 | `GET /me/feedback/{feedbackId}` | P1 | 否 | 否 | — | `FeedbackDTO` |
| 24 | `GET /me/messages` | P1 | 否 | 否 | — | `List<NotificationDTO>` |
| 25 | `PUT /me/messages/{messageId}/read` | P1 | 是 | 否 | `{}` | `{id,readAt}` |
| 26 | `PUT /me/messages/read-all` | P1 | 是 | 否 | `{offeringId?}` | `{updatedCount}` |
| 27 | `GET /offerings/{offeringId}/notices` | P1 | 否 | 否 | — | 通知分页 |
| 28 | `GET /notices/{noticeId}` | P1 | 否 | 否 | — | `{id,offeringId,title,content,target,createdAt,recipientCount}` |
| 29 | `POST /me/learning-events` | P2 | 是 | 否 | `{events:[...]}`（≤50） | `{acceptedCount,duplicateCount}` |
| 30 | `GET /teacher/courses` | P1 | 否 | 否 | — | `List<{id,title,mark}>` |
| 31 | `GET /teacher/offerings` | P1 | 否 | 否 | — | `List<OfferingDTO>` |
| 32 | `POST /teacher/offerings` | P1 | 是 | 否 | `{courseId,title,groupName,termId,progressUnit}` | `OfferingDTO` |
| 33 | `POST /teacher/offerings/{offeringId}/archive` | P1 | 是 | 否 | `{}` | `OfferingDTO` |
| 34 | `GET /teacher/offerings/{offeringId}/members` | P1 | 否 | 否 | — | `List<{userId,displayName,username,role,joinedAt}>` |
| 35 | `GET /teacher/offerings/{offeringId}/chapters` | P1 | 否 | 否 | — | `{offeringId,items}` |
| 36 | `GET /teacher/chapters/{chapterId}` | P1 | 否 | 否 | — | `ChapterDetailDTO` |
| 37 | `POST /teacher/offerings/{offeringId}/chapters` | P1 | 是 | 否 | `{number,title,summary,isRequired}` | `ChapterSummaryDTO` |
| 38 | `PATCH /teacher/chapters/{chapterId}` | P1 | 是 | 否 | `{title?,summary?,number?,isRequired?}` | `ChapterSummaryDTO` |
| 39 | `POST /teacher/chapters/{chapterId}/publish` | P1 | 是 | 否 | `{}` | `ChapterSummaryDTO` |
| 40 | `POST /teacher/offerings/{offeringId}/knowledge-points` | P1 | 是 | 否 | `{chapterId?,title,description,order}` | `KnowledgePointDTO` |
| 41 | `GET /teacher/offerings/{offeringId}/knowledge-points` | P1 | 否 | 否 | — | `{offeringId,items}` |
| 42 | `PATCH /teacher/knowledge-points/{knowledgePointId}` | P1 | 是 | 否 | `{chapterId?,title?,description?,order?}` | `KnowledgePointDTO` |
| 43 | `POST /teacher/chapters/{chapterId}/resources` | P1 | 是 | 否 | `{knowledgePointId?,title,type,content,url,order}` | `ResourceDTO` |
| 44 | `PATCH /teacher/resources/{resourceId}` | P1 | 是 | 否 | `{knowledgePointId?,title?,content?,order?}` | `ResourceDTO` |
| 45 | `DELETE /teacher/resources/{resourceId}` | P1 | 是 | 否 | — | `{id,archived}` |
| 46 | `POST /teacher/offerings/{offeringId}/invites` | P1 | 是 | 否 | `{expiresAt,maxUses?}` | `{id,inviteCode,expiresAt,maxUses,usedCount,revokedAt,createdAt}` |
| 47 | `GET /teacher/offerings/{offeringId}/invites` | P1 | 否 | 否 | — | `List<{id,expiresAt,maxUses,usedCount,revokedAt,createdAt}>` |
| 48 | `POST /teacher/invites/{inviteId}/revoke` | P1 | 是 | 否 | `{}` | `{id,revokedAt}` |
| 49 | `GET /teacher/offerings/{offeringId}/assignments` | P1 | 否 | 否 | — | `List<TeacherAssignmentDTO>` |
| 50 | `POST /teacher/offerings/{offeringId}/assignments` | P1 | 是 | 否 | `AssignmentWriteDTO` | `TeacherAssignmentDTO` |
| 51 | `GET /teacher/assignments/{assignmentId}` | P1 | 否 | 否 | — | `TeacherAssignmentDTO` |
| 52 | `PATCH /teacher/assignments/{assignmentId}` | P1 | 是 | 否 | draft: `AssignmentWriteDTO` 字段<br>published: `{dueAt?,lateUntil?,description?}` | `TeacherAssignmentDTO` |
| 53 | `POST /teacher/assignments/{assignmentId}/publish` | P1 | 是 | 否 | `{}` | `TeacherAssignmentDTO` |
| 54 | `POST /teacher/assignments/{assignmentId}/archive` | P1 | 是 | 否 | `{}` | `TeacherAssignmentDTO` |
| 55 | `GET /teacher/assignments/{assignmentId}/submissions` | P1 | 否 | 否 | — | `List<SubmissionSummaryDTO + {student}>` |
| 56 | `GET /teacher/submissions/{submissionId}/feedback` | P1 | 否 | 否 | — | `{feedback,baseVersion}` |
| 57 | `POST /teacher/submissions/{submissionId}/feedback` | P1/P2 | 是 | 否 | `{baseVersion,score,rubricResults,comment,knowledgeEvaluations,issueTags?}` | `FeedbackDTO`（201 创建 / 200 更新） |
| 58 | `POST /teacher/submissions/{submissionId}/feedback/publish` | P1 | 是 | 否 | `{baseVersion}` | `FeedbackDTO` |
| 59 | `GET /teacher/offerings/{offeringId}/stats` | P1 | 否 | 否 | — | `{studentCount,activeAssignmentCount,pendingReviewCount,pendingHelpCount}` |
| 60 | `GET /teacher/assignments/{assignmentId}/stats` | P1/P2 | 否 | 否 | — | `{studentCount,submittedStudentCount,pendingReviewCount,reviewedStudentCount,commonIssues}` |
| 61 | `GET /teacher/offerings/{offeringId}/students/{studentId}/learning-records` | P2 | 否 | 否 | — | 学习记录对象 + `student` |
| 62 | `POST /teacher/offerings/{offeringId}/notices` | P1 | 是 | 否 | `{title,content,target?}` | `{id,offeringId,title,content,createdAt,recipientCount}` |
| 63 | `GET /teacher/offerings/{offeringId}/notices` | P1 | 否 | 否 | — | 通知分页 |
| 64 | `GET /teacher/assignments/{assignmentId}/ai-policy` | P2 | 否 | 否 | — | `AiPolicyDTO` |
| 65 | `PUT /teacher/assignments/{assignmentId}/ai-policy` | P2 | 是 | 否 | `{baseVersion,...AiPolicyWriteDTO}` | `AiPolicyDTO` |
| 66 | `GET /teacher/offerings/{offeringId}/help-requests` | P2 | 否 | 否 | — | `List<HelpRequestDTO>` |
| 67 | `GET /teacher/help-requests/{helpRequestId}` | P2 | 否 | 否 | — | `HelpRequestDetailDTO` |
| 68 | `POST /teacher/help-requests/{helpRequestId}/replies` | P2 | 是 | 否 | `{content}` | `{id,content,teacher,createdAt,status}` |
| 69 | `PUT /teacher/help-requests/{helpRequestId}/status` | P2 | 是 | 否 | `{status}` | `{id,status,updatedAt}` |
| 70 | `GET /assignments/{assignmentId}/ai-policy` | P2 | 否 | 否 | — | `AiPolicyDTO` |
| 71 | `GET /offerings/{offeringId}/issue-tags` | P2 | 否 | 否 | — | `{version,items:[{tag,title,description}]}` |
| 72 | `GET /assignments/{assignmentId}/tutoring-sessions` | P2 | 否 | 否 | — | `List<{id,assignmentId,createdAt,status,pendingRequestId,lastMessageAt}>` |
| 73 | `POST /tutoring/sessions` | P2 | 是 | 否 | `{assignmentId}` | `{id,assignmentId,createdAt,policyVersion}` |
| 74 | `GET /tutoring/sessions/{sessionId}/messages` | P2 | 否 | 否 | — | `List<TutoringMessageDTO>` |
| 75 | `POST /tutoring/sessions/{sessionId}/messages` | P2 | 是 | **是** | `{action,content,studentAttempt?,workspaceRevision?}` | `{tutoringRequestId,status}`（202） |
| 76 | `GET /tutoring/requests/{tutoringRequestId}` | P2 | 否 | 否 | — | `{id,sessionId,status,result,error,createdAt,completedAt}` |
| 77 | `POST /me/help-requests` | P2 | 是 | 否 | `{assignmentId,title,content,studentAttempt,workspaceRevision?,sharedTutoringRequestIds?,issueTags?}` | `HelpRequestDTO` |
| 78 | `GET /me/help-requests` | P2 | 否 | 否 | — | `List<HelpRequestDTO>` |
| 79 | `GET /me/help-requests/{helpRequestId}` | P2 | 否 | 否 | — | `HelpRequestDetailDTO` |
| 80 | `POST /assignments/{assignmentId}/checks` | P3 | 是 | 建议 | `{workspaceRevision}` | `{checkId,status}`（202） |
| 81 | `GET /checks/{checkId}` | P3 | 否 | 否 | — | `{id,assignmentId,workspaceRevision,checkerVersion,status,result,error,createdAt,completedAt}` |

**共同前缀之外的运维端点**：`GET /health/live`（200 `{status:'ok'}`）、`GET /health/ready`（200 `{status:'ready'}` / 503 `{status:'unavailable'}`）。**这两个是当前唯一已实现的端点**，使用独立约定、**不套业务信封**。

**仅需 CSRF 的写方法**：`POST` / `PUT` / `PATCH` / `DELETE`（API.md 第 36 行）。

---

### 5.2 类型登记表

#### A. §2 注册表已登记（14 个）【已核实】

`API.md` 第 142–155 行，形式为"字段名清单"，**无类型、无必填/可空标注、无嵌套结构定义**。

| DTO | 定义位置 |
| --- | --- |
| `UserDTO` | 第 142 行 |
| `OfferingDTO` | 第 143 行 |
| `CourseSummaryDTO` | 第 144 行 |
| `ChapterSummaryDTO` | 第 145 行 |
| `ChapterDetailDTO` | 第 146 行 |
| `ResourceDTO` | 第 147 行 |
| `KnowledgePointDTO` | 第 148 行 |
| `AssignmentSummaryDTO` | 第 149 行 |
| `AssignmentDetailDTO` | 第 150 行 |
| `WorkspaceDTO` | 第 151 行 |
| `SubmissionSummaryDTO` | 第 152 行 |
| `SubmissionDetailDTO` | 第 153 行 |
| `FeedbackDTO` | 第 154 行 |
| `NotificationDTO` | 第 155 行 |

#### B. 未进入注册表的复合类型（22 个）【已核实】

| 类型（本文命名） | 定义位置与形式 | 备注 |
| --- | --- | --- |
| `/me/config` 响应 | 第 179 行，表格单元格内联 | 本文件称 `MeConfigDTO` |
| `DashboardDTO` | 第 180 行标注名称 + 第 542–623 行**仅有 JSON 示例** | 表格说"字段见示例" |
| 学习记录对象 | 第 242 行 + 第 251–257 行 **bullet 散文** | 无 DTO 名 |
| 知识证据项（P2） | 第 256 行，散文中的行内对象 | 无 DTO 名 |
| 建议项（P2） | 第 257 行，散文中的行内对象 | 无 DTO 名 |
| `TeacherAssignmentDTO` | 第 365 行，**"以上字段加…"引用式描述** | 依赖 `AssignmentWriteDTO` |
| `AssignmentWriteDTO` | 第 331–363 行，JSON 示例 | 无字段级类型表 |
| `AiPolicyDTO` | 第 410–429 行，JSON 示例 | 无类型表 |
| `AiPolicyWriteDTO` | 第 433 行，**一句话描述**（"为以上可配置字段，排除…"） | 最薄弱的一处 |
| 辅导会话项 | 第 404 行，表格单元格内联 | 本文件称 `TutoringSessionDTO` |
| `TutoringMessageDTO` | 第 443 行，散文中的行内对象 | |
| 辅导请求响应 | 第 408 行 + 第 449–456 行 bullet | 无 DTO 名 |
| `HelpRequestDTO` | 第 470 行，散文中的行内对象 | |
| `HelpRequestDetailDTO` | 第 470 行，散文中的行内对象 | |
| 检查结果 | 第 481、483 行 | 无 DTO 名 |
| 成员项 | 第 289 行，表格单元格内联 | `{userId,displayName,username,role,joinedAt}` |
| 邀请创建响应 | 第 301 行，表格单元格内联 | 唯一返回明文 `inviteCode` 的响应 |
| 邀请列表项 | 第 302 行，表格单元格内联 | 不含 `inviteCode` |
| 公告对象 | 第 248 行 + 第 385 行 | 两处需一致 |
| 教学班统计 | 第 327 行，表格单元格内联 | |
| 作业统计 | 第 328 行，表格单元格内联 | |
| 领域列表包装 `{offeringId,items}` | 第 184、290、296 行 | 无类型名 |

#### C. 一次性内联对象字面量（约 15 处）

`{csrfToken}`、`{user,csrfToken}`、`{loggedOut}`、`{offeringId,enrolledAt,created}`、`{chapterId,studentProgress,courseProgress}`、`{offeringId,lastChapterId,lastStudiedAt}`、`{id,readAt}`、`{updatedCount}`、`{id,archived}`、`{id,revokedAt}`、`{feedback,baseVersion}`、`{tutoringRequestId,status}`、`{checkId,status}`、`{acceptedCount,duplicateCount}`、`{id,status,updatedAt}`。

**合计约 14 + 22 + 15 ≈ 51 个对外对象形状，其中只有 14 个有字段级登记。**

---

### 5.3 错误码总表（36–37 个）【已核实，状态标注见备注】

| HTTP | 错误码 | 来源 | 备注 |
| --- | --- | --- | --- |
| 400 | `INVALID_REQUEST` | §1.3 表 | JSON 正文缺失/损坏/未知字段 |
| 400 | `INVALID_INVITE_CODE` | §1.3 表 | 无效/过期/撤销邀请码统一 |
| 400 | `INVALID_FILE_PATH` | §1.3 表 | |
| 401 | `UNAUTHENTICATED` | §1.3 表 | 会话失效 |
| 401 | `INVALID_CREDENTIALS` | §1.3 表 | 固定文案"用户名或密码错误" |
| 403 | `FORBIDDEN` | §1.3 表 | |
| 403 | `CSRF_INVALID` | §1.3 表 | |
| 404 | `NOT_FOUND` | §1.3 表 | 对他人私有资源也返回此码 |
| 405 | `METHOD_NOT_ALLOWED` | §1.3 表 | 保留 `Allow` 头 |
| 406 | `NOT_ACCEPTABLE` | §1.3 表 | |
| 409 | `WORKSPACE_CONFLICT` | §1.3 表 | 带 `details.currentRevision` |
| 409 | `FEEDBACK_VERSION_CONFLICT` | §1.3 表 | |
| 409 | `IDEMPOTENCY_KEY_REUSED` | §1.3 表 | |
| 409 | `EVENT_CONFLICT` | §1.3 表 | |
| 409 | `SUBMISSION_CLOSED` | §1.3 表 | **触发条件未定义**（缺口 2） |
| 409 | `RESUBMIT_NOT_ALLOWED` | §1.3 表 | **触发条件未定义**（缺口 2） |
| 409 | `ATTEMPT_LIMIT_REACHED` | §1.3 表 | **触发条件未定义**（缺口 2） |
| 409 | `RESUBMIT_AFTER_REVIEW` | §1.3 表 | 有已发布评价后重交 |
| 409 | `SUBMISSION_SUPERSEDED` | §1.3 表 | 评价已失效的旧提交 |
| 409 | `REQUEST_IN_PROGRESS` | 第 119 行 | 带 `Retry-After` |
| 409 | `ARCHIVE_PENDING_REVIEWS` | 第 288、322 行 | 有未批阅当前提交时归档 |
| 409 | `CHAPTER_ALREADY_PUBLISHED` | 第 305 行 | 已发布章节改 `number`/`isRequired` |
| 409 | `ASSIGNMENT_ALREADY_PUBLISHED` | 第 369 行 | 已发布作业改冻结字段 |
| 409 | `ASSIGNMENT_ARCHIVED` | 第 236 行 | 同时用作 `saveBlockedReason` 取值 |
| 409 | `OFFERING_ARCHIVED` | 第 226 行 | **仅作为 `saveBlockedReason` 出现，从未被称为错误码**（缺口 2） |
| 409? | `ASSIGNMENT_NOT_PUBLISHED` | 第 371 行 | **HTTP 状态未标注**，且无反引号（缺口 2） |
| 409? | `FEEDBACK_ALREADY_PUBLISHED` | 第 377 行 | **HTTP 状态未标注**，且无反引号（缺口 2） |
| 409 | `AI_DISABLED` | 第 435 行 | 不消耗配额 |
| 409? | `AI_POLICY_VERSION_CONFLICT` | 第 439 行 | **HTTP 状态未标注**，且无反引号（缺口 2） |
| 409 | `AI_REQUEST_IN_PROGRESS` | 第 445 行 | `details` 返回本人 `pendingRequestId` |
| 409 | `HINT_LIMIT_REACHED` | 第 447 行 | 超过政策 `maxHintLevel` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | §1.3 表 | |
| 422 | `VALIDATION_ERROR` | §1.3 表 | 带 `details.fields:[{field,message}]` |
| 422 | `ATTEMPT_REQUIRED` | 第 456 行 | 达到 `requireAttemptFromLevel` 无尝试描述 |
| 429 | `RATE_LIMITED` | §1.3 表 | 带 `Retry-After` |
| 500 | `INTERNAL_ERROR` | §1.3 表 | 只返回请求标识与通用说明 |
| 503 | `SERVICE_UNAVAILABLE` | §1.3 表 | 不得返回正常业务空列表 |

**另有非错误码的状态字符串**：`retention_expired`（`contentUnavailableReason` 取值，第 443、460 行）。

---

### 5.4 枚举总表【已核实】

**⚠ 标记为大小写陷阱，必须显式声明。**

| 字段 | 取值 | 大小写 |
| --- | --- | --- |
| `UserDTO.roles[]` | `student` / `teacher` / `admin` | 小写 |
| `OfferingDTO.status` / `CourseSummaryDTO.status` | `active` / `archived` | 小写 |
| `OfferingDTO.progressUnit` / `progress.unit` | `chapter` / `assignment` | 小写 |
| `publicationState`（章节、作业） | `draft` / `published` / `archived` | 小写 |
| ⚠ `studentProgress.status`（章节） | `not_started` / `in_progress` / `completed` | **小写** |
| ⚠ `assignmentState`（作业） | `NOT_STARTED` / `IN_PROGRESS` / `SUBMITTED` / `REVIEWED` | **大写** |
| `assignment.type` | `web_lab` / `sql_text` / `text` | 小写 |
| `resource.type` | 固定 `markdown` | — |
| `resource.url` | 固定 `null`（P1） | — |
| `SubmissionSummaryDTO.feedbackStatus` | `none` / `draft` / `published` | 小写 |
| `FeedbackDTO.status` | `draft` / `published` | 小写 |
| `knowledgeEvaluations[].result`、`evidence[].result` | `meets_expectation` / `needs_practice` / `insufficient_evidence` | 小写 |
| ⚠ 知识证据 `assessmentState` | `basically_mastered` / `needs_practice` / `learning` / `insufficient_evidence` | 小写，**与上一行是不同集合** |
| `freshness` | `fresh` / `stale` / `none` | 小写 |
| `knowledgeEvidence.ruleVersion` | 固定 `knowledge-v2` | — |
| `NotificationDTO.type` | `course_notice` / `assignment_published` / `feedback` / `system` / `help_reply`(P2) | 小写 |
| `target.type` | `chapter` / `resource` / `assignment` / `feedback` / `offering` / `help_request`(P2) | 小写 |
| AI `allowedActions` | `ask` / `concept` / `next_hint` | 小写 |
| AI `allowedModes`；`result.mode` | `concept` / `debug_hint` / `guided_question`；fallback 时 `fallback` | 小写 |
| `tutoringRequest.status` | `queued` / `running` / `completed` / `fallback` / `failed` | 小写 |
| `result.nextAction` | `try_and_report` / `review_concept` / `request_teacher_help` / `none` | 小写 |
| `contentUnavailableReason` | `null` / `retention_expired` | 小写 |
| 辅导会话 `status` | `active` / `closed` | 小写 |
| `HelpRequestDTO.status` | `open` / `answered` / `closed` | 小写 |
| `checkRun.status` | `queued` / `running` / `completed` / `error` | 小写 |
| `checkResult.items[].status` | `pass` / `fail` | 小写 |
| ⚠ `saveBlockedReason` | `OFFERING_ARCHIVED` / `ASSIGNMENT_ARCHIVED` / `null` | **大写** |
| ⚠ `submissionBlockedReason` | **全部文档中从未定义**（缺口 1） | ? |
| 学习事件 `type` | `chapter_opened` / `resource_opened` / `editor_opened` / `preview_opened` / `active_heartbeat` | 小写 |
| 全部布尔字段 | `true` / `false`（**不是 0/1**；数据库侧才是 `TINYINT`） | — |
| `features` 三项 | `aiTutoring` / `learningAnalytics` / `serverChecks`，P1 全 `false` | — |

---

### 5.5 响应信封与列表形状【已核实】

**成功信封**（`API.md` 第 49–56 行）：

```json
{ "data": { }, "requestId": "req-example" }
```

**分页列表**（第 58–73 行）：

```json
{ "data": { "items": [], "page": 1, "pageSize": 20, "total": 0, "summary": {} }, "requestId": "req-example" }
```

- `page` 从 1 开始；`pageSize` 默认 20，范围 1～100。
- 未特别注明的列表按 `createdAt` 降序、ID 降序稳定排序。
- `summary` 可选，计数表示当前权限与业务筛选范围的统计，**不是本页条数**。
- 空列表是 HTTP 200；超出最后一页返回空列表与真实 `total`。

**错误信封**（第 75–86 行）：

```json
{ "error": { "code": "WORKSPACE_CONFLICT", "message": "…", "details": { "currentRevision": 8 } }, "requestId": "req-example" }
```

- 无附加信息时 `details` 为 `{}`；字段校验失败时 `details.fields` 为 `{field,message}` 数组。
- 错误响应设置 `Cache-Control: no-store`。

**健康端点例外**（第 190 行）：`/health/*` 使用独立 DTO，**不套业务信封**。

**三种列表形状的冲突**见缺口 7。

**`X-Request-ID` 约定**（第 26 行）：只接受一个头值，格式 `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`，不做首尾空白修剪；不合法时服务端生成 `req-<UUID>`。当前过滤器只处理 `/api/v1` 及其下级路径。

**幂等约定**（第 110–119 行）：`Idempotency-Key` 为客户端生成 UUID；幂等范围为"当前用户 + 路径中的目标对象 + 操作 + key"，保留至少 24 小时。仅 `POST /assignments/{id}/submissions` 与 `POST /tutoring/sessions/{id}/messages` **必须**携带；`POST /assignments/{id}/checks` 为"建议"。

**乐观锁约定**：整数 `baseRevision`（工作区）/ `baseVersion`（评价、AI 政策）；过期版本返回 409，禁止静默覆盖。

---

### 5.6 前端接线坐标（已验证准确）【已核实】

`API.md` 第 740–749 行与 `DEVELOPMENT.md` 第 420–432 行的引用**全部对得上**：

| 原型位置 | 现状 | 需对接 |
| --- | --- | --- |
| `learning-ui.js:6–23` | `joined` 集合、`courses` 字典、`tasks` 数组、`pending()`/`feedbackCount()` | `/me/courses`、`/me/assignments`、`/me/dashboard` |
| `learning-ui.js:87–118` | `taskPage()`、`assignmentRow()`、`assignments()`；中文 `state`、布尔 `done`、`route` | 作业 DTO；服务端 `overdue`/`canSubmit` |
| `learning-ui.js:121–140` | `openJoin()`；邀请码字典 `{WEB2026,DB2026,UX2026,NET2026}` | `POST /me/enrollments` |
| `course-ui.js:6–22` | `directory()` 固定第 3 章、`web()` 固定 lessons | 章节目录、章节详情、`PUT /chapters/{id}/progress` |
| `records-ui.js:3–44` | `evidence` 四行固定知识证据、`progress()` | `/me/learning-records?offeringId=…` |
| `records-ui.js:51–71` | `messages()` 固定 2 条消息与阅读标签 | 消息列表与标记已读 |
| `main.js:19` | `chapters` 常量 | 章节目录 |
| `main.js:21–24` | `codeSamples`、`codeView()`、`lab()` 只读代码与静态预览 | 工作区读写、预览、P2 AI、P3 检查 |
| `main.js:26` | `teacher()` 硬编码 36 人 / 12 份待批阅 / 3 条求助 | 教师教学班、作业、提交、评价、统计、通知、P2 求助 |
| `main.js:29` | `location.hash.slice(1).split('/')` **只解析两段** | 完整路径解析 |
| `main.js:30` | `[data-chapter]` 处理器，非第 2 章即提示"暂未接入" | 可切换章节 |
| `main.js:32–35` | `[data-code]`/`[data-size]`/`[data-lab-view]`/`[data-hint]` 演示交互 | 真实编辑、预览、AI 提示 |
| `serve.mjs:14–17` | 仅允许 `/`、`/index.html`、`/src/*`，其余 404 | P0 加受限 API 代理 |

**原型中不能进入接口字段的表示**（第 751–757 行）：`?scenario=empty|clear|error`、`sampleDate='2026-10-01'`、中文 `state`、布尔 `done`、`route:'lab'|'progress'`、教师/学生视角路由切换。

**`DEVELOPMENT.md` 第 10.4 节的路由表**（第 473–497 行）是前端路由契约，共 20 条路由，与 API 端点一一对应。**该表本身没有缺口**，但它引用的字段名全部依赖 API.md。

---

## 6. 必须由项目方拍板的 6 个决策

这些是文档中**没有答案**、且**我无法从现有内容推断**的。设计者需要把它们作为待决问题列出，不能自行发明。

| # | 决策 | 关联缺口 | 选项与影响 |
| --- | --- | --- | --- |
| 1 | `submissionBlockedReason` 的取值集合 | 缺口 1 | 至少要覆盖：已截止且无补交窗口 / 补交窗口已过 / 次数用尽 / 已有已发布评价禁止重交 / 作业归档 / 教学班归档。给出后 `canSubmit` 语义才闭合 |
| 2 | PATCH 的可选字段语义 | 缺口 3 | ① 缺省=不变、显式 `null`=清空（能表达"解绑知识点"，**推荐**）；② 缺省=不变、不允许清空（则 `PATCH /teacher/resources/{resourceId}` 的 `knowledgePointId` 永远无法解绑） |
| 3 | `SUBMISSION_CLOSED` / `RESUBMIT_NOT_ALLOWED` / `ATTEMPT_LIMIT_REACHED` 各自的触发条件 | 缺口 2 | 三者现在并列在 §1.3 同一行，正文只解释了另两个码 |
| 4 | 三种列表形状是否都放进 `data`，前端如何选择解包方式 | 缺口 7 | ① 统一收敛到标准分页信封；② 保留三种但给出显式判据（如"具名 DTO 才分页"）；③ 为无分页列表单独定义 `items` 语义 |
| 5 | 三个未标状态的错误码的 HTTP 状态 | 缺口 2 | `ASSIGNMENT_NOT_PUBLISHED` / `FEEDBACK_ALREADY_PUBLISHED` / `AI_POLICY_VERSION_CONFLICT`，本文推断均为 409 |
| 6 | Cookie 名称 | 缺口 9 | 预登录 Cookie 与会话 Cookie 的名称；影响联调、排错、集成测试 |

**另有 3 个较小但需确认的项**：`Idempotency-Replayed` 是否属于契约；`score` 在 JSON 中是数字还是字符串；`details.fields` 的元素结构示例。

---

## 7. 对目标交付物的要求（设计约束）

以下为**要求**，不是方案。方案由设计者决定。

### 7.1 单一权威

- 对外字段、类型、可空性、枚举、错误码必须**只有一个产生源**。叙述文档只做引用，不重述。
- 必须显式声明权威顺序，例如"字段级以契约文件为准；业务规则以 DEVELOPMENT 为准；存储以 DATA_MODEL 为准"。
- 现存的三处以上重述（见 3.1 节）必须逐条消除或降级为链接。

### 7.2 机器可读

- `DEVELOPMENT.md` 第 181 行已承诺 OpenAPI 导出并入库做契约差异检查，**该承诺目前未兑现**。设计要求应明确：契约文件放哪、由谁生成、如何校验、如何在 CI 中阻止不兼容变更。
- 契约必须包含每个字段的 `type` / `required` / `nullable` / `enum` / `example`，以及每个端点的错误响应。

### 7.3 注册表层与叙述层分离

- 错误码、枚举、字段级类型属于**注册表**，适合表格化/机器化。
- 业务规则（进度公式、knowledge-v2、AI 提示层次、锁顺序、保留策略）属于**叙述**，应保持现状，**不要重写**。
- 端点清单属于两者之间：阶段、权限、CSRF、幂等要求适合注册表；每个端点的业务前置条件适合叙述。

### 7.4 支持异构模型并行开发

这是本项目的特殊约束：前端由 GLM 负责、后端由 DeepSeek 负责、架构与文档由 GPT-6 负责。设计要求应包含：

- **接口冻结流程**：字段改名/新增/删除必须原子地同时更新契约文件、前端类型、mock 数据与叙述文档；不允许只改一处。
- **前端可用性**：前端在后端 81 个端点全部未实现的前提下要能并行开工，因此需要 mock 层与"当前是否可用"的显式标记。
- **两端读取同一份东西**：前端模型与后端模型应被指向**同一份契约产物**，而不是同一份散文。
- **禁止事项清单**：例如"前端不得手写字段名，必须引用生成类型"、"后端不得新增未登记错误码"。

### 7.5 体量控制

现约 2290 行设计文档，且仍在增长。设计要求应考虑：哪些内容必须留在主文档，哪些应移入注册表/生成产物；新增内容是否会加剧"选择性阅读"导致的读取偏差。

### 7.6 保留现有优点

以下内容**已经写好，不要重做**：并发与锁设计、事务步骤、幂等语义、保留与清理策略、业务规则闭合度、行号级的前端接线映射、诚实的"未实现"声明。设计要求应明确把这些标为"已冻结/已验收"，避免下一轮被改写。

---

## 8. 建议的验收方式

设计交付后，可用以下检查判断是否解决了本报告的问题：

1. **随机抽取 5 个 §2 未登记的复合类型**（如 `AiPolicyWriteDTO`、邀请列表项、教师统计），检查新契约是否给了完整字段/类型/可空性。**通过标准：5/5 完整。**
2. **随机抽取 5 个错误码**，检查是否能在一处查到 HTTP 状态与触发条件。**通过标准：5/5 可查，且 `ASSIGNMENT_NOT_PUBLISHED` 等三个码的状态已确定。**
3. **对 `PATCH /teacher/resources/{resourceId}` 写出"解绑知识点"的请求体**，检查契约是否能唯一确定。**通过标准：无歧义。**
4. **搜索新文档集中是否仍存在跨文档重述的字段名**。**通过标准：字段名只在契约层出现一次。**
5. **验证前端模型与后端模型被指向同一份契约产物**。**通过标准：两者引用的文件完全相同。**
6. **验证契约中每个端点都有响应示例或 schema**。**通过标准：81/81。**

---

## 附录 A：核查方法与证据

**核查动作**：

1. 通读 `README.md`（176 行）、`docs/DEVELOPMENT.md`（771 行）、`docs/API.md`（759 行）、`docs/DATA_MODEL.md`（447 行）、`docs/archive/*`（138 行）。
2. 用正则提取 `API.md` 中所有端点表格行，逐行核对阶段、CSRF、幂等、请求与响应根类型；排除 §8 前端接线表的 2 行非端点行，得 **81**。
3. 用正则提取全部 SCREAMING_CASE 词元并人工分类，分离错误码与业务枚举，得错误码 **36–37** 个。
4. 逐条打开 `API.md` §8 与 `DEVELOPMENT.md` §10.1 引用的原型行号，与 `learning-ui.js`（155 行）、`main.js`（43 行）、`course-ui.js`（25 行）、`records-ui.js`（80 行）、`serve.mjs`（35 行）实际内容比对。
5. 全仓库检索 `fetch(`、`XMLHttpRequest`、`localStorage`、`sessionStorage`、`/api/v1`、`openapi`、`swagger`。
6. 检索 `backend/src/main/java` 中的 `@RestController`、`@RequestMapping`、`@GetMapping`、`@PostMapping`、`@PutMapping`、`@PatchMapping`、`@DeleteMapping`、`@Service`、`@Component`。
7. 统计 `API.md` 中的 ` ```json ` 代码块数量并逐个分类为"响应示例 / 请求示例 / schema 定义"。
8. 检索跨文档的字段名重述（`aiPolicyVersion`、`canSave`、`saveBlockedReason`、`canSubmit`、进度公式、会话期限、用户名规范）。

**未做的事**：

- 未运行构建、测试或应用，未验证文档声明的测试用例数（93 / 126 / 166 条等）与耗时数据。
- 未连接数据库，未验证迁移的实际执行结果。
- 未修改任何文件；本报告为**新增文件**，三份设计文档与 README 未被改动。

**遗留的不确定项**（建议设计者复核）：

- 第 5.1 节中 §5 / §6 端点的阶段归属由本文按节补齐，需项目方确认。
- 第 5.1 节中部分"需 CSRF"由"写方法均需 CSRF"的规则推导，而非逐行标注。
- 错误码总数 36–37 取决于 `OFFERING_ARCHIVED` 是否算作错误码。
