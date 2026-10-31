import type { components } from '../api/generated/schema'
import type {
  BaseCourseDTO, OfferingDTO, CourseSummaryDTO, ProgressDTO, ChapterDetailDTO,
  TeacherChapterDetailDTO, TeacherChapterSummaryDTO, ResourceDTO, KnowledgePointDTO,
  MemberDTO, InviteDTO, InviteCreatedDTO, EnrollmentDTO, LearningPositionDTO,
  OfferingWrite, ChapterWrite, ChapterPatch, KnowledgePointWrite, KnowledgePointPatch,
  ResourceWrite, ResourcePatch, InviteWrite, EnrollmentWrite, ChapterProgressWrite,
  LearningPositionWrite,
} from '../api/courses'
import { MOCK_TERM, mockSession, requireMockSession, validateMockCsrf } from './auth'
import { randomUUID } from './random'
import type { MockHandler, MockRequestContext, MockResult } from './types'
import { sharedMembers } from './shared-state'
import { P1A_IDS as _P1A_IDS, P1A_INVITE_CODES as _P1A_INVITE_CODES } from './constants'

type ChapterProgress = components['schemas']['ChapterProgress']
type Body = Record<string, unknown>
const uuid = (value: number) => '00000000-0000-4000-8000-' + String(value).padStart(12, '0')

// Re-export from constants to maintain backward compatibility
export const P1A_IDS = _P1A_IDS
export const P1A_INVITE_CODES = _P1A_INVITE_CODES

const personalResource1 = `# HTML 入门

HTML（HyperText Markup Language）是构建网页的标准标记语言。每个网页都由 HTML 元素组成。

## 什么是 HTML

HTML 描述网页的结构，由一系列元素组成。元素用标签包围内容，告诉浏览器如何显示。

## 基本元素结构

\`\`\`html
<标签名 属性="值">内容</标签名>
\`\`\`

- **开始标签**：元素名称加尖括号
- **内容**：元素内的文本或子元素
- **结束标签**：与开始标签类似，但名称前有斜杠

## 常见属性

| 属性 | 说明 |
|------|------|
| class | 元素的类名，用于 CSS 和 JS |
| id | 元素的唯一标识符 |
| style | 内联样式 |
| title | 元素的额外信息（鼠标悬停显示） |

## HTML 文档基本结构

\`\`\`html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>页面标题</title>
</head>
<body>
  <h1>我的第一个网页</h1>
  <p>这是一个段落。</p>
</body>
</html>
\`\`\`

\`<!DOCTYPE html>\` 声明文档类型为 HTML5。\`<html>\` 是根元素，\`lang\` 属性指定语言。\`<head>\` 包含元数据，\`<body>\` 包含可见内容。

## 练习要点

1. 理解 HTML 元素由标签、内容和属性组成
2. 掌握文档的基本结构（DOCTYPE、html、head、body）
3. 正确使用 \`charset\`、\`lang\`、\`viewport\` 等元属性`

const personalResource2 = `# 文本与链接

HTML 提供丰富的标签来组织和格式化文本内容，以及创建超链接连接不同页面。

## 标题标签

HTML 提供六级标题，从 \`<h1>\` 到 \`<h6>\`：

\`\`\`html
<h1>主标题</h1>
<h2>次要标题</h2>
<h3>三级标题</h3>
\`\`\`

每个页面应只有一个 \`<h1>\`，标题应按逻辑顺序使用，不要跳级。

## 段落与换行

\`\`\`html
<p>这是一个段落。浏览器会自动在段落前后添加空白。</p>
<p>第一行内容<br>第二行内容（使用 br 标签换行）</p>
\`\`\`

## 列表

**无序列表**（项目符号）：

\`\`\`html
<ul>
  <li>项目一</li>
  <li>项目二</li>
</ul>
\`\`\`

**有序列表**（编号）：

\`\`\`html
<ol>
  <li>第一步</li>
  <li>第二步</li>
</ol>
\`\`\`

列表可以嵌套，形成多级结构。

## 超链接

\`\`\`html
<a href="https://example.com">访问示例网站</a>
<a href="page2.html">跳转到第二页</a>
<a href="#section1">跳转到页面内锚点</a>
<a href="mailto:test@example.com">发送邮件</a>
\`\`\`

\`target="_blank"\` 在新窗口打开链接。

## 文本格式化

- \`<strong>\` 表示重要文本（通常加粗）
- \`<em>\` 表示强调文本（通常斜体）
- \`<code>\` 表示代码片段
- \`<blockquote>\` 表示引用块`

const personalResource3 = `# 多媒体与嵌入

HTML 支持在页面中嵌入图片、视频、音频等多媒体内容，以及通过 iframe 嵌入其他页面。

## 图片

\`\`\`html
<img src="photo.jpg" alt="照片描述" width="400" height="300">
\`\`\`

\`alt\` 属性提供替代文本，用于屏幕阅读器和图片加载失败时显示。

**常见图片格式**：JPEG（照片）、PNG（透明背景）、GIF（动画）、SVG（矢量图）、WebP（现代高效格式）。

## 视频

\`\`\`html
<video src="video.mp4" controls width="640" height="360">
  您的浏览器不支持视频播放。
</video>
\`\`\`

可用属性：\`controls\`（显示控件）、\`autoplay\`（自动播放）、\`loop\`（循环）、\`muted\`（静音）、\`poster\`（封面图）。

## 音频

\`\`\`html
<audio src="audio.mp3" controls>
  您的浏览器不支持音频播放。
</audio>
\`\`\`

## iframe 嵌入

\`\`\`html
<iframe src="https://example.com" width="600" height="400" title="嵌入内容">
</iframe>
\`\`\`

## 响应式图片

\`\`\`html
<picture>
  <source media="(max-width: 600px)" srcset="small.jpg">
  <source media="(max-width: 1200px)" srcset="medium.jpg">
  <img src="large.jpg" alt="响应式图片示例">
</picture>
\`\`\`

## 练习要点

1. 始终为图片提供有意义的 \`alt\` 属性
2. 使用 \`<figure>\` 和 \`<figcaption>\` 为媒体内容添加说明
3. 为视频和音频提供 \`controls\` 以便用户操作`

const personalResource4 = `# 表格与表单

表格用于展示结构化数据，表单用于收集用户输入。两者都是 Web 交互的基础。

## 表格结构

\`\`\`html
<table>
  <thead>
    <tr>
      <th>姓名</th>
      <th>年龄</th>
      <th>城市</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>张三</td>
      <td>20</td>
      <td>北京</td>
    </tr>
  </tbody>
</table>
\`\`\`

\`colspan\` 和 \`rowspan\` 属性可以合并单元格。

## 表单基础

\`\`\`html
<form action="/submit" method="post">
  <label for="username">用户名：</label>
  <input type="text" id="username" name="username" required>

  <label for="email">邮箱：</label>
  <input type="email" id="email" name="email">

  <button type="submit">提交</button>
</form>
\`\`\`

## 常用输入类型

| 类型 | 用途 |
|------|------|
| text | 单行文本 |
| password | 密码 |
| email | 邮箱（自动验证格式） |
| number | 数字 |
| date | 日期选择器 |
| checkbox | 复选框 |
| radio | 单选按钮 |
| select | 下拉选择 |
| textarea | 多行文本 |
| file | 文件上传 |

## label 与 input 关联

\`<label>\` 的 \`for\` 属性必须与 \`<input>\` 的 \`id\` 一致。这样点击标签就能聚焦输入框，提升可访问性。

## 表单分组

\`\`\`html
<fieldset>
  <legend>个人信息</legend>
  <label for="name">姓名：</label>
  <input type="text" id="name" name="name">
</fieldset>
\`\`\`

\`<fieldset>\` 将相关字段分组，\`<legend>\` 提供组标题。`

const personalResource5 = `# 文档结构与语义化

语义化 HTML 使用有意义的标签来描述内容的结构和用途，而不是仅用 \`<div>\` 和 \`<span>\`。

## 语义化布局标签

| 标签 | 用途 |
|------|------|
| \`<header>\` | 页面或区块的头部 |
| \`<nav>\` | 导航链接区域 |
| \`<main>\` | 页面主要内容（每页唯一） |
| \`<article>\` | 独立的、可复用的内容块 |
| \`<section>\` | 主题相关的内容分组 |
| \`<aside>\` | 侧边栏或补充信息 |
| \`<footer>\` | 页面或区块的底部 |
| \`<figure>\` | 独立的内容（图片、代码等） |
| \`<figcaption>\` | figure 的说明文字 |

## 典型页面结构

\`\`\`html
<body>
  <header>
    <h1>网站标题</h1>
    <nav>
      <a href="/">首页</a>
      <a href="/about">关于</a>
    </nav>
  </header>

  <main>
    <article>
      <h2>文章标题</h2>
      <p>文章内容...</p>
    </article>
  </main>

  <aside>
    <h3>相关链接</h3>
    <ul>
      <li><a href="#">链接一</a></li>
    </ul>
  </aside>

  <footer>
    <p>&copy; 2026 网站名称</p>
  </footer>
</body>
\`\`\`

## 文档大纲

- 使用语义化标签而非 \`<div>\` 构建结构
- 标题层级从 \`<h1>\` 开始，依次递进，不要跳级
- 每个 \`<section>\` 和 \`<article>\` 可以有自己的标题层级

## 最佳实践

1. **样式与结构分离**：CSS 放在 \`<head>\` 的 \`<style>\` 或外部文件
2. **脚本优化**：\`<script>\` 放在 \`</body>\` 前或使用 \`defer\`/\`async\`
3. **可访问性**：为图片添加 \`alt\`，为表单添加 \`label\`
4. **验证代码**：使用 W3C 验证器检查 HTML 正确性`

const personalOfferingFixture: OfferingDTO = {
  id: P1A_IDS.offeringPersonal, courseId: P1A_IDS.basePersonal, title: 'HTML 入门教程',
  mark: 'WEB', groupName: '个人自学', termId: MOCK_TERM.id, termLabel: MOCK_TERM.label,
  status: 'active', progressUnit: 'chapter', teachers: [],
}
const STUDENT_ID = uuid(1), TEACHER_ID = uuid(2)
const fixtureTime = '2026-10-14T02:00:00Z'
const now = () => new Date().toISOString()
const notStarted = (): ChapterProgress => ({ status: 'not_started', completedAt: null })
const teacher = { id: TEACHER_ID, displayName: '演示教师' }
const fixtureOffering: OfferingDTO = {
  id: P1A_IDS.offeringWeb, courseId: P1A_IDS.baseWeb, title: 'Web 前端开发技术',
  mark: 'WEB', groupName: '计算机 2301 班', termId: MOCK_TERM.id, termLabel: MOCK_TERM.label,
  status: 'active', progressUnit: 'chapter', teachers: [teacher],
}
const fixtureResource: ResourceDTO = {
  id: P1A_IDS.resourceWeb, offeringId: P1A_IDS.offeringWeb, chapterId: P1A_IDS.chapterWeb,
  knowledgePointId: P1A_IDS.knowledgeWeb, title: '语义化文档结构', type: 'markdown',
  content: '# 语义化文档结构\n\n使用语义标签表达页面结构。\n\n- 先组织内容\n- 再检查标签含义\n\n```html\n<main>学习内容</main>\n```',
  url: null, order: 1, archived: false,
}
const fixtureKnowledge: KnowledgePointDTO = {
  id: P1A_IDS.knowledgeWeb, offeringId: P1A_IDS.offeringWeb,
  chapterId: P1A_IDS.chapterWeb, title: 'HTML 语义结构', description: '解释标签与内容结构的关系。', order: 1,
}
const fixtureChapter: ChapterDetailDTO = {
  id: P1A_IDS.chapterWeb, offeringId: P1A_IDS.offeringWeb, number: 1,
  title: 'HTML 文档结构', summary: '语义标签、链接与表单', isRequired: true,
  publicationState: 'published', studentProgress: notStarted(), contentVersion: 1,
  resourceCount: 1, assignmentCount: 0, resources: [fixtureResource], knowledgePoints: [fixtureKnowledge], assignments: [],
}
const fixtureTeacherChapter: TeacherChapterDetailDTO = { ...fixtureChapter, studentProgress: null, assignments: [] }
const fixtureSummary: CourseSummaryDTO = {
  offeringId: fixtureOffering.id, courseId: fixtureOffering.courseId, title: fixtureOffering.title,
  mark: fixtureOffering.mark, groupName: fixtureOffering.groupName, termId: fixtureOffering.termId,
  termLabel: fixtureOffering.termLabel, status: 'active', teachers: [teacher],
  currentChapter: { id: fixtureChapter.id, number: fixtureChapter.number, title: fixtureChapter.title },
  progress: { unit: 'chapter', completed: 0, total: 2, percent: 0, notConfigured: false, asOf: fixtureTime },
  lastStudiedAt: null, pendingAssignmentCount: 0, unreadFeedbackCount: 0,
}
const fixtureEnrollment: EnrollmentDTO = { offeringId: P1A_IDS.offeringDatabase, enrolledAt: fixtureTime, created: true }
export const P1A_FIXTURES = {
  offering: fixtureOffering, chapter: fixtureChapter, teacherChapter: fixtureTeacherChapter,
  resource: fixtureResource, knowledgePoint: fixtureKnowledge, courseSummary: fixtureSummary,
  enrollment: fixtureEnrollment,
}

interface StoredOffering { dto: OfferingDTO; createdAt: string }
interface StoredInvite { dto: InviteDTO; offeringId: string; codeKey: string }
const offerings = new Map<string, StoredOffering>()
const chapters = new Map<string, TeacherChapterSummaryDTO>()
const resources = new Map<string, ResourceDTO>()
const knowledgePoints = new Map<string, KnowledgePointDTO>()
/** 供作业快照冻结知识点定义（P2 知识评价）：只保留已登记的 ID，顺序随入参。 */
export function mockKnowledgeSnapshot(ids: readonly string[]): Array<{ id: string; title: string; description: string }> {
  return ids.filter(id => knowledgePoints.has(id)).map(id => {
    const point = knowledgePoints.get(id)!
    return { id: point.id, title: point.title, description: point.description }
  })
}
const invites = new Map<string, StoredInvite>()
const chapterProgress = new Map<string, ChapterProgress>()
const positions = new Map<string, LearningPositionDTO>()
const baseCourses: BaseCourseDTO[] = [
  { id: P1A_IDS.baseWeb, title: 'Web 前端开发技术', mark: 'WEB' },
  { id: P1A_IDS.baseDatabase, title: '数据库原理', mark: 'DB' },
  { id: P1A_IDS.basePersonal, title: 'HTML 入门教程', mark: 'WEB' },
]
const progressKey = (userId: string, chapterId: string) => userId + ':' + chapterId
const positionKey = (userId: string, offeringId: string) => userId + ':' + offeringId
// Deterministic mock lookup only; this is not a production cryptographic digest.
function codeKey(code: string): string {
  let value = 2166136261
  for (const character of code.trim().toUpperCase()) value = Math.imul(value ^ character.charCodeAt(0), 16777619)
  return String(value >>> 0)
}
function seedInvite(id: string, offeringId: string, code: string, expiresAt = '2099-01-01T00:00:00Z', revokedAt: string | null = null, maxUses: number | null = 3, usedCount = 0): void {
  invites.set(id, { offeringId, codeKey: codeKey(code), dto: { id, expiresAt, maxUses, usedCount, revokedAt, createdAt: fixtureTime } })
}
export function resetMockCourseState(): void {
  offerings.clear(); chapters.clear(); resources.clear(); knowledgePoints.clear()
  sharedMembers.clear(); invites.clear(); chapterProgress.clear(); positions.clear()
  const database: OfferingDTO = { ...fixtureOffering, id: P1A_IDS.offeringDatabase, courseId: P1A_IDS.baseDatabase, title: '数据库原理', mark: 'DB' }
  const empty: OfferingDTO = { ...fixtureOffering, id: P1A_IDS.offeringEmpty, title: '课程内容准备中', groupName: '计算机 2302 班' }
  const foreign: OfferingDTO = { ...fixtureOffering, id: P1A_IDS.offeringForeign, groupName: '其他教学班', teachers: [{ id: uuid(999), displayName: '其他演示教师' }] }
  const pendingArchive: OfferingDTO = { ...fixtureOffering, id: P1A_IDS.offeringPendingArchive, title: '待批阅归档示例', groupName: '计算机 2303 班' }
  for (const dto of [fixtureOffering, database, empty, pendingArchive, foreign]) {
    offerings.set(dto.id, { dto: structuredClone(dto), createdAt: fixtureTime })
    sharedMembers.set(dto.id, [{ userId: dto.teachers[0]?.id || TEACHER_ID, username: dto.id === foreign.id ? 'other.teacher' : 'teacher.demo', displayName: dto.teachers[0]?.displayName || '演示教师', role: 'teacher', joinedAt: fixtureTime }])
  }
  sharedMembers.get(fixtureOffering.id)?.push({ userId: STUDENT_ID, displayName: '演示学生', username: 'student.demo', role: 'student', joinedAt: fixtureTime })
  const summary: TeacherChapterSummaryDTO = {
    id: fixtureChapter.id, offeringId: fixtureChapter.offeringId, number: 1, title: fixtureChapter.title,
    summary: fixtureChapter.summary, isRequired: true, publicationState: 'published',
    studentProgress: null, contentVersion: 1, resourceCount: 1, assignmentCount: 0,
  }
  for (const item of [
    summary,
    { ...summary, id: P1A_IDS.chapterSecond, number: 2, title: 'CSS 基础与盒模型', summary: '选择器、尺寸与内外边距' },
    { ...summary, id: P1A_IDS.chapterDraft, number: 3, title: 'CSS 布局与响应式设计', summary: 'Flex 与媒体查询', publicationState: 'draft', resourceCount: 0 },
    { ...summary, id: P1A_IDS.chapterDatabase, offeringId: P1A_IDS.offeringDatabase, title: '关系模式与约束', summary: '理解主键、外键与约束' },
    { ...summary, id: P1A_IDS.chapterArchived, number: 4, title: '归档章节', summary: '历史内容', publicationState: 'archived', resourceCount: 0 },
  ] satisfies TeacherChapterSummaryDTO[]) chapters.set(item.id, structuredClone(item))
  resources.set(fixtureResource.id, structuredClone(fixtureResource))
  resources.set(P1A_IDS.resourceSecond, { ...fixtureResource, id: P1A_IDS.resourceSecond, chapterId: P1A_IDS.chapterSecond, knowledgePointId: null, title: '盒模型阅读资料', content: '## CSS 盒模型\n\n比较内容、内边距与边框的宽度。' })
  resources.set(P1A_IDS.resourceDatabase, { ...fixtureResource, id: P1A_IDS.resourceDatabase, offeringId: P1A_IDS.offeringDatabase, chapterId: P1A_IDS.chapterDatabase, knowledgePointId: P1A_IDS.knowledgeDatabase, title: '关系模式', content: '## 关系模式\n\n先明确主键与外键。' })
  knowledgePoints.set(fixtureKnowledge.id, structuredClone(fixtureKnowledge))
  knowledgePoints.set(P1A_IDS.knowledgeDatabase, { ...fixtureKnowledge, id: P1A_IDS.knowledgeDatabase, offeringId: P1A_IDS.offeringDatabase, chapterId: P1A_IDS.chapterDatabase, title: '关系约束' })

  offerings.set(personalOfferingFixture.id, { dto: structuredClone(personalOfferingFixture), createdAt: fixtureTime })
  sharedMembers.set(personalOfferingFixture.id, [])
  // V16 迁移对齐：5 章真实 Web 课程结构
  const personalChapters: Array<{ id: string; number: number; title: string; summary: string; resourceId: string; resourceTitle: string; resourceContent: string; knowledgeId: string; knowledgeTitle: string; knowledgeDescription: string }> = [
    { id: P1A_IDS.chapterPersonal1, number: 1, title: 'HTML 基础', summary: '学习 HTML 文档结构与常用标签', resourceId: P1A_IDS.resourcePersonal1, resourceTitle: 'HTML 文档结构', resourceContent: personalResource1, knowledgeId: P1A_IDS.knowledgePersonal1, knowledgeTitle: '文档结构', knowledgeDescription: '理解 HTML 文档的基本结构：DOCTYPE、html、head、body' },
    { id: P1A_IDS.chapterPersonal2, number: 2, title: 'CSS 样式基础', summary: '掌握 CSS 选择器、盒模型与布局', resourceId: P1A_IDS.resourcePersonal3, resourceTitle: 'CSS 选择器与属性', resourceContent: personalResource3, knowledgeId: P1A_IDS.knowledgePersonal4, knowledgeTitle: '选择器优先级', knowledgeDescription: '理解元素、类、ID 选择器及优先级规则' },
    { id: P1A_IDS.chapterPersonal3, number: 3, title: 'JavaScript 入门', summary: '学习变量、函数与 DOM 操作', resourceId: P1A_IDS.resourcePersonal5, resourceTitle: '变量与数据类型', resourceContent: personalResource5, knowledgeId: P1A_IDS.knowledgePersonal7, knowledgeTitle: '变量与数据类型', knowledgeDescription: '使用 let、const 声明变量，理解基本数据类型' },
    { id: P1A_IDS.chapterPersonal4, number: 4, title: '响应式设计', summary: '使用媒体查询与 Flexbox 实现自适应布局', resourceId: P1A_IDS.resourcePersonal8, resourceTitle: '媒体查询', resourceContent: personalResource4, knowledgeId: P1A_IDS.knowledgePersonal10, knowledgeTitle: '媒体查询', knowledgeDescription: '使用 @media 规则适配不同设备' },
    { id: P1A_IDS.chapterPersonal5, number: 5, title: '综合实践', summary: '完成个人主页项目', resourceId: P1A_IDS.resourcePersonal10, resourceTitle: '个人主页项目', resourceContent: personalResource2, knowledgeId: P1A_IDS.knowledgePersonal12, knowledgeTitle: '项目结构', knowledgeDescription: '组织 HTML、CSS、JS 代码构建完整项目' },
  ]
  for (const item of personalChapters) {
    chapters.set(item.id, { id: item.id, offeringId: P1A_IDS.offeringPersonal, number: item.number, title: item.title, summary: item.summary, isRequired: true, publicationState: 'published', studentProgress: null, contentVersion: 1, resourceCount: 1, assignmentCount: 0 })
    resources.set(item.resourceId, { id: item.resourceId, offeringId: P1A_IDS.offeringPersonal, chapterId: item.id, knowledgePointId: item.knowledgeId, title: item.resourceTitle, type: 'markdown', content: item.resourceContent, url: null, order: 1, archived: false })
    knowledgePoints.set(item.knowledgeId, { id: item.knowledgeId, offeringId: P1A_IDS.offeringPersonal, chapterId: item.id, title: item.knowledgeTitle, description: item.knowledgeDescription, order: 1 })
  }

  seedInvite(P1A_IDS.inviteDatabase, database.id, P1A_INVITE_CODES.database)
  seedInvite(P1A_IDS.inviteEmpty, empty.id, P1A_INVITE_CODES.empty)
  seedInvite(uuid(603), database.id, P1A_INVITE_CODES.expired, '2020-01-01T00:00:00Z')
  seedInvite(uuid(604), database.id, P1A_INVITE_CODES.revoked, '2099-01-01T00:00:00Z', fixtureTime)
  seedInvite(uuid(605), database.id, P1A_INVITE_CODES.exhausted, '2099-01-01T00:00:00Z', null, 1, 1)
}
resetMockCourseState()

function object(value: unknown): value is Body { return value !== null && typeof value === 'object' && !Array.isArray(value) }
const text = (value: unknown, maximum: number, minimum = 0): value is string => typeof value === 'string' && value.length >= minimum && value.length <= maximum
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 2147483647
const timestamp = (value: unknown): value is string => typeof value === 'string' && value.endsWith('Z') && !Number.isNaN(Date.parse(value))
const optionalId = (value: unknown) => value === undefined || value === null || identifier(value)
const optional = (body: Body, key: string, validate: (value: unknown) => boolean) => body[key] === undefined || validate(body[key])
const allowed = (body: Body, names: string[]) => Object.keys(body).length > 0 && Object.keys(body).every(name => names.includes(name))
function offeringWrite(value: unknown): value is OfferingWrite {
  return object(value) && allowed(value, ['courseId', 'title', 'groupName', 'termId', 'progressUnit']) && identifier(value.courseId) && identifier(value.termId) && text(value.title, 200, 1) && text(value.groupName, 200, 1) && (value.progressUnit === 'chapter' || value.progressUnit === 'assignment')
}
function chapterWrite(value: unknown): value is ChapterWrite {
  return object(value) && allowed(value, ['number', 'title', 'summary', 'isRequired']) && integer(value.number) && text(value.title, 200, 1) && text(value.summary, 8000) && typeof value.isRequired === 'boolean'
}
function chapterPatch(value: unknown): value is ChapterPatch {
  return object(value) && allowed(value, ['number', 'title', 'summary', 'isRequired']) && optional(value, 'number', integer) && optional(value, 'title', v => text(v, 200, 1)) && optional(value, 'summary', v => text(v, 8000)) && optional(value, 'isRequired', v => typeof v === 'boolean')
}
function knowledgeWrite(value: unknown): value is KnowledgePointWrite {
  return object(value) && allowed(value, ['chapterId', 'title', 'description', 'order']) && optionalId(value.chapterId) && text(value.title, 200, 1) && text(value.description, 8000) && integer(value.order)
}
function knowledgePatch(value: unknown): value is KnowledgePointPatch {
  return object(value) && allowed(value, ['chapterId', 'title', 'description', 'order']) && optionalId(value.chapterId) && optional(value, 'title', v => text(v, 200, 1)) && optional(value, 'description', v => text(v, 8000)) && optional(value, 'order', integer)
}
const content = (value: unknown): value is string => typeof value === 'string' && new TextEncoder().encode(value).byteLength <= 65536
function resourceWrite(value: unknown): value is ResourceWrite {
  return object(value) && allowed(value, ['knowledgePointId', 'title', 'type', 'content', 'url', 'order']) && optionalId(value.knowledgePointId) && text(value.title, 200, 1) && value.type === 'markdown' && content(value.content) && value.url === null && integer(value.order)
}
function resourcePatch(value: unknown): value is ResourcePatch {
  return object(value) && allowed(value, ['knowledgePointId', 'title', 'content', 'order']) && optionalId(value.knowledgePointId) && optional(value, 'title', v => text(v, 200, 1)) && optional(value, 'content', content) && optional(value, 'order', integer)
}
function inviteWrite(value: unknown): value is InviteWrite {
  return object(value) && allowed(value, ['expiresAt', 'maxUses']) && timestamp(value.expiresAt) && (value.maxUses === undefined || value.maxUses === null || integer(value.maxUses))
}
function enrollmentWrite(value: unknown): value is EnrollmentWrite {
  return object(value) && allowed(value, ['inviteCode']) && text(value.inviteCode, 128, 1)
}
function progressWrite(value: unknown): value is ChapterProgressWrite {
  return object(value) && allowed(value, ['status']) && (value.status === 'in_progress' || value.status === 'completed')
}
function positionWrite(value: unknown): value is LearningPositionWrite {
  return object(value) && allowed(value, ['offeringId', 'chapterId', 'assignmentId']) && identifier(value.offeringId) && ((identifier(value.chapterId) && value.assignmentId === undefined) || (identifier(value.assignmentId) && value.chapterId === undefined))
}
const requestId = (context: MockRequestContext) => context.headers['X-Request-ID'] || randomUUID()
const ok = (context: MockRequestContext, data: unknown, status = 200): MockResult => ({ status, bodyJson: { data: structuredClone(data), requestId: requestId(context) } })
const fail = (context: MockRequestContext, status: number, code: string, message: string, details: unknown = {}): MockResult => ({ status, bodyJson: { error: { code, message, details }, requestId: requestId(context) } })
const invalid = (context: MockRequestContext, message = '输入不符合要求。', field = 'body'): MockResult => ({ status: 422, bodyJson: { error: { code: 'VALIDATION_ERROR', message, details: { fields: [{ field, message }] } }, requestId: requestId(context) } })
const missing = (context: MockRequestContext) => fail(context, 404, 'NOT_FOUND', '对象不存在或不可访问。')
const archived = (context: MockRequestContext) => fail(context, 409, 'OFFERING_ARCHIVED', '教学班已归档，当前只能查看历史内容。')
const idFor = (context: MockRequestContext) => new URL(context.path, 'http://mock.local').pathname.split('/')[context.path.startsWith('/api/v1/teacher/') ? 5 : 4] || ''
export function isMember(offeringId: string, userId: string, role?: MemberDTO['role']): boolean {
  return sharedMembers.get(offeringId)?.some(item => item.userId === userId && (role === undefined || item.role === role)) ?? false
}
function readableOffering(id: string, userId: string): OfferingDTO | undefined {
  return isMember(id, userId) ? offerings.get(id)?.dto : undefined
}
function teacherOffering(id: string, userId: string): OfferingDTO | undefined {
  return isMember(id, userId, 'teacher') ? offerings.get(id)?.dto : undefined
}
function courseChapters(id: string, publishedOnly = false): TeacherChapterSummaryDTO[] {
  return [...chapters.values()].filter(item => item.offeringId === id && (!publishedOnly || item.publicationState === 'published')).sort((a, b) => a.number - b.number || a.id.localeCompare(b.id))
}
function chapterResources(id: string): ResourceDTO[] {
  return [...resources.values()].filter(item => item.chapterId === id && !item.archived).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}
function chapterKnowledge(id: string): KnowledgePointDTO[] {
  const referenced = new Set(chapterResources(id).map(item => item.knowledgePointId))
  return [...knowledgePoints.values()].filter(item => item.chapterId === id || referenced.has(item.id)).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}
function chapterSummary(chapter: TeacherChapterSummaryDTO): TeacherChapterSummaryDTO {
  return { ...chapter, resourceCount: chapterResources(chapter.id).length }
}
function courseProgress(offering: OfferingDTO, userId: string): ProgressDTO {
  const list = offering.progressUnit === 'chapter' ? courseChapters(offering.id, true).filter(item => item.isRequired) : []
  const completed = list.filter(item => chapterProgress.get(progressKey(userId, item.id))?.status === 'completed').length
  return { unit: offering.progressUnit, completed, total: list.length, percent: list.length ? Math.round(completed / list.length * 100) : 0, notConfigured: list.length === 0, asOf: now() }
}
function courseSummary(offering: OfferingDTO, userId: string): CourseSummaryDTO {
  const list = courseChapters(offering.id, true), position = positions.get(positionKey(userId, offering.id))
  const current = list.find(item => item.id === position?.lastChapterId) || list.find(item => chapterProgress.get(progressKey(userId, item.id))?.status !== 'completed') || list[0]
  return {
    offeringId: offering.id, courseId: offering.courseId, title: offering.title, mark: offering.mark,
    groupName: offering.groupName, termId: offering.termId, termLabel: offering.termLabel,
    status: offering.status, teachers: offering.teachers,
    currentChapter: current ? { id: current.id, number: current.number, title: current.title } : null,
    progress: courseProgress(offering, userId), lastStudiedAt: position?.lastStudiedAt ?? null,
    pendingAssignmentCount: 0, unreadFeedbackCount: 0,
  }
}
function paginate<T>(items: T[], context: MockRequestContext): { items: T[]; page: number; pageSize: number; total: number } | null {
  const query = new URL(context.path, 'http://mock.local').searchParams
  const page = Number(query.get('page') || '1'), pageSize = Number(query.get('pageSize') || '20')
  if (!integer(page) || !integer(pageSize) || pageSize > 100) return null
  return { items: items.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: items.length }
}
function validKnowledge(id: string | null | undefined, offeringId: string, chapterId: string): boolean {
  if (id === null || id === undefined) return true
  const item = knowledgePoints.get(id)
  return item !== undefined && item.offeringId === offeringId && (item.chapterId === null || item.chapterId === chapterId)
}
function handleCourse(context: MockRequestContext): MockResult {
  const unavailable = requireMockSession(context)
  if (unavailable !== null) return unavailable
  const session = mockSession()
  if (session === null) return fail(context, 401, 'UNAUTHENTICATED', '会话不存在或已过期。')
  if (context.method !== 'GET') {
    const csrfFailure = validateMockCsrf(context)
    if (csrfFailure !== null) return csrfFailure
  }
  const account = session.account, userId = account.id, operation = context.operationId
  const teacherOperation = context.path.startsWith('/api/v1/teacher/')
  const studentOperation = ['listMyCourses', 'enroll', 'updateChapterProgress', 'recordLearningPosition'].includes(operation)
  if ((teacherOperation && !account.roles.includes('teacher')) || (studentOperation && !account.roles.includes('student'))) return fail(context, 403, 'FORBIDDEN', '当前角色不能执行此操作。')
  const id = idFor(context), body = context.bodyJson
  const query = new URL(context.path, 'http://mock.local').searchParams
  const termId = query.get('termId') || MOCK_TERM.id
  if (query.has('termId') && !identifier(termId)) return invalid(context, '学期标识不合法。')

  if (operation === 'listBaseCourses') {
    const page = paginate(baseCourses.slice().sort((a, b) => b.id.localeCompare(a.id)), context)
    return page ? ok(context, page) : invalid(context, '分页参数不合法。')
  }
  if (operation === 'listMyCourses' || operation === 'listTeacherOfferings') {
    const status = query.get('status') || 'active'
    if (operation === 'listMyCourses' && !['active', 'archived', 'all'].includes(status)) return invalid(context, '课程状态不合法。')
    const list = [...offerings.values()].filter(item => item.dto.termId === termId && isMember(item.dto.id, userId, operation === 'listMyCourses' ? 'student' : 'teacher') && (operation !== 'listMyCourses' || status === 'all' || item.dto.status === status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.dto.id.localeCompare(a.dto.id))
    const page = operation === 'listMyCourses' ? paginate(list.map(item => courseSummary(item.dto, userId)), context) : paginate(list.map(item => item.dto), context)
    return page ? ok(context, page) : invalid(context, '分页参数不合法。')
  }
  if (operation === 'createOffering') {
    if (!offeringWrite(body)) return invalid(context)
    if (body.courseId === P1A_IDS.baseForbidden) return fail(context, 403, 'FORBIDDEN', '当前教师不能使用该基础课程。')
    if (body.courseId === P1A_IDS.baseConflict) return fail(context, 409, 'OFFERING_ARCHIVED', '当前教学班状态不允许开班。')
    const base = baseCourses.find(item => item.id === body.courseId)
    if (!base || body.termId !== MOCK_TERM.id) return invalid(context, '课程或学期不存在。', body.termId !== MOCK_TERM.id ? 'termId' : 'courseId')
    const dto: OfferingDTO = { id: randomUUID(), courseId: body.courseId, title: body.title, mark: base.mark, groupName: body.groupName, termId: body.termId, termLabel: MOCK_TERM.label, status: 'active', progressUnit: body.progressUnit, teachers: [{ id: userId, displayName: account.displayName }] }
    const createdAt = now()
    offerings.set(dto.id, { dto, createdAt })
    sharedMembers.set(dto.id, [{ userId, displayName: account.displayName, username: account.username, role: 'teacher', joinedAt: createdAt }])
    return ok(context, dto, 201)
  }
  if (operation === 'enroll') {
    if (!enrollmentWrite(body)) return invalid(context)
    const invite = [...invites.values()].find(item => item.codeKey === codeKey(body.inviteCode))
    const inviteFailure = () => fail(context, 400, 'INVALID_INVITE_CODE', '邀请码无效，请检查或向教师获取新的邀请。')
    if (!invite || invite.dto.revokedAt !== null || Date.parse(invite.dto.expiresAt) <= Date.now()) return inviteFailure()
    const offering = offerings.get(invite.offeringId)?.dto
    if (!offering) return inviteFailure()
    if (offering.status === 'archived') return archived(context)
    if (isMember(offering.id, userId, 'teacher')) return fail(context, 403, 'FORBIDDEN', '授课成员不能通过邀请码变成学生。')
    const existing = sharedMembers.get(offering.id)?.find(item => item.userId === userId && item.role === 'student')
    if (existing) return ok(context, { offeringId: offering.id, enrolledAt: existing.joinedAt, created: false } satisfies EnrollmentDTO)
    if (invite.dto.maxUses !== null && invite.dto.usedCount >= invite.dto.maxUses) return inviteFailure()
    const enrolledAt = now()
    sharedMembers.get(offering.id)?.push({ userId, displayName: account.displayName, username: account.username, role: 'student', joinedAt: enrolledAt })
    invite.dto.usedCount += 1
    return ok(context, { offeringId: offering.id, enrolledAt, created: true } satisfies EnrollmentDTO, 201)
  }
  if (operation === 'recordLearningPosition') {
    if (!positionWrite(body)) return invalid(context, '请选择一个章节或作业，不能同时指定二者。')
    const offering = readableOffering(body.offeringId, userId)
    if (!offering || !isMember(offering.id, userId, 'student')) return missing(context)
    if (offering.status === 'archived') return archived(context)
    // P1-A has no assignment fixtures; never manufacture a readable assignment.
    const chapter = body.chapterId ? chapters.get(body.chapterId) : undefined
    if (!chapter || chapter.offeringId !== offering.id || chapter.publicationState !== 'published') return missing(context)
    const key = progressKey(userId, chapter.id)
    if (!chapterProgress.has(key)) chapterProgress.set(key, { status: 'in_progress', completedAt: null })
    const position: LearningPositionDTO = { offeringId: offering.id, lastChapterId: chapter.id, lastStudiedAt: now() }
    positions.set(positionKey(userId, offering.id), position)
    return ok(context, position)
  }
  if (operation === 'getOffering' || operation === 'listChapters') {
    const offering = readableOffering(id, userId)
    if (!offering) return missing(context)
    if (operation === 'getOffering') return ok(context, offering)
    const items = courseChapters(id, true).map(chapter => ({ ...chapterSummary(chapter), studentProgress: isMember(id, userId, 'student') ? chapterProgress.get(progressKey(userId, chapter.id)) || notStarted() : null }))
    return ok(context, { offeringId: id, items } satisfies components['schemas']['ChapterListDTO'])
  }
  if (operation === 'getChapter' || operation === 'getTeacherChapter' || operation === 'updateChapterProgress') {
    const chapter = chapters.get(id)
    if (!chapter) return missing(context)
    const offering = operation === 'getTeacherChapter' ? teacherOffering(chapter.offeringId, userId) : readableOffering(chapter.offeringId, userId)
    if (!offering || (operation === 'getChapter' && chapter.publicationState !== 'published')) return missing(context)
    if (operation === 'updateChapterProgress') {
      if (!isMember(offering.id, userId, 'student')) return missing(context)
      if (offering.status === 'archived') return archived(context)
      if (chapter.publicationState === 'archived') return fail(context, 409, 'CHAPTER_ARCHIVED', '归档章节不能继续写入。')
      if (!progressWrite(body)) return invalid(context)
      const key = progressKey(userId, id), previous = chapterProgress.get(key)
      const studentProgress: ChapterProgress = previous?.status === 'completed' ? previous : { status: body.status, completedAt: body.status === 'completed' ? now() : null }
      chapterProgress.set(key, studentProgress)
      return ok(context, { chapterId: id, studentProgress, courseProgress: courseProgress(offering, userId) } satisfies components['schemas']['ChapterProgressDTO'])
    }
    const common = { ...chapterSummary(chapter), resources: chapterResources(id), knowledgePoints: chapterKnowledge(id), assignments: [] }
    if (operation === 'getTeacherChapter' || isMember(offering.id, userId, 'teacher')) return ok(context, { ...common, studentProgress: null } satisfies TeacherChapterDetailDTO)
    return ok(context, { ...common, studentProgress: chapterProgress.get(progressKey(userId, id)) || notStarted() } satisfies ChapterDetailDTO)
  }
  if (operation === 'getResource') {
    const resource = resources.get(id)
    if (!resource || resource.archived || chapters.get(resource.chapterId)?.publicationState !== 'published' || !readableOffering(resource.offeringId, userId)) return missing(context)
    return ok(context, resource)
  }

  let offeringId = id
  if (['getTeacherChapter', 'patchChapter', 'publishChapter', 'createResource'].includes(operation)) offeringId = chapters.get(id)?.offeringId || ''
  if (['patchResource', 'archiveResource'].includes(operation)) offeringId = resources.get(id)?.offeringId || ''
  if (operation === 'patchKnowledgePoint') offeringId = knowledgePoints.get(id)?.offeringId || ''
  if (operation === 'revokeInvite') offeringId = invites.get(id)?.offeringId || ''
  const offering = teacherOffering(offeringId, userId)
  if (!offering) return missing(context)
  if (context.method !== 'GET' && offering.status === 'archived' && operation !== 'archiveOffering') return archived(context)
  if (['archiveOffering', 'publishChapter', 'revokeInvite'].includes(operation) && (!object(body) || Object.keys(body).length !== 0)) return invalid(context)

  if (['patchResource', 'archiveResource'].includes(operation)) {
    const resource = resources.get(id)
    if (resource && chapters.get(resource.chapterId)?.publicationState === 'archived') return fail(context, 409, 'CHAPTER_ARCHIVED', '归档章节不能继续写入。')
  }
  switch (operation) {
    case 'archiveOffering':
      if (offering.id === P1A_IDS.offeringPendingArchive) return fail(context, 409, 'ARCHIVE_PENDING_REVIEWS', '当前教学班存在待批阅提交。')
      offering.status = 'archived'
      return ok(context, offering)
    case 'listMembers': {
      const list = [...(sharedMembers.get(offering.id) || [])].sort((a, b) => b.joinedAt.localeCompare(a.joinedAt) || b.userId.localeCompare(a.userId))
      const page = paginate(list, context)
      return page ? ok(context, page) : invalid(context, '分页参数不合法。')
    }
    case 'listTeacherChapters':
      return ok(context, { offeringId: offering.id, items: courseChapters(offering.id).map(chapterSummary) } satisfies components['schemas']['TeacherChapterListDTO'])
    case 'createChapter': {
      if (!chapterWrite(body)) return invalid(context)
      if (courseChapters(offering.id).some(item => item.number === body.number)) return invalid(context, '章节编号已存在。', 'number')
      const chapter: TeacherChapterSummaryDTO = { id: randomUUID(), offeringId: offering.id, ...body, publicationState: 'draft', studentProgress: null, contentVersion: 1, resourceCount: 0, assignmentCount: 0 }
      chapters.set(chapter.id, chapter)
      return ok(context, chapter, 201)
    }
    case 'patchChapter': {
      const chapter = chapters.get(id)
      if (!chapter) return missing(context)
      if (chapter.publicationState === 'archived') return fail(context, 409, 'CHAPTER_ARCHIVED', '归档章节不能继续写入。')
      if (!chapterPatch(body)) return invalid(context)
      if (chapter.publicationState === 'published' && ((body.number !== undefined && body.number !== chapter.number) || (body.isRequired !== undefined && body.isRequired !== chapter.isRequired))) return fail(context, 409, 'CHAPTER_ALREADY_PUBLISHED', '已发布章节不能改变编号或必修属性。')
      if (body.number !== undefined && courseChapters(offering.id).some(item => item.id !== id && item.number === body.number)) return invalid(context, '章节编号已存在。')
      Object.assign(chapter, body)
      chapter.contentVersion += 1
      return ok(context, chapterSummary(chapter))
    }
    case 'publishChapter': {
      const chapter = chapters.get(id)
      if (!chapter) return missing(context)
      if (chapter.publicationState === 'archived') return fail(context, 409, 'CHAPTER_ARCHIVED', '归档章节不能继续写入。')
      if (chapter.publicationState === 'published') return ok(context, chapterSummary(chapter))
      chapter.publicationState = 'published'
      return ok(context, chapterSummary(chapter))
    }
    case 'listKnowledgePoints':
      return ok(context, { offeringId: offering.id, items: [...knowledgePoints.values()].filter(item => item.offeringId === offering.id).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)) } satisfies components['schemas']['KnowledgePointListDTO'])
    case 'createKnowledgePoint': {
      if (!knowledgeWrite(body)) return invalid(context)
      if (body.chapterId !== undefined && body.chapterId !== null && chapters.get(body.chapterId)?.offeringId !== offering.id) return invalid(context, '知识点章节必须属于当前教学班。')
      const point: KnowledgePointDTO = { id: randomUUID(), offeringId: offering.id, chapterId: body.chapterId ?? null, title: body.title, description: body.description, order: body.order }
      knowledgePoints.set(point.id, point)
      return ok(context, point, 201)
    }
    case 'patchKnowledgePoint': {
      const point = knowledgePoints.get(id)
      if (!point) return missing(context)
      if (!knowledgePatch(body)) return invalid(context)
      if (body.chapterId !== undefined && body.chapterId !== null && chapters.get(body.chapterId)?.offeringId !== offering.id) return invalid(context, '知识点章节必须属于当前教学班。')
      if (body.chapterId !== undefined && body.chapterId !== point.chapterId && [...resources.values()].some(item => item.knowledgePointId === id)) return invalid(context, '已被资料引用的知识点不能变更章节。')
      Object.assign(point, body)
      return ok(context, point)
    }
    case 'createResource': {
      const chapter = chapters.get(id)
      if (!chapter) return missing(context)
      if (chapter.publicationState === 'archived') return fail(context, 409, 'CHAPTER_ARCHIVED', '归档章节不能继续写入。')
      if (!resourceWrite(body)) return invalid(context)
      if (!validKnowledge(body.knowledgePointId, offering.id, id)) return invalid(context, '资料知识点必须属于同一教学班和章节。')
      const resource: ResourceDTO = { id: randomUUID(), offeringId: offering.id, chapterId: id, knowledgePointId: body.knowledgePointId ?? null, title: body.title, type: 'markdown', content: body.content, url: null, order: body.order, archived: false }
      resources.set(resource.id, resource)
      return ok(context, resource, 201)
    }
    case 'patchResource': {
      const resource = resources.get(id)
      if (!resource || resource.archived) return missing(context)
      if (!resourcePatch(body)) return invalid(context)
      if (!validKnowledge(body.knowledgePointId === undefined ? resource.knowledgePointId : body.knowledgePointId, offering.id, resource.chapterId)) return invalid(context, '资料知识点必须属于同一教学班和章节。')
      Object.assign(resource, body)
      return ok(context, resource)
    }
    case 'archiveResource': {
      const resource = resources.get(id)
      if (!resource) return missing(context)
      resource.archived = true
      return ok(context, { id, archived: true } satisfies components['schemas']['ResourceArchiveDTO'])
    }
    case 'createInvite': {
      if (!inviteWrite(body) || Date.parse(body.expiresAt) <= Date.now()) return invalid(context, '邀请到期时间必须晚于当前时间。')
      const inviteCode = 'P1A-' + randomUUID().replaceAll('-', '')
      const dto: InviteDTO = { id: randomUUID(), expiresAt: body.expiresAt, maxUses: body.maxUses ?? null, usedCount: 0, revokedAt: null, createdAt: now() }
      invites.set(dto.id, { dto, offeringId: offering.id, codeKey: codeKey(inviteCode) })
      return ok(context, { ...dto, inviteCode } satisfies InviteCreatedDTO, 201)
    }
    case 'listInvites': {
      const list = [...invites.values()].filter(item => item.offeringId === offering.id).map(item => item.dto).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      const page = paginate(list, context)
      return page ? ok(context, page) : invalid(context, '分页参数不合法。')
    }
    case 'revokeInvite': {
      const invite = invites.get(id)
      if (!invite) return missing(context)
      invite.dto.revokedAt ??= now()
      return ok(context, { id, revokedAt: invite.dto.revokedAt } satisfies components['schemas']['InviteRevokedDTO'])
    }
    default:
      return missing(context)
  }
}

export const courseHandlers: Record<string, MockHandler> = Object.fromEntries([
  'listMyCourses', 'getOffering', 'listChapters', 'getChapter', 'getResource', 'enroll',
  'updateChapterProgress', 'recordLearningPosition', 'listTeacherOfferings', 'listBaseCourses',
  'createOffering', 'archiveOffering', 'listMembers', 'listTeacherChapters', 'createChapter',
  'getTeacherChapter', 'patchChapter', 'publishChapter', 'listKnowledgePoints',
  'createKnowledgePoint', 'patchKnowledgePoint', 'createResource', 'patchResource',
  'archiveResource', 'listInvites', 'createInvite', 'revokeInvite',
].map(operationId => [operationId, handleCourse]))
