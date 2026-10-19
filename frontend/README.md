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
npm run test:browser:student # 真实学生现有数据：筛选分页、六页面及1440/1024/320/375/430视口，无新增样例
npm run test:browser:home-design # 首页A/B同源数据、零切换请求、真实主任务跳转和六视口截图
npm run test:browser:home-bplus # B+日期分组、真实章节语义、首屏操作和滚动遮挡，生成B/B+同数据截图
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

学生首页额外完整读取待办与课程，并读取候选任务详情确认 `canSubmit`；优先展示仍可提交且截止最早的任务，权限失败不伪装为空任务。作业列表默认待完成，已归档历史在全部中保留；状态/课程/排序/页码存入URL。近期任务最多五项，首页课程最多两门。课程按服务端 `lastStudiedAt` 在完整集合中排序；学习记录自动选最近课程并读取章节真实进度，不估算学习时长。消息按真实类型/已读参数筛选，不合并不同消息；用户打开关联内容后显式标读。设计实现记录见本目录 DESIGN.md。

`test:browser:student` 的截图和结果保存在忽略的 `.cache/student-workbench/`。它使用现有账号与记录，只读验收界面，不新增/删除/重命名业务数据；旧乱码和验收标题不由前端改写。首次学生可用性测试需另行组织，浏览器脚本不代表真实受试者的3秒判断结果。

## 首页 V3 视觉探索（尚未选择正式方案）

- 原首页：`http://127.0.0.1:4173/#/student/home`
- A 编辑式：`http://127.0.0.1:4173/#/student/home?design=a`
- B 模块化：`http://127.0.0.1:4173/#/student/home?design=b`

预览参数页面的顶部切换器支持版本互切，查询参数可刷新与前进后退；仍受同一学生登录权限限制。两套预览共享 `use-student-home.ts` 与原首页的业务状态，切换不重新读取数据；默认原首页不变。样式仅作用于预览根节点，不改变其他页面。A跨栏任务/日期、无框待办与反馈边栏；B任务焦点、课程轨迹与日期序列；内容、操作和推荐规则相同。

浏览器脚本只登录和读取现有数据，验证真实提交资格、主入口跳转/返回、A/B同一任务/课程/统计与零切换请求，不写业务数据。截图在忽略的 `.cache/home-exploration/`，含1440/1024/320/375/390/430两套页面；单元测试另验证无任务、无反馈/公告和未知方案参数回到原版。不对后端/数据库或其他学生页面做V3改版，等用户选择后另行实施。

### B+ 候选：首页精修，尚未替换默认版本

- B+：`http://127.0.0.1:4173/#/student/home?design=bplus`
- 原版比较入口：`http://127.0.0.1:4173/#/student/home?design=current`
- 正常首页仍为 `/student/home`，不显示探索控件；四版本在预览模式下互切，B+切换器默认收起。固定预览参数可在登录后恢复，仍受学生权限守卫。

B+复用B的深蓝焦点与共享任务状态；截止时间集中展示一处，精确时刻仍保留在time属性/提示中。近期任务按同一真实截止时刻分组，组内保留每项课程/状态/操作；任务与辅助栏独立排布，取消列表/课程/反馈外层卡片。最近课程仅一门，并额外使用既有listChapters读取该课程真实章节进度：未阅读→继续学习；全部已开放章节读完→复习章节；无章节/未知进度/读取失败→查看课程，不把摘要100%解释为结课。课程读取失败有重试，不编造下一章。

B+业务推荐规则不变；只在首次进入B+或最近课程变化时读取章节，切换不重新获取看板/待办。截图与测量记录在忽略的`.cache/home-bplus/`，包括B/B+桌面1440/手机390、B+焦点细节、六视口和手机滚动截图。测试只登录并读接口，不写业务记录；真实空数据与特殊进度场景以单元测试补充，不将其宣称为真实用户可用性测试。最终采用与否等待用户确认。

浏览器脚本使用本机Edge，依赖playwright-core（仅开发依赖，不下载浏览器）。真实脚本在内存读取已忽略的`backend/.env`中的本地演示账号，不输出口令；会创建单独命名的验收教学班和作业，保留供复核。截图和结果存入已忽略的`.cache/zhixue/`；边界脚本会编辑该验收班中的练习工作区，并归档其文字作业。真实脚本不是所有安全/竞态场景的替代品，未覆盖项以STATUS记录为准。
