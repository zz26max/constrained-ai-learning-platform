# P1-A 教学班、邀请与内容 · 指挥进度（2026-10-14）

## 目标与已定决策
- 27 个操作（公告推到 P1-C）；验收链路：教师开班→发布章节→邀请码→学生加入→阅读完成→跨班被拒。
- 演示初始化 profile（2 学期 + 2 门课，不建教学班）；`ARCHIVE_PENDING_REVIEWS` 只留扩展点（`OfferingArchiveGuard`），P1-C 补齐。
- STATUS/README/开发笔记由指挥统一更新；本人是指挥角色，不直接写业务代码，只写提示词、审查、验收。
- 实际拆分是 11 + 16（不是 10 + 17）：getOffering 归在教学班那组。

## 后端 PR #8（`backend/p1a-courses`：97d9216 4bd8971 7fd3335 8197bd5）
- 已完成：27 个操作全部 implemented；我本地复跑 `mvnw test` 159 项、`verify` 集成 118 项全部通过。
- 已确认的缺陷（待发修复提示词）：
  1. `CourseService.java:212` 的 `validatePatch` 只放行 `knowledgePointId` 的 null，导致 `patchKnowledgePoint` 发送 `chapterId:null` 解绑时返回 422，违反契约 `KnowledgePointPatch`。
  2. `CourseService.java:194`：知识点被资源引用时，只拦截了“解绑”，没拦截“改到别的章节”；契约要求只要改章节就返回 VALIDATION_ERROR。
  3. MockMvc 覆盖不足：16 个内容操作只测了 401 和缺 CSRF（`CourseHttpContractTest.java:222-263`），没有并入 `operations()`，缺正常、403/404、422 的参数化用例。
  4. `CourseContentIntegrationIT` 只有 2 个用例，缺：教师跨班写内容、知识点解绑、已归档资源的 PATCH。
  5. `CourseService.java:175-221` 每个方法挤成一行（900～1100 字符），要求按提交 2 的风格展开。
  6. `patchResource`（`CourseService.java:198`）改已归档资源时返回 200 和旧数据，实际没写入。契约 409 只有 OFFERING/CHAPTER_ARCHIVED，不能自造错误码；archiveResource 是软删除，所以按 404 `NOT_FOUND` 处理，`updateResource` 返回 0 行时同样处理。
- 【已修复并复验 2026-10-14】缺陷 1～6 都在 882d6ce 内解决。我复跑 `mvn test` 243 项、`mvn verify` 122 项、`validate_contract.py` 全部通过。
- 【遗留到 P1-B】契约 `KnowledgePointPatch`（`openapi.yaml:5261`）要求"被资源/作业引用"都拦，实现只查了资源。建 `assignments` 表时必须给 `patchKnowledgePoint` 补上作业引用检查，否则知识点换章会让作业引用悬空。
- 核实结论（已定，写入 STATUS 第 4 节已知限制）：
  - enroll/createInvite 不限流：契约列了 429，但现行 DEVELOPMENT/BACKEND 没有规则；邀请码有 256 位熵，无法枚举。P1-A 不实现（用户可推翻）。
  - `ensureChapterPositionFree` 先查后插，并发时会撞唯一约束，返回 500 而不是 422。
- 已审过、没问题：V5 迁移（复合外键、CHECK 约束、循环外键）、`InviteCodeCodec`（HMAC-SHA256，密钥 ≥32 字节，从环境变量读取）、`CourseAccess`（跨班返回 404、角色不足返回 403）、enroll 的事务与 1062 处理、进度用 HALF_UP、`updateProgress` 不回退已完成状态、DTO 字段与契约一致、SecurityConfiguration 的路由角色。

## 前端 PR #7（67a267a → 828b8d5，worktree `C:/Users/zz/.codex/worktrees/p1a-courses/…`）
- `npm run verify` 通过：8 个测试文件、61 个用例，node v24.17.0 / npm 11.13.0。
- 已审过、没问题：`safe-markdown.ts`（marked 只做词法分析，自己生成 VNode，不用 v-html，链接协议走允许列表）、`use-page-query.ts`（请求代次 + 校验 userId）、`page-error.ts`（错误分流）、`ChapterPage.vue`（进入时记录学习位置，进度用服务端返回的 courseProgress）。
- 【已修复并复验 2026-10-15，commit 828b8d5】
  1. 路由守卫与认证恢复：`bootStatus='error'` 时重试；恢复标志改为"连续两次失败才放弃"，不按会话累计；`recoverIdentity` 返回 boolean 区分可重试与已登出。
  2. 教师写路径 UI：邀请码过期判断、明文弹窗拦截 Esc、`publishChapter` 重复发布改 200 幂等。
  3. page-query 刷新时保留旧数据、弹窗前清空 actionError、422 展示字段详情。
  4. 测试补齐：路由守卫分流（`router.test.ts`）、教师写路径（`p1a-teacher.test.ts`）、认证恢复连续失败（`auth-recovery.test.ts`）。
- 已推送至 `origin/frontend/p1a-courses`（commit 828b8d5）。
- 尚未做真实模式联调。

## 杂项
- `origin/copilot/project-status-review` 指向 c50f263（与 master 相同，无差异），可以删除（属于红线操作，需先问用户）。
- `.claude/HANDOFF.md` 已过时（还写着 #6 待合并），需要更新。
- 坑：前端 worktree 不在主目录下；主目录当前检出的是 `backend/p1a-courses`；JDK 要显式传 21；不要读出 `backend/.env` 里的值。

## 下一步的第一个动作
后端修复提示词（缺陷 1～6）已于 2026-10-14 发出。等后端会话推送后：审查 diff，复跑 `mvnw test` 和 `verify`，再转去审前端 PR #7 中未审的部分。
