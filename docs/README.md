# 文档索引

本目录是项目的文档根。本文件只说明各文档的用途、权威边界与阅读顺序，不重复任何规范内容；文件之间出现冲突时，按 [AGENTS.md](../AGENTS.md) 第 1 节的归属规则判定。

## 1. 该读哪些

| 文档 | 负责内容 | 谁能改 |
| --- | --- | --- |
| [学生端视觉收敛](features/student-ui-convergence.md) | Claude 视觉收敛方案与范围记录 | 前端维护任务 |
| [STATUS.md](STATUS.md) | 进度、交接、验证记录、已知限制 | 任何实现任务可直接更新 |
| [DEVELOPMENT.md](DEVELOPMENT.md) | 架构、跨端业务规则、阶段与工作包 | 用户授权的维护任务 |
| [FRONTEND.md](FRONTEND.md) / [BACKEND.md](BACKEND.md) | 本端工程、状态、存储、事务 | 用户授权的维护任务 |
| [DEBUGGING.md](DEBUGGING.md) | 后端断点调试与内部实现逐步指引 | 用户授权的维护任务 |
| [openapi.yaml](openapi.yaml) | 路径、字段、类型、错误与接口实现状态 | 用户授权的维护任务 |
| [features/](features/p1a-courses.md) | 已交付工作包的设计与验收场景；[P1 页面验收清单](features/p1-acceptance-checklist.md) 追踪"契约已实现但未在页面走过"的缺口 | 用户授权的维护任务 |
| [archive/](archive/ARCHITECTURE_REVIEW.md) | 历史快照，**不是规范**；含已作废的 [2026-10-16 交接说明](archive/HANDOFF-2026-10-16.md) | 不修改 |

**准入规则**：本表是 `docs/` 的准入清单。新增 `docs/` 下的 Markdown 必须同时在本表登记用途与责任人；未登记的文件视为临时草稿，不构成权威，也不得被其他文档引用。历史上 `HANDOFF.md` 正是因为没进本表而长期无人维护、与 STATUS 冲突。

## 2. 权威边界

- 字段结构以 [openapi.yaml](openapi.yaml) 为准，业务含义以 [DEVELOPMENT.md](DEVELOPMENT.md) 为准，存储与事务以 [BACKEND.md](BACKEND.md) 为准，界面行为以 [FRONTEND.md](FRONTEND.md) 为准。
- 发现文档之间冲突时先修文档再开发；其他文件只引用，不维护第二份字段表或错误码表。
- [archive/](archive/) 保留早期文档供追溯，其中的接口、表结构与进度描述均已过时。

## 3. 推荐阅读顺序

1. 先读 [STATUS.md 的 §0「现在是什么状态」](STATUS.md)，确认当前基线、阶段与未决事项。**§1 及之后是历史日志，不要用来判断现状。**
2. 按角色读对应手册：[FRONTEND.md](FRONTEND.md) 或 [BACKEND.md](BACKEND.md)。
3. 按任务读 [DEVELOPMENT.md](DEVELOPMENT.md) 的相关章节，再按需切片契约：

   ```powershell
   .\.contract-venv\Scripts\python.exe scripts/contract_slice.py getCsrfToken login logout getMe getConfig
   ```

## 4. 契约工具

按需读取契约，不要通读全文：

| 工具 | 用途 |
| --- | --- |
| [contract_slice.py](../scripts/contract_slice.py) | 按 operationId 提取只读契约切片 |
| [validate_contract.py](../scripts/validate_contract.py) | 校验契约结构、示例、文档引用，以及文档卫生（`docs/*.md` 必须登记在本索引表、`docs/` 下不得有活跃 HANDOFF、STATUS §0 的基线 commit 必须可解析） |

两者依赖 [requirements-contract.txt](../scripts/requirements-contract.txt)，使用独立的 `.contract-venv` 环境，不进入产品依赖。
