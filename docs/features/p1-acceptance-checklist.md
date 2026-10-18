# P1 页面验收清单

> 生成于 2026-10-18，由 `docs/openapi.yaml` 的 `x-implementation-status` 与 `frontend/src/api/*.ts` 的实际引用交叉得出。
> 用途：把"契约测试通过"和"页面真的能用"之间的缺口，变成一份可勾选、可追溯的清单。
> 重新生成方法见 §8。

## 0. 判定标准与用法

- **`verified` 的定义**（[AGENTS.md](../../AGENTS.md) §3）：另有一次真实跨端联调证据。`implemented` 只代表契约测试通过，不代表页面能用。
- 每验完一条，记录四项：**页面路径 + 操作步骤 + 结果 + 证据位置**（requestId、截图、读回 JSON）。通过后把该操作在 `openapi.yaml` 的 `x-implementation-status` 改为 `verified`——**改契约状态需负责人确认**，且同一变更集要更新契约与前端生成类型。
- 证据默认放本机临时目录（如 `D:/tmp/lp/`），**不入库**；结果摘要写进 [STATUS](../STATUS.md) 的验证记录。
- 判断通过时不要只看"页面打开了"，见 §1 的五条必过项。

### 1. 每条操作都要额外过的五关

历史上 P1 的阻塞缺陷（B1～B8）**没有一个能被静态检查或契约测试发现**，全部出在这五项里：

| 编号 | 检查点 | 曾出现的缺陷 |
| --- | --- | --- |
| F1 | 刷新整页后状态是否保留 | B3：重开草稿时截止时间控件为空 |
| F2 | 失败时是否有可见反馈 + requestId | B8：归档失败页面毫无反应 |
| F3 | 权限：学生敲教师路由、跨班 UUID、他人 submissionId 应为 403/404 且不泄漏内容 | 越权读取 |
| F4 | 离开/切页时未保存内容是否提示或先保存 | B2：切页丢未保存文字 |
| F5 | 操作连击、慢响应、立即提交等时序 | B1：立即提交丢最新编辑 |

## 2. 全景数字（2026-10-18）

| 状态 | 数量 | 含义 |
| --- | --- | --- |
| `verified` | 10 | 有真实跨端证据 |
| `implemented` 且前端有页面入口 | **47** | **本清单主体** |
| `implemented` 但无页面入口 | 4 | 见 §3 |
| 健康检查（无页面属正常） | 2 | `/health/live`、`/health/ready` |
| `planned` | 22 | P2/P3，不在本清单 |

## 3. 先处置：4 个没有页面入口的操作

| 操作 | 现状 | 处置 |
| --- | --- | --- |
| `markMessagesAsRead` `PUT /me/offerings/{offeringId}/messages/mark-read` | 页面用单条 `readMessage`，批量接口未接线 | 接"全部标为已读"，或确认不使用 |
| `getAssignmentStats` `GET /teacher/assignments/{assignmentId}/stats` | 教师作业统计页按设计不做 | 保留，不验收 |
| `getStudentLearningRecords` `GET /teacher/offerings/{offeringId}/students/{studentId}/learning-records` | 教师查看学生学习记录页按设计不做 | 保留，不验收 |
| `getFeedbackDraft` `GET /teacher/submissions/{submissionId}/feedback` | **无消费方**：`TeacherFeedbackEditor.vue` 走 `api.getSubmission()` 的 `draftFeedback` 字段 | 前端切到该接口，或把契约状态退回 `planned` |

## 4. 学生核心闭环（18 条，P0）

一次点击链可顺带覆盖大部分：登录 → 首页 → 我的课程 → 入班 → 章节 → 资料 → 作业 → 工作区 → 提交 → 消息 → 评价。

| 勾选 | 操作 | 触发页面 | 重点 |
| --- | --- | --- | --- |
| [ ] | `getDashboard` GET `/me/dashboard` | `StudentHomePage` | 多班、待办计数 |
| [ ] | `listMyCourses` GET `/me/courses` | `CourseListPage` | F1 |
| [ ] | `enroll` POST `/me/enrollments` | `CourseListPage` | 无效邀请码 |
| [ ] | `getOffering` GET `/offerings/{id}` | `OfferingPage` | F3 跨班 |
| [ ] | `listChapters` GET `/offerings/{id}/chapters` | `OfferingPage` | 未发布章节不可见 |
| [ ] | `getChapter` GET `/chapters/{id}` | `ChapterPage` | F3 |
| [ ] | `getResource` GET `/resources/{id}` | `ResourcePage` | Markdown 渲染与 XSS |
| [ ] | `updateChapterProgress` PUT `/chapters/{id}/progress` | `ChapterPage` | F1 完成后刷新 |
| [ ] | `recordLearningPosition` POST `/me/learning-position` | `ChapterPage` | 刷新后位置 |
| [ ] | `getAssignment` GET `/assignments/{id}` | `AssignmentDetail` | `canSubmit`/`submissionBlockedReason` |
| [ ] | `listMySubmissions` GET `/assignments/{id}/submissions` | `AssignmentDetail` | 超过 20 条分页 |
| [ ] | `getSubmission` GET `/submissions/{id}` | `AssignmentDetail` | 不可变快照 |
| [ ] | `getWorkspace` GET `/assignments/{id}/workspace` | `WorkspaceEditor` | 三类文件 |
| [ ] | `saveWorkspace` PUT `/assignments/{id}/workspace` | `WorkspaceEditor` | F5 409 冲突 |
| [ ] | `submitAssignment` POST `/assignments/{id}/submissions` | `WorkspaceEditor` | **F5 立即提交丢编辑（B1）** |
| [ ] | `listMessages` GET `/me/messages` | `NotificationCenter` | 未读数 |
| [ ] | `readMessage` PUT `/me/messages/{id}/read` | `NotificationCenter` | 标读后计数 |
| [ ] | `getFeedback` GET `/me/feedback/{id}` | `AssignmentDetail` | 从消息深链进入 |

## 5. 教师内容管理（19 条，P0）

| 勾选 | 操作 | 触发页面 | 重点 |
| --- | --- | --- | --- |
| [ ] | `listBaseCourses` GET `/teacher/courses` | `TeacherOfferingsPage` | — |
| [ ] | `listTeacherOfferings` GET `/teacher/offerings` | `TeacherOfferingsPage` | — |
| [ ] | `createOffering` POST `/teacher/offerings` | `TeacherOfferingsPage` | 无效学期 → 422 |
| [ ] | `archiveOffering` POST `/teacher/offerings/{id}/archive` | `TeacherOfferingPage` | 有待批阅时应拒绝 |
| [ ] | `listMembers` GET `/teacher/offerings/{id}/members` | `TeacherMembersPanel` | — |
| [ ] | `listTeacherChapters` GET `/teacher/offerings/{id}/chapters` | `TeacherChaptersPanel` | — |
| [ ] | `createChapter` POST `/teacher/offerings/{id}/chapters` | `TeacherChaptersPanel` | 重复序号 → 422 |
| [ ] | `getTeacherChapter` GET `/teacher/chapters/{id}` | `TeacherChaptersPanel` | — |
| [ ] | `patchChapter` PATCH `/teacher/chapters/{id}` | `TeacherChaptersPanel` | 空摘要允许 |
| [ ] | `publishChapter` POST `/teacher/chapters/{id}/publish` | `TeacherChaptersPanel` | — |
| [ ] | `createResource` POST `/teacher/chapters/{id}/resources` | `TeacherChaptersPanel` | — |
| [ ] | `patchResource` PATCH `/teacher/resources/{id}` | `TeacherChaptersPanel` | F1 |
| [ ] | `archiveResource` DELETE `/teacher/resources/{id}` | `TeacherChaptersPanel` | — |
| [ ] | `listKnowledgePoints` GET `/teacher/offerings/{id}/knowledge-points` | `TeacherKnowledgePanel` | — |
| [ ] | `createKnowledgePoint` POST `/teacher/offerings/{id}/knowledge-points` | `TeacherKnowledgePanel` | — |
| [ ] | `patchKnowledgePoint` PATCH `/teacher/knowledge-points/{id}` | `TeacherKnowledgePanel` | — |
| [ ] | `listInvites` GET `/teacher/offerings/{id}/invites` | `TeacherInvitesPanel` | — |
| [ ] | `createInvite` POST `/teacher/offerings/{id}/invites` | `TeacherInvitesPanel` | 名额上限 |
| [ ] | `revokeInvite` POST `/teacher/invites/{id}/revoke` | `TeacherInvitesPanel` | — |

## 6. 教师作业与批阅（7 条，P0）

| 勾选 | 操作 | 触发页面 | 重点 |
| --- | --- | --- | --- |
| [ ] | `createAssignment` POST `/teacher/offerings/{id}/assignments` | `AssignmentEditor` | **B3 日期控件 → UTC** |
| [ ] | `getTeacherAssignment` GET `/teacher/assignments/{id}` | `AssignmentEditor` | — |
| [ ] | `patchAssignment` PATCH `/teacher/assignments/{id}` | `AssignmentEditor` | **B3 不得发送 `aiPolicyVersion`** |
| [ ] | `publishAssignment` POST `/teacher/assignments/{id}/publish` | `AssignmentManagement` | — |
| [ ] | `archiveAssignment` POST `/teacher/assignments/{id}/archive` | `AssignmentManagement` | **B8 失败要有反馈** |
| [ ] | `saveFeedback` POST `/teacher/submissions/{id}/feedback` | `TeacherFeedbackEditor` | 草稿对学生不可见 |
| [ ] | `publishFeedback` POST `/teacher/submissions/{id}/feedback/publish` | `TeacherFeedbackEditor` | 发布后只读 |

## 7. 公告与统计（3 条，P1）

| 勾选 | 操作 | 触发页面 | 重点 |
| --- | --- | --- | --- |
| [ ] | `listNotices` GET `/offerings/{id}/notices` | `NoticeListPage`、`TeacherNoticesPanel` | 归档班只读 |
| [ ] | `getNotice` GET `/notices/{id}` | `NoticeDetailPage` | target 跳转 |
| [ ] | `getOfferingStats` GET `/teacher/offerings/{id}/stats` | `TeacherOfferingPage` | 学生数/待批阅数 |

## 8. 维护

重新生成缺口清单的方法（不依赖本文件是否为最新）：

1. 从 `openapi.yaml` 取每个 operation 的 `x-implementation-status`；
2. 从 `frontend/src/api/*.ts` 取 `{ id: '<operationId>' }` 形式的规格表，得到被前端调用的操作集合；
3. 差集 `implemented ∩ 被调用` 即本清单；
4. 再用页面源码确认调用点，排除只在 mock 或生成代码里出现的假阳性。

本清单不是契约，**不维护状态**——权威状态始终是 `openapi.yaml` 的 `x-implementation-status`。本文件只回答"还剩哪些没在页面上走过"。
