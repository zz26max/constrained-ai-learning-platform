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
npm run verify         # typecheck + build + check:no-mock + test
npm run test:browser:real   # 真实服务已启动时，创建独立验收班走三类作业闭环
npm run test:browser:boundaries # 主流程脚本成功后，使用其验收班验证冲突/网络/会话/归档等边界
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

浏览器脚本使用本机Edge，依赖playwright-core（仅开发依赖，不下载浏览器）。真实脚本在内存读取已忽略的`backend/.env`中的本地演示账号，不输出口令；会创建单独命名的验收教学班和作业，保留供复核。截图和结果存入已忽略的`.cache/zhixue/`；边界脚本会编辑该验收班中的练习工作区，并归档其文字作业。真实脚本不是所有安全/竞态场景的替代品，未覆盖项以STATUS记录为准。
