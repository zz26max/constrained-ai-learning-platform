# P2 后端联调说明

本说明记录 P2 后端接入方式，接口字段与错误以 [OpenAPI](../openapi.yaml) 为准，业务规则以 [DEVELOPMENT](../DEVELOPMENT.md) 为准。后端实现不代表正式前端已完成真实联调。

## 范围与依赖

P2-A：作业政策读写、辅导会话与异步请求、学生求助与教师回复/关闭；P2-B：问题词表、四类客户端事件、教师知识评价与发布证据、学生学习记录和教师统计。另接通已设计的 `getLearningRecords` 查询入口，不新增设计外路由。P3 自动检查不在本次范围。

依赖顺序：P1 账户/成员/作业/工作区 → V11 辅导政策与请求 → V12 求助与通知来源 → V13 学习事件、知识评价与证据。已有 V1–V10 不改。Flyway 只在获准的目标环境运行；本轮仅允许隔离 Testcontainers MySQL 8.4.11，不迁移当前 3307 数据库。

MySQL DDL 可能隐式提交，不能把整套迁移当作可整体回滚的事务。真实环境升级前须获准并备份；失败时核对 Flyway 历史与实际已执行 DDL，按执行边界恢复或还原备份，不修改已应用版本、不启用 clean。回退应用代码前须同时核对新增外键和已生成数据的兼容性。

P1 实际只有审计记录，没有 learning_events；本次开始记录后续可信事件，不从审计日志编造历史学习事实。P1 只接受空知识评价，没有历史教师知识结论可回填。新提交冻结知识点名称/说明；旧 P1 提交缺失历史定义的已知限制仍保留。

## 默认配置

`backend/.env.example` 与启动脚本已列出配置。外部模型默认关闭：`AI_EXTERNAL_ENABLED=false`、`AI_DATA_APPROVED=false`，供应商地址、模型和密钥留空。适配层支持兼容的非流式 JSON HTTP 接口；实际供应商尚未配置或验收。启用前确认提供商、数据类别、用途、保留和告知要求，密钥仅进入服务端环境。

没有作业政策时读取返回版本 0、enabled=false；教师用 baseVersion=0 首次保存。全局外发开关与作业政策独立：教师启用政策不代表允许向外部模型发数据。外部模型不可用的请求以 failed/PROVIDER_UNAVAILABLE 结束；规则命中的固定提示以 fallback 返回，不伪装成个性化生成。

`/me/config` 的 learningAnalytics 为 true；aiTutoring 根据适配器是否具备开关、外发批准及完整配置返回，serverChecks 仍为 false。前端应同时读取能力开关与作业政策。

AI、求助副本和客户端事件的定时清理分别由 `AI_RETENTION_CLEANUP_ENABLED`、`HELP_RETENTION_ENABLED`、`ANALYTICS_RETENTION_ENABLED` 显式启用，默认均为 false。本轮未批准真实数据库清理；读取路径仍强制执行 90 天正文到期占位，关闭物理清理不会延长可读期限。

## 调用示例

从同源入口登录并保留 Cookie。先 GET `/api/v1/auth/csrf` 获取 CSRF token；写请求携带 `Origin`、`X-CSRF-Token` 与 `Content-Type: application/json`。Cookie 令牌不是 CSRF 令牌。下面的 ID 是占位符，需要替换为本人可访问的真实 UUID。

教师 PUT `/api/v1/teacher/assignments/{assignmentId}/ai-policy`，请求结构引用 `AiPolicyWriteDTO`；版本冲突后重新读取政策，不能覆盖他人改动。

学生 POST `/api/v1/tutoring/sessions`：

```json
{"assignmentId":"<assignment UUID>"}
```

随后 POST `/api/v1/tutoring/sessions/{sessionId}/messages`：

```json
{"action":"concept","content":"如何判断盒模型宽度？","studentAttempt":"已对比边框与内边距"}
```

受理返回 202；用返回的请求 ID GET `/api/v1/tutoring/requests/{tutoringRequestId}`。HTTP 200 只表示查询成功，必须检查 queued/running/completed/fallback/failed。同学生同作业跨会话只允许一个在途请求；409 时使用 details.pendingRequestId 恢复。可选 workspaceRevision 必须是本人当前已保存版本；请求不会创建工作区或改变其 revision。

学生先 GET `/api/v1/offerings/{offeringId}/issue-tags`，再 POST `/api/v1/me/help-requests`：

```json
{"assignmentId":"<assignment UUID>","title":"盒模型排查求助","content":"宽度与预期不同","studentAttempt":"已检查 padding 与 border","issueTags":["box_model"]}
```

可选共享 revision 冻结本人文件；sharedTutoringRequestIds 只能选择本人同作业已交付且未过期的请求。教师回复成功后，学生消息 type=help_reply、target.type=help_request，指向求助详情；阅读消息与查看求助是不同操作。

学生 POST `/api/v1/me/learning-events`：

```json
{"events":[{"eventId":"<event UUID>","sessionId":"<browser-session UUID>","occurredAt":"<UTC ISO timestamp>","offeringId":"<offering UUID>","assignmentId":"<assignment UUID>","type":"editor_opened","payload":{"activeFile":"answer.md"}}]}
```

每批最多 50 条；eventId 重发同正文计 duplicate，改正文返回 EVENT_CONFLICT，整批回滚。类型、payload、归属和时间窗口由服务端验证。客户端不得上报保存、提交、教师评价、AI 完成或求助成功等可信事实。

教师评价沿用 saveFeedback/publishFeedback，知识评价只允许提交快照中的知识点，问题标签来自班级词表。草稿不生成知识证据；发布、证据、可信事件、通知同事务。重复发布不增加证据或提醒。学生及教师学习记录沿用既有端点，也可使用 `getLearningRecords` 的 offeringId 查询入口。

## 验收与前端配合

本次后端任务清单：

- [x] 作业政策与受限异步辅导、预算、恢复及安全回退。
- [x] 学生主动共享求助与教师回复/关闭、help_reply 通知。
- [x] 词表、四类客户端事件与后续可信服务端事件。
- [x] 教师知识评价、发布证据、knowledge-v2、建议与共性问题。
- [x] V11–V13 隔离库验证、权限/事务/并发测试、独立审查与规范对齐。

2026-10-25 实测：452 单元/HTTP 通过；245 MySQL 场景分次覆盖通过。最终全量运行中 240 IT 通过、5 个求助 IT 在既有 V6 迁移阶段因默认 3 秒读取超时未启动；同一代码用 `-Dit.test=HelpIntegrationIT -Dspring.datasource.hikari.data-source-properties.socketTimeout=30000` 复跑 verify，452 单元/HTTP 与 5 IT 全通过、BUILD SUCCESS。生产超时未改，未以该参数再次全量重跑。详细原始数量和边界见 STATUS，不能把这些证据写成一次全量全绿。

后端验收分别覆盖 HTTP 协议/会话/CSRF、真实 MySQL 迁移与唯一约束、跨用户/跨班拒绝、异步恢复、政策收紧、共享到期、整批事件回滚、证据规则和通知失败回滚。独立审查发现的冻结版本竞态、排队政策收紧及默认词表不一致均须在测试中回归。

远端补充证据：[CI run 40149776199](https://github.com/zz26max/constrained-ai-learning-platform/actions/runs/40149776199) 对实现提交 bd3cf67，在默认参数下完整通过 452 单元/HTTP + 245 MySQL IT（0 失败/错误/跳过，BUILD SUCCESS），未使用本地 30 秒读取参数。契约/文档与自动前端检查也通过。上述本地分次记录继续保留，用于说明容器负载下的迁移读取超时，不能与远端运行混为一次命令。

前端配合：切真实模式后验证能力/政策关闭态、请求轮询与重进恢复、求助主动共享和 help_reply 跳转、四类事件重试、教师知识评价/标签输入，以及证据不足/历史证据解释。后端不替前端保存页面路由，不修改前端代码或生成类型；本轮 OpenAPI 未改变字段结构。

共性问题按当前词表版本聚合，分别统计学生自报、教师确认与去重并集；历史其他词表版本不混入当前版本。未接入 P3 检查证据，不推断分数或能力。外部供应商实测和正式浏览器联调须另留证据，不能据本轮测试标记 verified。
