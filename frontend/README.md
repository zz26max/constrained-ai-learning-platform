# 学习平台前端（frontend）

Vue 3 + TypeScript strict 工程。已交付登录页与身份恢复退出、课程与章节阅读、作业列表与工作区编辑器、提交与评价、通知中心，以及按 operationId 组织的 mock 层。P1-D 多班聚合的后端接口已就绪，仪表盘、公告列表与教师统计页面尚在开发。

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
```

## mock 模式

- 唯一开关是构建环境变量 `VITE_API_MODE=real|mock`（省略即 real，其他值启动/构建失败）；切换模式必须重启开发服务，页面常显"模拟模式"标识。
- mock 响应按 operationId 组织于 `src/mocks/`，走同一请求层与同一契约类型；未实现的操作显式失败，不转发真实请求。
- 虚构账号：`student.demo` / `teacher.demo` / `admin.demo`，口令统一 `mock-demo-pass`（仅存在于 mock 层）。

## 联调与代理

开发浏览器固定从 `http://127.0.0.1:4173` 进入；Vite 只把 `/api/v1/` 转发到预配置后端（可用 `BACKEND_ORIGIN` 环境变量在启动前覆盖），保留查询、方法、正文、Cookie、CSRF、请求标识与状态码，后端不可用时返回可识别 503 JSON。生产由同源 HTTPS 反向代理提供相同路径。
