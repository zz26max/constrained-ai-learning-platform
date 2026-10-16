# 基于受限式 AI 辅导与学习行为分析的个性化学习平台

本项目面向多课程的实践学习，提供作业学习、教师反馈、受限 AI 辅导和可解释的学习分析。

当前进度、交接与验证记录见 [STATUS](docs/STATUS.md)。原型中的课程、成绩与 AI 内容是演示数据。

## 当前状态

契约基线 **1.1.0**，共 83 个业务操作与 2 个健康检查。截至 2026-10-15，**P0-A、P1-A、P1-B、P1-C、P1-D 已完成**：认证、课程与教学班、作业与工作区、提交与评价、多班聚合均有后端实现；57 个操作 `implemented`、5 个 `verified`、23 个 `planned`。P2（受限式 AI 辅导、学习行为分析）与 P3（独立运行检查）尚未实现。接口实现状态以 [接口契约](docs/openapi.yaml) 的 `x-implementation-status` 为准，不在本文件另维护计数。

## 文档入口

| 文档 | 查看内容 |
| --- | --- |
| [协作约定](AGENTS.md) | 修改权限、证据与提交规则 |
| [当前状态](docs/STATUS.md) | 进度、交接、验证记录、已知限制 |
| [开发方案](docs/DEVELOPMENT.md) | 架构、公共业务规则、阶段与工作包 |
| [前端手册](docs/FRONTEND.md) | Vue 工程、路由、状态、编辑保存与浏览器行为 |
| [后端手册](docs/BACKEND.md) | 服务分层、权限、数据模型、事务、迁移与运行 |
| [后端调试指引](docs/DEBUGGING.md) | IDEA 断点、JUnit 6 兼容性、认证内部实现逐步调试 |
| [接口契约](docs/openapi.yaml) | 两端共用的接口结构、错误、权限和实现状态 |
| [前端工程说明](frontend/README.md) | 前端工具链、命令、mock 模式与代理 |
| [P1-A 设计](docs/features/p1a-courses.md) / [P1-D 设计](docs/features/p1d-aggregation.md) | 已交付工作包的设计与验收场景 |
| [历史归档](docs/archive/ARCHITECTURE_REVIEW.md) | 早期文档快照，不是规范 |

## 快速开始

需要 JDK 21、Docker（本地 MySQL）、Node.js 24.21.0 与 npm 11.19.0。工具链以 `frontend/.nvmrc` 与 `frontend/package.json` 的 `packageManager` 为准。

从项目根目录执行，JDK 路径替换为实际安装目录：

```powershell
# 1. 启动数据库与 API（首次会创建被 Git 忽略的 backend/.env）
.\backend\scripts\Start-Local.ps1 -JdkPath 'C:\Program Files\Java\jdk-21.0.11'

# 2. 初始化本地演示账户（一次性，执行后退出，不占用 API 端口）
.\backend\scripts\Start-Local.ps1 -InitializeAccounts -JdkPath 'C:\Program Files\Java\jdk-21.0.11'

# 3. 启动正式前端（另开终端）
cd frontend
npm ci
npm run dev
```

真实模式从 http://127.0.0.1:4173 进入，`/api/v1` 代理到本地 8080 后端。不依赖真实后端的界面开发使用 `npm run dev:mock`；mock 必须明确显示标识，不能作为真实联调证据。原型与正式前端默认端口相同，不同时占用。

## 后端启动

后端使用 JDK 21、Spring Boot 4.1.1、Maven Wrapper 3.3.4 / Maven 3.9.16、MySQL 8.4.11。工程位置为 `backend/`，运行前需要准备 Docker 中的项目数据库；首次依赖或镜像下载需要联网。

先准备本地数据库，Windows PowerShell 从项目根目录执行：

```powershell
.\backend\scripts\Start-Local.ps1 -DatabaseOnly
```

脚本首次创建被 Git 忽略的 `backend/.env`，为项目账号和数据库 root 账号生成独立随机密码；已有配置不会被覆盖。Compose 启动项目专用数据库 `learning_platform`，只监听 `127.0.0.1:3307`，数据保存在命名卷中。应用使用项目账号，不使用 root。

默认只监听 `127.0.0.1:8080`：`http://127.0.0.1:8080/health/live` 返回 HTTP 200 和 `{"status":"ok"}`；`http://127.0.0.1:8080/health/ready` 返回 HTTP 200 和 `{"status":"ready"}`。端口被占用时可给脚本增加 `-Port 8081`，或在 IDEA 环境变量中设置 `SERVER_PORT`。在启动终端按 Ctrl+C 停止 API。

应用首次启动时 Flyway 依次执行 V1～V9，建立学期、账户、会话、审计、课程内容、作业、评价通知与公告相关表及迁移记录；已有数据库只执行尚未应用的迁移。迁移不初始化学期、账户或会话，再次启动先校验迁移，不重复建表。数据库初始连接或迁移失败时应用启动失败；已启动后数据库失联，ready 返回 503 `{"status":"unavailable"}`，live 仍可返回 200。

IDEA 开发步骤：

1. 打开 `backend/pom.xml` 作为 Maven 工程并同步依赖，项目 SDK 和 Maven Runner JRE 选择 JDK 21。
2. 编辑 `LearningPlatformApplication` 的运行配置，把工作目录设为 `backend/`，在 **Environment variables** 中填写本地 `.env` 的 `SPRING_PROFILES_ACTIVE`、`DB_URL`、`DB_USERNAME`、`DB_PASSWORD` 四项。这里填写实际值，不包含注释；root 密码只供数据库容器初始化使用。
3. 运行或 Debug `LearningPlatformApplication.main()`。Spring Boot 不会自动读取 `.env`；终端脚本设置的变量也不会自动传给已经打开的 IDEA。

本地演示账户分别是 `student.demo`（学生）、`teacher.demo`（教师）、`admin.demo`（管理员）。需要查看密码时在本机打开 `.env`，不要提交或截图分享。账户初始化、认证内部实现与逐步调试方法见 [后端调试指引](docs/DEBUGGING.md)。

## 前端

工具链以 `frontend/.nvmrc` 与 `frontend/package.json` 的 `packageManager` 为准；首次安装与验证方式见 [前端工程说明](frontend/README.md)。在 `frontend/` 执行：

```powershell
npm ci
npm run dev          # 真实模式，代理到本地 8080 后端
npm run dev:mock     # 不依赖真实后端的界面开发
npm run verify       # typecheck + build + check:no-mock + test
```

## 原型本地查看

以下只启动 website-prototype，不启动正式前端；原型没有第三方依赖。以下命令从项目根目录执行：

```sh
npm --prefix website-prototype run dev
```

默认地址为 http://127.0.0.1:4173/，修改后刷新浏览器即可。端口被占用时可通过 PORT 环境变量指定其他端口。已经位于 website-prototype/ 时直接运行 npm run dev。

也可以直接打开 website-prototype/index.html 查看静态原型。后续真实 Cookie 登录与 API 联调必须通过 HTTP 服务，正式 Vue 工程将通过 Vite 同源代理连接 Spring Boot 8080；当前原型静态服务没有该代理。

## 构建与预览

从项目根目录执行：

```sh
npm --prefix website-prototype run build
npm --prefix website-prototype run preview
```

构建复制 index.html 和 src/ 到 dist/。开发服务与预览服务使用相同的默认端口，应先停止前一个服务，或使用不同端口；网站发布使用 dist/ 内容。

## 验证与检查

| 位置 | 命令 | 覆盖内容 |
| --- | --- | --- |
| 项目根目录 | `.contract-venv\Scripts\python.exe scripts/validate_contract.py` | 契约结构、示例与文档引用静态校验（不证明 HTTP 行为） |
| `backend/` | `.\mvnw.cmd test` | Web 契约、密码算法、登录凭据校验、会话令牌与配置的单元测试；不需要 Docker |
| `backend/` | `.\mvnw.cmd verify` | 上述内容 + Testcontainers 真实 MySQL 测试并打包；要求 Docker 可用 |
| `frontend/` | `npm run verify` | vue-tsc 类型检查、生产构建、mock 泄漏检查与 vitest |

CI 配置见 [.github/workflows/contract.yml](.github/workflows/contract.yml)，包含契约、后端与前端三个作业。CI 静态检查通过不等于联调通过；本机结果也不必然等同 CI 基线。

## 目录与开发约定

```text
README.md                       项目入口与启动方法
AGENTS.md                       协作、证据与提交规则
CLAUDE.md                       Claude Code 会话规则
docs/
  STATUS.md                     当前进度、交接与验证记录
  DEVELOPMENT.md                架构、业务规则与工作包
  FRONTEND.md                   前端开发手册
  BACKEND.md                    后端开发手册与数据模型
  DEBUGGING.md                  后端调试指引
  openapi.yaml                  共享结构契约
  README.md                     文档索引、权威边界与阅读顺序
  DEBUGGING.md                  后端调试指引
  features/                     已交付工作包的设计与验收场景
  archive/                      历史文档快照，不是规范
scripts/
  validate_contract.py          契约、示例与文档引用校验
  contract_slice.py             按 operationId 提取只读契约
  requirements-contract.txt     契约工具依赖
.github/workflows/contract.yml  契约、后端与前端检查
frontend/                       正式 Vue 工程，课程、作业、评价与通知流程已交付
backend/
  pom.xml                       Maven 依赖与打包配置
  compose.yml                   本地 MySQL 8.4.11 与持久化数据卷
  .env.example                  配置字段模板；真实 .env 不提交
  scripts/Start-Local.ps1        准备数据库、初始化账户或演示数据并启动 API
  mvnw / mvnw.cmd / .mvn/        固定版本的 Maven Wrapper
  src/main/java/                启动入口与后端代码
  src/main/resources/           公共配置、API 配置及 db/migration 迁移
  src/test/java/                HTTP 契约与真实 MySQL 集成测试
  target/                       自动生成，不提交
website-prototype/
  index.html                    前端入口
  src/
    main.js                     页面、导航与原型交互
    learning-ui.js              课程、任务与状态预览
    course-ui.js                 课程章节与资料
    records-ui.js                学习记录与消息
    styles.css                  全局样式与响应式布局
    workspace.css               学习页面公共布局
    course-ui.css                课程详情样式
    records-ui.css               学习记录与消息样式
  scripts/
    serve.mjs                   本地开发与预览服务
    build.mjs                   静态构建
  package.json                  前端描述与命令
  dist/                         自动生成，不直接编辑
  .preview/                     本地截图与检查材料，不提交
  .openai/                      已有站点标识与托管配置
```

- 页面开发在 src/ 中进行，新增图片和图标按实际需要放入 src/assets/。
- 当前页面以 hash 导航切换；邀请码加入等交互只在本次预览内生效。
- 保留已有 .openai/ 配置；本地截图和检查脚本不属于发布内容。

## 原型状态预览

在“使用帮助”页面可打开无课程、无待办及加载失败示例，并恢复默认状态。课程加入只在本次页面预览中保留；邀请码 WEB2026、DB2026、UX2026、NET2026 对应示例课程。日期与逾期判断统一使用标注的示例日期 2026-10-01，不连接真实课程或 AI 服务。
