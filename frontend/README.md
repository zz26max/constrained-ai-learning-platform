# 知学 · 正式前端（frontend）

Vue 3 + TypeScript strict 工程。“知学”原型7ede99e的视觉与交互已迁入正式Vue组件，使用已有P0/P1接口，覆盖登录、课程与章节、三类工作区、教师批阅、首页/公告/消息/学习记录和作业日历。管理员用户管理、排课、AI及未开放分析无操作入口。

## 工具链（首次开工锁定，见 docs/FRONTEND.md 第 1 节）

- Node.js **24.21.0**（`.nvmrc`、`engines.node`）
- npm **11.19.0**（`packageManager`、`engines.npm`）；首次生成 lockfile 后统一用 `npm ci`
- Vite 8 + @vitejs/plugin-vue 6 + vue-tsc 3（类型检查与构建是两项独立检查）
- 类型生成：openapi-typescript 7（`src/api/generated/` 由 `docs/openapi.yaml` 生成，禁止手改）
- 测试：vitest 5（happy-dom + @vue/test-utils 供组件测试）

## 常用命令

```sh
npm run dev            # 真实模式开发服务：http://127.0.0.1:4173，/api/v1 代理到 127.0.0.1:8080
npm run dev:mock       # mock 模式开发服务：同一端口，使用 src/mocks 的虚构响应
npm run typecheck      # vue-tsc 对应用与 node 配置两项类型检查
npm run build          # 生产构建（强制真实模式；发现 mock 配置即失败）
npm run check:no-mock  # 扫描 dist，确认 mock 层未进入生产包
npm run test           # vitest 全量测试
npm run contract:types # 从 ../docs/openapi.yaml 重新生成契约类型
npm run verify         # test:browser:config + typecheck + build + check:no-mock + test
npm run test:browser:config # 无需服务与浏览器：校验验收配置、凭据解析与夹具归属规则
npm run test:browser:real   # 真实服务已启动时，创建独立验收班走三类作业闭环
npm run test:browser:boundaries # 主流程脚本成功后，使用其验收班验证冲突/网络/会话/归档等边界
npm run test:browser:student # 真实学生现有数据：筛选分页、六页面及1440/1024/320/375/430视口，无新增样例
```

## mock 模式

- 唯一开关是构建环境变量 `VITE_API_MODE=real|mock`（省略即 real，其他值启动/构建失败）；切换模式必须重启开发服务，页面常显"模拟模式"标识。
- mock 响应按 operationId 组织于 `src/mocks/`，走同一请求层与同一契约类型；未实现的操作显式失败，不转发真实请求。
- 虚构账号：`student.demo` / `teacher.demo` / `admin.demo`，口令统一 `mock-demo-pass`（仅存在于 mock 层）。

## 联调与代理

开发浏览器固定从 `http://127.0.0.1:4173` 进入；Vite 只把 `/api/v1/` 转发到预配置后端（可用 `BACKEND_ORIGIN` 环境变量在启动前覆盖），保留查询、方法、正文、Cookie、CSRF、请求标识与状态码，后端不可用时返回可识别 503 JSON。生产由同源 HTTPS 反向代理提供相同路径。

## 知学页面与接口映射

| 入口 | 真实数据与操作 |
| --- | --- |
| `/student/home`、`/course` | getDashboard、listMyCourses、邀请码加入；课程卡片与章节继续学习 |
| `/course/:offeringId`、章节与资料详情 | getOffering/listChapters/getChapter/getResource，服务端阅读进度与学习位置 |
| `/student/assignments`、详情与工作区 | 现有作业、工作区、提交、公开反馈接口；Web/SQL/文字保存流程保持 |
| `/student/progress`、消息、公告 | 现有学习记录、消息已读和课程公告接口 |
| `/teacher`、教学班详情 | 基础课程开班，章节/资料、成员、邀请、知识点和公告接口 |
| 教师作业详情与批阅地址 | listTeacherSubmissions/getSubmission/saveFeedback/publishFeedback；列表打开抽屉，直达地址独立展示 |
| `/student/calendar`、`/teacher/calendar` | 完整分页读取已有作业截止数据；日期/view/offering保存在URL，不虚构上课时间 |

连续批阅队列只保留在当前页面内存，刷新后返回列表重新建立；分数上限和量规取提交快照，已发布评价只读。实际接口失败、版本冲突、会话变化均保留正式错误处理，真实模式不使用本地样例数据。

学生首页额外完整读取待办与课程，并读取候选任务详情确认 `canSubmit`；优先展示仍可提交且截止最早的任务，权限失败不伪装为空任务。作业列表默认待完成，已归档历史在全部中保留；状态/课程/排序/页码存入URL。近期任务最多五项，首页课程最多两门。课程按服务端 `lastStudiedAt` 在完整集合中排序；学习记录自动选最近课程并读取章节真实进度，不估算学习时长。消息按真实类型/已读参数筛选，不合并不同消息；用户打开关联内容后显式标读。视觉与交互规范见 `docs/FRONTEND.md` 第 9 节。

`test:browser:student` 的截图和结果保存在忽略的 `.cache/student-workbench/`。它使用现有账号与记录，只读验收界面，不新增/删除/重命名业务数据；旧乱码和验收标题不由前端改写。首次学生可用性测试需另行组织，浏览器脚本不代表真实受试者的3秒判断结果。

## 首页视觉历史

首页 V3 系列探索（design=a/b/bplus 预览参数）已随 V3.6.1 正式采纳而移除路由，正式首页为 `/student/home`，现行视觉规范见 `docs/FRONTEND.md` 第 9 节；各轮候选的交付记录归档于 `docs/archive/V3*-DELIVERY.md`。

## 真实浏览器验收（隔离目标与写入确认）

`test:browser:real` 与 `test:browser:boundaries` 必须指向**专用、可丢弃的真实测试环境**：同源前端与 API、已迁移到当前版本的隔离数据库、独立的教师/学生账号。脚本不启动或迁移数据库、不读取数据库凭据、不配置或启用外部供应商；不要指向日常使用的 3307 库或生产环境。只改前端端口不能隔离数据，须确认其 `/api/v1` 代理实际指向隔离 API。`test:browser:student` 仍使用本机既有配置，不属于这套流程。

依赖 playwright-core（仅开发依赖，不下载浏览器）。两项脚本不再默认读取 `backend/.env`，也不再固定使用 Edge；缺少目标、写入确认或口令时，在启动浏览器和写结果之前退出。

| 变量 | 说明 |
| --- | --- |
| `BROWSER_ACCEPTANCE_BASE_URL` | 必填，同源前端 HTTP(S) origin；不接受路径、查询、hash 或内嵌凭据 |
| `BROWSER_ACCEPTANCE_ALLOW_WRITES` | 必填，确认是隔离环境后设为 `isolated-fixtures`（持久写入确认，不是只读模式） |
| `BROWSER_ACCEPTANCE_STUDENT_USERNAME` / `BROWSER_ACCEPTANCE_TEACHER_USERNAME` | 专用测试账号，默认 `student.demo` / `teacher.demo`，两者不能相同 |
| `BROWSER_ACCEPTANCE_STUDENT_PASSWORD` / `BROWSER_ACCEPTANCE_TEACHER_PASSWORD` | 通过当前进程环境提供，不写进命令行 |
| `BROWSER_ACCEPTANCE_ENV_FILE` | 可选，显式指定本机已忽略的凭据文件；只读 `LOCAL_STUDENT_PASSWORD`、`LOCAL_TEACHER_PASSWORD`，进程环境优先 |
| `BROWSER_ACCEPTANCE_CHANNEL` / `BROWSER_ACCEPTANCE_EXECUTABLE_PATH` | 浏览器 channel（如 `msedge`，默认 `chromium`）或绝对可执行路径，两者互斥 |
| `BROWSER_ACCEPTANCE_TIMEOUT_MS` | 可选，操作超时，默认 45000，允许 1000～180000 |
| `BROWSER_ACCEPTANCE_OUTPUT_DIR` | 可选，证据根目录，默认忽略的 `.cache/zhixue/`；每次运行写入独立 runId 子目录 |
| `BROWSER_ACCEPTANCE_FIXTURE` | 边界脚本必填：主流程本次成功生成的 `result.json` 路径；失败、中断或旧格式会被拒绝 |

证据按运行隔离：主流程在 `<输出目录>/<runId>/result.json` 依次写入 `RUNNING`/`PASS`/`FAIL`、夹具 ID 与页面错误，并打印该 runId 目录；边界脚本先校验夹具确属本环境的班级与三份作业，不匹配就拒绝任何写入，结果与截图写在同一 runId 下的 `boundaries-*` 目录。所有证据目录均被 Git 忽略。真实脚本不是所有安全/竞态场景的替代品，未覆盖项以 STATUS 记录为准。
