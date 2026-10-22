# 学生端视觉收敛（首页 / 课程 / 作业 + 公共外壳）

范围已确认：保留现有视觉身份（深蓝焦点、学科色、日期衬线数字、系统中文字体）；不删除任何文件；只改首页、我的课程、我的作业与侧栏/顶栏/底部导航。学习记录、日历、消息只随共享变量变化，不改结构。

## 1. 根本做法：正式三页脱离历史样式层

调研结论：历史样式层几乎全部以页面根类限定（visual.css 248 处 `.vx-page`、craft.css 379 处 `.vc-page`、integration.css 82 处 `.v35-page`、home-bplus.css 130 处 `.exploration-bplus`、home-exploration.css 131 处 `.home-exploration`，content.css 以 `.student-release` + `.vc-*` 组合限定）。demo/campus 通过 `@import` 复用这些文件。

因此：
- 三个正式组件的根节点只保留 `workspace-page` + 新根类 `sr-home` / `sr-courses` / `sr-tasks`，去掉 `vx-page v35-page vc-page vc-home vc-tasks home-exploration exploration-b exploration-bplus vx-refined` 与 `data-craft/data-polish/data-unread`。历史规则自然不再命中这三页；记录/日历/消息与 demo 预览不受影响。
- 新建 `frontend/src/features/student/release/release.css`（唯一来源），在 `main.ts` 最后导入，全部规则限定在 `.student-release`。
- 测试锁定的元素类名与文案全部保留：`.explore-focus` `#explore-focus-title` `.explore-courses` `.bplus-group-heading`（含“N 项任务”）`.task-group-heading`（文案“可继续处理/已过期未完成/暂不可提交”）`.vx-course-primary` `.vx-course-copy h2 a` `.pagination button` `.student-release`，以及“复习章节”“已逾期，可补交”“已截止”“暂不可提交”等状态文案。
- 组件内恒为真的分支（`design='bplus'`、`isPlus`、`v-if="true"`、`direction`）只删死分支，不改数据与资格逻辑。

## 2. 设计变量（release.css 顶部，`.student-release` 上定义）

| 角色 | 值 | 说明 |
|---|---|---|
| canvas | #f4f6f9 | 冷灰页面底，沿用现状但收为一个值 |
| surface | #ffffff | 唯一纸面 |
| ink / muted | #1c2d49 / #52627a | 沿用 DESIGN.md 正式值 |
| line / line-strong | #dde3ec / #c5cfdd | 分隔 / 控件边框 |
| brand / brand-hover / brand-soft | #2853bc / #2147a3 / #eef2fb | 蓝只留这三个 |
| focus-deep | #1f3b84 | 首页焦点卡唯一深蓝（去掉渐变两端色） |
| warn / warn-soft | #8a5208 / #fbf3e6 | 已截止、补交、过期分组 |
| 学科色 | 沿用 SubjectGlyph 现有四组 | 只表示学科 |

- 圆角三档：`--r-s:6px`（标签、小按钮、输入框）、`--r-m:10px`（卡片、表格、面板）、`--r-focus:14px`（仅首页焦点卡）。层级不同用不同圆角，不再出现 4/7/8/12 混用。
- 无阴影；层级只靠底色与 1px 边框。
- 字号：页面标题 28/手机 25、区块 18、正文 15、辅助 13；去掉 11–12px。衬线数字只用于日期（CraftDate），评分 90 改为无衬线 tabular-nums。

## 3. 逐页改动

公共外壳（App.vue + release.css）
- 侧栏去掉重复的“工作空间”小标题（`nav-caption`，保留 `sidebar-role` 一处）。
- 页面内不再重复面包屑：首页去掉“知学 / 虚构演示·当前学期”眉标，学期信息只在顶栏右侧。
- 手机端隐藏顶栏汉堡按钮，“更多”是唯一的菜单入口（≤760px）。
- 链接符号统一：站内跳转不加 `↗`；只有主按钮保留 `→`。

首页
- 本学期概览（课程数 / 待完成 / 未读消息）从页脚移到标题下一行，作为可点击的轻量数字行，替代原说明句。
- 右栏三块统一为同一种白色面板（`--r-m`、1px 边、无顶部色线、无浅蓝底）：最近课程、最近反馈、最新公告。
- 近期任务：日期轨道只显示 月/日 + “N 项任务”，删除“截止安排”；同组行内只保留“具体时刻截止”，相对天数（5 天后）移到组标题一次显示。行内操作改为文字链接 + 整行 hover，第一条之外不再每行一个描边按钮。
- 焦点卡保留，深蓝改单色；“查看全部待办”去掉 ↗。

我的课程
- 当前筛选为“进行中”时，卡片右上角不再逐张重复“进行中”，只在已归档/其他状态时显示。
- 学科书脊收窄为 56px，只放图形，删掉图形下重复的“DB/WEB”文字。
- 主操作“复习章节/继续阅读”改为小号描边按钮（44px 高），去掉 ↗。
- 仅一页时不渲染分页。手机端进度与“最近学习”合并为两行紧凑区。

我的作业
- 桌面表格固定列宽：截止 148px / 作业与课程 1fr / 状态 200px / 操作 120px，消除中间大空白；行高压到约 88px。
- 状态列字号 13→14，点和文字同行。
- “已过期未完成”与“暂不可提交”分组头改用 warn 色左线与底色，与“可继续处理”区分。
- 筛选栏：课程下拉 min(360px,100%)、排序 180px，计数右对齐一行。
- 原生 select 统一外观（边框、圆角、箭头色），不换组件。

## 4. 不做 / 待你另定

- 已过期任务仍显示“进行中”的语义问题：它来自作业状态（有草稿），改文案属于业务表述变更，本轮只做视觉区分，不改文案。
- 不改排序、资格、分组、分页逻辑；不改接口、后端、教师端、demo。

## 5. 验证

1. 先更新 `frontend/DESIGN.md` 增加“学生端视觉收敛（2026-10-20）”一节（规范先于实践）。
2. `npm --prefix frontend run verify`（类型 + 构建 + no-mock + vitest），失败只看失败项。
3. 预览：在 `.claude/launch.json` 用 `dev:mock`（模拟数据）启动，1440 与 390 两个宽度截图三页，逐项对照第 3 节检查；检查键盘焦点、底部导航遮挡、横向滚动。
4. 更新 `docs/STATUS.md` §0 一条记录。不提交 commit，等你确认。
