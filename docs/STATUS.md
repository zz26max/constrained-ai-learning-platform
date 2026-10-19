# 当前状态与交接

本文件记录会随交付变化的进度、交接与验证结果。**实现任务可以直接更新本文件**，无需另行授权；架构、业务规则与契约仍按 [AGENTS.md](../AGENTS.md) 的规则修改。设计基线见 [DEVELOPMENT](DEVELOPMENT.md)。

**读法**：§0 是判断"项目当前处在哪"的唯一出处；§1 及之后是按时间追加的历史记录，只用于追溯，不能据此判断现状。

## 0. 现在是什么状态（唯一权威）

> 改本节必须显式说明改了什么、依据是什么；其余章节只追加、不修改。

- **代码基线**：`c70dad4`（2026-10-19，V3.3独立高校演示与隔离验证；依据253项回归和浏览器流程；正式学生UI沿用V3.2的`4dd2d3e`；默认B+；V3.2回退基线`c4bc273`，V3.1回退基线`4fefad4`），此前候选`2296e07`；A/B探索基线为`25ac4b6`；学生任务工作台基线为`0006259`，其优化前基线为`0c91fe1`；此前迁移基线 `dd879e3`（2026-10-18，知学真实日历与三类作业联调；公共框架`7b4e843`、学生目录`77173fb`、教师批阅`bae06b7`）；原P1联调基线为`dc87d38`。四个迁移包已交付，真实主流程与边界专项通过，未改变契约。**本地 master 尚未推送**，领先量以 `git status` 为准。
- **阶段**：P1（课程 / 作业 / 评价 / 多班聚合）的契约、前后端与浏览器验收已闭环，见 §3.8。**P2（受限式 AI 辅导）、P3（学习行为分析）尚未开始**，契约中对应操作仍为 `planned`。
- **契约状态**：83 个业务操作 + 2 个健康检查；截至 2026-10-18 为 53 个 `implemented`、10 个 `verified`、22 个 `planned`。权威值以 `openapi.yaml` 的 `x-implementation-status` 为准，本节只是时间点快照。
- **门禁现状**（2026-10-19）：本轮前端 `npm --prefix frontend run verify` 通过，27 个测试文件 / 253 个用例，包含类型/构建/生产无mock与独立演示检查；`scripts/validate_contract.py` 通过。后端代码本轮未改，沿用此前完整复跑结果：**BUILD SUCCESS**，384 个单元/HTTP 测试 + 206 个 Testcontainers 真实 MySQL 集成测试，0 failure/error/skipped（4:17），不宣称本轮重跑Maven。
- **未决事项**（不阻塞 P1，进入 P2 前需定）：
  1. §1 记录的联调观察 ①～④：归档作业重发旧 revision 返回 200、公告生成的消息 `target` 为 null、陈旧 `baseVersion` 重发 `publishFeedback` 返回 200、全班公告可指向某学生的 feedback。
  2. §4 接受的 5 个低概率竞态，其中"归档与提交竞态"会在归档后留下一篇无法再批阅的提交。
  3. 本轮已补充慢网络、会话失效、作业归档只读的真实浏览器证据；不将作业归档证据等同于公告归档验证。
- **V3.3 隔离演示**（2026-10-19）：基于已存在的6929694实现独立campus开发入口（4174），复用学生页面与API客户端，内存夹具8课程/18作业/16消息/4评价，固定北京时间2026-10-19 10:00。真实端拒绝演示入口，预览端无代理并拒绝/api/，生产包不含演示标记。verify 27文件253项、130响应OpenAPI校验、六页36视口、桌面/手机A–F共12条模拟流程通过，真实API请求0；V3.2主回归及边界脚本通过。未改后端、正式业务数据、契约、教师页面；不将内存模拟视为真实后端联调或学生测试。实现提交c70dad4；交付见frontend/V3.3-DELIVERY.md，人工材料frontend/V3.3-STUDENT-TEST.md。current仅12图，index.html包含交互证据。SQL答疑与截止顺序已纠正；V3.2正式页面不变，真实学生测试未执行。
- **V3.2 当前任务**（2026-10-19）：先审计后实施，基线c4bc273，before真实36视口与局部图已保存；课程去顶部蓝线/进度对齐，记录880px阅读分区与日期分数对齐，消息按真实裁切显示全文入口并保留展开连续性。26文件245项、同数据六页36视口PASS，已查看课程桌面/手机、记录桌面与消息局部图。首页浅色焦点、作业时间/资格分层、日历轻量事件/44px溢出入口与学生微交互已落地；245项仍通过。同数据六页36视口、隔离长标题/章节/空态、200%文本放大与720CSSpx/DPR2等效重排、动态全文/焦点连续性及reduced-motion PASS。V3.2已完成，提交edf3d90/4dd2d3e，报告frontend/V3.2-DELIVERY.md。139个渲染样本最小5.39:1；消息加载/网络失败重试、文本放大表单与末项命中PASS；当前12图在frontend/.cache/student-v32/current，对比含局部图在index.html。基线推进至已存在4dd2d3e，依据最终245项/浏览器/静态结果。审计见frontend/V3.2-DELIVERY.md；仅学生样式与展示，不改业务。
- **V3.1 当前任务**（2026-10-19）：P0待办按服务端资格全量读取、优先级排序后再分页，最多6并发查询；补交仍优先，失败仅按截止排序并提示未分组。105任务跨2个API页回归确认后页可提交项进入首页，数量105保持。verify 26文件240项；真实六页面36视口与固定导航上中下滚动/末项命中PASS；同数据before/after截图保存在frontend/.cache/student-v31。P1课程去重与章节直达、反馈按ID去重、消息日期分组及全文已完成；verify 26文件243项。同数据390首张课程487→323px、首条消息234→218px，六页36视口PASS并审阅手机截图。日历空日期增加完整查询内的下一截止日程日期入口（不推断提交资格），保留课程筛选；26文件245项通过。V3.1已完成，提交5836ce7、f0c52ee、519eeaf；报告frontend/V3.1-DELIVERY.md，同数据对比frontend/.cache/student-v31/index.html。重点文字样本最小5.39:1；真实六页36视口与隔离夹具复验PASS；未做真机/屏幕阅读器/全站审计。基线推进至已存在519eeaf，依据最终245项与浏览器/静态校验结果。§0基线由候选2296e07更正为已存在V3交付4fefad4，依据实际提交历史与V3报告。
- **V3.0 交付基线**（2026-10-19）：用户已选 B+，阶段一将其设为默认首页，保留显式原版/A/B预览。学生空间增加独立样式作用域、焦点与移动文字/触控规范。依据：verify 26文件238项通过；真实 B+ 六视口/滚动命中/键盘脚本 PASS，已审阅390截图。阶段二课程标识/标题层级与连续章节路径已实现：verify 26文件238项通过，六页六尺寸只读浏览器脚本PASS，已查看1440课程与390记录截图。阶段三表格/日历/消息精修已实现并通过238项检查与六页六尺寸脚本；已审阅作业桌面、手机日历与消息截图。阶段四综合验收通过：六页面36视口组合、筛选/手机日历/Esc操作、隔离长标题/24章节/空记录夹具，238项回归与契约静态校验PASS。截图在frontend/.cache/student-v3/index.html，逐页交付记录frontend/V3-DELIVERY.md；未做真机/学生可用性/全量对比度审计。阶段提交4638a00、83e5f8f、673b7f3。原实现基线2296e07可回退。
- **上一轮候选记录**（2026-10-19）：以B为基础融合A的B+首页候选已精修并验证，等待用户确认。design=bplus独立预览，原版/A/B保留；正常首页不显示探索条，design=current参与原版比较，不替换默认内容。依据为26文件237测试、B+真实分组/章节语义/六视口与手机滚动命中检查、A/B回归，详见 §8。
- **迁移进度与依据**：公共框架已完成品牌、侧栏/顶部栏、真实角色入口与手机导航；`npm --prefix frontend run verify` 22文件/203用例、类型/构建/no-mock通过。实际环境Node24.17.0/npm11.13.0低于文档基线，不视为CI等价证据；真实浏览器主流程与边界专项均已通过，见下方及 §5。
- **学生迁移包**：首页主任务/辅助栏、课程卡片、折叠章节、服务端当前章节恢复与本章真实作业入口已接入；复用原工作区/消息/学习记录逻辑。verify通过203项后新增目录测试，相关2文件34项通过；无接口变更。真实浏览器已走通入班、阅读和三类工作区立即提交。
- **教师迁移包**：授课班级卡片、章节内容折叠、真实统计（隐藏P2求助）、提交表格与批阅抽屉/跨页队列完成；保留快照满分、量规、已发布只读与草稿版本。最终verify 24文件213项通过；包含队列完整分页/中止/失败及发布失败不切换断言。真实浏览器已验证保存草稿、发布评价及学生端反馈，未改变接口状态标记。
- **日历与主流程验收**：学生/教师真实作业日历已接既有分页接口，URL保存日期/view/offering，支持月/周/手机日期条、详情跳转与历史标识。修正旧mock作业分页响应，并拒绝缺失total的响应以避免无限翻页。Edge真实主流程PASS：开班/发章/入班/阅读，Web/SQL/文字立即提交，草稿隔离与发布反馈，1440/1024/390布局/导航/抽屉Esc；证据`frontend/.cache/zhixue/result.json`及截图（已忽略）。另有边界专项PASS：真实双窗口409及显式合并、800ms延迟写入保留最新编辑、保存中断保留内容及取消离开、Web预览父页面/存储隔离、真实会话注销后换身份无草稿泄漏、归档只读及跨班拒绝。客户端延迟/中断为明确故障注入，未伪造成功响应。证据`frontend/.cache/zhixue/boundaries.json`；已人工检查加载完成的1024课程页、390日历与抽屉截图。

### 0.1 接手前必读

- 端口：MySQL 3307（Docker，Flyway V9）、后端 8080、Vite 4173（同源代理）。健康检查是 `/health/live`、`/health/ready`，不是 `/actuator/health`。
- 演示账号 `student.demo`、`teacher.demo`、`admin.demo`；密码在被 Git 忽略的 `backend/.env` 中，**不要提交、截图或贴进对话**。
- 单独跑某个前端测试要在 `frontend/` 目录下执行 `npx vitest run tests/xxx.test.ts`；在仓库根目录用 `npm --prefix frontend exec vitest` 不会加载 happy-dom，会报 `window is not defined`。
- 不要读 `frontend/src/api/generated/`（生成代码）、`node_modules`、lock 文件与日志；生成类型以 `openapi.yaml` 为源。
- **不要用 `backend/target/surefire-reports/*.txt` 累加用例数**：该目录会残留已删除测试类的旧报告，累加会得到虚高值（2026-10-18 实测累加得 443，Maven 实际 `Tests run: 384`）。以 Maven 的 `Results:` 汇总行为准。
- `docs/archive/` 一律是历史快照，不是规范。其中的 `HANDOFF-2026-10-16.md` 写的是 P1 尚未闭环时的状态，已作废。

## 1. 历史状态记录（只追加，勿据此判断当前）

> **本节是日志，不是现状。** 以下按日期自上而下追加，早期条目里的"未通过""待修复"描述在当时成立、现在可能已不成立；判断现状只看 §0，判断某条缺陷是否已修看 §3。

契约基线 1.1.0（2026-10-13 按课程演示规模简化，见 [DEVELOPMENT 第 14 节](DEVELOPMENT.md#14-决策与变更记录)）。

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

<a id="handoff"></a>

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
| 教学班/作业归档的检查与更新之间恰好有学生提交 | 归档后存在一份待批阅提交，P1 无法在归档后发布评价 | 归档是低频教师操作，窗口为毫秒级；需要时由管理员处理 |
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
