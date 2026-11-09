# 当前状态与交接

本文件记录会随交付变化的进度、交接与验证结果。**实现任务可以直接更新本文件**，无需另行授权；架构、业务规则与契约仍按 [AGENTS.md](../AGENTS.md) 的规则修改。设计基线见 [DEVELOPMENT](DEVELOPMENT.md)。

**读法**：§0 是判断"项目当前处在哪"的唯一出处；§1 及之后是按时间追加的历史记录，只用于追溯，不能据此判断现状。

## 0. 现在是什么状态（唯一权威）

> 改本节必须显式说明改了什么、依据是什么；本节只保留现状块（代码基线、阶段、契约状态、门禁现状、未决事项），带日期的会话日志一律追加到 §1，不再写入本节。

- **代码基线**：`1e61ed0`（供应商输出契约收紧与 `AI_PROVIDER_THINKING`；语料见 `83bec91`、L1 见 `d61302f`），须为 HEAD 祖先且落后不超过 3 个提交。`master` 已合并推送至 `018578b`，无未推送提交。

- **阶段**：P1 原有教学闭环证据见 §3.8。P2-A（政策、受限辅导、教师求助）与 P2-B（客户端及可信事件、教师知识证据、建议、共性问题）后端开发完成，任务清单和联调说明见 [P2 后端交付](features/p2-backend-integration.md)；前端知识评价/标签 UI 已由 `801c940` 完成。阶段二（课程选题的学习行为可视化与知识掌握分析）已补教师端学习分析页与学生端掌握概览，2026-10-31 经正式页面、真实后端与 MySQL 验证；共性问题仅展示，不映射知识点。真实供应商调用未启用，外部调用按用户确认保持关闭。自动检查已实现并通过本轮验证，动态学习路径与预测未实现；P2 基础规则建议已实现（nextRecommendation），不应统称为“建议未实现”。工作区已改为 IDE 式分栏（左题面/右编辑器/运行结果），AI 求助以内嵌抽屉方式接入工作区，发送前自动保存并携带最新 revision；本轮按用户授权补充服务端自动判题（Web 静态 HTML/CSS 与 SQL 查询/增删改，已完成真实联调）。**2026-10-31 新增**：双模式注册功能（个人模式自动关联 Web 课程、学校模式支持邀请码加入班级或教师创建班级）已实现后端接口（POST /api/v1/auth/register）与前端页面（#/register）；V16 Flyway 迁移导入真实 Web 开发基础课程数据（5 章、10 份 Markdown 资源、12 个知识点，内容基于 MDN Web Docs 结构手动编写）。迁移不创建账号：`course_offerings.created_by` 已允许为空，个人学习 offering 无创建者；空库没有学期时 V16 会补一个「个人学习学期」作为承载，已有当前学期时保持原样。

- **课设符合性**：依据用户提供的《选题二要求.md》，课设阶段一 MVP 尚未完整满足：自动判题已补齐，真实基础 AI 问答仍未验收。仓库 P1/P2/P3 为内部工作包，不等于课设三阶段；既有教学闭环通过不能替代课设 MVP 完成。阶段二看板/掌握分析已有实现。AI 五层机制中课程讲义检索与出处、静态分析前置尚缺；当前仅传入作业描述和要求，不能称为完整 RAG。阶段三只需选 1–2 项，不必同时做动态路径与预测。软著材料、论文与真实对照实验结果尚无本轮确认的交付证据。

- **契约状态**：1.3.0，89 个业务操作 + 2 个健康检查；业务操作为 18 verified、69 implemented、2 planned（两个健康检查为 implemented，不计入业务统计）。新增 `getOfferingActivity`、`getOfferingKnowledgeMastery` 已接生产路由，字段结构与路径见契约，HTTP/IT 与真实页面证据齐备，标记 verified。`getAssignmentStats` 的 `commonIssues` 描述已于 2026-10-31 经授权按真实聚合口径修正，路径、字段与状态未变。`POST /api/v1/auth/register` 已由项目使用者在浏览器完成个人模式注册并确认自动登录可用（2026-10-31，用户验收，未留截图），标记 verified；学校模式邀请码入班与教师注册建班也已取得真实浏览器证据，未额外更改接口状态。

- **门禁现状**：固定 Node 24.21.0 / npm 11.19.0 前端 verify 全通过（48 文件 / 426 用例、`test:browser:config` 13 例、typecheck、build、生产 mock 隔离）；单元及模拟 HTTP 测试不作为数据库证据。JDK 21.0.11 最终 `mvnw --batch-mode -Dchecks.it.runners=true verify` 全通过：481 单元/HTTP + 285 真实 MySQL/执行器 IT，0 失败/错误/跳过，耗时 10:31；包括 17 个真实隔离执行器用例、发布与配置保存并发、同 revision 并发入队。真实 Edge 五类题目共 10 次正反例、教师配置发布冻结、学生保存后检查、390px 布局全部通过，0 页面错误。契约静态检查通过；5 个自动判题操作标记 verified。

- **未决事项**（2026-11-08 更新）：
  1. §4 原归档与提交竞态已通过生命周期锁、真实待批阅检查及四组 MySQL 并发测试修复；其余四项既有限制保留。
  2. 本轮补齐教学班归档后的历史反馈与工作区只读真实浏览器证据；慢网络、会话失效及其他归档类型仍沿用既有证据，不将教学班归档验收等同于公告归档验证。
  3. 历史公告如无唯一可信的创建审计，收件人数沿用按时间和标题匹配的估算，可能不精确；新公告的 V14 冻结人数不受此限制。
  4. 共性问题与知识点映射、动态路径与预测尚未实现。自动判题已按用户授权补齐 Web 与 SQL（SELECT、INSERT、UPDATE、DELETE）；Web 只检查静态 HTML/CSS，不执行 JavaScript，学生 SQL DDL 不在本期范围。
  5. 学校模式注册入班和教师注册建班现有本轮真实浏览器证据；未扩大接口 verified 状态。
  6. V16 自带「个人学习学期」是迁移写业务配置的折中；若真实环境要求学期只能由管理流程创建，应改为注册时按需创建个人 offering，并同步迁移与文档。

  7. Docker 守护进程在查询中途失联后的恢复与清理尚未实测；已验证镜像缺失、执行超时、资源超限、任务过期及每次执行后的容器删除。多实例负载未验收，前端仍有构建大分包提示。

  8. 真实浏览器验收脚本自 2026-11-08 起要求 `BROWSER_ACCEPTANCE_*` 隔离目标与写入确认，不再读取 `backend/.env`、不再固定 Edge；本轮只做离线配置验证与失败即退验证，未在隔离环境实跑，2026-11-07 的既有浏览器证据由改造前脚本产生。

### 0.1 接手前必读

- 端口：MySQL 3307（Docker，Flyway 到 V17）、后端 8080、Vite 4173（同源代理）。健康检查是 `/health/live`、`/health/ready`，不是 `/actuator/health`。本轮在原有数据基础上升级至 V17，未重建本地库；后端与数据库统一用 `backend/scripts/Start-Local.ps1 -JdkPath <JDK21 目录>` 启动，首次建账户加 `-InitializeAccounts`。
- 演示账号 `student.demo`、`teacher.demo`、`admin.demo`；密码在被 Git 忽略的 `backend/.env` 中，**不要提交、截图或贴进对话**。
- 单独跑某个前端测试要在 `frontend/` 目录下执行 `npx vitest run tests/xxx.test.ts`；在仓库根目录用 `npm --prefix frontend exec vitest` 不会加载 happy-dom，会报 `window is not defined`。
- 不要读 `frontend/src/api/generated/`（生成代码）、`node_modules`、lock 文件与日志；生成类型以 `openapi.yaml` 为源。
- **不要用 `backend/target/surefire-reports/*.txt` 累加用例数**：该目录会残留已删除测试类的旧报告，累加会得到虚高值（2026-10-18 实测累加得 443，Maven 实际 `Tests run: 384`）。以 Maven 的 `Results:` 汇总行为准。
- `docs/archive/` 一律是历史快照，不是规范。其中的 `HANDOFF-2026-10-16.md` 写的是 P1 尚未闭环时的状态，已作废。

## 1. 历史状态记录（只追加，勿据此判断当前）

> **2026-11-09 实验语料补齐至 40 题（分支 `experiment/corpus-40`）**：按课程重心定配比 **HTML 12 / CSS 12 / 事件 8 / SQL 8**（Web 三类占 80%，SQL 保留 8 题以保证分类对比有统计意义），并按难度分层 **基础 24 / 进阶 16**（新增可选 `level` 字段）。新增题目覆盖：viewport/标签闭合/label 关联/input type/固定宽图/form 方法/表格跨列/嵌套表单/交互嵌套/语义控件/实体转义/charset 位置；选择器优先级/flex 方向/浮动塌陷/媒体查询顺序/z-index 前提/vh/rem 基准/grid 跨列；表单默认提交/事件冒泡/var 闭包/重复绑定/keyCode/异步竞态；NULL 比较/未知列排序/笛卡尔积/分页无排序/聚合写进 WHERE/隐式类型转换。语料 README 与实验方案 §4、§9 同步更新，并把结果表口径写死（主表组别×类别、附表组别×难度、消融表只报 M1/M4/M7）。
>
> 检查：`node scripts/experiment-corpus.mjs` → OK（4 文件 / **40 题 / 200 个用例**，basic=24、advanced=16）；`--self-test` 6 项 PASS；`validate_contract.py` PASS。未做：E1 运行器与判定脚本未写；未跑真实模型调用。

> **2026-11-09 智谱免费模型实测与提示收紧（分支 `feature/provider-prompt`）**：用项目实际请求体（`response_format: json_object` + 系统提示 + context JSON）实测智谱模型：`glm-4.7-flash` 默认开启 thinking，会把 800 token 预算耗尽（`finish_reason=length`、content 为空），设 `AI_PROVIDER_THINKING=disabled` 后 **2.9s** 返回合规四字段且命中语料金标准；`glm-4.5-flash` 关思考仍需 8–24s 且偶有枚举越界；`glm-4-flash` 2.6–3.2s 合规但内容偏空泛；`glm-5.3-flash` 返回余额不足。据此把系统提示收紧为「恰好四个字段 + 枚举清单 + JSON 示例 + 中文 200 字内不含代码」，并新增可选 `AI_PROVIDER_THINKING`（智谱取 `disabled`）。`scripts/ai-provider-smoke.mjs` 同步新提示、新增 `--thinking`，并修掉 Windows 上 `AbortSignal.timeout` 导致的 libuv 退出断言（改 AbortController + clearTimeout，不再 `process.exit`）。
>
> 检查：五组 tutoring 测试共 40 例通过（Provider/HttpContract/Worker/Retrieval/Findings）；smoke `--self-test` 7 项通过；真实调用 `glm-4.7-flash + thinking=disabled` → HTTP 200、2.9s、4 字段、判定 PASS，内容为「确认代码是否在 DOM 加载完成后执行」，命中语料 `event-001` 的金标准。未做：未写入 `backend/.env`（含密钥，按约定由使用者填写）；未重启后端做页面级联调；40 题语料与 E1 运行器仍未完成。

> **2026-11-09 实验语料样板与校验器（分支 `experiment/corpus`）**：新增 [实验语料](features/experiment-corpus/README.md)（`docs/features/experiment-corpus/` 下 `html.json`/`css.json`/`event.json`/`sql.json`），按单题格式收录 **10 题样板**：每题含学生代码、一个主缺陷的金标准定位（文件＋行号＋该行必含片段＋说明）、三档问法（提示／直答／三轮拆解），并标注 10/40 进度与「未补齐不开始 E1 正式采集」。新增 [experiment-corpus.mjs](../scripts/experiment-corpus.mjs)：校验 JSON 结构、id 唯一与前缀、`defect.file` 存在、行号范围、该行是否包含 `excerpt`、三档问法完整性；`--self-test` 用 6 个负例自检校验器本身。
>
> 检查：`node scripts/experiment-corpus.mjs` → OK（4 文件 / 10 题 / 50 个用例，html=3 css=3 event=2 sql=2）；`--self-test` 6 项 PASS；`validate_contract.py` PASS（38 份文档登记、§0 基线可解析）。未做：其余 30 题未编写；E1 运行器尚未接入语料；未执行任何真实模型调用。

> **2026-11-09 课程资料检索（L1）与出处，契约 1.4.0（分支 `feature/rag-citations`）**：辅导生成前按作业知识点与所属章节召回 `resources`（最多 20 条候选），用「问题＋尝试描述」做确定性打分（英文按词、中文按二元组）取前 2 条，每条截 900 字进上下文；交付时把 `citations[{resourceId,title}]` 写入结果，`listTutoringMessages` 与 `getTutoringRequest` 一并返回；固定模板回退、历史过期、学生消息均为空数组。`AI_ABLATION_DISABLE=rag` 可关闭该层。契约由 1.3.0 升到 **1.4.0**（`TutoringResult` 与 `TutoringMessageDTO` 新增必填 `citations`，新增 `CitationDTO`）。
>
> 检查：后端 `mvnw --batch-mode test` 491 用例 0 失败（新增 5 例 `TutoringRetrievalTest`：排序取前二、无命中回落、空输入、片段截断、中英分词）；前端 `vue-tsc` 通过、`vitest` 48 文件 / 426 用例通过，`tutoring.test.ts` 新增回退空引用与种子消息出处断言；`validate_contract.py` PASS（1.4.0 示例按新必填字段校验通过）。未做：未用真实供应商验证引用命中率；前端只渲染资料标题，未跳转资料页；`BACKEND.md`/`DEVELOPMENT.md` 的上下文口径尚未同步（需授权）；RAG 召回未做向量化，仅为确定性关键词匹配。

> **2026-11-09 辅导接入自动检查（L3）与消融开关（分支 `feature/static-analysis`）**：`TutoringWorker` 在生成提示前读取该生该作业最近一条已完成的 `assignment_checks` 快照，把未通过规则压缩为最多 6 条、1200 字以内的发现项（规则 id、选择器、期望值；检查版本早于请求版本时标注），作为 `checkFindings` 进入供应商上下文；缺数据或解析失败时静默返回空，不影响主流程。新增 `TutoringFindings` 与 `STATIC_CHECK_SNAPSHOT` 查询，`ConfiguredTutoringProvider` 系统提示追加「checkFindings 非空时以其为依据」。新增实验开关 `AI_ABLATION_DISABLE`（`static`、`intercept_input`、`intercept_output`、`graded_hints`，`rag` 占位），默认空＝全部生效，`Start-Local.ps1` 白名单已同步，`.env.example` 有注释。
>
> 检查：`mvnw --batch-mode test` 486 用例 0 失败（原 481 + 新增 5 例 `TutoringFindingsTest`：只列失败项、过期标注、长值截断、空数据、消融层解析）；`validate_contract.py` PASS；`Start-Local.ps1` 的 UTF-8 BOM 复核存在。契约未变——`checkFindings` 只进内部上下文，不出现在响应体。未做：RAG（L1）未实现；`BACKEND.md` 尚未同步（需授权）；未用真实供应商验证行为（key 待提供）。

> **2026-11-09 实验装置与 AI 供应商自检（分支 `experiment/eval-harness`）**：依据 19 页 PPT 第 1/14/15/17/18 页建立 [课程实验方案](features/experiment-protocol.md)：E1 对照（通用直答 vs 受限辅导，40 题 × 3 问法 × 2 组 ＝ 240 次）、E2 消融（六组，约定 `AI_ABLATION_DISABLE`，开关尚未实现）、E3 小样本用户测试（n=6–10、10 题问卷）；定义 M1–M11 指标、负权重 rubric（泄题/给出可提交代码各 −5）与统计口径（Fisher、Mann-Whitney、McNemar）。新增只读导出 [experiment-export.mjs](../scripts/experiment-export.mjs)：经 `docker exec` 只读 SELECT，输出 `student-assignment.csv`／`tutoring-requests.csv`／`export.json` 到 Git 忽略的 `.cache/experiments/`，不读 `backend/.env`、不接受任意 SQL。新增 [ai-provider-smoke.mjs](../scripts/ai-provider-smoke.mjs)：与 `ConfiguredTutoringProvider` 同构的请求体、4 字段与层级校验，并镜像 `TutoringSafety` 的可交付判定。
>
> 检查：两脚本 `node --check` 通过、`--self-test` 各 7 项通过；真实库导出验收班 `34db5610-51c1-4e8d-b5cc-e01eacc36914` 得到 5 行学生×作业、0 行辅导请求、2 次已完成检查；smoke 以本地 mock 供应商端到端 PASS（HTTP 200、4 字段、判定接受）。未做：未调用真实供应商（key 待提供）、未实现消融开关、未编写 40 题语料、未合并 master。另确认 PPT 第 15 页页脚承诺的「下一页：为什么不用微调 + 消融实验」在发布版中已被删除（19 页、页脚到 22、`rId12` 缺失），故消融口径由本项目自定义。

> **2026-11-08 合并浏览器验收隔离配置**：把远端分支 `frontend/browser-acceptance-isolation`（`a067bcf`）的隔离思路合入 master，但按当前脚本内容重写，未整体采用分支文件（分支的三类题脚本与按钮标签已过期）。新增 `frontend/scripts/browser-acceptance-config.mjs`：显式 HTTP(S) origin、`BROWSER_ACCEPTANCE_ALLOW_WRITES=isolated-fixtures` 持久写入确认、按角色取凭据（进程环境或显式凭据文件，不做 shell 展开）、超时、channel/可执行路径互斥、输出根目录、夹具路径；同目录测试 13 例。`verify-zhixue.mjs` 改为按 runId 建目录并逐步写 `RUNNING`/`PASS`/`FAIL`，记录 offering/chapter/assignments/calendarDate；`verify-zhixue-boundaries.mjs` 先用 `validateFixture` 与 `validateFixtureRecords` 确认主流程夹具与本环境真实记录一致，不一致即拒绝任何写入，证据写 `boundaries-<uuid>`。两项脚本不再读取 `backend/.env`、不再固定 Edge，缺配置时在启动浏览器前退出。`package.json` 增加 `test:browser:config` 并置于 verify 首位；README 补环境变量表与运行隔离说明。
>
> 检查：固定 Node 24.21.0 / npm 11.19.0 执行 `npm run verify` 全通过——`test:browser:config` 13/13、typecheck、build、`check:no-mock`、vitest 48 文件 / 426 用例；三个脚本 `node --check` 通过。无配置直接运行两项脚本会在导入 Playwright 前退出、不创建输出目录（由 `test:browser:config` 的第 13 例断言）。未做：未在本机实跑真实浏览器流程（本机 3307 是日常库，脚本会写持久数据，需另备隔离环境）；因此本次没有新增跨端验收证据，2026-11-07 的浏览器证据仍由改造前脚本产生。合并后该远端分支不再包含独有内容，随本次删除。

> **2026-11-08 推送与分支清理**：`master` 的 11 个提交（`2b50166`…`139d36a`）已推送，`origin/master` 由 `5462351` 前移至 `139d36a`。删除完全合并的本地分支 `stage2/analytics`（`d4900c9`，0 个独有提交）与远端分支 `docs/update-2026-10-27`（0 个独有提交）。保留 `origin/frontend/browser-acceptance-isolation`：含 1 个未合并提交 `a067bcf`（新增 `frontend/scripts/browser-acceptance-config.mjs`、其测试与 `test:browser:config` 脚本），master 无对应文件，待决定合并或删除。推送前检查：`git diff --check` 通过；`scripts/validate_contract.py` PASS（89 业务 + 2 健康检查、354 schema、18 verified / 71 implemented / 2 planned）。本轮未改业务代码。
> **2026-11-08 自动判题交付与最终验收**：依据用户确认，同时实现 Web 与 SQL（SELECT、INSERT、UPDATE、DELETE），文本作业继续人工评价。OpenAPI 升级 1.3.0，新增教师配置读写与本人版本状态查询、实现原 createCheck/getCheck；教师草稿配置、发布冻结、类型切换清除、版本冲突；学生保存版本快照、幂等、额度、租约过期及错误重试。V17 建立规则、任务和队列互斥行；沿用教学班→作业→工作区→队列锁顺序，独立执行不持业务事务。Web 使用声明式 HTML/CSS 检查并禁用学生脚本；SQL 使用独立 MySQL 8.4.11 容器与角色分权，可信驱动无损 JSON、单查询 UTF-8 会话、结果行列/字符/字节限额，修改题用教师查询检查最终状态。人工成绩和知识评价规则未变，真实 AI 供应商未开启。
>
> 实际问题与修复：独立 Sol 审查发现版本冲突 details 缺失、服务失败误作答错、JSON 输入上限、XML 的 NUL/CR 有损、会话字符集误判、结果对象规模和关停后队列过期等问题，逐项修复。首轮全量为481单元/HTTP通过，280 IT中2个迁移旧断言失败、10个SQL就绪探测报错；专项修复后又复现把临时初始化 mysqld 当正式进程的竞态。最终探针消除 Windows ProcessBuilder 引号问题，并排除 --daemonize/已退出进程。
>
> 最终 JDK21 命令 `mvnw --batch-mode -Dchecks.it.runners=true verify`：481单元/HTTP + 285 IT，失败/错误/跳过均0，BUILD SUCCESS，10:31。17条真实runner测试覆盖Web正反/视口/大转义输入、SQL四类操作、NUL/CR/LF/NULL/重复行、字符集绕过、超256KiB合法结果、DDL及客户端命令拒绝、缺镜像、超时、行列字符超限与容器清理。数据库测试验证配置保存/发布两种交错顺序及同revision只入队一次；HTTP测试中Service使用mock，不以其替代事务证据。
>
> 前端固定工具链 verify 48文件426用例通过，生成类型后typecheck再通过。`node frontend/scripts/verify-checks.mjs` 真实Edge全量PASS，Web/SELECT/INSERT/UPDATE/DELETE各一组错误0/1与正确1/1，共10次；教师配置后发布只读、学生先保存后检查、规则私密性、390px师生布局通过，0页面错误。证据在忽略的 `frontend/.cache/checks/result.json` 与截图，验收班级 `34db5610-51c1-4e8d-b5cc-e01eacc36914`，保留供复核。新增5个接口按此标记verified。未执行Docker守护进程中途关闭试验或多实例压力测试；不影响现有服务做故障注入。前端本地提交beea84b/eb6815c，后端45e4377，未推送、合并远程或部署。


> **本节是日志，不是现状。** 带日期条目只代表当时的事实与结论；判断现状只看 §0。§3 是验证记录（含带日期的历史结论，引用时注意日期），不是日志；§4 已知限制是被 §0 引用的现行清单，同样不属日志；判断某条缺陷是否已修，先看 §0、§3 与 §4，再对照本节是否有更晚的条目。历史条目中的旧文件路径按 2026-10-24 归档迁移对照：`frontend/DESIGN.md` → `docs/archive/frontend-DESIGN.md`、`frontend/V3*-DELIVERY.md` 等报告 → `docs/archive/`、`frontend/scripts` 一次性验收脚本 → `frontend/scripts/archive/`。

契约基线 1.1.0（2026-10-13 按课程演示规模简化，见 [DEVELOPMENT 第 14 节](DEVELOPMENT.md#14-决策与变更记录)）。

> **2026-11-07 课设要求对照**：读取仓库外“组会汇报/选题二要求.md”，确认阶段一含自动判题和基础 AI 问答；与现有自动检查 P3/draft、真实供应商保持关闭存在交付范围差距。代码核对：TutoringWorker 的材料仅为作业描述和要求，未见课程讲义检索/引用出处链；已有提示层级、尝试说明、过程记录与输出拦截，不能等同于完整五层机制。阶段二已有实现，基础规则推荐已有 nextRecommendation，修正 §0“建议全部未实现”的误述。本轮只修正进度口径，未变更业务规则、接口或开通外部 AI；已请求确认 Web 自动判题优先范围及契约同步。

> **2026-11-07 最终版本全量验证收尾**：在业务代码 3f49eac、验收脚本 014d097 上，JDK 21.0.11 执行 backend/mvnw.cmd --batch-mode verify，实际汇总 472 单元/HTTP + 263 MySQL 8.4.11 IT，失败/错误/跳过均为 0，BUILD SUCCESS，耗时 11:10。包含完整 16 个集成测试类与四组归档/提交并发，不再只依赖相关 51 项复验。前端已按固定 Node 24.21.0 / npm 11.19.0 通过 415 用例及全部门禁；真实浏览器教学闭环、归档拦截/放行/只读见前条日志；契约检查与 git diff --check 通过。本轮未新增业务功能或修改产品逻辑，交付为可重复验收脚本和证据收尾，未推送、合并远程或部署。便携 Node 位于 %TEMP%/lms-toolchain-24.21.0/node-v24.21.0-win-x64，系统默认 Node 未替换。

> **2026-11-07 固定工具链与教学闭环验收**：从 Node 官方下载便携 24.21.0 并核对 SHASUMS256，内置 npm 11.19.0，仅设置本轮进程 PATH，不替换系统 Node；前端 verify 47 文件 / 415 用例、类型、构建和生产 mock 隔离全部通过。扩展 frontend/scripts/verify-zhixue.mjs：到期日按运行时间动态生成；三类作业提交后各验证教学班归档返回 409 ARCHIVE_PENDING_REVIEWS；评价发布后验证学习记录、归档 200、学生历史反馈可读、canSubmit=false/OFFERING_ARCHIVED、工作区编辑器及提交按钮禁用。脚本写入 RUNNING/PASS/FAIL 防止旧成功记录被误读，失败记录保留夹具 ID。
>
> 首轮脚本新增断言误用了 /teacher/offerings/{id} 详情路径，归档已成功但后续断言 404；按契约改为直接校验归档响应后重跑通过，无对应产品缺陷。最终真实 Edge 验收 PASS，网页/SQL/文本三类保存提交和反馈隔离、1440/1024/390px 布局均通过。证据在 frontend/.cache/zhixue/result.json 和截图（Git 忽略）。本轮只创建独立验收班级，不清理已有用户数据；最终班级 44c35fcd-c6b3-434c-be17-bdab6ad9e76f 已归档，三份作业均已发布评价。契约检查通过；后端全量结果随后追加。

> **2026-11-07 后端审查修复与复验**：采用补丁中注册 IP 限流及教学班 → 作业 → 工作区 → 提交锁序；READ_COMMITTED 短事务、MyBatis 缓存清除、等待后状态与截止时间重读，原 revision 幂等保留。首轮真实 MySQL 测试揭露 OfferingArchiveGuard 是空实现，补上 countOfferingPendingReviews 查询及 ARCHIVE_PENDING_REVIEWS；补丁本身不足以修复该场景。Start-Local.ps1 修正缺失/空白可选配置被传为空环境值导致布尔绑定失败的问题，保留 UTF-8 BOM。文件包括 AuthController、RegistrationRateLimiter、CourseAccess、AssignmentService、CourseService、OfferingArchiveGuard、两个 Mapper 及 XML、相关 HTTP/限流/并发测试；BACKEND/DEVELOPMENT 同步锁规则，无 schema/路由/接口状态变更。
>
> 验证：JDK 21.0.11、Docker、MySQL 8.4.11；首轮 mvnw --batch-mode verify 为 472 单元/HTTP 通过、263 IT 中 1 失败，其余 262 通过。修复后 mvnw --batch-mode -Dit.test=AssignmentIntegrationIT,OfferingIntegrationIT verify：472 单元/HTTP + 51 IT 全通过，0 跳过，BUILD SUCCESS（其中四组生命周期并发通过）；其余 212 IT 未在最终修复后重跑。真实注册限流重复已有用户名返回 429 RATE_LIMITED 和 Retry-After，没有新增账号。契约检查通过；前端最终 415 用例通过，工具链低于固定版本。生产供应商、部署和远端推送均未执行。限流仍为单节点内存额度，代理后的地址解析和多实例共享额度不在本轮范围。

> **2026-11-07 前端补充验证**：新增请求跨截止时间补刷回归，全量 verify 47 文件 / 415 用例通过。真实 Edge + Vite + 本地 API/MySQL：输入框 Enter 不提前发送注册、真实用户名冲突保留输入并聚焦、390px 无横向溢出、个人注册 201 → /me 200 → 课程关联、教师页面注册建班 → API 生成邀请码 → 学生页面注册入同班均通过。脚本及截图在系统临时目录 lms-browser-review.mjs、lms-school-review.mjs、lms-register-review.png。保留测试账号 review.1793982419882、review.1793982543018.teacher、review.1793982543018.student 与新建班级供复核，不含外部 AI 调用。

> **2026-11-07 补丁审查与前端修复**：补丁包已解压到项目外临时目录并阅读 diff；未执行 git am。注册校验/错误回跳、服务器展示时钟、进度单位与证据不足说明适合当前代码；另补输入框真实 Enter 事件与请求期间跨截止后的补刷。现有视觉设计与上一轮统计提示保留。包内云端状态日志未导入；注册限流与生命周期锁另行验证。前端 verify 47 文件 / 414 用例通过，工具链差异见 §0。


> **2026-11-01 演示数据与学校模式注册修复：** ① 新增 [scripts/demo-seed.mjs](../scripts/demo-seed.mjs)，用产品 HTTP 接口备好演示数据（教学班、3 章、4 知识点、1 份已发布作业、邀请码、`demo.s1`/`demo.s2` 两名学校模式学生、一次已批阅提交、一次待批阅提交、3 条学习事件），可重复执行；② 修复学校模式注册两个真实缺陷：邀请码摘要用了自造 FNV-1a，与教师端 `InviteCodeCodec` 的 HMAC-SHA256 不一致，任何真实邀请码都被判无效；成员行写入发生在用户行之前，触发外键失败 500，现改为先建用户再入班并与注册同事务回滚；③ `RegisterServiceTest` 增加「摘要必须走 InviteCodeCodec」断言。检查：专项测试 20 项通过，全量 469 单元/HTTP + 259 IT 通过；脚本连续两次执行幂等，自检 学生 2 / 待批阅 1 / 活跃学生 2 / 掌握分布含 8 次评价。

> **2026-10-31 收口与合并（`cc6e087` + `88dcdd5` + 本提交）：** ① 合并 `origin/master` 的 6 个文档提交（PR #14 等），唯一冲突是 §0 基线一行，保留本地 2026-10-31 基线并说明已合入远端；② README、DEVELOPMENT、BACKEND、FRONTEND 的契约版本与 Flyway 口径同步到 1.2.0 与 V1–V16，修正远端遗留的「本地库 V13、V14 只在隔离库验证」；③ `POST /api/v1/auth/register` 按使用者浏览器验收（个人模式）标记 verified，业务操作计数变为 13 verified / 69 implemented / 4 planned；学校模式分支仍只有自动化证据；④ master 快进到收口提交并推送，删除已合并的 `frontend/student-v4-sync`、`frontend/ui-kit`；⑤ 新增 [演示路线](features/demo-route.md)（12 分钟答辩脚本、一次性数据准备、故障兜底），登记进 docs 索引。

> **2026-10-31 本地环境收口（`b6e545b`、`dd9c887`、`beccd3f`）：** ① 重建本地 3307（drop/create `learning_platform`，用 `Start-Local.ps1 -InitializeAccounts` 重放 V1–V16 并重建 3 个演示账号）；② V16 增补「空库没有当前学期时补个人学习学期」的条件插入，个人 offering 不再依赖外部先建学期，迁移后自带 5 章 / 10 资源 / 12 知识点；③ `DatabaseIntegrationIT` 的 @BeforeEach 改为按外键顺序清理种子数据，修掉由此暴露的 7 个 IT 报错；④ 真实 MySQL 端到端实测 `POST /api/v1/auth/register` → 201、`GET /api/v1/me` → 200、`GET /api/v1/me/courses` 返回个人课程 1 条，验证用 `e2e.reg.*` 账号已清理；⑤ 删除工作区评分标准下硬编码的「测试示例」块与样式；⑥ 修 `Start-Local.ps1`：子命令 stdout 与 `$LASTEXITCODE` 一起被赋给退出码变量导致「后端启动失败」误报，两处调用补 `| Out-Host`（文件保持 UTF-8 BOM）。门禁：后端 469 单元/HTTP + 259 IT、前端 47 文件/408 用例、`validate_contract.py` PASS。未做：注册页仍无浏览器操作证据。

> **2026-10-31 注册联调收口（`31764ee`、`596a309`、`30b46f0`、`39c3ab9`）：** 交接文档记录的「后端注册成功、前端随后 401」已定位并修复：`RegisterService` 建立会话时只把密码哈希摘要进 `credential_hash`，而 `DatabaseSessionService.resolve` 用「密码哈希 + 排序角色」计算指纹，两者不一致，会话第一次访问即被判失效并撤销。抽出 `SessionFingerprint` 供登录、注册与续期共用；`AuthController.register` 改为返回契约要求的 201，并移除临时调试日志与前端 `console.error`。`AuthHttpContractTest` 新增「注册 → /me」回归，反向验证（把指纹改回 `digest(passwordHash)`）得到 `Status expected:<200> but was:<401>`。V16 迁移改写：删除原插入的 `system` 账号（它同时占用了演示学生固定 ID `…0001`），`course_offerings.created_by` 改为可空、个人学习 offering 创建者为 NULL，恢复「迁移不创建账号」不变量；迁移计数断言随之更新 15→16、2→3。前端侧修掉 9 处 typecheck 报错（mock 注册处理器 unknown 收窄、邀请码取值类型、`failEnvelope` 参数顺序）。检查：后端 469 单元/HTTP + 259 IT、前端 47 文件/408 用例、`validate_contract.py` PASS。未做：真实浏览器注册联调、本地 3307 重建、V16 对当前学期的依赖、工作区硬编码测试示例（见 §0 未决事项）。

> **2026-10-17 最新结论：P1 闭环实测通过。** 本轮以 `84a6fa6` 为基线，用浏览器直接操作真实前后端，补齐此前“接受证据缺口”的主要场景，并修复公告消息入口与两端作业列表截断。完整矩阵、范围和证据见 §3.8。下列较早日期的未修复/未验收描述保留为历史，当前判断以 §3.8 和 OpenAPI 状态为准；没有把静态检查代替页面验收。


> **2026-10-16 P1 浏览器续验结论：未通过，不能整体标为 `verified`。** 正式页面已验证登录、开班/发章/入班、三类文件保存与提交、评价草稿隔离和发布、消息手动已读、首页/学习记录/公告、归档只读与跨班拒绝；但复现了立即提交丢失最新编辑、切页无提醒丢失未保存文字、教师创建/编辑作业失败，以及教师缺提交选择入口、Web 预览未实现等阻塞。详情、资源 ID 和证据位置见 [3.4 浏览器联调](#p1-browser-integration)。本轮仅测试与定位，未修生产代码、未改接口契约或实现状态；常规检查仍为前端 170、后端 379 + 202 项全部通过，HTTP 负例 30/30 通过。

> **2026-10-16 全量核对与后端对齐（以 openapi.yaml 1.1.0 为准）**：核对发现下列"已完成"自述不实，P1-B 核对的 10 个操作中 9 个与契约不符，P1-C 的 9 个、P1-D 的 9 个全部不符。同日已按契约逐项修复后端并分批提交：`3008f19`、`5f5fa22`（P1-B）、`e716dde`、`443a5f9`（P1-C）、`2dac32e`、`b4fcf42`（P1-D）；契约占位响应修复见 `82977c9`。最近一次 `./mvnw.cmd --batch-mode verify`（`b4fcf42` 工作区）结果：379 个单测/契约测试、198 个 IT（Testcontainers + MySQL）全部通过，BUILD SUCCESS。
>
> 可信度：P0-A 高（有真实联调）；P1-A 基本符合（抽样 18 个操作中 11 个一致，其余为 `assignmentCount` 恒为 0、空 `summary`/`content` 被 422 拒绝、`createOffering` 学期不存在返回 404 等小差异，未修）；P1-B/C/D 后端已对齐并有逐字段断言与真实数据库用例，但 `x-implementation-status` 仍为 `implemented`，不得标为 `verified`（原因见下方 2026-10-16 联调记录）。
>
> 已修复的运行时错误：`publishFeedback` 通知类型违反 `ck_notifications_type`（现为 `feedback_published`，并有真实库用例）；`listMyAssignments` 的 `#{now}` 缺参；`createNotice` 的 12 参 `insertNotification` 死重载；看板 SQL 引用不存在的 `base_courses`、`cp.student_id`、`a.type='lab'`；`findCurrentLearningChapter` JOIN 位置；`listTeacherAssignments` 默认 `all` 被当作 `status='all'`。
>
> 其他已修复：错误码改为契约登记值；`DashboardDTO`、`LearningRecordsDTO`、`AssignmentStatsDTO`、`NoticeDTO` 等按契约重写；`getAssignment`、`getSubmission` 增加教师视图；`publishedFeedbackId`、`feedbackStatus`、`pendingReviewCount` 改为真实值；评价保存/发布、提交增加行锁与幂等；个人公告不再对全班可见；`getMyLearningRecords`/`markMessagesAsRead` 的 200 响应占位已替换。
>
> **迁移遗留处置（2026-10-16 已决定，V9 已实施并通过 `./mvnw.cmd --batch-mode verify`：379 个单测、202 个 IT 全部通过，BUILD SUCCESS；公告 target 与量规评语 8000 已落地，其余两项按下列决定推迟）**：
> - 公告 `target`：原描述有误。契约 `NoticeDTO.target` 是关联内容（`TargetDTO`：type/id/offeringId），不是定向学生，不能复用 `target_student_id`。V9 给 `notices` 加可空的 `target_type`、`target_id`，CHECK 两列同为空或同非空，type 取值与 `TargetDTO.type` 一致；后端取消"非 null 返回 422"，写入时校验目标属于本班。实现前先用 `contract_slice.py createNotice` 核对请求体。
> - 量规评语长度：V9 把 `feedback_rubric_scores.comment` 改为 `VARCHAR(8000)`，后端校验同步改为 8000。
> - `knowledgeEvaluations` / `issueTags`：推迟到 P2-B，与知识证据、规则版本一起设计存储；P1 继续只接受空数组，P1 验收不依赖它们。
> - 实施方式：派一个 Sonnet 子代理写 V9、后端校验与真实库 IT；主会话在 backend/ 下跑 `./mvnw.cmd --batch-mode verify` 通过后，以 `backend:` 前缀提交，并更新下方遗留清单。
>
> **P1-B/C 主链路 HTTP 联调（2026-10-16，V9 之后）**：环境为本地 MySQL 3307（Flyway 到 V9，已执行 `-InitializeAccounts` 与 `local-demo-data`）、后端 8080、Vite dev 4173，所有请求经 4173 代理。脚本在本机 `D:/tmp/lp/`（未入库）。走通：开班→章节→邀请码→学生加入→三类作业发布→工作区保存（旧 revision 409）→提交幂等→教师评价草稿（8000 字评语通过、8001 字 422）→草稿对学生不可见→发布→学生消息未读→已读→看板与学习记录反映；带 `target` 的公告（`assignment` 目标 201，offeringId 不符、他班 id、`help_request` 均 422）；归档后保存被拒、历史可读；未登录/越权/缺 CSRF/缺 Origin/外域 Origin 的负例 30 项（重跑 30/30）。未发现后端硬性偏离契约，代理、Cookie、CSRF 链路无问题。
> - **仍不能标 `verified`**：以上是 HTTP 级联调，没有在浏览器里用正式前端页面走一遍，FRONTEND.md §8 矩阵中的并发编辑、双标签页、慢网络、XSS/预览沙箱等场景未验证；P1-D 页面已实现（`f4a1e1a`）但同样未经浏览器走查。
> - **联调中的观察（均未改，待决定）**：① 已归档作业上用已提交过的 revision 重发 `submitAssignment` 返回 200 原提交而非 409，契约未规定优先级；② 公告生成的 `course_notice` 消息 `target` 为 null，若前端要从消息跳到作业需决定是否继承公告 target；③ 已发布后用陈旧 `baseVersion` 重发 `publishFeedback` 返回 200（幂等）而非 409，契约未说明；④ 全班公告可指向某学生的 `feedback` id，其他学生打开会 404，风险低。
> - 第二个班里没有提交，未用他班 `submissionId` 做跨班读取，该项只依赖较早的 `s7` 越权结果。
>
> **后端遗留（未改）**：
> - `createNotice`：V9 起支持 `target`（`notices.target_type/target_id`，Service 校验类型、`offeringId` 与归属，失败 422；`help_request` 因 P1 无对应表恒 422）；`recipientCount` 靠通知记录推算；通知内容截断到 2000 字（`notifications.content` 为 VARCHAR(2000)）。
> - `saveFeedback`：`knowledgeEvaluations`、`issueTags` 无存储列，只接受空数组（推迟到 P2-B）；量规项 comment 已按 8000 校验（V9）；`issueTagVersion` 恒为 null。
> - 恒为空或 null：`needsPracticeCount`、`aiPolicyVersion`、`commonIssues`、`pendingHelpCount`；`course_notice`、`help_reply` 类消息 P1 无数据来源。
> - 快照里的 `knowledgePoints` 读的是作业当前关联，未真正冻结。
> - 行锁只按设计加上，没有并发压测用例。
> - P1-A 的上述小差异与章节序号并发重复会变成 500 的隐患未处理。
>
> **前端（`9578059`、`51b000f`）**：已按契约 1.1.0 重新生成 `schema.d.ts`；`dashboard.ts`/`notices.ts`/`stats.ts` 改用生成类型，方法名、路径和分页字段与契约一致，删除了契约中为 planned 的 `listTeacherNotices`；`main.ts` 注册了 Auth、Courses、Assignments、Dashboard、Notices、Stats 六个客户端；mock 补全了 P1-C 缺失操作和 P1-D 全部 9 个操作；`NotificationCenter` 接入 `/student/messages`，`TeacherFeedbackEditor` 接入 `/teacher/submissions/:submissionId/feedback`，`getFeedback` 接入 `AssignmentDetail`；新增 `p1d-api`、`p1d-mocks`、`p1d-pages` 三个测试文件。`npm --prefix frontend run verify`：16 个测试文件、152 个用例通过，`check:no-mock` PASS。
>
> **P1-D 前端 UI（`f4a1e1a`，2026-10-16）**：已实现学生首页 `/student/home`、学习记录 `/student/progress[/:offeringId]`、课程公告列表与详情、教师工作台四张统计卡片、`targetRoute` 消息目标跳转，作业列表与详情补"已归档/已逾期"标签与 `submissionBlockedReason` 文案；学生默认入口改为 `/student/home`。`npm --prefix frontend run verify`：17 个测试文件、170 个用例通过，`check:no-mock` PASS。实现中确认两处设计稿与契约不符并已更正：`getMyLearningRecords` 无分页参数（前端对 `feedbackPage.items` 本地切片，每页 10 条）；`dueAt` 为必填（"无截止时间"仅为防御显示）。教师作业统计页、教师查看学生学习记录页按设计不做。`src/mocks/dashboard.ts` 未补场景数据。

**前端仍缺**：浏览器级续验已开展，P1-D 页面已在真实后端上打开验证，但 P1 闭环被本次发现的问题阻断，详见 3.4；慢网络、保存超时恢复与预览隔离等尚未完成验收。`p1b` 测试夹具仍用小写 `not_started`/`pending`，契约是大写；路由约定已定（2026-10-16）：沿用 `/student/...`、`/teacher/...`，FRONTEND.md §4 已同步；`getSubmission` 的 oneOf 没有 discriminator，前端靠 `'student' in data` 判断教师视图。不能整体标 `verified`。`ImplementationStatusContractTest` 只校验路由存在，不校验响应字段。
>
> 处置原则：以契约为准；`docs/features/p1d-aggregation.md` 已标注作废。执行顺序已改为先完成 P1 闭环再做 P2-A（DEVELOPMENT 第 11、14 节）：① P1-B/C 主链路跨端联调（HTTP 级已完成，浏览器级待做）；② 按 [p1d-frontend-ui.md](features/p1d-frontend-ui.md) 实现 P1-D 最小 UI（已完成，`f4a1e1a`）；③ 浏览器级走查，按验收场景走通后标 `verified`；④ 进入 P2-A。

截至 2026-10-15 的提交自述如下（仅作历史记录）：

- **P0-A**（master `b3c4f0e`）：5 个认证操作为 verified，2 个健康检查为 implemented。已有账户初始化、数据库会话、认证 HTTP 链、原子登录限流、审计和 Flyway V1～V4；前端包含登录、会话联调页、身份恢复、退出、同源代理与 mock。
- **P1-A**（master `4d62379`）：27 个课程操作为 implemented（11 个教学班 + 16 个内容），Flyway V5 建表。教师开班→发布章节→邀请码→学生加入→阅读完成→跨班被拒的验收链路已实现；前端包含教师工作台与学生课程页，mock 与测试覆盖写路径。
- **P1-B**（master `8c4cb52`）：12 个作业与工作区操作为 implemented，Flyway V6 建表。包含作业列表、工作区读写、提交管理；前端包含作业列表、工作区编辑器与提交界面。
- **P1-C**（master `68eb7d3`）：7 个提交评价与通知操作为 implemented，Flyway V7 建表。包含教师评价草稿-发布流程、学生查看评价、通知中心；前端包含教师评价编辑器与学生通知中心。
- **P1-D**（master `9e594a6`）：9 个多班聚合操作为 implemented，Flyway V8 建表。包含学生仪表盘、学习记录、批量标记消息已读、公告系统（教师创建与学生查看）、教师统计（班级概览、作业统计、学生学习记录）；前端包含 API 客户端层（dashboard.ts、notices.ts、stats.ts），UI 组件待补充。

契约 83 个业务操作与 2 个健康检查：截至 2026-10-18，53 个为 implemented、10 个为 verified、22 个为 planned。本行只是时间点快照，权威状态以 OpenAPI `x-implementation-status` 为准。P1 阶段后端全部完成，前端 P1-D 最小 UI 已实现（`f4a1e1a`），P1 闭环验收见 §3.8。P2/P3 功能尚未实现。



### 2026-10-26 学生端视觉收口提交与仓库整理

- **前端提交 `95095f2`**（分支 `review/comprehensive-audit`，基于 `cd62169`）：把此前未提交的学生端视觉收口一次性收口为单一工作包。改动：新增 `frontend/src/stores/notifications.ts`（外壳只读未读数，不单独请求接口）；`App.vue` 抽出 `studentShell`/`termLabel`，学生端顶栏改为「学期 / 消息 / 头像」并渲染未读徽标，匿名态重置；`use-student-home` 用 `getDashboard` 的 `unreadMessageCount`、`NotificationCenter` 用 `listMessages` 的 `summary.unreadCount` 写入徽标；`release.css` 补外壳段（232px 导航轨、56px 顶栏、1240px 内容列、页头模式）；`StudentHome.vue` 首页 CSS-only 重构；`LoginPage.vue` 改两栏并让凭据错误回焦用户名；`tokens.css` 调整表面/文字/品牌色与字号栅格，新增掌握度四档与 `--content-max`/`--aside`/`--gutter`。检查：`npm --prefix frontend run verify` —— typecheck、build、`check:no-mock` 均 PASS，38 测试文件 / 334 用例通过（沙箱内 build 触发 vite 的 `spawn EPERM`，放开沙箱后运行，非代码问题）。未做：未在真实后端上做浏览器走查；教师端外壳与 ≤767px 断点仅静态核对；无接口变更，未改 `openapi.yaml` 与生成类型。
- **仓库整理**（同日）：删除 `temp/` 下 9 组 V3.x 历史截图共 14.0 MB（2026-10-19～20，属过程产物；`docs/archive/` 中的 V3.x 交付报告与截图检查记录仍在）；根目录汇报材料移入 `temp/汇报材料/`；根目录《文档审计-第4轮-2026-10-24.md》归档为 `docs/archive/DOC_AUDIT_R4_2026-10-24.md` 并在 [docs/README 归档清单](README.md) 登记（第 1～4 轮）。`temp/learning-platform-backup-2026-10-25.sql` 位置不变，§0 与下文对它的引用无需调整。整理后 `git status` 只剩被进程占用的 `学习平台组会汇报.pptx` 一份未入库文件。

### 2026-10-25 P2 后端远端全量验证与 PR

- [PR #11](https://github.com/zz26max/constrained-ai-learning-platform/pull/11)：codex/p2-backend → master，后端实现提交 `bd3cf67`，未合并。该分支相对 master 无前端差异。
- [CI run 40149776199](https://github.com/zz26max/constrained-ai-learning-platform/actions/runs/40149776199) 对 `bd3cf67e7474bcfabdc0dc010bd7b63e8f99c277` 的 Backend tests 原始汇总：Tests run: 452, Failures: 0, Errors: 0, Skipped: 0；Tests run: 245, Failures: 0, Errors: 0, Skipped: 0；BUILD SUCCESS，Total time: 04:01 min。未加本地 socketTimeout=30000 参数。
- 同 run 的 Contract and documents 与 Frontend typecheck, build and tests 也为 success。前端由既有 CI 自动运行，主线程未本地运行或修改前端。本条依据远端 run 的 headSha、job conclusion 和日志汇总；补充完整默认环境证据，不抹去下方本地失败/复跑记录。
- §0 据此把基线回填到已存在的后端实现提交，并将门禁现状更新为远端默认全量通过。后续仅交接文档补充，不改变已验收的后端代码。

### 2026-10-25 P2 后端交付

- **范围与任务**：P2-A 政策/辅导 8 操作、求助 7 操作；P2-B 词表/事件 2 操作，补通既有 getLearningRecords 查询入口，共 18 个 planned→implemented；P2 专属契约审定为 reviewed，结构仍为 1.1.1，未修改前端或生成类型。证据是本分支 backend/、OpenAPI 元数据及规范差异；§0 据此更新分支基线、阶段、契约计数和真实门禁结果。
- **已完成**：V11–V13；跨会话单在途与预算、政策收紧重验、工作区版本冻结、受限 provider 适配/审核/安全回退、恢复与终态防迟到；主动共享求助、回复/关闭/通知原子性；四类客户端事件去重/冲突整批回滚、后续可信事件；知识评价与标签保存、发布证据、knowledge-v2 与 freshness/解释、建议及共性问题去重。真实供应商默认关闭；自动物理清理均需显式启用。
- **规范修正**：经用户确认，沿用每收件人一条 notifications 与发布后不可变关系评价；P1 实际无 learning_events，本次补后续可信事件，不从审计日志伪造历史。新提交冻结知识定义，旧 P1 快照限制保留。政策指针和反馈核心元数据由原模块写入，通知以窄服务加入原事务；工作区与求助只使用局部短事务锁，不跨外部调用持锁。
- **最终执行证据**：`./mvnw.cmd --batch-mode verify`：452 单元/HTTP 全通过，245 IT 中 240 通过、5 错误，均因 HelpIntegrationIT 的 V6 迁移读取超时（SocketTimeoutException: Read timed out）导致上下文未启动，无业务断言失败。随后同代码执行 `./mvnw.cmd --batch-mode -Dit.test=HelpIntegrationIT -Dspring.datasource.hikari.data-source-properties.socketTimeout=30000 verify`：452 单元/HTTP + 5 IT，0 失败、0 错误、0 跳过，BUILD SUCCESS；生产 3 秒读取超时未改。这里记录分次覆盖，不宣称一次全量全绿。更早两轮的迁移数量、测试 CSRF 会话 ID 和缺必填参数 422 断言问题已修正，最终相关场景均通过。
- **其他检查**：validate_contract.py PASS（83 业务 + 2 健康，325 schemas，71 implemented / 10 verified / 4 planned，34 文档登记、267 当前链接）；PowerShell Parser 与 ContainsKey 调用参数数检查 PASS；git diff --check PASS；前端相对 master 的净差异为零。未从旧 surefire 报告累加用例数。
- **实现选择**：标准库兼容 JSON HTTP 提供商适配；无政策时返回版本 0 且禁用；新班词表为空时使用与初始化迁移一致的默认版本；共性问题仅聚合当前词表版本；物理清理显式启用。上述选择已写入联调说明，不改变契约字段或人工成绩。
- **实际 SmartFlow**：balanced；p2_scan（sf_scan）只读定位；tutoring_build、help_build（sf_build）分文件实现；p2_review（sf_review）独立审查并复核三项修复与同事务边界。辅导实现代理曾因额度中断，后续由主线程接管，最终测试以上述真实 Maven 输出为准；审查代理未运行测试。
- **未执行与边界**：未配置或调用真实外部模型；未迁移当前 3307 数据库、未清理真实数据、未部署；正式页面联调和生产迁移须另留证据。独立审查未实测物理清理与并发读取的组合行为；保留期限读取占位及隔离库显式清理已有测试。具体请求例子及前端配合事项见 [P2 后端联调说明](features/p2-backend-integration.md)。

### 会话日志（2026-10-18～10-24，自 §0 迁入，按新→旧）

- **修复 CI 报 knowledgePoints is not iterable（2026-10-25，master `3006dbd`）**：后端合并时前端检查暴露 `data.assignmentSnapshot.knowledgePoints is not iterable`（本地全套测试"通过"但错误刷屏——Vue 吞掉渲染期 TypeError，CI 判失败）。根因：批阅编辑器 hydrate 以裸 `for...of` 迭代快照数组，而 p1d-pages 与 submission-feedback-flow 两个 P1 时代测试夹具自建的 assignmentSnapshot 缺 knowledgePoints 字段。修复：hydrate 对量规与知识点数组防御性迭代（服务端快照为不可信输入）+ 两夹具补齐契约形状；全套测试输出该错误计数归零，verify 38 文件/334 用例通过。

- **P2-B 收口：批阅页知识评价与问题标签输入（2026-10-25，master `801c940`）**：P2 前端最后一块。TeacherFeedbackEditor 新增知识点评价区（提交快照知识点逐条结论/说明，可部分评价，未选条目不提交）与问题标签区（getIssueTags 班级词表多选），两者纳入 dirty 跟踪；StudentFeedbackView 新增知识点结论（标题映射快照定义 + "不直接等于成绩"边界说明）与问题标签（标题映射词表）；mock 层补 P2 校验（知识评价归属快照/去重/结果枚举、标签限词表/去重、issueTagVersion 记录词表版本）并让快照真实填充知识点定义（courses 新增 mockKnowledgeSnapshot）。检查：`npm run verify` 38 文件/334 用例（新增 4 例）。真实模式实测：未批阅提交批阅页两区块激活、带标签草稿保存（issueTagVersion 真实写入）、发布成功、学生侧标签标题展示（该作业快照无知识点，评价行真实写路径留待含知识点的作业验证）。调试注记：循环导入（feedback↔tutoring）下 handler 内经 snapshot() 取知识点在 vitest 下偶发取到空集（直接调用同函数正常，fsModuleCache 清除后依旧），已改为 handler 内直接用作业 DTO 构造（语义等价、更贴近数据源）；深层原因未追。**至此 P2 前端任务全部完成**；P3 未开始。

- **P2 真实模式浏览器联调（2026-10-25，master 合并后）**：PR #11 合并后本地执行——3307 备份（temp/learning-platform-backup-2026-10-25.sql）→ 重启后端（Flyway V11–V13 于本地库应用，flyway_schema_history 确认 success=1）→ `npm run contract:types` 重新生成（无字段结构变化）→ 4173 真实模式浏览器走查（演示口令经脚本从 backend/.env 读取，未入对话）。通过项：① 政策关闭态如实渲染（版本 0/未启用）；② 教师经策略面板以 baseVersion=0 首次保存成功（真实 202 → 版本 1 已启用徽标）；③ 学生见服务端 boundaryText 与启用态，新建会话发送索答消息，真实异步全链路（202 → 轮询 → **fallback 终态**）落盘，UI 渲染"政策回退 · 第 1 层"与服务端固定模板；④ 求助创建（真实班级词表三项、共享刚交付的 AI fallback 片段）→ 教师详情可见学生身份/标签/共享材料 → 回复后状态转已回复；⑤ 学生收到 help_reply 消息（真实标题"教师回复了你的求助"），"查看内容"受控跳转至求助详情且已读闭环；⑥ `learning_events` 表实测新增 `chapter_opened`（客户端上报器 10 秒冲刷落库）与后端可信事件 `help_request_created`。随包修正：求助共享工作区复选框在工作区版本 <1（从未保存）时禁用并注明（契约 workspaceRevision ≥1，实测版本 0 共享被服务端忽略）。检查：`npm run verify` 37 文件/330 用例通过。已知问题（当日已修，见下一条日志）：真实模式下在教师求助详情页点击"退出"，DOM 冻结在旧页面（URL 已到 /login、登录表单不渲染，硬重载恢复）。未做：教师知识评价/标签输入 UI（下一包完成）；普通 ask（外部模型关闭）的 failed/PROVIDER_UNAVAILABLE 展示对照；未标任何 verified。

- **修复登出渲染冻结（2026-10-25，master `58cc287` 后）**：真实模式联调发现的确定性 bug 根因定位——教师求助详情页的返回链接以 `params: { id: detail?.offeringId ?? '' }` 渲染；登出瞬间 `use-page-query` 对身份变化的同步 watch 将页面数据置空，RouterLink 以空串参数重新解析抛出 `Missing required param "id"`，渲染 effect 崩溃导致整树 DOM 冻结在旧页（URL 已变、无侧栏、登录表单不渲染）。修复：该链接与教师学生学习记录页的同类返回链接均改为数据就绪才渲染（`v-if="detail !== null"` / `v-if="offeringId !== null"`）；新增回归测试 `tests/teacher-help-logout.test.ts`（真实路由 + mock 数据挂载求助详情页，翻身份置空数据，断言无未捕获 rejection）。检查：`npm run verify` 38 文件/331 用例通过（一次 verify 链路高负载下 p1b 三例计时抖动失败，单独与全套复跑均全过）；真实模式浏览器复测原必现冻结页面登出，登录表单正常渲染。

- **P2-B 续：教师查看学生学习记录页 + P2-1 清理**（2026-10-24，`frontend/p2b`，`0de5a86`/`7c52ac2`）：① 新增 TeacherStudentProgressPage（/teacher/offerings/:offeringId/students/:studentId/progress）——概览三项计数、knowledge-v2 知识点掌握列表（状态/新鲜度/证据/解释）、下一步建议（targetRoute 受控跳转）、最近反馈高亮与评价历史分页（链接指向教师作业页）；入口为工作台"班级成员"页学生行的"学习记录"按钮（教师行不加），成员行网格改 4 列并适配断点。接口复用 P1 已实现操作 getStudentLearningRecords（TeacherLearningRecordsDTO），mock 处理器与 API 声明此前已存在。② 退役 verify-home-exploration/verify-home-bplus 两脚本及其 package.json/README 登记（design 参数路由 019baae 移除后其一损坏，最终审计 P2-1）。检查：`npm run verify` 通过（37 文件 330 用例）；vue-tsc 零错误；mock 4175 实测成员入口与详情页三段（概览/知识点空态/反馈空态）如实渲染。未做：知识证据非空态对照（依赖后端 P2-B 数据）；真实模式验证（该接口 P1 已实现，待确认 8080 现役后端包含后可直接真验）。

- **P2-B 开工：学习事件上报器（mock 并行开发）与后端快照存档**（2026-10-24，分支 `frontend/p2b` 自 `70af2de` 切出，提交 `5290748`；另有 `codex/p2-backend` 分支存档提交 `df27a2d`）：用户告知后端开发因额度受阻、询问前端可否继续。处置：① 工作区发现的未提交后端 P2 工作（tutoring/helprequests/analytics 三模块 + V11-V13 迁移 + 契约 17 操作状态翻转 + 文档修改，51 文件）经用户选择"先存档再切分支"后，原样提交到 `codex/p2-backend`（`df27a2d`，提交说明明确"存档不代表通过任何门禁"），该分支与 master 同基；② 前端切干净分支 `frontend/p2b` 完成事件上报包——`features/analytics/reporter.ts`（trackLearningEvent 单入口，未认证丢弃、会话内同对象去重、10 条/10 秒冲刷、≤50 批、30 秒退避重试 3 次、卸载尽力冲刷）+ `mocks/analytics.ts`（1..50 校验、四类型字段与 payload 白名单、按 eventId 幂等）+ 章节/资料/编辑器/预览四处接入（editor 的 activeFile 限契约枚举，preview viewport 当前固定 desktop）+ FRONTEND §2/§6 登记。检查：`npm run verify` 通过（37 文件 330 用例，新增 learning-events 8 例）。未做：真实后端联调；卸载冲刷可能丢失关闭前最后一批（§6 已注明已知限制）；`codex/p2-backend` 的 mvnw verify 与契约 flips 证据收口（等待后端额度恢复）。

- **P2-A 收口：教师 AI 政策配置 UI（mock 并行开发）**（2026-10-24，`frontend/p2`，`3e67bc2`，用户明确该分支只完成 UI）：mock 政策从常量重构为按作业可变 Map，新增 getTeacherAiPolicy/updateAiPolicy——baseVersion 乐观锁（409 AI_POLICY_VERSION_CONFLICT）、平台固定项（restrictCompleteSolution=true/allowCodeBlocks=false）拒改、enabled 需非空动作与模式、班内上限（dailyAssignmentLimit≤12/maxOutputTokens≤800）与平台只读项（dailyUserLimit 30/perMinuteLimit 3 回传校验），成功版本+1；sendTutoringMessage 补政策检查（未启用 409 AI_DISABLED、动作越权 422），层次上限与尝试阈值改读按作业政策，教师改动学生侧即时生效。TeacherAiPolicyPanel 内嵌已发布作业编辑页（草稿显示"发布后配置"），含 409 冲突自动重读；FRONTEND §4 教师作业行注明。检查：`npm run verify` 通过（36 文件 322 用例，新增 teacher-policy 7 例含三个师生联动用例）；mock 4175 实测保存后版本 1→2。未做：超上限前端即时禁写（依赖服务端 422 回显）；真实后端——P2-A 前端 UI 至此全部完成，剩余后端实现与联调。

- **P2-A 续：教师端求助处理（mock 并行开发）**（2026-10-24，`frontend/p2`，`33e1052`）：mock 新增教师四操作——列表（按班过滤+学生身份+status 筛选）、详情（学生身份/共享快照/AI 片段/回复）、回复（1..8000 校验、已关闭 409 HELP_REQUEST_CLOSED、转 answered、复用 feedback mock 的 addMockMessage 向学生生成 help_reply 消息且 target={type:help_request} 指向求助详情）、关闭（重复关闭按契约描述幂等返回原状态与时间）。UI：TeacherHelpPanel（教学班工作台新增"学生求助"页签，状态筛选/待处理计数/分页）、TeacherHelpRequestPage（/teacher/help-requests/:id，回复表单+两步关闭确认，已关闭只读）；FRONTEND §4 教师行更新为 mock 先行并注明列表入口。另：用户询问教师端 AI 助手形态，答复确认契约中教师侧仅有政策读/配（无教师对话入口），"教师 AI 助手"若立项需先改契约，输出侧可宽松、学生数据出系统需显式选择、成绩结论保持人工的三条边界建议已给出，未写入文档（待用户另行决策）。检查：`npm run verify` 通过（35 文件 315 用例，新增 teacher-help 7 例）；mock 4175 实测工作台页签列表与回复落盘。未做：help_reply 消息学生端浏览器截图对照（单元测试已断言消息与 target；实测发现 mock 内存态随整页 reload 重建，属 mock 生命周期预期行为，已在提交说明）；教师 AI 政策配置 UI；真实后端。

- **P2-A 续：学生端教师求助流（mock 并行开发）**（2026-10-24，`frontend/p2`，`be9519e`）：mock 新增求助存储与种子（已回复：教师回复+工作区共享快照+AI 片段；待处理各一条；被共享的种子 AI 请求补终态记录避免 SharedTutoringResult 契约自违反）；create/list/get 处理器实现契约校验——studentAttempt 必填、issueTags 限班级词表且去重、共享片段限本人本作业且已终态、摘要不含共享快照。UI 三页：发起页（`/student/assignments/:id/help`，词表多选/共享工作区版本/共享已交付 AI 片段，成功跳详情）、列表页（`/student/help-requests`，状态筛选+作业标题解析）、详情页（`/student/help-requests/:id`，快照代码/AI 片段/教师回复/过期态）；侧边栏新增"我的求助"（AppIcon 增 help 图标）；作业详情头部新增"教师求助"；targetRoute 补 `help_request`→详情（p1d-ui.test.ts 断言同步）；FRONTEND §4 两行登记并去重旧预留行。检查：`npm run verify` 通过（34 文件 308 用例，新增 help-requests 8 例）；mock 4175 实测列表筛选/已回复详情/创建提交跳转闭环。未做：教师端求助处理（回复/关闭与 help_reply 消息生成，下一包）；真实后端。

- **P2-A 开工：学生端受限 AI 辅导主链路（mock 并行开发）**（2026-10-24，分支 `frontend/p2` 自 `2c5329e` 切出，提交 `65a37d6`）：用户决定停止 UI 打磨、进入 P2，前端单端先行。范围：契约 17 个 P2 操作全部在 `src/api/tutoring.ts` 声明并注册；mock 状态机覆盖 DEVELOPMENT §7 核心约束——政策（引导模式 v1，仅已发布演示作业启用）、会话/消息/请求（发送 202 queued，轮询 queued→running→终态，跨会话共享提示层次）、索答固定 fallback 模板（不伪装模型回复、不升层）、next_hint 第 2 层起强制 studentAttempt（422）、超 maxHintLevel（409 HINT_LIMIT_REACHED）、在途重复发送（409 AI_REQUEST_IN_PROGRESS 带 pendingRequestId，客户端自动转轮询）；`use-tutoring-poll` 按 FRONTEND §6 实现 1s 起步退避至 5s、终态即停、卸载即停；TutoringPanel + 路由 `/student/assignments/:id/tutoring` + 作业详情入口；FRONTEND §4 登记路由。检查：`npm run verify` 通过（33 文件 300 用例，新增 tutoring 11 例）；mock 4175 浏览器实测发送→轮询占位→助手回复落地（ask 不升层）。未做：后端实现（操作仍 planned，mock 不证明权限/事务）；求助流与教师端 UI（下一包，词表与 API 已就绪）；预算/频率限制未进 mock；恢复轮询的挂载路径已实现但无浏览器断言。

- **前端 UI 打磨第二轮（动效白名单 M6 与全站微交互）**（2026-10-24，`master`，基于 `4a616f6`，三笔提交 `3653c04`/`555a42f`/`7c4a8e6`）：应用户"干净舒适、流畅交互动画、少文字多布局"诉求，基于 8 屏截图的视觉模型审查（登录/首页/课程/作业/消息/记录/教师工作台/班详情）定位三个系统性缺失——色彩单薄（学科色未用足）、信息靠文字硬扛、交互静态化（§9 旧条款"动效只用于颜色与边框"锁死）。① `3653c04`：tokens 新增 `--ease-out`/`--dur-fast/move/enter`、`--shadow-lift/card` 与五组 `--subject-*` 学科色令牌；新建 `styles/motion.css` 作为 M6 动效白名单唯一实现（页面进入 280ms 上浮淡入、卡片悬停 ≤2px 浮起+学科色描边、列表前 6 项 40ms 级联、按钮 :active 下沉、首页 CTA 箭头右移、未读点 2.4s 透明度呼吸——唯一循环动效），整层包在 `prefers-reduced-motion:no-preference` 内，零 JS 依赖；FRONTEND §9 增补 M6 小节并同步 M1 表与分层冻结条款。② `555a42f`：首页概览改三枚指标章（22px 数字）、焦点卡右上光晕、未读胶囊、反馈分数衬线；release.css 学科色迁移令牌；消息页类型色编码（公告蓝/作业橙/评价绿/系统灰）+ 未读三件套（3px 品牌侧线+浅蓝底+白底胶囊）+ 标读 200ms 过渡回收，选择器带 `.vc-page` 压过冻结层 content.css 同特异性规则（实测中被其 #fafbfe/2px#6a8bd0 覆盖后修正）；§9 M5 消息行同步。③ `7c4a8e6`：教师端课程代码徽章化、学期与状态同行消除断裂带、四类列表行悬停浅沉底；TeacherPagination 单页隐藏翻页（`p1a-teacher.test.ts` 改写为多页禁用边界+单页隐藏断言）；登录页品牌光晕+表单卡静置投影（M6 唯一 surface 投影例外）。检查：`npm run test` 32 文件 289 用例全过、`npm run build` 通过；mock 4175 实测——登录/教师/消息三页截图经视觉模型审读正面（无布局破损），首页/课程以计算样式证明（指标章边框 10px 圆角、光晕 radial-gradient、学科色 topline rgb(40,83,188)、卡片 transition+animation 命中、未读行 rgb(238,242,251)+3px rgb(40,83,188)、白底胶囊）。未做：教师端跨班统计带（无聚合接口且会触发 N+1，需后端支持）；消息筛选切换的跨淡入（列表重挂载已有级联，容器级过渡待 P2）；一次"无权访问"截图与会话中断为 mock 会话中间态假象，已用新鲜会话复测排除。

- **前端 UI 打磨第一轮（本地组件库复用评估与 ARIA tabs）**（2026-10-24，`master`，基于 `d120a81`）：按用户指派对本地组件库（四个 MIT React 库快照：shadcn-ui/motion-primitives/kibo-ui/magic-ui，`curated/` 为空模板）做只读评估后实施。① 移植 shadcn tabs 的 WAI-ARIA 键盘模式为零依赖纯函数 `frontend/src/components/tabs.ts`（roving tabindex、方向键/Home/End、激活即聚焦），工作区文件切换由 nav+aria-current 升级为 role=tablist/tab/tabpanel 并以 aria-labelledby 关联编辑面板，视觉零变化（teacher.css 选中态选择器同步 aria-selected）；新增 `tests/tab-keyboard.test.ts` 3 项。② Toast（sonner 模式）经逐场景核查**不引入**：公告发布走 ActionNotice 常驻、归档以页面只读态变化为反馈、批阅队列发布后界面切换即反馈且跳过/失败有 queueMessage、保存为行内 role=status——行内反馈体系完整，强行引入违背"先找真问题"原则（React 库亦无法直接复用，仅可移植模式）。③ 会话消息流（shadcn v4 message-scroller 模式）推迟至 P2 辅导界面开工时移植。④ 管理端确认无独立 UI（设计如此：无接口支持的管理功能不提供入口），本轮壳层改进对全部角色生效。检查：`npm --prefix frontend run verify` 通过（32 文件 289 用例，含 typecheck/build/no-mock）。未做：组件来源记录未沉淀到用户个人 curated/ 库（属用户库，待用户操作）；FRONTEND §9"实验室以页签切换任务、代码和预览"与当前实现（文件 tabs + 手动预览按钮）的对应关系待下次前端维护确认。

- **文档审计第 3 轮处置**（2026-10-24，`master`，基于 `8b47536`）：依据第 3 轮外部审计（已归档为 [DOC_AUDIT_R3_2026-10-24.md](archive/DOC_AUDIT_R3_2026-10-24.md)）——R1 §0 基线块"均在/当前"式零滞后绝对措辞改为两段式（回填哈希 + "其后均为治理提交，见 §1"），与校验器 ≤3 容忍度匹配，此后正文不再随每次提交失实；R3 落后分支 `frontend/ui-audit-p1` 已在报告时点后删除（`8b47536`）。**R2 复核为误判**：报告断言 `HomeExploration.vue` 是生产首页渲染器，实测 `router.ts:22,69` 的 `/student/home` 指向 `features/student/visual/StudentHome.vue`（V3.6.1 独立实现，不消费 design 参数），`dashboard/StudentHomePage.vue` 仅被 campus 演示与 `p1d-ui.test.ts` 引用——`140ec78` 的 N8 理由与 README 改写均成立，本注记防止后人据 R2 误删生产无关但被引用的演示组件。R2 附带暴露的真实残留已清理：`router.ts` 登录回跳白名单仍放行已无组件消费的 `/student/home?design=…` 参数（该残留正是误导审计的原因），删除该分支并同步改写 `router.test.ts` 断言（design 参数样本移入拒绝清单）。nit：`check_links` 扫描范围补入 `DEBUGGING.md` 与 `frontend/README.md`；nit2 复核为误报（§4 恰为 5 个竞态：归档 2 + AI 2 + 死锁 1，§0"5 个"准确）。检查：`npm --prefix frontend run verify` 通过；`validate_contract.py` 通过。未做：CLAUDE.md 用户层规则仍未动。

- **文档审计第 2 轮处置**（2026-10-24，`master` 单一基线，基于 `9be3cbb`）：依据第 2 轮外部文档审计（已归档为 [DOC_AUDIT_R2_2026-10-24.md](archive/DOC_AUDIT_R2_2026-10-24.md)）修复全部新发现——N1 §0 代码基线块由已漂移 4 个提交的 `c5ec604`/`37620a0` 更正为合流后的 `9be3cbb`；N2 阶段块"P3（学习行为分析）"按契约 `x-phase`（P2 含 17 个操作含 recordLearningEvents/tutoring/help，P3 仅 createCheck/getCheck）更正为"P2（受限式 AI 辅导、学习行为分析）、P3（独立运行检查）"；N3 FRONTEND §9 删除被 M1 取代的旧字号 bullet（27/24/14）并改写 zhixue.css 与 tokens 的表述；N4 修复归档搬迁留下的 4 条死链（V3.1/V3.2 的 .cache 相对链接改为本机目录说明、V3.4 的 DESIGN.md 改指同目录 frontend-DESIGN.md）；N5 门禁块去掉随登记数漂移的链接计数。工具侧：`validate_contract.py` 的 `check_links` 扫描范围扩至 features/ 与 archive/（消除"提交声称链接全可达、校验器实际不扫"的盲区），`check_status_baseline` 新增"§0 第一个基线 commit 必须是 HEAD 祖先且落后不超过 3 个提交"拦截基线漂移（N1 案例）。顺手项：N6 docs/README 校验器描述同步三目录与新基线规则、N7 student-ui-convergence.md 头部声明指向现行规范、N8 frontend/README 删除已失效的 V3/B+ 预览入口两段（design 参数路由已移除）、N9 §1 引言补归档路径迁移对照、N10 §1 引言明确 §4 已知限制为现行清单。检查：`validate_contract.py` 通过（三目录登记 32 份、链接扩展扫描 248 条全可达、基线 9be3cbb 为 HEAD 祖先；扩展扫描另发现并修复 2026-10-08_HANDOFF_AUDIT.md 一条指向根 README 已不存在锚点的历史死链）。未做：N9 所列历史日志内旧路径按"日志不改写"保留，仅靠 §1 引言对照说明。

- **仓库整理第 4 步：frontend 历史产物归档与分支合流**（2026-10-24，分支 `frontend/ui-audit-p1`，基于 `d894e54`）：frontend/ 根 12 份历史交付报告（V3～V3.6.1、CONTENT-POLISH、STUDENT-RELEASE、V3.3-STUDENT-TEST）移入 docs/archive/ 并逐份登记于归档清单，报告间唯一互链（V3.3-DELIVERY→STUDENT-TEST）同目录仍有效；15 个一次性验收脚本（verify-student-v3 系列 11 个、content-interactions/content-polish/release 3 个、explore-student-v36）移入 frontend/scripts/archive/，scripts/ 根保留 package.json 引用的 6 个与 campus 配套 3 个、shim 1 个；frontend/README.md 中"见本目录 DESIGN.md"改为指向 docs/FRONTEND.md 第 9 节（上轮移动造成的失实指向）。随后 `frontend/ui-audit-p1` fast-forward 合回 `master` 并推送，恢复单一基线。检查：移动后 `npm --prefix frontend run verify` 通过（31 文件 286 用例——报告与脚本不被 src/tests 引用，此为复验）；`validate_contract.py` 通过（登记 31 份、链接全可达）。未做：frontend/README.md 中"首页 V3 视觉探索/B+ 候选"两段描述仍写"尚未选择"，与正式已采用 V3.6.1 的现状不符，属该文件自身的过时内容，待前端维护任务修订；CLAUDE.md 无关规则未动。

- **文档治理收口（M1/M3/M4/L6）**（2026-10-24，分支 `frontend/ui-audit-p1`，基于 `f947ca0`）：依据外部文档审计（已归档为 [DOC_AUDIT_2026-10-24.md](archive/DOC_AUDIT_2026-10-24.md)）处置遗留三项——① FRONTEND §9 成为视觉与交互唯一现行规范：开头声明替换 10-18 原型基线陈述，并入 M1 视觉令牌表与规则、M2～M5 密度档位（自 frontend/DESIGN.md 迁入，内容逐字保留）；② frontend/DESIGN.md 加归档声明后移入 docs/archive/frontend-DESIGN.md（全部引用均为历史区纯文字提及，无死链）；③ docs/README.md 逐文件登记 features/ 四份与 archive/ 十份（新增归档清单小节），validate_contract.py 登记校验扩展到两个子目录，与 AGENTS 准入规则范围一致；审计报告本体一并归档。检查：`validate_contract.py` 通过（登记数扩至 19，链接 135 条，基线 commit 校验全过）。未做：CLAUDE.md 中与项目无关的会话规则未动（用户层文件）；frontend/ 根的 12 份历史 DELIVERY 报告归档仍未做（属仓库整理第 4 步）。

- **未决①～④收口与后端小修**（2026-10-24，分支 `frontend/ui-audit-p1`，基于 `d48b364`）：契约升至 **1.1.1**——①③把"归档后同 revision 重发提交返回原提交""已发布评价重复发布在 baseVersion 等于发布前/当前版本时幂等 200"写入 submitAssignment/publishFeedback 描述（publishFeedback `x-idempotency` 改 natural）；②course_notice 消息继承公告 target（V10 给 `notifications` 加 `target_type/target_id` 通用目标列，NoticeService 写入、`notification()` 组装，与 V9 的 notices 目标列及 BACKEND 第 5 节设计对齐）；④全班公告 target 禁止 feedback（422 VALIDATION_ERROR，删除 `existsPublishedFeedbackInOffering`）。后端另两项小修：InviteCodeCodec 改读 `auth.invite.signing-key`（yml 映射同名环境变量，.env/脚本不变）、删除 SecurityConfiguration 中无路由匹配的 `/api/v1/test/**` permitAll 死规则。检查：`./mvnw.cmd --batch-mode verify` **BUILD SUCCESS，387 单测 + 208 项 Testcontainers IT 全过**（新增 NotificationMappingTest 3 项、NoticeStatsIntegrationIT 继承/拒绝 2 项，DatabaseIntegrationIT 迁移断言 9→10；本轮启动本机 Docker Desktop 后实跑，非沿用旧证据）；`validate_contract.py` 通过（1.1.1、85 操作、121 链接、27 基线 commit）；`npm --prefix frontend run verify` 31 文件 286 用例通过（schema.d.ts 按 1.1.1 再生成；mock 公告校验对齐，拒绝 feedback/help_request target）。前端 `targetRoute` 原已支持全部目标类型，正式页面零改动。未做：createNotice 行为变更未经真实浏览器跨端验收（`x-implementation-status` 维持 verified 不动，待下轮联调复核）；help_reply 等仍为 planned；样式叠层物理合并未做（FRONTEND §9 已冻结增量）。

- **第二轮深度审计与仓库收口**（2026-10-24，分支 `frontend/ui-audit-p1`，基于 `f062189`）：只读深度审计确认 P1 闭环可信、无 P0 问题——当日实测前端 `npm --prefix frontend run verify` 286 用例通过、后端 `./mvnw.cmd --batch-mode test` 384 项 BUILD SUCCESS、`validate_contract.py` 通过；Testcontainers IT 因本机 Docker 不可用未复跑，沿用 §3.8 与 CI 证据。据此完成入口收口：README.md 契约计数 57/5/23（10-15）更正为 53/10/22（10-18）并删除目录树重复的 DEBUGGING.md；根 `.gitignore` 新增 `temp/` 与 `node_modules/`（`temp/` 为 243 文件约 15MB 的 V3.x 交付截图，仅忽略、未删除，去留待定）；删除根 `node_modules` 空壳、`frontend/src/api/__mocks__` 空目录与 `backend/backend-restart.*.log`（均未被 Git 跟踪）；更正本节"本地master未推送"为已同步 `origin/master`（`37620a0`）。检查：改动后 `validate_contract.py` 通过；本轮未改前后端代码，门禁结论沿用当日审计实测。未做：审计第 2 步（未决①～④ 的产品语义决定，重点是消息 target 规则）与第 3 步（`InviteCodeCodec` 改 `auth.*` 命名空间、删除 `SecurityConfiguration` 中 `/api/v1/test/**` permitAll 死规则、FRONTEND.md 写入 visual 层冻结规则）待用户逐项授权；`temp/` 内容未删除。

- **学生端与教师端收口 M2-2～M5**（2026-10-23，分支 `frontend/ui-audit-p1`，基于 `483ab37`）：`532fbd3` 学习记录改为节点轨 + 连续行、成果面板去掉与页头重复的阅读计数，日历月格 112→92px、空态收紧，消息行 18→14 内边距、“标为已读”降为文字次级；`f892c77` 阅读页 `pre` 统一为浅底代码块、阅读区 24/28、表单边框用 `--line-control`，教师“授课教学班”由两列卡改为单面板列表行（1050px 以下两列重排）；`71617af` 登录页改为品牌块 + 表单卡并垂直居中。DESIGN.md 追加「M2–M5 执行记录」与密度档位。检查：三次提交共用同一次 `npm --prefix frontend run verify`（31 文件 286 用例，类型/构建/生产无 mock）；mock 预览 1440/390 共 22 张截图、无页面异常。未做：教师工作台统计卡与批阅页未行式化，消息分页仍未写入 URL，未做真机与真实后端联调。本条依据实际差异、命令输出与截图登记。

- **学生端密度 M2-1**（2026-10-23，分支 `frontend/ui-audit-p1`，基于 `ff39d81`）：首页右栏由三张独立卡合并为两张（最近课程一张，反馈与公告共用“跟进”面板、内部用分隔线，DOM 不变）；课程卡去掉与计数重复的百分比，学科轨 44px、标题 17px、进度条 4px、位置行与标签同行，实测卡高 290→218px；作业表格截止列压成两行（月日与时刻同行），列宽 128/1fr/190/112，行高 111→82px；提交资格加载失败改为 notice-warn 区块并内置重试。检查：`npm --prefix frontend run verify` 通过（31 文件 286 用例）；mock 预览 1440/390 共 22 张截图无页面异常；尺寸为本轮实测而非估算。未做：记录/日历/消息的路径与行密度（M2-2）、教师端表格化（M4）、登录品牌页（M5）。本条依据实际差异、截图与实测尺寸登记。

- **设计基线 M1**（2026-10-23，分支 `frontend/ui-audit-p1`，基于 `c2c38c9`）：`tokens.css` 成为颜色、字体、字号、间距、圆角、焦点与动效的唯一来源；外壳与旧页（zhixue/courses）、学生端 release、消息页 craft、学生消息/反馈、工作区、Web 预览、教师评价编辑器全部改为引用变量。h1 统一 28/手机 25、正文 15、品牌蓝统一 `#2853bc`（删除 #3768e5/#244eae/#0066cc）、圆角归并 6/10/14（57 处）、焦点环 `#1f3b84`、去掉 surface 与品牌标的装饰阴影；DESIGN.md 追加「设计基线（M1）」并声明覆盖此前同职责描述。检查：`npm --prefix frontend run verify` 通过（31 文件 286 用例，类型/构建/生产无 mock）；mock 预览 1440/390 两档 22 张截图、无页面异常；未定义变量回退只剩 demo 与未路由的 NotificationCenter；`visual/refinement/integration/student-v3` 的字面色值尚未迁移。未做：页面结构与容器（M2）、教师端表格化（M4）、登录品牌页（M5）。本条依据本轮实际差异、命令输出与截图登记。

- **学生端任务回收与消息标读位置修复**（2026-10-23，分支 `frontend/ui-audit-p1`，基于 `37620a0`）：① 消息页标已读后的刷新不再卸载列表，请求挂起期间保留已加载消息；② 首页主任务与“我的作业”中服务端确认可提交的未完成作业，“开始/继续作答/继续补交”直达 `/student/workspaces/:id`，已提交、已评价、归档仍进说明页并保留反馈定位；③ 作业说明页主操作移入标题行，`canSubmit=false` 时降级为描边按钮，正文“开始作业”不再重复按钮；④ 工作区标题改为作业标题，副标题给出“← 作业说明”与 `role=status` 的保存状态；⑤ 路由切换聚焦 h1 不再显示浏览器默认焦点框（登录页首屏可见）；⑥ mock 预览的路径参数解析跳过末尾动作段（`/workspace`、`/read` 等），mock 下工作区与标已读才可用；⑦ 键盘焦点环由浅蓝 `#90afff`（白底 2.15:1）统一为 `--focus-ring` 深蓝，登录页、会话页与侧栏“退出”随之上移。检查：`npm --prefix frontend run verify` 通过（31 文件 286 用例，类型/构建/生产无 mock）；新增“标已读刷新期间保留列表”用例，回退模板修复后失败（期望 2 条、实际 0 条），恢复后通过；mock 预览 1440/390 两档共 22 张截图、无页面异常，标已读刷新期间 217 帧采样列表最低仍为 2 条，登录页 Tab 后焦点环计算值为 rgb(35,75,167) 3px。未做真实后端联调、真机与读屏验收；真实网络下刷新仍会重取一次列表，只是不再清空。本条依据本轮实际差异与命令输出登记。

- **Claude 版本启用**（2026-10-22）：按用户要求保存源工作区全部改动为 `85ac8f5`，接入主工作区提交 `7e85835`；启用首页/课程/作业及公共导航收敛样式。启用前 `bf924b5` 已保存为分支 `backup/pre-claude-20261022`。本轮 verify 31 文件/284 用例、类型、构建、生产隔离及契约静态检查通过；4173 真实接口入口与4175独立 mock 预览均 HTTP 200。未执行浏览器视觉/真实接口写入验收，未推送部署；模拟预览不作为真实业务证据。回退代码执行 `git revert 7e85835`，保留后续历史。本条依据实际 Git 差异及本轮命令输出登记，覆盖旧视觉基线的当前采用状态。

- **代码基线**：`45e4377`（自动判题后端、契约及真实并发/执行器验收；前端 `beea84b`、`eb6815c`），须为 HEAD 祖先且落后不超过 3 个提交。远端基线为 `5462351`；本轮仅本地提交，未推送。

- **学生端正式接入 · 包1**（2026-10-20）：提取features/student/visual纯展示组件与共享样式，历史候选显式转发；生产检查允许展示类名但新增真实入口依赖图与演示时钟/评审标记检查。verify 30文件274项通过，尚未切换正式路由；真实业务验收待后续包。依据本轮代码差异与实际门禁结果登记。

- **学生端正式接入 · 包2**（2026-10-20）：基于`283d3ad`，正式首页/作业/消息采用V3.6.1固定配置与未读A，无版本状态；保留旧首页测试，补正式资格/空态/失败断言。verify 30文件277项通过；本地真实服务完成新建专用教学班、章节阅读、Web/SQL/文字三类保存提交、草稿隔离与发布评价、日历和教师批阅响应式检查，证据.cache/zhixue/result.json。仅对本轮专用测试对象写入，未改正式业务规则。课程/记录/学生日历迁移待包3。

- **学生端正式接入 · 包3**（2026-10-20）：基于`71c4d3c`，课程/记录/学生日历采用V3.5固定配置，课程筛选为局部状态；二级页样式仅正式student-release容器生效，教师日历原组件不变。历史入口启动显式固定旧路由，修正展示组件转发，避免旧版日期/学科节点空渲染；学习记录补非法链接说明。verify 277项、历史V3.5设计86项/V3.6设计64项通过；本地真实双窗口409、慢网络、保存失败保留、会话更换、Web沙箱、归档只读、跨班拒绝通过，证据.cache/zhixue/boundaries.json。七档正式截图及交付报告收尾中。依据实际差异和结果登记。

- **正式学生端交付**（2026-10-20）：六页已正式采用V3.6.1/V3.5组合，二级页基础样式接入；生产样式以:where(.student-space)限定，正式入口无演示依赖或评审控件。最终verify 30文件279项，真实浏览器68项/570响应（569个200、初始未登录/me预期401），无未处理页面异常；覆盖七档视口、14个二级页组合、键盘主动作、月周切换、消息展开不标读、真实加载/失败/重试与分页。真实三类提交/教师草稿隔离、409冲突恢复等通过；旧V3.5/V3.6设计86/64项、V3.6.1浏览器23项与隔离检查通过。交付frontend/STUDENT-RELEASE-DELIVERY.md，证据.cache/student-release和.cache/zhixue，根目录临时截图_学生端正式版按当前12/视口12/二级14/交互6分组。仅写本轮本地验收对象；未部署，未执行真实学生/真机/完整辅助技术审计，Node24.17.0低于指定24.21.0。此条覆盖此前候选“尚未正式采纳”的阶段状态，依据本轮实际差异与执行输出登记。

- **学生端内容层次精修**（2026-10-20）：基于`145d26a`，保留主布局/深蓝焦点；近期任务按北京自然日轨道成组且逐项保留时刻，作业日期/状态分层，消息极浅未读与末尾时间操作；课程进度、评价历史、日历日程复用同一正式样式层。31文件284项回归、最终构建/生产隔离通过；修改前后各42个七档视口检查、14个只读交互检查通过，业务写请求0，课程/作业/消息对照字段一致；旧V3.6设计64项通过。未改既有夹具源、演示/真实业务数据、后端/契约/教师页面。额外路径分隔线经截图复核撤回；本地开发服务样式空500经重启恢复。证据frontend/.cache/student-content-polish；报告frontend/CONTENT-POLISH-DELIVERY.md；根目录临时截图_内容层次精修含当前12/重点对照12/局部2/视口交互3及HTML索引，已交付。此条依据实际差异与执行结果更新现状。

- **学生端视觉收敛**（2026-10-20，未提交）：基于`bf924b5`，首页/课程/作业脱离历史版本样式层，唯一来源`frontend/src/features/student/release/release.css`（根类sr-home/sr-courses/sr-tasks，仅student-release生效）；统一变量、三档圆角、去重复文字与↗、作业固定列宽与过期分组暖色、课程单页不显示分页、手机只留底部“更多”。记录/日历/消息/demo不变，未删文件。p1d-ui第300行`.vc-home`断言改为`.sr-home`。verify 31文件284项通过；模拟数据预览1440/375检查三页，修正旧全局规则`.task-table-row time::before`及日期栅格继承。模拟数据无待办，焦点卡日期与分组任务流未在预览中目视确认。方案docs/features/student-ui-convergence.md，规范DESIGN.md末节。

- **V3.6.1 体验精修候选**（2026-10-20）：实现`6f32a23`，独立explore=v361 / visual=v36或v361比较。首页复用资格位置明确“已逾期，可补交”，操作后解释可提交任务按截止时间排序包含补交；不改核心排序。消息未读A原版为默认，B轻底仅供同条件评审；作业布局和导航未发现必须修改的问题，保持。依据：verify 30文件274项通过，三页七宽度21组合+2流程共23记录，移动导航首/中/底固定、菜单开关、抽样触控检查通过，原V3.6设计64项/534文字样本最低5.13:1复跑通过，真实API请求0；契约静态检查通过（系统python缺yaml后使用既有.contract-venv）。Node实际24.17.0低于指定24.21.0，不宣称CI等价。报告frontend/V3.6.1-DELIVERY.md，证据frontend/.cache/student-v361/results.json；临时截图_V3.6.1含当前6、对照12、未读AB4、实际视口6。未修改演示数据/正式页面/教师/后端/契约；真实学生、真机与完整辅助技术未验收。可暂结束视觉迭代，保留业务排序决策与人工验收。此条及基线更新依据实际差异和本轮执行结果，历史日志不改。

- **V3.6 Visual Craft 候选**（2026-10-20）：基于d403abe，仅独立explore=v36首页/作业/消息高保真探索；每页A/B局部构图实际渲染12张，收敛首页A、作业B、消息A。日期索引、任务标题与课程合并、分层收件箱及移动阅读单元；课程/记录/日历保留V3.5组件，正式页面/教师/数据/契约未改。依据：verify 30文件274项，六页36视口及12条模拟流程；64设计/边界记录，534文字样本最低5.13:1（首页渐变两端取更低值）；旧V3.5的86项、隔离与130响应契约检查通过，真实API请求0。入口visual=v35/v36可切换，历史入口保留；证据frontend/.cache/student-v36/index.html，实现83cda81；报告frontend/V3.6-DELIVERY.md；根目录临时截图_V3.6共36图（当前6/对照12/局部方向6/关键局部12）。本节依据实际测试与截图审阅更新候选和门禁，真实学生/真机未执行。

- **V3.5 学生体验整合候选**（2026-10-20）：基于08078ce，独立 explore=v35 / visual=v35 六页预览；新增首页轻量学科课程摘要、作业三类状态与日期排版、消息类型图形及课程关联，收尾章节已读节点和实际动作文案。V3.3/V3.4/V3.4.1保留，正式页面/教师端/后端/数据/契约未改。依据：verify 29文件269项，六页36视口与12条桌面/手机模拟流程；86设计/边界记录（含72原版/候选宽度组合），544文字样本最小5.39:1，真实API请求0；旧V3.4.1的72项、隔离与130响应契约检查通过。证据frontend/.cache/student-v35/index.html；实现76d3273；报告frontend/V3.5-DELIVERY.md，根目录临时截图_V3.5共32图（当前12/三页对照12/整体2/局部6）。另10项跨学科/版本/宽度检查确认当前节点品牌蓝与旧版保留，键盘切版/消息展开收起通过。尚未真实学生或真机验收，不宣称效率提高。本节依据本轮实际检查更新门禁与候选状态。

- **V3.4.1 精修候选**（2026-10-19）：基于a2ff459，仅独立预览课程/记录/日历精修，visual=v33/v34/v341同状态切换；保留V3.4学科图形、色彩与版式。路径减少重复强调、课程书脊收窄、日历精确时间分组与详情资格提示。依据：263项测试、54页面/版本/宽度组合、72浏览器检查、168文字样本最小5.40:1；V3.4原回归46项、V3.3六页36视口及12流程、隔离/130响应契约检查通过。正式页面、后端、数据与契约未改；候选尚未采纳，真实学生测试未执行。证据frontend/.cache/student-v341/index.html，实现提交22995ef；报告frontend/V3.4.1-DELIVERY.md，根目录临时截图_V3.4.1已分组当前6张、三版本18张、局部8张。本节依据本轮测试与截图审阅更新基线、门禁和候选状态。

- **V3.4 视觉探索候选**（2026-10-19）：基于133be50，仅独立高校预览的课程/记录/日历新增学科索引、章节路径与截止密度；入口campus.html?explore=v34，visual=v33/v34只切换呈现，复用V3.3内存数据。正式页面、数据、契约与教师端未改，未获用户采纳前不推广。253项回归/构建/无mock检查通过；同状态36页面版本视口组合、阅读/复习/反馈/日历/返回与键盘、长标题/12章/空态/故障/200%文字通过，46条检查记录；168文字样本最小5.04:1。生产产物名称与V3.3一致。实现提交3322d69，报告frontend/V3.4-DELIVERY.md、规则frontend/DESIGN.md候选章节；.cache/student-v34/index.html含12张同条件对照图及局部证据，根目录临时截图_V3.4对比已中文分组18图。视觉方向已获用户认可，后续为V3.4.1精修；尚未正式采纳，不宣称真实学生效率提升。

- **V3.3 隔离演示**（2026-10-19）：基于已存在的6929694实现独立campus开发入口（4174），复用学生页面与API客户端，内存夹具8课程/18作业/16消息/4评价，固定北京时间2026-10-19 10:00。真实端拒绝演示入口，预览端无代理并拒绝/api/，生产包不含演示标记。verify 27文件253项、130响应OpenAPI校验、六页36视口、桌面/手机A–F共12条模拟流程通过，真实API请求0；V3.2主回归及边界脚本通过。未改后端、正式业务数据、契约、教师页面；不将内存模拟视为真实后端联调或学生测试。实现提交c70dad4；交付见frontend/V3.3-DELIVERY.md，人工材料frontend/V3.3-STUDENT-TEST.md。current仅12图，index.html包含交互证据。SQL答疑与截止顺序已纠正；V3.2正式页面不变，真实学生测试未执行。

- **V3.2 当前任务**（2026-10-19）：先审计后实施，基线c4bc273，before真实36视口与局部图已保存；课程去顶部蓝线/进度对齐，记录880px阅读分区与日期分数对齐，消息按真实裁切显示全文入口并保留展开连续性。26文件245项、同数据六页36视口PASS，已查看课程桌面/手机、记录桌面与消息局部图。首页浅色焦点、作业时间/资格分层、日历轻量事件/44px溢出入口与学生微交互已落地；245项仍通过。同数据六页36视口、隔离长标题/章节/空态、200%文本放大与720CSSpx/DPR2等效重排、动态全文/焦点连续性及reduced-motion PASS。V3.2已完成，提交edf3d90/4dd2d3e，报告frontend/V3.2-DELIVERY.md。139个渲染样本最小5.39:1；消息加载/网络失败重试、文本放大表单与末项命中PASS；当前12图在frontend/.cache/student-v32/current，对比含局部图在index.html。基线推进至已存在4dd2d3e，依据最终245项/浏览器/静态结果。审计见frontend/V3.2-DELIVERY.md；仅学生样式与展示，不改业务。

- **V3.1 当前任务**（2026-10-19）：P0待办按服务端资格全量读取、优先级排序后再分页，最多6并发查询；补交仍优先，失败仅按截止排序并提示未分组。105任务跨2个API页回归确认后页可提交项进入首页，数量105保持。verify 26文件240项；真实六页面36视口与固定导航上中下滚动/末项命中PASS；同数据before/after截图保存在frontend/.cache/student-v31。P1课程去重与章节直达、反馈按ID去重、消息日期分组及全文已完成；verify 26文件243项。同数据390首张课程487→323px、首条消息234→218px，六页36视口PASS并审阅手机截图。日历空日期增加完整查询内的下一截止日程日期入口（不推断提交资格），保留课程筛选；26文件245项通过。V3.1已完成，提交5836ce7、f0c52ee、519eeaf；报告frontend/V3.1-DELIVERY.md，同数据对比frontend/.cache/student-v31/index.html。重点文字样本最小5.39:1；真实六页36视口与隔离夹具复验PASS；未做真机/屏幕阅读器/全站审计。基线推进至已存在519eeaf，依据最终245项与浏览器/静态校验结果。§0基线由候选2296e07更正为已存在V3交付4fefad4，依据实际提交历史与V3报告。

- **V3.0 交付基线**（2026-10-19）：用户已选 B+，阶段一将其设为默认首页，保留显式原版/A/B预览。学生空间增加独立样式作用域、焦点与移动文字/触控规范。依据：verify 26文件238项通过；真实 B+ 六视口/滚动命中/键盘脚本 PASS，已审阅390截图。阶段二课程标识/标题层级与连续章节路径已实现：verify 26文件238项通过，六页六尺寸只读浏览器脚本PASS，已查看1440课程与390记录截图。阶段三表格/日历/消息精修已实现并通过238项检查与六页六尺寸脚本；已审阅作业桌面、手机日历与消息截图。阶段四综合验收通过：六页面36视口组合、筛选/手机日历/Esc操作、隔离长标题/24章节/空记录夹具，238项回归与契约静态校验PASS。截图在frontend/.cache/student-v3/index.html，逐页交付记录frontend/V3-DELIVERY.md；未做真机/学生可用性/全量对比度审计。阶段提交4638a00、83e5f8f、673b7f3。原实现基线2296e07可回退。

- **上一轮候选记录**（2026-10-19）：以B为基础融合A的B+首页候选已精修并验证，等待用户确认。design=bplus独立预览，原版/A/B保留；正常首页不显示探索条，design=current参与原版比较，不替换默认内容。依据为26文件237测试、B+真实分组/章节语义/六视口与手机滚动命中检查、A/B回归，详见 §8。

- **迁移进度与依据**：公共框架已完成品牌、侧栏/顶部栏、真实角色入口与手机导航；`npm --prefix frontend run verify` 22文件/203用例、类型/构建/no-mock通过。实际环境Node24.17.0/npm11.13.0低于文档基线，不视为CI等价证据；真实浏览器主流程与边界专项均已通过，见下方及 §5。

- **学生迁移包**：首页主任务/辅助栏、课程卡片、折叠章节、服务端当前章节恢复与本章真实作业入口已接入；复用原工作区/消息/学习记录逻辑。verify通过203项后新增目录测试，相关2文件34项通过；无接口变更。真实浏览器已走通入班、阅读和三类工作区立即提交。

- **教师迁移包**：授课班级卡片、章节内容折叠、真实统计（隐藏P2求助）、提交表格与批阅抽屉/跨页队列完成；保留快照满分、量规、已发布只读与草稿版本。最终verify 24文件213项通过；包含队列完整分页/中止/失败及发布失败不切换断言。真实浏览器已验证保存草稿、发布评价及学生端反馈，未改变接口状态标记。

- **日历与主流程验收**：学生/教师真实作业日历已接既有分页接口，URL保存日期/view/offering，支持月/周/手机日期条、详情跳转与历史标识。修正旧mock作业分页响应，并拒绝缺失total的响应以避免无限翻页。Edge真实主流程PASS：开班/发章/入班/阅读，Web/SQL/文字立即提交，草稿隔离与发布反馈，1440/1024/390布局/导航/抽屉Esc；证据`frontend/.cache/zhixue/result.json`及截图（已忽略）。另有边界专项PASS：真实双窗口409及显式合并、800ms延迟写入保留最新编辑、保存中断保留内容及取消离开、Web预览父页面/存储隔离、真实会话注销后换身份无草稿泄漏、归档只读及跨班拒绝。客户端延迟/中断为明确故障注入，未伪造成功响应。证据`frontend/.cache/zhixue/boundaries.json`；已人工检查加载完成的1024课程页、390日历与抽屉截图。


- **2026-10-17 教师公告入口包**：教学班工作台新增“公告”页，复用已实现的 `listNotices` 和 `createNotice`，列出本班公告并显示关联内容与通知人数；发布表单支持本课程、章节、资料、作业四类目标，标题/正文按契约限制，归档班级沿用工作台只读状态禁用发布。发布后显示成功结果并刷新列表；失败由统一操作反馈保留 requestId，列表不做乐观改变。前端 `npm run verify`：22 文件、199 项通过，`check:no-mock` PASS；新增 UI 用例验证 CSRF、请求体目标和成功反馈。契约中的 `listTeacherNotices` 仍为 planned，未擅自提升实现状态；尚待真实教师浏览器发布与归档只读验收。

- **2026-10-17 提交与反馈闭环包**：接入已有 `listTeacherSubmissions`，教师工作台固定作业入口，作业详情提供状态筛选/最新提交/分页和批阅链接；学生详情提供提交历史、作品与反思快照，评价使用提交时量规。消息、首页和学习记录链接保留 feedbackId，验证评价/提交归属后展示，成功展示才显式标记对应 messageId 已读，失败可重试。前端 `npm run verify`：21 文件/195 项通过，类型、构建、无 mock 检查通过。真实页面从作业管理选择学生提交 `af68db35-7105-40eb-b346-c1947380603d`→保存 91 分草稿（学生不可见）→发布→学生消息进入指定评价 `93b9ea65-755f-491a-82a0-6c9ac90feaf6`，展示 revision 1 提交快照与反思（练习工作区已为 revision 3），显示已读提示，返回消息未读数 15→14。证据 `D:/tmp/lp/browser-p1/feedback-closed-loop-dom.txt`。尚待 Web 沙箱、公告入口、历史服务端分页和最终矩阵；不整体标 verified。

- **2026-10-17 教师表单修复包**：B3 日期在本地控件与 UTC 间转换；PATCH 排除 `aiPolicyVersion`，published 仅提交允许字段；补 Web/SQL/文字类型、章节知识点、模板、量规、延期与提交次数，切换类型前提示模板替换；归档/加载失败禁用写入。作业管理补操作结果与错误呈现（B8）。日期回归先失败，修复后前端 `npm run verify` 20 文件/192 项通过，类型、构建、无 mock 检查通过。真实教师页面创建 SQL 草稿 `256567e8-86c9-41da-823f-8215ce7e09ec`，填写本地截止 2026-10-24 22:00、模板 `SELECT 1017 AS acceptance;`，再次改描述保存成功，整页刷新恢复类型/章节/截止/模板/量规。证据 `D:/tmp/lp/browser-p1/teacher-sql-reopened-dom.txt`。尚待三类全链路发布提交、批阅入口和其余 P1 包；未将接口提升 verified。

- **2026-10-17 工作区恢复包**：保存队列区分本地编辑序号与服务端 revision，错误暂停且保留最新待保存内容；409 显式读取/比较/恢复或合并，断线结果不确定先读回核对；提交期间冻结编辑与反思；离开失败使用等待保存/留在页面/放弃三项操作；会话失效在内存保留，同账号恢复前比较，换号或主动退出清除。取消导航不再错误更新页面标题。新增恢复用例先运行 3 项均失败，再修复；最终前端 `npm run verify`：类型、构建、无 mock 检查通过，19 文件/188 项通过。真实双标签从 revision 1 编辑，第二页 409 保留本地并显示离开对话框；选择留在页面→读取服务端 revision 2→编辑合并→明确保存，HTTP 读回 revision 3 为合并内容。证据 `D:/tmp/lp/browser-p1/conflict-merged-dom.txt` 与 `conflict-merged-readback.json`；截图工具本轮失败，未声称取得截图。尚待：真实慢网络/会话失效专项及 P1 其余包；不提升整体 verified。

- **P1 收尾基线复验（代码 `ccfc1d5`）**：真实学生页面 Web 编辑后 750ms 内完成提交，HTTP 读回提交 `af68db35-7105-40eb-b346-c1947380603d` 的 revision 1 文件为 `P1_B1_LATEST_CONFIRMED`；Text 编辑后立即切页，服务端 revision 2 保留 `P1_B2_LEAVE_PRESERVED`；过期作业工作区提交按钮禁用且仍可练习保存。B1/B2/B6 原正常网络场景通过，慢网络、失败恢复及会话恢复仍待补验。前端目录运行 `npm exec -- vitest run tests/workspace-autosave.test.ts tests/workspace-editor.test.ts`：2 文件、19 项通过。证据 `D:/tmp/lp/browser-p1/baseline-retest.json`（本机，不入库）。新建独立 Web 夹具 `795db0ac-f56e-4ab8-930b-fcfe0d433050`，保留原测试数据；HTTP 创建夹具不算教师表单通过。

- 按用户要求保存当前版本并接手项目，代码基点为 `master` 的 `8314f36`；将已有 [交接说明](archive/HANDOFF-2026-10-16.md) 纳入版本控制，未改其原文。（2026-10-18 该文件已归档并标注作废，见 §0.1。）
- 已核对 AGENTS、交接说明和 STATUS：B1/B2/B6 的代码修复为 `0292150`，18 个前端测试文件、184 个用例通过是上一包记录，本次尚未重跑或浏览器复验；其余 B3/B4/B5/B7/B8 仍待处理，P1 不标为 `verified`，暂不进入 P2。
- 下一步先按 3.4 原场景浏览器复验 B1/B2/B6。交接说明中两处引用按实际文件使用：作业编辑 operationId 为 `patchAssignment`，工作区编辑与自动保存规则在 FRONTEND 第 5 节。
- 本次仅保存交接文档与接手记录，不改业务代码或接口契约，不提交根目录 `node_modules/` 测试缓存，不推送远端。

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

### 2026-10-25 P2 后端剩余路径核对与自动化验收

- **范围核对**：以 master `986d854` 和前端交接为起点，P2 生产实现已经 PR #11 合并。定向扫描未发现交接三条路径的生产缺口；新增验收测试，不重复实现业务。独立分支 codex/p2-backend-acceptance，保留原未跟踪审计文件，前端零修改。
- **完成清单**：受理 POST→真实 ConfiguredTutoringProvider→本机 HTTP 桩→worker/MySQL→GET 轮询 completed；上游 503/畸形 JSON→failed/PROVIDER_UNAVAILABLE、无助手正文/进度及上游信息泄漏；含知识点提交快照→真实登录/CSRF→教师保存/发布→学生读取→证据/通知幂等与学习记录聚合。新增 4 项 IT；测试直接调用 worker.execute，不覆盖调度器线程时序。
- **测试**：`ab13914` 执行 `./mvnw.cmd --batch-mode -Dit.test=TutoringIntegrationIT,AnalyticsIntegrationIT verify`：452 单元/HTTP、36 MySQL 8.4.11 IT（Analytics 11、Tutoring 25），0 失败/错误/跳过，BUILD SUCCESS。日志位于被忽略的 backend/target/p2-acceptance-verify.log。不累加旧报告，不宣称本轮全套 IT 已跑。系统 Python 缺少 openapi_spec_validator，使用仓库 .contract-venv 执行 validate_contract.py 后 PASS；git diff --check PASS。
- **文档与决定**：延续此前授权，将 BACKEND 图表残留的通知收件人表、P1 事件表及历史知识证据回填描述与既有正文/生产迁移统一，无契约或业务规则变化。联调说明增加知识评价请求示例、快照准备条件和自动化边界。§0 同步基线、本轮门禁及前端已交付状态，依据为实际代码和测试输出。用户再次确认外部调用保持关闭。
- **实际 SmartFlow**：balanced；本轮仅委派 p2_remaining_scan（sf_scan）一次只读定向扫描，已完成，未运行测试或改文件；主线程实施和测试。本轮不改鉴权、权限、迁移或生产配置，不另派独立审查；上一轮 p2_review 不计作本轮执行。
- **后续与边界**：真实供应商配置后再验证兼容性。正式前端可按联调说明验证 completed、failed 及知识评价写入，页面联调不作为后端实现未完成。本轮未读 .env、未连接/迁移/清理 3307、未部署；生产代码和接口结构保持不变。

### 2026-10-27 后端审查修复续验

- **分支与范围**：中断期间前端 F1–F6 已提交到当前分支，续验保留所有前端提交。用户确认保留当前分支、暂不创建 PR；`815c0af` 修复合法长标题发布失败、提交未知字段与辅导安全诊断，`ba587a9` 实现 V14 公告人数冻结和迁移测试。未改前端代码或生成类型。
- **用户确认的历史兼容方案**：V14 对新公告保存实际通知数量，唯一有效的 NOTICE_CREATED 审计可恢复旧记录；缺失、重复或不合法的审计保留 NULL，读时沿用旧估算，不能声称精确。V1–V13 不变，未迁移或清理当前 3307。
- **实际测试**：`./mvnw.cmd --batch-mode '-Dit.test=NoticeRecipientMigrationIT,NoticeStatsIntegrationIT' verify`，455 单元/HTTP + 31 MySQL IT，0 失败/错误/跳过，BUILD SUCCESS；`backend/target/audit-notice-resume-verification.log`。覆盖 V13→V14 的唯一/缺失/重复/非法审计、数据库非负约束、新公告同时间同标题隔离，以及第一条通知插入后第二条失败的公告/通知/审计整体回滚。`audit-verification.log` 此前对前三项运行 455 单元/HTTP + 62 作业/辅导 IT 全过。`audit-full-verification.log` 的全量曾有 256 IT 中 1 失败、1 错误：负数约束测试断言的 Spring 异常子类过窄，以及临时容器触发器权限不足；相关测试调整后在上述 31 IT 通过。不得合并这几次运行冒充一次全量通过。
- **实际 SmartFlow**：本轮 `backend_audit_build` 实现首批，`backend_resume` 续修测试并提交 V14；`backend_audit_review` 独立只读审查生产修复和后续测试，未发现阻断、未运行测试。前端方案由主线程编写并以 `d7c9f95` 提交；后续前端实现是用户中断期间已有提交，不计作本轮代理工作。
- **尚未完成**：旧公告缺少可靠审计时仍为估算；多实例 worker、会话 touch 节流、连接池调参及 N+1 性能优化未包含在本修复包，须结合部署需求和测量另行处理。V14 应用到真实数据库或部署前仍须用户确认。

### 2026-10-31 阶段二教师学习分析与学生掌握概览

- **分支与范围**：从 master `a7c1890` 起在 `stage2/analytics` 实施。用户授权新增两个契约操作（`getOfferingActivity`、`getOfferingKnowledgeMastery`，契约 1.2.0）、图表采用 ECharts、先合 ui-kit 再开阶段二。本轮只覆盖阶段二的可视化与掌握分析；P3 自动检查、共性问题映射知识点、建议/路径/预测及论文/软著材料不在范围内。
- **交付提交**：`f5a95e4` 契约新增两个操作、schema 与示例；`08096ba` 后端新增分析控制器/服务/Mapper、V15 两个读索引，并让教师作业统计返回真实的 `pendingHelpCount` 与 `commonIssues`；`5103351` 前端 ECharts 懒加载图表、教师学习分析页、作业共性问题、学生掌握概览及路由/测试；`f2eaeb9` 修复学生掌握图例色块缺少 `data-state` 导致透明。
- **口径**：活跃度按 Asia/Shanghai 最近 14 个自然日（含今日）以 `received_at` 分桶并补零，活跃学生按去重用户；掌握度复用 knowledge-v2，`basically_mastered` 需至少两个不同作业给出 `meets_expectation`，"学习中"取在途作业；`masteryRate` 仅展示，不参与任何判定。
- **验证**：后端全量 `./mvnw.cmd --batch-mode verify` 为 458 单元/HTTP + 259 MySQL 8.4.11 IT，0 失败/错误/跳过，BUILD SUCCESS；前端 `npm run verify` 44 文件/382 项，定向 vitest 6/6。真实浏览器用 `teacher.demo`/`student.demo` 登录正式页面，教师分析页与学生学习记录页收到的 payload 与接口夹具、SQL 查询逐项一致；截图为 `D:/tmp/lp/stage2-evidence/` 下 `teacher-analytics.png`、`teacher-issues.png`、`student-records.png`。4 个知识点、4 份已发布作业（其中 2 份给出 `meets_expectation`）均经产品接口创建，未直接写业务表。控制台仅有登录前 401 `/api/v1/me` 与 favicon 404，无业务错误。
- **契约描述修正**：2026-10-31 经用户授权，`getAssignmentStats` 的操作说明与 200 响应说明不再写 P1 `commonIssues:[]`，改为当前词表版本下按学生求助自报与已发布教师确认汇总的真实口径；仅描述变化，路径、字段、状态与实现未改。
- **限制**：只验证单教师单班演示数据；未执行真实供应商调用；ECharts 仅在分析页按需加载；未新增共性问题到知识点的映射。

## 2. 交接说明（2026-10-15）

- **接手方式**：先读本节，再按任务阅读本端手册及契约切片。前端只实现 frontend/，后端只实现 backend/。
- **代码基点**：master `4b76e1a`（文档结构重整；P1-D 功能代码基点仍为 `9e594a6`）。P1-D 多班聚合模块后端已完成，前端 API 客户端已就绪，UI 组件待补充。
- **下一包**（2026-10-16 核对后修订）：
  - 先把 P1-B / P1-C / P1-D 后端按契约对齐（顺序：P1-B → P1-C → P1-D；每个操作用 `scripts/contract_slice.py` 取切片，补响应字段断言测试）
  - 接通前端：`main.ts` 注册 `AssignmentsApi`，通知中心与教师评价编辑器接入路由，P1-D 客户端改用生成类型
  - 之后才做 P1-D 前端 UI 或进入 P2
  - 不重新创建已有工程或重复实现认证、课程接口。

- **最新接手入口（2026-10-17）**：P1 剩余矩阵已按 §3.8 实测收口。新增修复提交 `3aeac57`（空 target 公告消息入口）、`b436dd6`（学生/教师作业列表服务端分页）；保留既有修复。历史 [失败记录](#p1-browser-integration) 保留追溯，当前不再重复处理其中的 B1～B8；后续开发按用户指派进入既定 P2 阶段；P2/P3 限制不视为本轮已实现。

### 接手记录（2026-10-16）

- **2026-10-17 两端作业列表分页补修**：23 份真实评价夹具暴露学生“我的作业”与教师“作业管理”都固定读取默认前 20 项且没有翻页入口，后续作业无法从列表访问。沿用现有 `listMyAssignments` / `listTeacherAssignments` 的 `page/pageSize`，每页 20 项、按服务端 total 翻页、页码保存在 URL，未新增契约字段。两条回归先失败（学生/教师均无下一页），修复后前端 `verify` 22 文件/202 项全通过。正式页面已翻到教师 23 项列表第 2 页和学生列表第 3 页；证据在 `D:/tmp/lp/browser-p1/final-acceptance/` 的 `assignment-list-truncated-before.txt`、`teacher-assignment-list-truncated-before.txt`、`teacher-assignment-list-page2-fixed.txt`、`student-assignment-list-page3-fixed.txt`、`assignment-pagination-before.log`。P1 其余专项仍在收口。


- **2026-10-17 剩余场景实测发现并修复公告消息入口**：以 `84a6fa6` 为基线，正式页面发布公告后，真实 `course_notice` 消息 `target=null` 只有标读按钮，不能进入公告。补按 `offeringId` 进入本班公告列表的入口，仅适用于课程公告且 UUID 合法，打开不标读，不改变服务端消息字段。回归先失败（找不到查看按钮），修复后前端 `verify` 22 文件/200 项、类型/构建/no-mock 全通过。真实学生消息点击已进入对应班公告列表。证据 `D:/tmp/lp/browser-p1/final-acceptance/notice-null-target-missing-entry.txt`、`notice-null-target-entry-fixed.txt` 和 `notice-entry-before.log`。其余专项仍在验收，本条不代表 P1 全量收口。


- **2026-10-17 Web 预览前端包**：Web 工作区增加手动预览/重置，SQL/文字无入口；无同源权限的 `sandbox=allow-scripts`，CSP 默认拒绝网络与框架，惯用本地文件引用由可信引导脚本组合，作品仅作为转义数据，清除 base/meta/嵌套框架/外部资源/导航属性；消息核对窗口、随机标识与白名单。Vite dev/preview 返回防嵌入头。前端 `npm run verify` 22 文件/198 项通过。真实浏览器执行作品探针，DOM 明确显示 `parent DOM:blocked | cookie:blocked | storage:blocked | fetch:blocked`，恶意 iframe/meta 未生成嵌套内容，重置移除预览；证据 `D:/tmp/lp/browser-p1/preview-isolation-dom.txt`。尚待后端 CSP 防嵌入头及最终恶意预览矩阵；不将预览成功视为自动验收通过，不宣称任意 JS 零外网或 CPU 配额。

- **2026-10-17 学习记录分页与 API 防嵌入包**：`getMyLearningRecords` 增加可选 `page/pageSize`（默认 `1/20`），后端使用既有反馈查询按 `published_at、id` 稳定倒序分页；`summary` 与 `recentFeedback` 仍覆盖全班公开评价，前端每页请求 10 条。同步 OpenAPI、示例、生成类型、客户端、mock 与分页 UI；真实 MySQL 用例构造 23 份评价验证三页无重复、空页和汇总稳定。API 安全链增加 `Content-Security-Policy: frame-ancestors 'none'`，并由 Spring Security 保持 `X-Frame-Options: DENY`。前端 `npm run verify`：22 文件、198 项通过；后端 HTTP 契约 22 项通过，`DashboardIntegrationIT` 23 项通过；契约校验 PASS（83 个业务操作、325 个 schema、96 个文档链接）。尚待正式浏览器验证 API 防嵌入响应头及最终 P1 矩阵；不整体标 verified。

## 3. 验证记录

<a id="verification"></a>

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

<a id="p1-browser-integration"></a>

### 3.4 P1 正式页面浏览器续验（2026-10-16，代码基点 `4e9abe1`）

**结论：P1 尚不能验收。** 本轮用户指派为继续前后端联调测试，因此只记录测试证据与定位，不修改前后端生产代码、契约或 `x-implementation-status`。正常路径与失败路径均使用真实 API，没有 mock 回退。静态/集成测试全通过不抵消下表的浏览器失败。

环境与数据：现有后端 8080、Vite 4173、本地 MySQL 3307/Flyway V9；浏览器分别用 `localhost:4173` 与 `127.0.0.1:4173` 保持教师和学生会话，均经同源代理。凭据仅在内存从 `backend/.env` 读取用于登录，未写入证据或 Git。新建独立验收教学班 `a7c51322-4426-48d9-8630-17e18078d56e`（浏览器联调-1016-P1）、章节 `caaba527-3ef5-4a9b-8c8d-c9c4cf5008c0`；开班、发章、邀请码、学生加入和确认阅读均通过页面完成。教师作业表单被阻断后，为继续验证下游，用真实 HTTP 建立并发布三类作业、过期作业及公告；这些准备步骤不算教师创建页面通过。临时脚本的部分夹具中文有编码损坏，按 UUID 验证，不将其误报为产品编码问题；未清除既有或本轮测试数据。

| 检查 | 实际结果 |
| --- | --- |
| `npm --prefix frontend run verify` | 类型检查、构建、`check:no-mock` PASS；17 个测试文件、170 个用例通过 |
| backend：`./mvnw.cmd --batch-mode verify` | 379 个单元/HTTP 测试 + 202 个真实 MySQL IT；0 failure/error/skipped，BUILD SUCCESS，耗时 4:29，20:38:57 +08:00 完成 |
| `.contract-venv/Scripts/python.exe scripts/validate_contract.py` | PASS；83 个业务操作 + 2 个健康检查、325 个 schema、29 个示例、41 个回归场景、93 个当前文档链接（本轮添加链接前） |
| 既有 HTTP 负例脚本 `D:/tmp/lp/s7.py` 安全重跑 | 30/30 PASS：未登录、角色越权、不可见对象、CSRF、坏 JSON/未知字段、无效邀请码、requestId 与退出失效；无 Origin/外域 Origin 均观察到 403。脚本末尾旧路径 `/me/learning-records` 的额外探测不计入通过项，真实学习记录路径已另按契约验证 |
| 浏览器动作后的 HTTP 读回 | 25 个 GET 全部 200；核对三类 workspace/提交快照、已发布评价/消息、dashboard/learningRecords/overview；Web revision 2 旧内容、SQL/Text revision 1；过期作业 revision 1 且 0 提交。另按前端请求重现无时区创建 422 `VALIDATION_ERROR`、完整草稿 PATCH 400 `INVALID_REQUEST`，前后草稿与作业列表相同（6→6），负例未写入 |
| 登录/导航/课程 | 教师与学生登录、切换账号、整页刷新恢复；开班→发章→邀请码→入班→确认阅读，刷新仍为已读；学生教师路由进入权限不足页；他班作业显示不可访问且无数据残留（requestId `8fec5188-80ec-4ac6-b51a-fec11cc5cd84`） |
| 三类工作区 | Web 的 HTML/CSS 切换保留内存修改；三类保存到服务端并提交，SQL/Text 在确认已保存后正常提交；Text 整页刷新恢复 revision 1。SQL/文字无执行入口。立即提交另见失败项 B1 |
| 双标签页 | SQL 两页从 revision 0 打开；第一页保存 `SELECT 101 AS tab_one_saved;` 成为 revision 1；第二页保存 `SELECT 202 AS tab_two_local;` 被拒，显示“工作区版本冲突，请刷新后重试。”且本地文本保留。无比较/恢复入口，未证明完整冲突恢复通过 |
| 批阅/反馈 | 经已知 submissionId 深链打开教师页；看到不可变文件快照；88 分总分与量规保存草稿，整页刷新恢复；独立学生会话看不到草稿；发布后教师只读、学生能看到 88 分及评语。消息发布可见；阅读后的已读缺陷见 B5 |
| P1-D 页面 | 首页两班、课程进度与待办；学习记录从空态变为 1 个实验、1 份公开评价，P2 掌握分析明确未开放；公告列表空态/详情及 assignment target 跳转；教师卡片反映学生 1、进行中作业 4、待批阅 2。SQL/Text 不计入“实验已完成”符合既定口径 |
| 归档/期限/文本安全 | 既有归档 Text 作业详情可读，工作区 textarea 与提交禁用；过期作业可练习保存，正式提交被服务端拒绝（B6）。标题/公告中的 img/script 探针未生成标题图片或设置 DOM 标记，反馈 Markdown 未执行探针；Web 沙箱因尚无实现而无法验收 |

浏览器复现与代码定位（B1、B2、B6 已在 `0292150` 修复代码，待浏览器复验；其余**均未修复**）：

| 编号 | 影响与可复现结果 | 定位/证据 |
| --- | --- | --- |
| B1 · 阻塞/丢作品 | Web 已保存到 revision 2 后，把 `BASELINE_V1` 改成 `LATEST_MUST_BE_SUBMITTED`，在 859ms 内完成打开提交、填写反思、确认。页面显示已提交，返回工作区仍为 revision 2/旧文本；教师提交快照同样只有 `BASELINE_V1`，最新编辑被取消且丢失 | `frontend/src/features/assignments/WorkspaceEditor.vue` 的 `submitAssignment()` 先 `cancelPending()`、直接提交 `lastSavedRevision`；`use-debounced-save.ts` 防抖时也未及时置待保存。提交 `5c996cf0-049b-4635-913a-10ce79cacb93`；证据 `04`、`08` 及 `readback-web-immediate.json` |
| B2 · 阻塞/丢作品 | Text 输入 `UNSAVED_ROUTE_CHANGE_MUST_WARN`，65ms 后点击“我的作业”，没有离开确认；重进工作区已回到模板，未保存文本丢失 | `WorkspaceEditor.vue` 卸载时取消待保存，没有路由离开/刷新保护 |
| B3 · 阻塞/教师创建与编辑失败 | 创建页按日期控件填写 `2026-10-23T22:00` 后保存提示参数不符合要求（requestId `509b1e71-3cc3-4bf7-92d6-b20c0d11c141`）；已有正常中文 Web 草稿仅改描述再保存提示未知字段（`d1da38e8-1e16-49d2-880d-82764fbbdac3`）；重开草稿的截止时间控件为空；按同样字段独立 HTTP 复现分别为 422 `VALIDATION_ERROR` 与 400 `INVALID_REQUEST` | `AssignmentEditor.vue` 原样发送 `datetime-local`，未转换契约 UTC；PATCH 发送完整对象并包含不允许的 `aiPolicyVersion`；后端 `AssignmentInput` 拒绝。证据 `01`、`07`、`final-http-audit.json`。创建页也没有 SQL/Text 类型、章节、模板与量规配置控件 |
| B4 · 阻塞/页面主链不完整 | 有待评后工作台会显示“去批阅”，但只进入作业列表；点作业只到编辑表单，没有学生提交列表或选择批阅入口。本轮批阅靠已知提交深链；学生作业详情也没有已提交作品/历史快照展示 | `AssignmentManagement.vue`、`AssignmentEditor.vue`、`AssignmentDetail.vue`；不能把深链页面可用等同完整教师操作链通过 |
| B5 · 一致性 | 学生刷新成功看到正式评价，或从新反馈消息“查看”进入评价后，回消息页仍为“未读”（14 条）；点击手动“标为已读”后才变 13 条，首页随后也显示 13 | `AssignmentDetail.vue`/`StudentFeedbackView.vue` 不按 `messageId` 显式标读；证据 `09`。代码另见消息只保留 assignmentId、丢指定 feedbackId，未制造旧评价场景复现 |
| B6 · 一致性 | 过期作业详情正确提示“提交窗口已关闭”，但进入工作区并练习保存后“提交作业”可点；确认后才显示同一拒绝原因（requestId `f60977bb-0ba9-4512-8923-b94cdf9a4bd0`） | `WorkspaceEditor.vue` 以 `canSave` 代替正式 `canSubmit`；证据 `06`；后端拒绝有效 |
| B7 · 未实现 | Web 工作区仅三个文本文件，没有“预览效果”、iframe、sandbox 或消息桥 | 无法执行 DEVELOPMENT §6/FRONTEND §8 的恶意预览隔离验收；不能标为通过 |
| B8 · 错误未呈现 | Web 尚有待评提交时点“归档”，仍留原列表，无原因或 requestId 提示 | `AssignmentManagement.vue` 没有渲染 `actions.error/message`；`use-debounced-save.ts` 冲突分支另外写成不存在的 `VERSION_CONFLICT`（`0292150` 已改为 `WORKSPACE_CONFLICT`），未实现暂停/比较/恢复流程 |

**B1/B2/B6 代码修复（`0292150`，2026-10-16，未经浏览器复验）**：`use-debounced-save.ts` 新增 `flush()`，调用 `scheduleSave` 即标记待保存；`WorkspaceEditor.vue` 提交前先 `flush()` 并等待服务端确认，保存失败或冲突则停止提交并在对话框提示；路由离开与切换到另一作业的工作区前先保存，失败时 `window.confirm` 让用户选择留下或放弃；退出登录或会话失效时丢弃待发送内容，不再用失效会话写入；保存目标固定为已加载的作业 id；正式提交资格改用 `getAssignment.canSubmit`，显示 `submissionBlockedReason`，`getAssignment` 失败时显示错误与 requestId。新增 `tests/workspace-editor.test.ts`（11 个组件用例）和 3 个 `flush` 单元用例；把两个源文件回退到修复前运行，新组件测试 9 个中 6 个失败（立即提交、保存失败不提交、离开先保存、失败后留下、`canSubmit=false`、`getAssignment` 失败），恢复后全过。`npm --prefix frontend run verify`：18 个测试文件、184 个用例通过，`check:no-mock` PASS。仍未做：离开确认是 `window.confirm`，不是 FRONTEND §124 的“等待保存/留在页面/放弃”三选一对话框；保存失败后没有重试入口，要再编辑一次才会重新保存；409 提示“请刷新后重试”会误导（刷新会丢本地修改），留给 B8 冲突流程；提交对话框显示的版本号是 `flush` 之前的值。

额外代码审查发现（**未构造 21 份评价做浏览器复现**）：`DashboardService` 固定返回最近 20 份评价，`LearningRecordsPage.vue` 按 `items.length` 本地切页，忽略更大的 `total`；超过 20 份的历史不可访问且无截断说明。契约没有分页请求参数，后续若扩分页须按 AGENTS 先确认契约/产品规则，不能自行加兼容字段。

本轮未完成：慢网络连续编辑与迟到响应、保存超时/断网后的结果核对、完整双标签冲突恢复、截止瞬间竞态、晚加入学生的旧公告浏览器场景、旧反馈身份跳转、完整预览安全矩阵、21 份以上评价历史。P2/P3 功能仍未实现；本轮不将这些场景写成通过。

证据均在本机 `D:/tmp/lp/browser-p1/`，不入库：`fixture.json`、`http-negative-s7.txt`、`fixture-readonly-check.json`；`evidence/` 下 `01-create-assignment-rejected.png`、`02-cross-offering-denied.png`、`03-archived-workspace-readonly.png`、`04-immediate-submit-lost-edit.png`、`05-two-tab-conflict.png`、`06-expired-submit-rejected.png`、`07-draft-patch-rejected.png`、`08-teacher-snapshot-old-content.png`、`09-feedback-still-unread.png`、`readback-web-immediate.json`、`final-http-audit.json`、`browser-observations.json`。这些是本机测试证据，不是可移植自动化测试。Maven 报告仍在 `backend/target/surefire-reports/`、`failsafe-reports/`。浏览器测试结束后两个会话均已退出；原有服务继续运行。文档变更后重跑契约校验 PASS（95 个当前文档链接），`git diff --check` 无错误。

工具链：Node v24.17.0/npm 11.13.0（低于仓库 24.21.0/11.19.0 基线，不等同 CI）；Java 21.0.11、Docker 29.3.1、Testcontainers MySQL 8.4.11。本轮自主决定：复用现有服务、增加独立虚构验收班、在教师表单阻断后用 HTTP 准备下游数据，并保留证据和数据供修复后复验。

### 3.5 P1-A 课程内容校验修复（2026-10-17）

已修复并补测课程内容与教学班接口的已知差异：章节摘要和资料正文允许空字符串；章节统计返回真实作业数量并按学生/教师可见性过滤；不存在的学期在创建教学班时返回 `422 VALIDATION_ERROR`；章节序号唯一键冲突转换为可理解的 `422 VALIDATION_ERROR`，避免数据库错误泄漏。新增集成回归覆盖空内容和重复序号。

| 检查 | 结果 |
| --- | --- |
| `./mvnw.cmd --batch-mode "-Dtest=CourseContentIntegrationIT" test` | PASS，8 项 |
| `./mvnw.cmd --batch-mode "-Dtest=OfferingIntegrationIT" test` | PASS，10 项（同批次执行） |

本包尚未完成最终全量 `verify` 与正式浏览器复验；预览安全、公告页面浏览器证据及 P1 验收矩阵仍按上文记录，未提升相关接口的 `verified` 状态。

2026-10-17 重启后端服务并复验真实 HTTP 响应：`GET http://127.0.0.1:8080/api/v1/auth/csrf-token` 返回 200，同时包含 `Content-Security-Policy: frame-ancestors 'none'` 与 `X-Frame-Options: DENY`。前端 4173 同端点响应也包含这两项。该结果证明防嵌入响应头已加载到当前服务进程；不等同于完整浏览器 P1 矩阵通过。

2026-10-17 继续验收基础检查：`npm --prefix frontend run verify` 通过（22 个测试文件、199 项测试，类型检查、构建及 no-mock 检查均通过）；`.contract-venv\\Scripts\\python.exe scripts/validate_contract.py` 通过（83 个业务操作、325 个 schema、29 个示例、41 个回归场景）。当前仓库没有 Playwright/Puppeteer 验收入口，Edge 进程未开放调试端口，因此本轮未新增真实浏览器动作证据，B3/B4/B5/B8 及并发、超时、跨账号场景仍不能标记为 `verified`。

### 3.6 P1 浏览器闭环验收记录（2026-10-17）

本轮采用用户手动操作 Edge、脚本即时 HTTP 读回的方式，证据保存在 `D:/tmp/lp/browser-p1/`，不入库。结果如下：

| 场景 | 结果 | 证据/说明 |
| --- | --- | --- |
| B3 教师创建与草稿恢复 | PASS | `B3-create-edit.json`；Web/SQL/文字模板、UTC 时间、量规总分和草稿状态读回一致 |
| B4 提交列表与批阅入口 | FAIL | `B4-submission-review.json`；提交列表、快照和入口可用，但 `getFeedbackDraft` GET 返回 405，requestId `req-2b9162d8-6776-4f50-b1fc-62b9fdaf28c9`，响应 `Allow: POST` |
| B5 反馈跳转与标读 | PASS | `B5-feedback-message-final.json`；4 个 feedbackId 可读，最新 messageId 已标读，未读数 18→14 |
| B8 冲突/恢复最终状态 | PASS（页面结果由用户确认） | `B8-conflict-recovery-final.json`；三个工作区读回 200，revision 为 3/2/1，提交历史可读 |
| 学习记录超过 20 条分页 | BLOCKED | `pagination.json`；当前夹具只有 3 条和 1 条评价，未达到超过 20 条的前置条件 |
| 公告列表与 target | PASS | `pagination.json`；教师和学生列表均 200，target 属于当前教学班 |
| 标题/公告/预览隔离 | PASS（页面结果由用户确认） | 用户确认恶意探针未执行，预览不能读父页面、Cookie、存储或 API，重置成功 |

最终自动化检查：前端 `verify` 通过（22 个测试文件、199 项）；后端 Maven `verify` 通过（380 个单元/HTTP、205 个集成测试）；契约校验通过（83 个业务操作、325 个 schema）。由于 B4 为 FAIL、历史分页为 BLOCKED，P1 仍不能整体标记 `verified`。

### 3.7 B4 修复后复验与验收收口（2026-10-17）

本轮按用户指示修复明确的 B4 接口缺失；证据不足但没有观察到产品失败的项目按“接受通过”记录，并保留覆盖范围说明。

| 检查 | 结果 | 证据/说明 |
| --- | --- | --- |
| B4 教师评价草稿读取 | PASS | 新增 `GET /api/v1/teacher/submissions/{submissionId}/feedback`；原失败提交真实返回 200，`feedback` 与 `baseVersion` 正确。证据 `D:/tmp/lp/browser-p1/B4-get-feedback-draft-retest.json`，requestId `b4-retest-get` |
| B4 空草稿、草稿恢复、已发布读取、越权 | PASS | `AssignmentIntegrationIT.getFeedbackDraftReturnsEmptyThenCurrentTeacherFeedback` |
| B4 HTTP 契约与状态同步 | PASS | `AssignmentHttpContractTest` 已纳入 `getFeedbackDraft`；OpenAPI 状态从 `planned` 更新为 `implemented` |
| 历史分页超过 20 条 | PASS（接受证据缺口） | 当前真实夹具仍为 3/1 条评价；分页 200、页码和汇总稳定。按本次指示接受通过，不宣称已用超过 20 条真实数据完成浏览器翻页 |
| 隔离与预览探针 | PASS（复用既有证据） | 复用 `preview-isolation-dom.txt` 与用户已确认的页面结果；本轮未重复执行恶意探针，仅确认重置结果 |
| 公告归档只读、慢网络/超时/会话失效专项 | PASS（接受证据缺口） | 本轮未新增专项浏览器证据；按本次指示接受通过，后续若继续演练仍需单独补证 |

本轮检查结果：前端 `npm run verify` 仍为 22 个测试文件、199 项；后端定向测试 151 项全部通过；后端全量 `./mvnw.cmd --batch-mode verify` 为 384 个单元/HTTP、206 个集成测试，`BUILD SUCCESS`；契约校验为 83 个业务操作、325 个 schema、96 个文档链接。实现提交：`41d2a92`。基于本轮规则，P1 主链路验收判定通过；`x-implementation-status` 仅将实际新增并复验的 `getFeedbackDraft` 标为 `implemented`，未因接受证据缺口批量提升其他状态。

### 3.8 P1 剩余场景真实复验与闭环验收（2026-10-17）

**结论：本轮 P1 闭环实测通过。** 基线为 `84a6fa6`，浏览器工具直接操作正式页面，教师 `localhost:4173` 与学生 `127.0.0.1:4173` 保持独立会话，经真实代理、后端 8080 与本地 MySQL V9。§3.7 的“接受证据缺口”不作为本轮通过依据；下列项目具有本轮页面与 HTTP 证据。修复包分别提交 `3aeac57`、`b436dd6`，未推送远端。

证据根目录：`D:/tmp/lp/browser-p1/final-acceptance/`（本机、不入库）；`evidence-audit.json` 自动核对页面条目、关键状态、代理请求顺序与凭据脱敏。截图工具两次捕获失败，没有声称取得截图；页面 DOM、请求 requestId、读回结果与检查日志已保存。

| 场景 | 实际结果与关键证据 |
| --- | --- |
| 三类作业页面主链 | PASS。独立班通过教师页面创建 Web/SQL/文字，填写 UTC 转换所需的本地截止和模板，草稿刷新恢复；学生通过页面保存、提交，教师通过工作台/作业/提交选择进入批阅并发布 92/93/94 分评价。`main-and-pagination-readback.json`、`B4-three-types-published-readback.json`。SQL/文字页面无执行或预览入口。 |
| B4 空草稿、刷新恢复、隔离与发布只读 | PASS。新 Web 提交默认空草稿；保存后整页刷新恢复评论/92 分/量规；学生发布前不可见，发布后教师不可编辑。`B4-empty-draft.txt`、`B4-draft-restored.txt`、`B4-student-draft-hidden.txt`、`B4-published-readonly.txt`。教师草稿 GET 对未批阅提交真实返回 `{feedback:null,baseVersion:0}`（`B4-empty-draft-get-real.json`），对三个新提交真实返回已发布版本 200；接口状态仍保守保持 implemented，不把单独 HTTP 读回当成该 GET 的前端接入证据。 |
| 指定评价与已读一致性 | PASS。消息进入文字评价时 URL 保留 feedbackId，作品、反思、94 分一致，消息未读 66→65。另注入评价 GET 失败，消息保持未读；显示成功后注入标读 PUT 失败，页面出现重试入口，点击后实际读回 readAt 非 null。`B5-feedback-visible-read.txt`、`feedback-failure-unread-before.json`、`feedback-failure-unread-after.json`、`feedback-mark-read-failed.txt`、`feedback-mark-read-retry-success.txt`。 |
| 超过 20 份评价 | PASS。独立分页班通过真实接口准备 23 份已发布评价，正式页面三页条数为 10/10/3，23 个 ID 与夹具完全一致且无重复；汇总与最近评价跨页相同，第三页刷新保留页码。`pagination-three-pages.json`、`pagination-refresh-page3.txt`、`main-and-pagination-readback.json`。HTTP 准备夹具不计为教师页面创建证据。 |
| 教师提交分页与筛选 | PASS。同一作业 21 次提交，默认每人最新提交仅 1 条，取消筛选后为 20/1 两页；真实草稿筛选显示草稿，发布后 published 筛选显示该提交、none 筛选为空。`teacher-latest-only.txt`、`teacher-submission-page1.txt`、`teacher-submission-page2.txt`、`teacher-filter-draft.txt`、`teacher-filter-published.txt`、`teacher-filter-none-empty.txt`。 |
| 学生历史与不可变快照 | PASS。21 次提交按 10/10/1 翻页，可选择第 1 次作品及对应反思；工作区练习到 revision 22 后，最新正式提交仍为 revision 21、内容 P1_HISTORY_21。Web 练习替换为预览探针后，正式作品仍为 revision 1。`student-history-page1.txt`、`student-history-page2.txt`、`student-history-old-snapshot.txt`、`history-snapshot-after-practice22.txt`、`web-immutable-after-practice.txt`。 |
| 慢网络连续编辑、立即提交与冻结 | PASS。延迟首笔保存响应期间继续输入 B 并确认提交，提交等待保存，文件/反思控件冻结，最终提交 revision 6 为 B，旧响应未覆盖新编辑。`slow-submit-frozen.txt`、`slow-submit-latest-result.txt`、`fault-requests.jsonl`。 |
| 保存未落库与提交保护 | PASS。专用代理在转发前断开一次 PUT，页面保留本地文件并明确停止提交；读取服务端后重试成功。`save-failure-blocked-submit.txt`；代理日志证明该次请求 forwarded=false，未生成对应提交。 |
| 保存结果未知与定时超时 | PASS。一次保存已落库后丢弃响应，恢复先 GET 核对 revision 7。另一次已保存 revision 8 后等待 5000ms 断开，页面保留内容，恢复确认 revision 8，没有第二次 PUT。`save-response-lost.txt`、`timed-timeout-inflight.txt`、`timed-timeout-local-retained.txt`、`timed-timeout-recovered-without-replay.txt`、`fault-requests.jsonl`。这是测试代理计时断开，不声称前端具有独立的请求计时器。 |
| 提交响应丢失的幂等重试 | PASS。revision 7 的首次提交返回在代理丢失，页面重试同 revision 得到原提交；读回历史只有一份 revision 7。`submit-response-lost.txt`、`submit-retry-idempotent.txt`、`final-http-assertions.json`。 |
| 双标签冲突与离开选择 | PASS。409 不静默覆盖；比较后恢复服务端、另一次手工合并保存 revision 3 均通过。等待冲突保存保持对话框，留在页面保留内容，放弃修改离开不写入；普通保存失败后选择等待保存，先读回重试成功再离开。`conflict-comparison.txt`、`conflict-merged.txt`、`leave-save-failure-dialog.txt`、`leave-wait-save-success.txt`。 |
| 慢网络切页与迟到响应 | PASS。A 保存响应延迟期间编辑 B 并切页，页面等待两个保存串行完成再离开；重新进入 revision 11 为最新 B。`slow-route-awaiting-save.txt`、`slow-route-left-after-save.txt`、`slow-route-reopened-latest.txt`。 |
| 会话失效、同账号恢复、换号和退出 | PASS。另一标签真实退出使会话失效，编辑触发真实 401；同账号登录后显示服务端与本地比较，明确保存到 revision 2。再次失效后换教师账号拒绝学生入口，换回学生不恢复旧临时内容；主动退出后同账号登录也不恢复未保存文件。`session-same-user-restored.txt`、`session-after-account-switch.txt`、`session-active-logout-cleared.txt`。 |
| 截止竞态 | PASS。截止前保存并打开提交框，实际截止后确认得到拒绝；提交历史仍为 0，截止后练习保存到 revision 2，刷新后提交按钮禁用。`deadline-change.json`、`deadline-race-rejected.txt`、`deadline-practice-readonly-submit.txt`、`final-http-assertions.json`。已发布作业缩短期限被 409 拒绝符合既有规则，没有为夹具修改业务规则。 |
| 公告、目标、晚入班和归档 | PASS。教师页面发布课程/章节/资料/作业四类目标，学生详情与目标跳转正确；空 target 消息修复后进入本班公告列表且不自动标读。独立班先发公告再入班，学生可读旧公告；教师页面归档后公告发布禁用、历史可读，学生工作区只读；真实公告 POST、工作区 PUT、提交 POST 均 409，历史内容不变。`teacher-notices-four-targets.txt`、`notice-null-target-entry-fixed.txt`、`notice-chapter-target.txt`、`notice-resource-target.txt`、`notice-late-join-readable.txt`、`notice-archived-teacher-readonly.txt`、`archived-student-workspace.txt`。 |
| 操作失败反馈与新增列表缺陷 | PASS（修复后）。未批阅作业归档失败显示原因与 requestId，列表/HTTP 读回仍为 published。新增两项实际缺陷分别为公告消息无入口和两端作业列表固定前 20 项，已先写失败回归再修复。`archive-failure-visible-unchanged.txt`、`course-validation-and-final-state.json`、两包接手记录及失败日志。 |
| 权限隔离 | PASS。同班另一虚构学生与他班均准备真实私有提交/评价；当前学生 HTTP 读取他人提交/评价、他班作业/工作区均 404，页面显示无权访问且不泄漏他人内容。`archive-isolation-fixture.json`、`other-student-feedback-denied.txt`、`foreign-assignment-denied.txt`。既有认证/权限/CSRF/Origin 负例重跑 30/30 通过，额外无 Origin/外域 Origin 观察仍为 403；旧路径的额外探测不计通过项。 |
| 标题、公告、评论与预览隔离 | PASS（按实际探针范围）。恶意公告/评论未生成 img/script/svg 或 javascript 链接，父页面 DOM 标记为空。真实 iframe 仅 allow-scripts；探针显示父 DOM/Cookie/storage/顶层导航/API fetch 被阻止、嵌套框架和危险 URL 为 0、闭合脚本标签作为数据保留；伪造消息没有生成错误提示，重置移除 iframe。`comment-xss-dom-check.json`、`notice-xss-dom-check.json`、`preview-security-probes.txt`、`preview-parent-dom.json`、`preview-reset.txt`。 |
| 平台防嵌入与 P1-A 校验 | PASS。当前 4173 页面/API 及 8080 API 响应真实包含 frame-ancestors 'none' 和 DENY；未声称另外搭建第三方站点做嵌入页面验收。空摘要章节/空正文资料通过页面保存；无效学期/重复章节号真实返回 422，学生/教师章节作业计数均为 1。`final-http-assertions.json`、`course-validation-and-final-state.json`。 |
| 原有幂等和版本规则 | PASS。已归档的既有作品同 revision 重提返回原提交；评价以当前发布版本的前一版本重放得到原评价、版本不增加，过旧 baseVersion=0 为 409。`final-http-assertions.json`。不把所有旧版本重放都说成幂等成功，不改既有规则。 |

检查结果：前端 `npm --prefix frontend run verify` 为 **22 文件/202 项**，类型检查、构建、no-mock 全通过；后端 `./mvnw.cmd --batch-mode verify` 为 **384 个单元/HTTP + 206 个 MySQL IT**，0 failure/error/skipped、BUILD SUCCESS；HTTP 负例 **30/30**；契约校验 **83 个业务 + 2 个健康操作、325 个 schema、29 个示例、41 个回归场景、96 个文档链接**通过。类型重新生成无结构差异；状态变更后的 `ImplementationStatusContractTest` 5 项全部通过、BUILD SUCCESS。环境已恢复为 4173 直接代理 8080，故障代理 8081 已停止；页面、CSRF API、后端 ready 均真实返回 200，见 `restored-environment.json`。

本轮仅将具有对应正式页面与读回证据的 `getMyLearningRecords`、`listMyAssignments`、`listTeacherAssignments`、`listTeacherSubmissions`、`createNotice` 五项提升为 verified；其余状态保持原值。状态定义仍以 OpenAPI 为准，不因总体验收通过批量提升全部 P1 操作。

自主采用的测试准备：页面创建主验收班 `6206d4db-c218-4a60-bc38-8e1d37f37a20`；接口准备分页班 `eb12fca9-5db5-44ec-a249-f81a64c95825`、21 次提交、仅归档测试班 `f66a826f-af6a-4ab0-af3f-39eb8a49e050` 及另一虚构学生。另一学生仅在本地测试库新增，用于证明同班他人作品隔离，既有账号/凭据不变；没有删除旧数据。故障脚本/控制文件位于本机临时目录，保留真实上游业务处理、Cookie/Origin/CSRF，不修改生产接口或安全规则。自动审批曾拦截额外代理扩展命令，随后只添加计时规则并核对进程身份，安全完成超时场景；没有部署额外嵌入页面。

范围限制：证据为当前本机环境与列出的真实探针，不宣称任意 JS 零外网、CPU/内存配额或生产部署全面安全审计；AI、知识分析、自动判题、成绩更正及知识点快照冻结仍按既定 P2/P3 处理。截图不可用已经明确记录，不用未执行场景替代实测结果。

## 4. 已知限制

以下竞态在课程演示规模下发生概率极低，按设计不加防护；如果出现，在此记录现象再决定是否补强。

| 场景 | 可能结果 | 为何接受 |
| --- | --- | --- |
| 教学班/作业归档与学生提交 | 已修复：生命周期锁串行协调、重读状态、教学班待批阅检查 | 2026-11-07 四组真实 MySQL 并发测试通过，不再作为接受的竞态 |
| 写入校验通过后教学班恰好被归档 | 该次草稿保存或位置更新落在归档之后 | 不公开任何草稿，后续请求一律拒绝 |
| 同一学生并发发起多个 AI 请求（不同作业） | 每日/每分钟预算偶发超出 1 次 | 预算是用量保护，不是计费；在途唯一约束仍阻止同作业并发 |
| AI 请求已完成但响应丢失，客户端重新发送 | 新建一次请求，多计一次预算 | 删除通用幂等键后的代价，用户可见且无数据错误 |
| 死锁或锁等待超时 | 返回服务端错误，用户手动重试 | 无全局锁顺序，但保留的行锁只有 submission 一处，死锁面很小 |


## 5. 2026-10-18 知学迁移交付记录

- 本次修订 §0：将代码基线及四包状态改为实际交付状态，依据是下列检查输出与真实浏览器记录；未改后端、OpenAPI 或契约状态。
- 工作包提交：文档约定 c3354df；公共框架 7b4e843；学生页面 77173fb；教师批阅 bae06b7；日历及真实主流程 dd879e3。
- `npm --prefix frontend run verify`：类型检查、生产构建、生产包无 mock 检查通过；24 个文件 / 213 项测试通过。`scripts/validate_contract.py` 通过。后端 Maven 本轮未重跑。
- `npm --prefix frontend run test:browser:real`：Edge + 本地真实 API/MySQL，开班、发布章节、学生入班阅读、Web/SQL/文字保存并立即提交、草稿隔离、发布反馈及学生刷新查看 PASS。
- `npm --prefix frontend run test:browser:boundaries`：真实双窗口冲突与合并、客户端延迟/中断、预览隔离、真实会话换用户、归档只读、跨班拒绝 PASS。检查 1440/1024/390 的页面溢出和手机导航 Esc；截图在忽略的 `.cache/zhixue/`，结果为 result.json 与 boundaries.json。验收助手曾因遗漏归档接口必需空JSON请求体返回400，修正脚本后全程通过，未更改接口。
- 真实验收教学班：77871924-56af-462d-94a5-9ce164419ac1。独立命名的验收数据保留在本地数据库，未清空原有记录；文字作业已归档用于只读验收。
- 自行决定：复用原有 Vue 状态/保存控制器；采用共享分页聚合并拒绝缺失 total；浏览器检查使用已安装 Edge，不下载浏览器。未引入 React 运行时或原型样例数据库。
- 限制：实际 Node24.17.0/npm11.13.0 低于约定 Node24.21/npm11.19，不声称与CI环境等价。管理员管理、排课、AI与未开放分析不在范围；多份跨页队列/失败分支有自动测试，真实浏览器本次使用单份提交验证发布完成。既有历史样例部分标题编码异常未改数据。无后端变更，无推送。


## 6. 2026-10-19 学生端任务工作台优化

- 修订 §0：记录本轮任务、优化前基线与实际检查数量，依据为工作区差异、前端命令输出和真实浏览器结果。此前迁移记录保留为历史。
- 首页：服务端看板保留统计口径；额外完整读取待办、课程，依截止顺序读取候选详情，只选 canSubmit=true 的任务作为主操作。显示3–5项近期可操作任务（不足时按真实数量），最近两门课程；数据概览移到最后。候选读取失败保留重试，不显示成功空态。没有可操作任务时进入最近课程或课程列表。
- 作业：默认待完成（排除归档历史），提供已提交/已批改/全部、课程与截止排序；完整分页集合上筛选后每页20项，URL保存筛选/排序/页码。当前页详情确认资格，失败保留查看详情；已截止与处理状态分开，补交必须服务端确认。归档数据保留在全部视图。
- 课程/记录：全量课程按lastStudiedAt排序，双列/单列卡片、两行标题和完成后查看课程；记录默认最近课程，选择器切换，真实章节明细与最近阅读时间；现有评价分页保持。未提供学习时长不估算；章节阅读与作业进度单位不混用。
- 消息/日历/导航：消息使用正式read/type筛选，紧凑列表、未读点+文字、明确查看入口及完整正文展开；打开关联入口后显式标读，不聚合不同记录。日历沿用两项溢出/月周/手机日期条，补充处理状态和320宽度文字修正。学生手机底部四主入口与更多菜单，Esc关闭，页面底部保留导航空间。
- 实际检查：`npm --prefix frontend run verify` 类型/构建/生产无mock检查通过；25文件221测试通过。新增资格/补交/归档、状态筛选、截止边界、最近学习排序及组合筛选清页、消息正式参数断言。旧布局断言与缺少total/小写状态的测试样例改为真实契约形式。
- `npm --prefix frontend run test:browser:student` PASS：Edge使用现有真实API/MySQL数据（49项作业、79条未读、多门课程），默认待办、分页与筛选清页、未读筛选、手机更多Esc及六页面1440/1024/320/375/430无页面横向溢出、无浏览器异常。30张截图与result.json在忽略的frontend/.cache/student-workbench/；已人工查看首页桌面/375、作业1440/1024/320、记录430、消息375、日历320及课程1440。只读检查未新增或清理业务记录。
- 自行决定：资格缺失时用查看详情，不假设允许补交；归档待办在全部中保留；首页课程缩至最近两门；窄屏表格重排时保留课程字段。采用既有图标/字体/token，无新依赖。
- 未完成/限制：历史损坏标题与验收数据尚未整理，本轮不改写或掩盖原文；真实学生的3秒任务测试、受试者灰度识别实验尚未组织，自动与截图检查不能替代。无学习时长字段不展示时长；没有新增课表事件。多课程/作业完整读取及详情查询带来额外请求，未进行大规模性能压测。Node24.17.0/npm11.13.0低于项目约定，本轮不宣称与CI等价；后端Maven和先前三类工作区写入流程本轮未重跑。未推送。

- 本轮实现提交：`0006259`。提交后将 §0 基线更新为实际存在的实现提交；依据为 Git 提交结果和上述检查。


## 7. 2026-10-19 首页 V3 视觉探索（待用户选择）

- 本次修订 §0：任务切换为完成A/B预览并等待选择，检查数量按实际输出改为225；不改之前的历史验收记录，不宣称全站V3已完成。
- 保留StudentHomePage正式模板，仅增加比较入口；use-student-home.ts抽取原有看板、完整待办/课程、资格筛选和最近课程状态供三个视图使用。query参数design=a/b只改变展示，切换无额外API请求，不重新选择任务；未知参数回原首页。其他学生页面布局未改。
- HomeExploration.vue + home-exploration.css：A连续版面、跨栏核心任务、独立大日期、无框任务和反馈边栏；B深蓝任务焦点、白主按钮、上半区课程轨迹、下方日期序列与轻量反馈。内容与功能一致，日期/mark/进度/反馈分数均取真实字段，不新造学习时长等指标。
- 登录返回地址仅增加固定/student/home?design=a或b的白名单，保留原角色守卫；额外参数/外域继续拒绝，教师仍无学生页权限。直接打开方案A后真实登录可恢复A；不放开通用return查询。
- `npm --prefix frontend run verify`：类型/生产构建/无mock检查通过，25文件225测试通过。新断言覆盖A/B与原首页共用查询及同一任务/课程、无可提交任务与无反馈/公告空态、非法方案回原版、固定预览登录恢复及教师拒绝。
- `npm --prefix frontend run test:browser:home-design`：Edge真实前后端PASS；A/B主任务/近期任务/课程/统计一致，切换零额外请求；真实主任务canSubmit=true、跳转与返回原首页可用；1440/1024/320/375/390/430两套页面无横向溢出，390高900主按钮在首屏可见。脚本不写业务数据；仅登录，未改数据库记录。
- 实际查看A/B桌面1440和手机390、B320及对比报告截图。发现并修复日期后缀挤成两行、B白色按钮被旧样式覆盖、手机预览工具条占高；最后浏览器检查PASS。截图与result.json位于忽略的frontend/.cache/home-exploration/。四张交付截图（两方案桌面1440/手机390）和自包含对比HTML另存本会话outputs/home-v3-exploration；报告图片加载及桌面/手机切换均浏览器检查通过。
- 主要文件：StudentHomePage.vue、HomeExploration.vue、use-student-home.ts、home-exploration.css；router.ts仅固定预览回跳；p1d-ui/router测试、浏览器脚本、README及DESIGN记录。无新依赖、无后端/契约/数据库变更。
- 设计建议偏向B：首页任务焦点与课程轨迹更明确，A更适合连续阅读与密集列表。这是设计判断，不是用户实验结果；原首页仍默认，等待用户决定，不继续全站实施。
- 限制：真实受试者3秒测试尚未组织；无任务/无反馈场景为单元测试，真实截图使用现有业务记录与长验收名称；历史原文数据未改。Node/npm仍低于仓库约定，不声称CI等价；未重跑三类工作区写入闭环或后端Maven。本地提交，未推送。

- 本轮首页探索实现提交：`25ac4b6`。§0基线据实际提交更新；原版/A/B入口及截图访问方式见frontend/README，用户尚未选定最终方案。


## 8. 2026-10-19 B+首页视觉精修（候选，待确认）

- 修订 §0：当前任务改为B+候选完成并等待确认，测试数量改为实际26文件237项；代码基线提交后同步。不把B+当成正式首页或全站V3完成。
- 复用HomeExploration与useStudentHome，B+继承B深蓝/白主按钮；核心任务去重复时间标签与完整日期重复行，桌面日期置右、手机置操作之前。主显示精确到分钟，原时刻保留在time属性与完整北京时间提示；分组仍按原截止瞬时，不改提交窗口。
- 近期任务按相同真实时刻分组（等价时区同组），组内作业独立；日期、剩余时间只显示一次。取消待办、课程、反馈/公告外框和背景，用A的分隔线；左右栏独立排布，防止右栏课程撑开主栏空白。手机重排为任务/近期任务/课程/反馈/公告/概览。
- 最近课程仅一门，B+额外读取该门课程既有listChapters；真实已开放章节未读→继续学习，全部已读→复习章节，空/未知/失败→查看课程并可重试。只表示已开放章节阅读完成，不推断整门课程结课，不按摘要作业100%虚构下一章。A/B与正式页面进度逻辑不改。
- 正常/student/home隐藏探索控件；原版比较用design=current。四版本可互切，B+切换器默认收起。仅扩展固定bplus/current登录返回白名单，不放开任意查询、不改角色守卫。共享TaskStatus新增默认开启的日期展示开关，其他页面默认表现不变。
- `npm --prefix frontend run verify`：类型、生产构建、生产无mock检查通过；26文件237测试通过。新增日期分组/稳定排序/等价时区/跨年/真实阅读语义，B+分组独立入口、单课程、完成/未读/未知/空章节、章节503与重试、空任务课程反馈公告、正常首页隐藏探索条等断言。
- `npm --prefix frontend run test:browser:home-bplus` PASS：Edge真实接口登录恢复B+，主任务canSubmit=true、键盘Enter进入真实作业；4项近期任务归2个截止组；最近课程真实1/1已读，链接为复习章节。核心看板/待办切换不重读，B+仅补读最近课程章节。正常记录无写入（仅认证登录）。
- 1440/1024/320/375/390/430真实截图无横向溢出。四种手机宽度下主按钮均在底部导航上方；滚动0/50%/100%检查导航纵坐标稳定，任务/课程/概览入口滚到可见区域后经elementFromPoint命中检查。390×844主按钮底缘592px，导航顶缘783px；不是凭整页截图判断定位。
- 同数据测量：桌面1440焦点B 459.6px→B+264.4px；手机390 B477.1px→B+319.7px。实际短标题/横向排布下缩幅超过15–20%参考，不人为填高以凑比例；字号、主操作尺寸和信息均保留，长标题高度自然增加。已人工看1440/1024、320/390、核心细节和滚动截图。
- `test:browser:home-design` A/B回归PASS；原版、A、B仍可比较，未删除。截图/测量位于忽略的frontend/.cache/home-bplus；交付截图（B+桌面、390手机、核心细节、B基线和320滚动）及自包含对比报告另存本会话outputs/home-bplus，含七维比较与分区说明。
- 主要文件：HomeExploration.vue、StudentHomePage.vue、home-bplus.css、bplus-presentation.ts、TaskStatus.vue日期开关、router固定参数、相关测试/浏览器脚本及README/DESIGN。无新依赖，无后端、OpenAPI、数据库或其他页面业务布局变更。
- 已实现但未以真实账户复现：无任务/课程/反馈公告、未知进度、无章节、章节503、跨年日期，以上有自动测试；未写入假数据制造截图，未重跑阅读标记和三类工作区完整写入流程。
- 尚未解决/边界：历史验收名称与损坏原文未清理，真实学生3秒可用性研究未组织；Node24.17.0/npm11.13.0仍低于约定，不宣称CI等价。未将B+设为默认，停止后等待用户确认；未推送。

- B+实现提交：`2296e07`。§0据实际存在的实现提交同步基线；对比报告图片与尺寸切换经浏览器验证，等待用户确认，不继续全站改版。

## 9. 学生端 V3.0（2026-10-19）

用户正式选择B+；按首页→课程/记录→作业/日历/消息→综合验收顺序完成并提交。默认首页B+，探索代码保留。仅学生作用域样式，未改接口、后端、数据库和教师布局。
最终verify：26文件238项；B+真实六视口脚本PASS；全站36视口、筛选/手机日期/更多Esc、隔离夹具PASS；validate_contract PASS。已查看六页1440/390及边界截图。章节按已发布顺序，未知阅读状态不推断未读。
截图与JSON位于frontend/.cache/student-v3（本地忽略），交付报告frontend/V3-DELIVERY.md。无真实学生可用性实验、真机与全量对比度证据；其余页未制作同数据完整改前截图。Node24.17.0/npm11.13.0低于锁定版本，不视为CI证据；本轮未重跑后端。

## 10. 学生端 V3.1 局部精修（2026-10-19）

以4fefad4为回退点，按问题确认→P0→P1→P2→综合验收推进。5836ce7全量待办资格排序后分页；f0c52ee课程/记录/消息去重与完整阅读；519eeaf日历空日期入口、窄屏与边界收尾。保持首页和教师布局，不改后端/数据库/契约/权限。
verify26文件245项PASS；最后夹具枚举修订后相关2文件47项PASS；契约静态校验PASS；真实六页36视口及旧边界脚本PASS；同数据before/after各36截图、固定导航上中下/末项命中、320键盘全文与日期跳转PASS。重点作业文字20样本对比度最小5.39:1。390首张课程486.84→322.97px，首条消息233.52→217.52px；待办总数7不变。105待办跨2API页排序、补交、不可提交、同截止跨课程、无可操作、资格失败、ID去重有回归。
截图/冻结GET响应/测量在frontend/.cache/student-v31（本地忽略），报告frontend/V3.1-DELIVERY.md。冻结响应只用于同数据视觉比较，真实接口另外复跑；未做真实写操作、真机、学生实验、屏幕阅读器、200%缩放及全量对比度审计。资格多GET、最多6并发；正式提交仍由原服务端复核。工具链低于锁定版本，不作为远端CI证据。

## 11. 学生端 V3.2 设计质量精修（2026-10-19）

c4bc273为回退基线。先保存真实36视口与局部对比并写审计，edf3d90完成课程进度/标识、880px记录阅读与对齐、真实裁切消息；4dd2d3e完成B+浅色焦点、作业标签层级、日历细节及120ms状态反馈。仅学生展示，TaskStatus只加语义样式类，教师无视觉改版。
26文件245项/类型/构建/no-mock PASS；before/after各36视口，真实B+与全站脚本PASS；隔离长任务、24章/无章、无记录、空页、消息跨尺寸/展开/焦点连续性、加载/失败重试PASS。139个渲染样本最小5.39:1。390px内容200%字体与表单放大、720CSSpx/DPR2等效重排均六页通过，无溢出且末项可达；不声称浏览器工具栏实际缩放。reduce无过渡，no-preference120ms无位移动画。
当前12图：frontend/.cache/student-v32/current；同条件对比/局部/JSON：frontend/.cache/student-v32/index.html。报告frontend/V3.2-DELIVERY.md。未验证真机/其他浏览器/屏幕阅读器/真实学生实验及全站逐控件审计。保留已知前后端限制；无业务数据写入（除登录会话），不修改契约、后端或教师布局。工具链仍低于锁定版本，不声称远端CI。


## 12. 学生端 V3.3 高校场景隔离演示（2026-10-19）

- 实现：c70dad4，独立4174开发配置/HTML入口与内存传输，8课程/23开放章节/18作业/16消息/4评价。固定北京时钟，真实端404、预览API503、构建拒绝；正式数据与原mock夹具未改。
- 检查：verify 27文件253项；130响应schema格式检查；六页面36视口与场景补充、1440/390各A–F六条流程和返回状态通过；真实API请求与浏览器错误均0。原V3.2主流程、长标题/空态/重排等边界通过。契约静态检查与diff空白检查通过。
- 内容核对：纠正SQL答疑晚于截止的演示时间矛盾，不改正式规则；保留补交优先的既有推荐排序，等待学生验证。
- 交付：frontend/V3.3-DELIVERY.md、frontend/V3.3-STUDENT-TEST.md、.cache/student-v33/index.html及current内12张当前版本截图。测试模板未填写任何成功率、耗时或满意度。
- 限制：本地内存模拟不能证明真实后端权限/事务/数据库/并发；未做真实学生、手机真机、屏幕阅读器测试，未复跑Maven；Node/npm低于固定基线。回退无需数据库操作，见交付报告。
- §0基线推进至已存在c70dad4，依据最终253项、130契约响应与模拟浏览器结果，不提升任何接口implementation-status。


## 13. 学生端 V3.4 独立视觉探索候选（2026-10-19）

- 实现提交3322d69。概念为“学习的形状”：学科索引、真实章节路径、截止密度。只在campus.html?explore=v34中装配课程、记录和学生日历候选，visual=v33/v34保留业务内存、课程筛选与日期/课程选择；正常V3.3与正式生产仍是原页面。
- 先查看V3.3六张基础图，再实现记录样板并审阅桌面/手机，随后扩展课程与日历。修正手机概览过高、图形被span规则隐藏、版本参数替换历史导致后退跳页、零章0/0及空日称“今天”等问题。未改V3.3夹具、适配器、后端、契约或教师页。
- 检查：27文件253测试、类型/构建/无mock通过，生产CSS/JS产物名与V3.3一致；46条浏览器检查记录含两版本三页六宽度36组合、阅读/复习/评价/日历/返回、键盘与手机更多导航、200%文字及720CSSpx重排。长课程/12长章节、单/零章、加载/错误边界通过；168文字样本最小5.04:1，真实API请求与浏览器错误0。
- V3.3六页36视口、12模拟流程、130响应契约和生产隔离门禁复验通过；契约静态检查通过。正式生产页面与API状态未变。
- 交付：frontend/V3.4-DELIVERY.md、frontend/DESIGN.md候选规则；.cache/student-v34/comparison仅12张1440/390同状态对照，details为局部/边界；根目录临时截图_V3.4对比仅18张中文分组图。测试和源代码已提交，截图缓存/用户临时文件不入Git。
- 390px第一课程卡实测344.41→317.13px，只是该场景高度变化，不等同于任务速度提升。未做真实学生/真机/屏幕阅读器验证；不宣称全站无障碍或后端联调通过。等待用户确认，不推广到其他页面。
- §0基线推进至已存在3322d69，依据上述检查；此基线包含独立候选，不意味着视觉正式采纳。

### 2026-10-26 审计分支合并前复核

- 范围：`review/comprehensive-audit` 合入本地 `master`；联网执行 `git fetch --prune origin` 后，远端 master 仍为 `cd62169`，当前分支领先 3 个提交、无分叉，工作区干净。远端已删除的 `codex/p2-backend-acceptance` 跟踪引用已清理。
- 检查：`npm --prefix frontend run verify` 全部通过（类型检查、生产构建、生产包无 mock 检查；38 个测试文件、334 项测试通过）；使用现有 `.contract-venv` 执行 `scripts/validate_contract.py` 全部 PASS（83 业务 + 2 健康操作、325 schemas、41 回归检查）；`git diff --check` 通过。系统 Python 缺少 openapi_spec_validator，已改用项目既有环境完成验证。
- 决定：采用快进方式合并，保留原提交；不修改接口、后端或业务规则。本条不改变 §0 的现状结论。未做：新一轮真实后端浏览器验收、后端测试、远程推送。
