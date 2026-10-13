# 基于受限式 AI 辅导与学习行为分析的个性化学习平台

本项目面向多课程的实践学习，提供作业学习、教师反馈、受限 AI 辅导和可解释的学习分析。

当前进度、交接与验证记录见 [STATUS](docs/STATUS.md)。原型中的课程、成绩与 AI 内容是演示数据。

## 文档入口

| 文档 | 查看内容 |
| --- | --- |
| [协作约定](AGENTS.md) | 修改权限、证据与提交规则 |
| [当前状态](docs/STATUS.md) | 进度、交接、验证记录、已知限制 |
| [开发方案](docs/DEVELOPMENT.md) | 架构、公共业务规则、阶段与工作包 |
| [前端手册](docs/FRONTEND.md) | Vue 工程、路由、状态、编辑保存与浏览器行为 |
| [后端手册](docs/BACKEND.md) | 服务分层、权限、数据模型、事务、迁移与运行 |
| [接口契约](docs/openapi.yaml) | 两端共用的接口结构、错误、权限和实现状态 |

## 正式前端启动

工具链以 frontend/.nvmrc 与 package.json 的 packageManager 为准；首次安装与验证方式见 [前端工程说明](frontend/README.md)。在 frontend/ 执行：

```powershell
npm ci
npm run dev
# 不依赖真实后端的界面开发：npm run dev:mock
```

真实模式从 http://127.0.0.1:4173 进入，代理到本地 8080 后端；先启动下节后端并准备开发账户。mock 必须明确显示标识，不能作为真实联调证据。原型与正式前端默认端口相同，不同时占用。

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

## 后端启动

当前后端提供两项健康检查及 getCsrfToken/login/logout/getMe/getConfig 五个认证操作，已建立认证链、审计与统一响应；教学业务端点仍待开发。使用 JDK 21、Spring Boot 4.1.1、Maven Wrapper 3.3.4 / Maven 3.9.16、MySQL 8.4.11。工程位置为 `backend/`，运行前需要准备 Docker 中的项目数据库；首次依赖或镜像下载需要联网。

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

应用首次启动时 Flyway 依次执行 V1～V4，建立 `terms`、`users`、`auth_sessions`、`audit_logs` 和迁移记录；已有数据库只执行尚未应用的迁移。迁移不初始化学期、账户或会话，再次启动先校验迁移，不重复建表。数据库初始连接或迁移失败时应用启动失败；已启动后数据库失联，ready 返回 503 `{"status":"unavailable"}`，live 仍可返回 200。

首次调试时，在 `src/main/java/com/learningplatform/common/health/HealthController.java` 的 `live()` 返回语句设置行断点，以 Debug 模式运行启动类，访问上述地址。停住后确认请求到达自己的方法，再选择 Resume Program（Windows 默认 F9）让请求完成。Step Into（F7）会进入被调用的方法，可能打开 Spring 依赖类的反编译代码；Step Over（F8）执行当前行，本方法返回后也可能回到 Spring 的调用者。本轮先观察请求进入与返回结果，具体操作见 [IDEA 步进说明](https://www.jetbrains.com/help/idea/stepping-through-the-program.html)。

例如在 `return` 执行结束后，F8 停在 `InvocableHandlerMethod.class` 是正常的：该类属于 Spring，负责调用 Controller 方法，后续框架会处理返回值并写入 HTTP 响应。此时按 F9 完成请求；若要重新观察自己的代码，待请求完成后刷新浏览器，再次命中 `live()` 的断点。

如果刚命中断点就显示自己的 `HealthController.class`，先停止调试，以 Maven 项目打开 `backend/pom.xml` 并完成同步，确认 `src/main/java` 为后端模块源码目录，再从 `LearningPlatformApplication.java` 启动 Debug。断点应放在 `src/main/java` 下的 `.java` 文件中；`target/classes` 和打包 jar 是编译输出。

学习统一异常处理时，重启 Debug 应用，在 `RequestIdFilter.doFilterInternal()` 和 `GlobalExceptionHandler.handleExceptionInternal()` 设置断点，再访问 `http://127.0.0.1:8080/api/v1/not-existing`。它是故意访问的不存在路径；先在正式前端登录，同一浏览器持有效会话时返回 HTTP 404、`error.code=NOT_FOUND` 和 `requestId`，匿名请求会先被认证链以 401 拒绝；浏览器开发者工具中 `X-Request-ID` 响应头与正文一致。成功及业务拒绝的演示 Controller 仅存在于 [ApiContractTest](backend/src/test/java/com/learningplatform/common/api/ApiContractTest.java)，在 IDEA 调试对应测试即可观察，不需要数据库。

在 `backend/` 且终端已选择 JDK 21 时，执行 `.\mvnw.cmd test` 跑 Web 契约、密码算法、登录凭据校验、会话令牌与配置的单元测试，不需要 Docker 或数据库环境变量；执行 `.\mvnw.cmd verify` 还会运行 Testcontainers 真实 MySQL 测试（学期约束、就绪检查、用户读写、账户初始化、登录校验与会话生命周期）并打包，要求 Docker 引擎可用。数据库测试使用临时库与临时端口，完成后释放容器，不连接开发库。数据库验证不会因为缺少 Docker 被静默跳过。

下面是内部数据访问方法的调试入口，不替代认证 HTTP 接口验收。在 IDEA 调试 [UserMapperIntegrationIT](backend/src/test/java/com/learningplatform/modules/auth/mapper/UserMapperIntegrationIT.java) 的 `findByUsernameMapsAccountAndKeepsRolesImmutable()`，在调用 Mapper 前设置断点，步过查询观察 `Optional<User>`。SQL 位于 [UserMapper.xml](backend/src/main/resources/mapper/auth/UserMapper.xml)，角色与时间的类型转换器也可设断点；Mapper 接口由 MyBatis 生成代理实现，不需要手写实现类。测试中的虚构账户只在临时库存在，不是开发库的登录账号。

IDEA 的测试启动器也需要与 JUnit 版本兼容。2026-10-08 核查本机 IDEA 2024.2.4 的 `JUnit5TestRunnerUtil` 仍调用 `MethodSelector.getMethodParameterTypes()`，而项目由 Boot 管理的 JUnit 6.0.3 已移除该方法，因此直接点击测试 Debug 会出现 `NoSuchMethodError`，尚未进入查询代码。Maven 复测该查询方法及 40 条 Web 用例均通过。建议使用 IDEA 2025.3 或更新的支持 JUnit 6 的稳定版本，完成 Maven 同步后再调试；项目 SDK 保持 JDK 21，测试依赖继续由 Boot 管理。[JUnit 6 发布记录](https://docs.junit.org/6.0.0/release-notes.html)、[IDEA 2025.3 发布说明](https://www.jetbrains.com/idea/whatsnew/2025-3/)

保留旧版 IDEA 时，可在 `backend/`、JDK 21 和可用 Docker 环境中通过 Maven 启动测试 JVM，再用 IDEA 的普通 Java 调试器附加：

```powershell
.\mvnw.cmd "-Dit.test=UserMapperIntegrationIT#findByUsernameMapsAccountAndKeepsRolesImmutable" "-Dmaven.failsafe.debug" verify
```

出现 `Listening for transport dt_socket at address: 5005` 时，测试正在等待调试器。IDEA 的 **运行 → 编辑配置 → ＋ → Remote JVM Debug** 中选择 Attach 模式、Host `localhost`、Port `5005`，类路径模块选择后端模块；在测试第 92 行设置断点后启动该配置，即可沿用 F8/F9 调试。这条路径由 Maven Failsafe 启动测试，绕过旧 IDEA 的 JUnit 启动器；只调试 Maven 主进程不能代替附加到分叉的测试 JVM。[Failsafe 调试说明](https://maven.apache.org/surefire/maven-failsafe-plugin/examples/debugging.html)

本地开发账户通过一次性命令初始化，从项目根目录执行：

```powershell
.\backend\scripts\Start-Local.ps1 -InitializeAccounts -JdkPath 'C:\Program Files\Java\jdk-21.0.11'
```

脚本仅允许连接约定的本地 `3307/learning_platform` 开发库，为缺失的 `LOCAL_STUDENT_PASSWORD/LOCAL_TEACHER_PASSWORD/LOCAL_ADMIN_PASSWORD` 生成独立随机值并保存在被忽略的 `.env`。账户分别是 `student.demo`（学生）、`teacher.demo`（教师）、`admin.demo`（管理员），姓名均为虚构演示名称。需要查看自己的密码时在本机打开 `.env`，不要将它提交或截图分享。可在首次初始化前自行填写 15～128 个 Unicode 字符的非全空白密码；格式是原样 `KEY=value`，不加引号，不执行插值，密码首尾空格也会保留。

命令启用 `local-accounts` profile，执行迁移及事务初始化后退出，不占用 API 端口；普通 `api` 启动不创建账户。日志只显示新增与跳过数量。重复执行跳过已有账户，不更改密码、姓名、权限、状态或时间；任何新增失败，本次新增全部回滚。修改或重新生成 `.env` 密码不会重置已有用户口令，已有账户即使被禁用也不会自动恢复。账户信息存入 `users`，密码仅以 Argon2id 哈希保存；初始化不会创建学期或登录会话，初始化后可通过正式前端调用已实现的登录 HTTP 接口。

学习这一功能，优先查看 [LocalAccountInitializationService](backend/src/main/java/com/learningplatform/modules/auth/service/LocalAccountInitializationService.java) 的 `initialize()` 与 `createIfMissing()`。在 IDEA Debug [LocalAccountInitializationIntegrationIT](backend/src/test/java/com/learningplatform/modules/auth/service/LocalAccountInitializationIntegrationIT.java) 的 `createsAccountsWithVerifiableHashes()`，在 Service 的查询、生成哈希和插入语句设置行断点；F8 观察新账户的业务流程。重复初始化场景见 `repeatedInitializationPreservesEveryExistingField()`。测试仅操作独立临时数据库，不会更改开发库密码。

登录凭据校验已实现为内部方法 [LoginCredentialService.verifyCredentials()](backend/src/main/java/com/learningplatform/modules/auth/service/LoginCredentialService.java)。它规范化用户名、保留密码原样，查询账户并通过 `matches()` 验证哈希；仅 `active` 账户可通过。成功返回不含密码字段的 `UserDTO`，不存在、密码错误和禁用统一抛出 `INVALID_CREDENTIALS` 业务异常。字段缺失或超出输入范围为 `VALIDATION_ERROR`，数据库故障保留为服务端异常。未知用户名仍执行占位哈希校验，减少明显的计算耗时差异；这不保证整个请求耗时完全相同，也不替代已接入的登录限流（并发空档待修复）。

在 IDEA Debug [LoginCredentialIntegrationIT](backend/src/test/java/com/learningplatform/modules/auth/service/LoginCredentialIntegrationIT.java) 的 `verifiesActiveAccountAndReturnsSafeIdentity()`，在 Service 的 `User user = ...` 和 `boolean passwordCorrect = ...` 设置行断点，F8 观察数据库用户和校验结果；先禁用 Mapper 接口方法断点，避免停在代理类中。失败场景可调试 `rejectsWrongShortPasswordWithCredentialFailure()` 与 `disabledAccountFailsWithSamePublicError()`。测试会先在自己的临时库创建账户，测试口令仅在测试代码中使用；开发库的私有密码不用于这些测试。

数据库会话已实现为内部方法 [DatabaseSessionService](backend/src/main/java/com/learningplatform/modules/auth/service/DatabaseSessionService.java)：`login()` 验证凭据、建立新会话并撤销传入的旧令牌；`resolve()` 从令牌识别当前用户，检查有效性并更新最近访问时间；`revoke()` 持久撤销，重复调用仍安全。会话令牌由 32 个随机字节生成，数据库只保存 SHA-256 摘要；这不改变密码仍使用 Argon2id 的规则。重新登录只轮换当前请求提供的旧会话，其他设备的会话可以继续使用。

会话默认期限、环境变量名称和配置约束统一见 [BACKEND 会话期限](docs/BACKEND.md#session-timeouts)。覆盖值可在 IDEA 或启动进程环境变量中设置；无需修改本地 `.env`，该文件的脚本允许字段尚不包含这两项。过期、禁用或密码/平台角色变更被观察到时，旧会话拒绝并持久撤销；姓名变更读取最新值。后续账户管理还须在禁用、密码或权限修改事务内主动撤销全部会话，避免状态先改回再访问而未被观察到。

在 IDEA Debug [DatabaseSessionIntegrationIT](backend/src/test/java/com/learningplatform/modules/auth/service/DatabaseSessionIntegrationIT.java) 的 `loginCreatesSessionAndRecognizesNextRequest()`，先在 Service 的 `login()` 内第一条语句设置行断点，再在 `resolve()` 的第一条语句设置断点。F8 观察登录产生 `SessionGrant`，再观察相同令牌识别出 `SessionIdentity`；这是两次内部调用，不是浏览器 HTTP 验收。测试使用独立临时库。

打包产物为 `target/learning-platform-backend-0.0.1-SNAPSHOT.jar`；终端注入上述数据库变量后可用 `java -jar target/learning-platform-backend-0.0.1-SNAPSHOT.jar` 启动。登录 HTTP、Cookie、CSRF、限流和前端 API 代理已接入；通过 frontend/ 登录页访问，内部 Service 不直接暴露。内部结果的原始令牌与 CSRF 秘密不进入 JSON 或 `toString()`。

停止开发数据库时，在 `backend/` 执行 `docker compose --env-file .env stop db`；下次运行启动脚本恢复。普通停止保留数据，日常开发不要删除数据卷。数据库首次初始化后，修改 `.env` 密码不会自动修改已有数据库账号，应通过数据库管理流程协调变更。

## 目录与开发约定

```text
README.md                       项目入口与启动方法
AGENTS.md                       协作、证据与提交规则
docs/
  STATUS.md                     当前进度、交接与验证记录
  DEVELOPMENT.md                架构、业务规则与工作包
  FRONTEND.md                   前端开发手册
  BACKEND.md                    后端开发手册与数据模型
  openapi.yaml                  共享结构契约
  archive/
    ARCHITECTURE_REVIEW.md       历史架构评审
    UI_DESIGN_HISTORY.md        历史视觉调整
scripts/
  validate_contract.py          契约、示例与文档引用校验
  contract_slice.py             按 operationId 提取只读契约
  requirements-contract.txt     契约工具依赖
.github/workflows/contract.yml  静态检查与后端测试
frontend/                       正式 Vue 工程，P0-A 登录与会话基础已交付
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

## 原型状态预览

在“使用帮助”页面可打开无课程、无待办及加载失败示例，并恢复默认状态。课程加入只在本次页面预览中保留；邀请码 WEB2026、DB2026、UX2026、NET2026 对应示例课程。日期与逾期判断统一使用标注的示例日期 2026-10-01，不连接真实课程或 AI 服务。
