# 基于受限式 AI 辅导与学习行为分析的个性化学习平台

本项目面向多课程的实践学习，提供作业学习、教师反馈、受限 AI 辅导和可解释的学习分析。

整理日期：2026-10-07。当前已有原生 HTML / CSS / JavaScript 前端原型；后端采用 **Java / Spring Boot / MySQL**，已实现两项健康检查、首个 Flyway 迁移及统一业务响应、请求标识和 MVC 异常处理基础，账户与业务接口仍待开发。页面中的课程、成绩、AI 对话和学习判断仍为示例。

## 文档入口

日常开发从本页开始，详细设计只维护以下三份文档：

| 文档 | 查看内容 |
| --- | --- |
| [开发方案](docs/DEVELOPMENT.md) | 项目范围、架构、业务规则、技术选型、前端接入、视觉约定、任务顺序与验收 |
| [接口契约](docs/API.md) | 请求响应、权限、错误、分页及联调示例 |
| [数据模型](docs/DATA_MODEL.md) | MySQL 表、字段、外键、唯一约束、事务、索引与保留规则 |

可直接跳转到[技术选型依据](docs/DEVELOPMENT.md#13-技术选型依据)、[开发环境与开工检查](docs/DEVELOPMENT.md#121-本地开发环境与开工检查)、[前端接入](docs/DEVELOPMENT.md#10-前端接入方案)、[开发任务与验收](docs/DEVELOPMENT.md#11-开发任务拆分与验收)。历史资料集中在 docs/archive/：[架构评审](docs/archive/ARCHITECTURE_REVIEW.md)、[视觉调整记录](docs/archive/UI_DESIGN_HISTORY.md)。

## 本地查看

需要 Node.js 20 或更新版本。当前前端没有第三方依赖，无需安装依赖。以下命令从项目根目录执行：

```sh
npm --prefix website-prototype run dev
```

默认地址为 http://127.0.0.1:4173/，修改后刷新浏览器即可。端口被占用时可通过 PORT 环境变量指定其他端口。已经位于 website-prototype/ 时直接运行 npm run dev。

也可以直接打开 website-prototype/index.html 查看静态原型。后续真实 Cookie 登录与 API 联调必须通过 HTTP 服务，并按开发方案配置到本地 Spring Boot 8080 端口的同源代理；当前静态服务尚未加入该代理。

## 构建与预览

从项目根目录执行：

```sh
npm --prefix website-prototype run build
npm --prefix website-prototype run preview
```

构建复制 index.html 和 src/ 到 dist/。开发服务与预览服务使用相同的默认端口，应先停止前一个服务，或使用不同端口；网站发布使用 dist/ 内容。

## 后端启动

当前后端提供 `GET /health/live` 和 `GET /health/ready`，已建立统一业务响应、请求标识与 MVC 异常处理基础，登录等业务端点仍待开发。使用 JDK 21、Spring Boot 4.1.1、Maven Wrapper 3.3.4 / Maven 3.9.16、MySQL 8.4.11。工程位置为 `backend/`，运行前需要准备 Docker 中的项目数据库；首次依赖或镜像下载需要联网。

先准备本地数据库，Windows PowerShell 从项目根目录执行：

```powershell
.\backend\scripts\Start-Local.ps1 -DatabaseOnly
```

脚本首次创建被 Git 忽略的 `backend/.env`，为项目账号和数据库 root 账号生成独立随机密码；已有配置不会被覆盖。Compose 启动项目专用数据库 `learning_platform`，只监听 `127.0.0.1:3307`，数据保存在命名卷中。应用使用项目账号，不使用 root。

IDEA 开发步骤：

1. 打开 `backend/pom.xml` 作为 Maven 工程并同步依赖，项目 SDK 和 Maven Runner JRE 选择 JDK 21。
2. 编辑 `LearningPlatformApplication` 的运行配置，把工作目录设为 `backend/`，在 **Environment variables** 中填写本地 `.env` 的 `SPRING_PROFILES_ACTIVE`、`DB_URL`、`DB_USERNAME`、`DB_PASSWORD` 四项。这里填写实际值，不包含注释；root 密码只供数据库容器初始化使用。
3. 运行或 Debug `LearningPlatformApplication.main()`。Spring Boot 不会自动读取 `.env`；终端脚本设置的变量也不会自动传给已经打开的 IDEA。

也可以从项目根目录直接用脚本启动数据库和 API，JDK 路径替换为实际安装目录：

```powershell
.\backend\scripts\Start-Local.ps1 -JdkPath 'C:\Program Files\Java\jdk-21.0.11'
```

默认只监听 `127.0.0.1:8080`：`http://127.0.0.1:8080/health/live` 返回 HTTP 200 和 `{"status":"ok"}`；`http://127.0.0.1:8080/health/ready` 返回 HTTP 200 和 `{"status":"ready"}`。端口被占用时可给脚本增加 `-Port 8081`，或在 IDEA 环境变量中设置 `SERVER_PORT`。在启动终端按 Ctrl+C 停止 API。

应用首次启动时 Flyway 执行 `V1__create_terms.sql`，建立学期表和迁移记录；再次启动先校验迁移，不重复建表。数据库初始连接或迁移失败时应用启动失败；已启动后数据库失联，ready 返回 503 `{"status":"unavailable"}`，live 仍可返回 200。

首次调试时，在 `src/main/java/com/learningplatform/common/health/HealthController.java` 的 `live()` 返回语句设置行断点，以 Debug 模式运行启动类，访问上述地址。停住后确认请求到达自己的方法，再选择 Resume Program（Windows 默认 F9）让请求完成。Step Into（F7）会进入被调用的方法，可能打开 Spring 依赖类的反编译代码；Step Over（F8）执行当前行，本方法返回后也可能回到 Spring 的调用者。本轮先观察请求进入与返回结果，具体操作见 [IDEA 步进说明](https://www.jetbrains.com/help/idea/stepping-through-the-program.html)。

例如在 `return` 执行结束后，F8 停在 `InvocableHandlerMethod.class` 是正常的：该类属于 Spring，负责调用 Controller 方法，后续框架会处理返回值并写入 HTTP 响应。此时按 F9 完成请求；若要重新观察自己的代码，待请求完成后刷新浏览器，再次命中 `live()` 的断点。

如果刚命中断点就显示自己的 `HealthController.class`，先停止调试，以 Maven 项目打开 `backend/pom.xml` 并完成同步，确认 `src/main/java` 为后端模块源码目录，再从 `LearningPlatformApplication.java` 启动 Debug。断点应放在 `src/main/java` 下的 `.java` 文件中；`target/classes` 和打包 jar 是编译输出。

学习统一异常处理时，重启 Debug 应用，在 `RequestIdFilter.doFilterInternal()` 和 `GlobalExceptionHandler.handleExceptionInternal()` 设置断点，再访问 `http://127.0.0.1:8080/api/v1/not-existing`。它是故意访问的不存在路径，应得到 HTTP 404、`error.code=NOT_FOUND` 和 `requestId`；浏览器开发者工具中 `X-Request-ID` 响应头与正文一致。成功及业务拒绝的演示 Controller 仅存在于 [ApiContractTest](backend/src/test/java/com/learningplatform/common/api/ApiContractTest.java)，在 IDEA 调试对应测试即可观察，不需要数据库。

在 `backend/` 且终端已选择 JDK 21 时，执行 `.\mvnw.cmd test` 跑健康检查及统一响应的 Web 契约测试，不需要 Docker 或数据库环境变量；执行 `.\mvnw.cmd verify` 还会运行七条 Testcontainers 真实 MySQL 测试并打包，要求 Docker 引擎可用。数据库测试使用临时库与临时端口，完成后释放容器，不连接开发库。数据库验证不会因为缺少 Docker 被静默跳过。

打包产物为 `target/learning-platform-backend-0.0.1-SNAPSHOT.jar`；终端注入上述数据库变量后可用 `java -jar target/learning-platform-backend-0.0.1-SNAPSHOT.jar` 启动。登录和前端 API 代理仍待开发。

停止开发数据库时，在 `backend/` 执行 `docker compose --env-file .env stop db`；下次运行启动脚本恢复。普通停止保留数据，日常开发不要删除数据卷。数据库首次初始化后，修改 `.env` 密码不会自动修改已有数据库账号，应通过数据库管理流程协调变更。

## 目录与开发约定

```text
README.md                       项目入口与启动方法
docs/
  DEVELOPMENT.md                前后端开发方案
  API.md                        接口契约
  DATA_MODEL.md                 MySQL 数据模型
  archive/
    ARCHITECTURE_REVIEW.md       历史架构评审
    UI_DESIGN_HISTORY.md        历史视觉调整
backend/
  pom.xml                       Maven 依赖与打包配置
  compose.yml                   本地 MySQL 8.4.11 与持久化数据卷
  .env.example                  配置字段模板；真实 .env 不提交
  scripts/Start-Local.ps1        准备数据库、注入配置并启动 API
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
- 后端在 backend/ 中按开发方案逐步实现，当前完成工程、数据库基础与健康检查。

## 开发阶段

P0 建立工程、账户、权限、配置及前端代理；P1 完成课程、作业、保存、提交、批阅和通知闭环；P2 接入受限 AI、行为记录和规则分析；P3 增加独立隔离的运行检查。

原型中的“运行”“提交”和 AI 对话不代表后端功能已经完成。正式承担教学计分前需补齐可审计的评价更正流程，验收门槛见开发方案。项目进度以实际交付及验收结果为准。

## 原型状态预览

在“使用帮助”页面可打开无课程、无待办及加载失败示例，并恢复默认状态。课程加入只在本次页面预览中保留；邀请码 WEB2026、DB2026、UX2026、NET2026 对应示例课程。日期与逾期判断统一使用标注的示例日期 2026-10-01，不连接真实课程或 AI 服务。

## 文档维护

业务流程、架构、前端实现与验收放入 DEVELOPMENT；对外字段和端点放入 API；存储约束与事务放入 DATA_MODEL。跨文档规则修改时同步相关内容，避免复制出另一套接口或业务口径。仅需追溯的旧方案放入 archive，并注明日期及适用版本。
