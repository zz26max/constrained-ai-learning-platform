# 项目协作约定

适用于在本仓库工作的所有 AI 协作会话，是协作、提交与证据规则的唯一出处。先读 [当前状态与交接](docs/STATUS.md) 的 §0，再按任务读 [开发方案](docs/DEVELOPMENT.md) 与本端手册；§1 之后是历史日志，不用于判断现状。前后端分开实现，任务角色不绑定模型；只执行用户本次指派的范围。

## 1. 文档归属与修改权限

| 文件 | 负责内容 | 谁能改 |
| --- | --- | --- |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | 架构、跨端业务规则、阶段与工作包 | 用户授权的维护任务 |
| [FRONTEND.md](docs/FRONTEND.md) / [BACKEND.md](docs/BACKEND.md) | 本端工程、状态、存储、事务 | 用户授权的维护任务 |
| [openapi.yaml](docs/openapi.yaml) | 路径、字段、类型、必填/可空、枚举、错误、接口状态 | 用户授权的维护任务 |
| [STATUS.md](docs/STATUS.md) | 进度、交接、验证记录、已知限制 | **任何实现任务可直接更新** |

- **冲突判定顺序**（前者覆盖后者）：代码与测试 → `openapi.yaml` → `STATUS.md` §0 → DEVELOPMENT / FRONTEND / BACKEND → `docs/features/` → `docs/archive/`。任何一层与上一层矛盾时，先修文档再开发，不要照着文档写代码。
- **文档准入**：新增 `docs/` 下的文件必须在 [docs/README.md](docs/README.md) 的索引表登记。未登记的文件不构成权威，也不得被其他文档引用。
- **现状只看 `STATUS.md` §0**；§1 及之后是只追加的历史日志，"未通过""待修复"等描述不代表当前状态。
- 除 STATUS.md 外，实现任务未经授权不改 `docs/`。需要改字段、契约或业务规则时，先说明改什么、为什么、影响哪一端，等用户确认后统一修改；不要在代码里临时兼容或加前端兜底字段。
- 字段结构以 OpenAPI 为准，业务含义以 DEVELOPMENT 为准，存储与事务以 BACKEND 为准，界面行为以 FRONTEND 为准；发现冲突先修文档再开发。其他文件只引用，不维护第二份字段表或错误码表。
- `docs/archive/` 是历史快照，不是规范。
- 只改自己负责的目录：前端只改 `frontend/`，后端只改 `backend/`。多个任务不要同时编辑同一工作区的共享文件。

## 2. 动手前先查契约，不要发明

- 接口路径、字段、错误码、权限、是否需要 CSRF，全部以 `docs/openapi.yaml` 为准。用切片工具按需读取，不要通读全文：

  ```powershell
  python scripts/contract_slice.py getCsrfToken login logout getMe getConfig
  ```

- 契约里没有的错误码、字段名或枚举值，不要自己造，先提出来。
- 契约变更在同一变更集中更新 schema、示例、前端生成类型和后端契约测试；两端无法同步时停止使用受影响接口。新增或删除生产路由必须在同一提交更新 `x-implementation-status`。

## 3. 证据规则

- `x-implementation-status`：planned 未实现；implemented 有生产实现且 HTTP 测试通过；verified 另有真实跨端联调证据。不能按按钮是否出现判断完成。
- mock 只支持并行开发，不能证明权限、事务或数据库行为；真实模式失败不得回退为模拟成功。
- CI 静态检查通过不等于联调通过；"已完成""已同步"不算证据，要有文件差异或命令输出。

## 4. 提交与交付

**每完成一个工作包或可独立验收的模块，本端检查通过后立即提交。** 首行 `<范围>: <结果>`，范围用 `frontend` / `backend` / `contract` / `docs` / `scripts`；前后端代码分开提交；已授权的契约状态变更可与对应后端路由同提交。禁止 `wip`、`更新`、`fix`、`修改` 这类说明；不用 `-f` 绕过 `.gitignore` 提交 `target/`、`dist/`、`.env`、`.contract-venv` 等。

```text
<范围>: <本包可验证的结果>

改动：<关键文件与行为>
检查：<命令、实际结果；未运行须说明原因>
未做：<未覆盖的场景与后续事项>
```

交付说明包含：改了哪些文件、跑了什么检查、实际输出、哪些还没实现、哪些是自己决定的，以及**提交哈希**；同时更新 [STATUS.md](docs/STATUS.md)。
