// 原型演示数据：结构与 docs/openapi.yaml 的 DTO 同名同形，ID 用可读短串代替 UUID。
// 时间一律为 +08:00 的 ISO 字符串，界面按北京时间显示。
(() => {
const T = (md, t = '23:59:59') => `2026-${md}T${t}+08:00`;
const prog = (completed, total) => ({ unit: 'chapter', completed, total, percent: total ? Math.round(completed / total * 100) : 0, notConfigured: total === 0, asOf: T('10-28', '09:30:00') });
const P = {
  wang: { id: 't-wang', displayName: '王敏' }, li: { id: 't-li', displayName: '李建国' },
  chen: { id: 't-chen', displayName: '陈立' }, zhao: { id: 't-zhao', displayName: '赵雪' }, zhou: { id: 't-zhou', displayName: '周凯' },
};
const course = (offeringId, title, mark, teacher, cur, p, last, pending, unreadFb, extra = {}) => ({
  offeringId, courseId: 'c' + offeringId.slice(1), title, mark, groupName: '计科 2301 班',
  termId: 'term-2026f', termLabel: '2026 秋季学期', status: 'active', teachers: [teacher],
  currentChapter: cur, progress: p, lastStudiedAt: last, pendingAssignmentCount: pending, unreadFeedbackCount: unreadFb, ...extra,
});
const ch = (offeringId, number, title, summary, status, res, asg, completedAt = null) => ({
  id: `ch-${offeringId.slice(2)}-${number}`, offeringId, number, title, summary, isRequired: true, publicationState: 'published',
  studentProgress: { status, completedAt }, contentVersion: 1, resourceCount: res, assignmentCount: asg,
});

const D = window.DEMO = {
  serverTime: T('10-28', '09:30:00'),
  me: { id: 'u-lin', username: '20230117', displayName: '林知远', roles: ['student'] },
  term: { id: 'term-2026f', label: '2026 秋季学期' },
  terms: [{ id: 'term-2026f', label: '2026 秋季学期' }, { id: 'term-2026s', label: '2026 春季学期' }],

  // getDashboard.currentLearning → CurrentAssignment / CurrentLearningChapter
  // 服务端选“还能动手”的一项：优先未完成且仍可提交的作业，其次学习中的章节；逾期不可提交的作业不进入这里。
  dashboard: {
    currentLearning: {
      type: 'assignment', offeringId: 'o-web', chapterId: 'ch-web-5', assignmentId: 'a1',
      title: '响应式导航栏实现', description: '为课程主页实现一个响应式导航栏：宽屏横向排列，窄于 768px 时折叠为纵向列表。',
      assignmentType: 'web_lab', assignmentState: 'IN_PROGRESS', dueAt: T('10-30'), overdue: false,
      resume: { activeFile: 'style.css', savedAt: T('10-27', '21:40:00'), workspaceRevision: 7 },
    },
  },

  // listMyCourses / getDashboard.courses → CourseSummaryDTO
  courses: [
    course('o-web', 'Web 前端开发', 'WEB', P.wang, { id: 'ch-web-5', number: 5, title: 'Flex 与 Grid 布局' }, prog(4, 6), T('10-27', '21:12:00'), 2, 0),
    course('o-db', '数据库系统原理', 'DB', P.li, { id: 'ch-db-4', number: 4, title: '连接查询与子查询' }, prog(3, 5), T('10-26', '15:40:00'), 2, 0),
    course('o-os', '操作系统', 'OS', P.chen, { id: 'ch-os-3', number: 3, title: '进程调度' }, prog(2, 4), T('10-24', '10:05:00'), 1, 0),
    course('o-se', '软件工程导论', 'SE', P.zhao, { id: 'ch-se-4', number: 4, title: '需求工程' }, prog(3, 4), T('10-22', '19:30:00'), 1, 1),
    course('o-ds', '数据结构', 'DS', P.zhou, { id: 'ch-ds-8', number: 8, title: '排序' }, prog(8, 8), '2026-06-20T16:10:00+08:00', 0, 0,
      { termId: 'term-2026s', termLabel: '2026 春季学期', status: 'archived' }),
  ],

  // listChapters → ChapterSummaryDTO（学生只能看到已发布章节）
  chapters: {
    'o-web': [
      ch('o-web', 1, 'HTML 基础与文档结构', '文档结构、常用元素与属性，浏览器如何解析一个页面。', 'completed', 2, 0, T('09-12', '20:10:00')),
      ch('o-web', 2, '语义化与可访问性', '用正确的标签表达内容结构，为辅助技术提供可访问名称。', 'completed', 3, 1, T('09-19', '21:30:00')),
      ch('o-web', 3, 'CSS 选择器与层叠', '选择器类型、特异性计算与层叠顺序。', 'completed', 3, 1, T('09-30', '19:45:00')),
      ch('o-web', 4, '盒模型与常规流', 'content-box 与 border-box、外边距折叠、块级与行内格式化。', 'completed', 2, 1, T('10-16', '22:05:00')),
      ch('o-web', 5, 'Flex 与 Grid 布局', '一维与二维布局的选择，主轴、交叉轴、轨道与命名区域。', 'in_progress', 3, 2),
      ch('o-web', 6, '响应式与媒体查询', '视口、断点的确定方法与移动优先的写法。', 'not_started', 2, 0),
    ],
    'o-db': [
      ch('o-db', 1, '数据库系统概述', '数据模型、三级模式与数据独立性。', 'completed', 2, 0, T('09-14', '16:00:00')),
      ch('o-db', 2, '关系模型与 SQL 基础', '关系代数、单表查询、条件与排序。', 'completed', 3, 1, T('09-28', '15:20:00')),
      ch('o-db', 3, '索引', 'B+ 树索引、执行计划的阅读方法。', 'completed', 2, 1, T('10-15', '14:30:00')),
      ch('o-db', 4, '连接查询与子查询', '内连接、外连接、相关子查询与 EXISTS。', 'in_progress', 3, 1),
      ch('o-db', 5, '视图与事务', '视图的作用、事务的 ACID 与隔离级别。', 'not_started', 2, 0),
    ],
    'o-os': [
      ch('o-os', 1, '操作系统概述', '操作系统的功能、发展与结构。', 'completed', 2, 1, T('09-15', '10:00:00')),
      ch('o-os', 2, '进程与线程', '进程状态、PCB、线程模型。', 'completed', 3, 0, T('10-08', '11:20:00')),
      ch('o-os', 3, '进程调度', 'FCFS、SJF、时间片轮转与多级反馈队列。', 'in_progress', 3, 1),
      ch('o-os', 4, '同步与互斥', '临界区、信号量与经典同步问题。', 'not_started', 2, 0),
    ],
    'o-se': [
      ch('o-se', 1, '软件过程', '瀑布、增量与迭代模型。', 'completed', 2, 0, T('09-13', '19:00:00')),
      ch('o-se', 2, '敏捷方法', 'Scrum 角色、事件与工件。', 'completed', 2, 0, T('09-27', '20:40:00')),
      ch('o-se', 3, 'UML 建模', '用例图、类图与顺序图。', 'completed', 3, 1, T('10-12', '21:00:00')),
      ch('o-se', 4, '需求工程', '需求获取、分析与规格说明。', 'in_progress', 2, 1),
    ],
  },
};
// AssignmentSummaryDTO 字段 + AssignmentDetailDTO 补充字段（detail 内的只在 getAssignment 返回，列表拿不到）
const A = (id, offeringId, chapterId, title, type, dueAt, assignmentState, overdue, x = {}, detail = {}) => ({
  id, offeringId, offeringStatus: 'active', chapterId, title, type, isRequired: true, publicationState: 'published',
  description: x.description || '', dueAt, assignmentState, overdue,
  latestSubmissionId: x.latestSubmissionId || null, publishedFeedbackId: x.publishedFeedbackId || null, unreadFeedback: !!x.unreadFeedback,
  detail: { requirements: [], estimatedMinutes: 60, maxScore: 100, rubric: [], knowledgePointIds: [], lateUntil: null,
    allowResubmit: true, maxAttempts: 3, attemptsUsed: 0, canSubmit: true, submissionBlockedReason: null, aiPolicyVersion: null, ...detail },
});
const R = (criterionId, title, maxScore, description = '') => ({ criterionId, title, description, maxScore });
D.assignments = [
  A('a1', 'o-web', 'ch-web-5', '响应式导航栏实现', 'web_lab', T('10-30'), 'IN_PROGRESS', false,
    { description: '为课程主页实现一个响应式导航栏：宽屏横向排列，窄于 768px 时折叠为纵向列表。' },
    { requirements: ['使用语义化的 <nav> 与列表结构，为导航区提供可访问名称。', '布局使用 Flex 或 Grid，不使用浮动。', '在 answer 说明中写明断点选择的依据。'],
      estimatedMinutes: 90, knowledgePointIds: ['kp-web-flex', 'kp-web-grid', 'kp-web-resp'], lateUntil: T('11-02'), aiPolicyVersion: 4,
      rubric: [R('r1', '结构语义与可访问性', 30), R('r2', '宽屏与窄屏布局正确', 40), R('r3', '断点依据说明', 20), R('r4', '代码整洁', 10)] }),
  A('a2', 'o-db', 'ch-db-4', '多表连接查询练习', 'sql_text', T('10-31', '22:00:00'), 'NOT_STARTED', false,
    { description: '基于选课库完成 6 道连接查询，至少两道需要使用外连接。' },
    { requirements: ['每道题写一条 SQL，并用注释标出题号。', '外连接题目说明为什么不能用内连接。'], estimatedMinutes: 60,
      knowledgePointIds: ['kp-db-join'], aiPolicyVersion: 2, maxAttempts: 2,
      rubric: [R('r1', '查询结果正确', 70), R('r2', '连接方式选择说明', 30)] }),
  A('a3', 'o-os', 'ch-os-3', '进程调度算法对比分析', 'text', T('10-26'), 'IN_PROGRESS', true,
    { description: '用同一组进程分别计算 FCFS、SJF 与 RR（q=2）的平均等待时间和平均周转时间，并比较。' },
    { requirements: ['给出每种算法的甘特图（可用文字表格）。', '列出每个进程的等待时间计算过程。', '用不超过 300 字比较三种算法。'],
      estimatedMinutes: 75, lateUntil: T('11-02'), aiPolicyVersion: 1, maxAttempts: 1,
      rubric: [R('r1', '计算正确', 60), R('r2', '比较分析', 40)] }),
  A('a4', 'o-se', 'ch-se-4', '需求规格说明书初稿', 'text', T('11-03'), 'NOT_STARTED', false,
    { description: '为“图书馆座位预约”系统撰写需求规格说明书初稿，包含功能需求与非功能需求。' },
    { requirements: ['至少 8 条功能需求，每条可验证。', '至少 3 条非功能需求并给出度量方式。'], estimatedMinutes: 120,
      rubric: [R('r1', '需求完整且可验证', 60), R('r2', '结构与表述', 40)] }),
  A('a5', 'o-web', 'ch-web-5', 'Grid 画廊布局', 'web_lab', T('11-06'), 'NOT_STARTED', false,
    { description: '用 CSS Grid 实现一个图片画廊，宽屏 4 列、平板 2 列、手机 1 列。' },
    { requirements: ['使用 grid-template-columns 与 repeat()。', '不使用媒体查询以外的 JavaScript 控制布局。'], estimatedMinutes: 60,
      knowledgePointIds: ['kp-web-grid', 'kp-web-resp'], aiPolicyVersion: 1, lateUntil: T('11-08'),
      rubric: [R('r1', '三档布局正确', 70), R('r2', '代码整洁', 30)] }),
  A('a6', 'o-db', 'ch-db-3', '索引与执行计划', 'sql_text', T('10-24', '22:00:00'), 'NOT_STARTED', true,
    { description: '为三条慢查询设计索引，并用 EXPLAIN 前后对比说明效果。' },
    { requirements: ['给出 CREATE INDEX 语句。', '贴出 EXPLAIN 前后的关键行。'], knowledgePointIds: ['kp-db-index'],
      canSubmit: false, submissionBlockedReason: 'SUBMISSION_CLOSED', rubric: [R('r1', '索引设计', 60), R('r2', '执行计划解读', 40)] }),
  A('a7', 'o-web', 'ch-web-4', 'CSS 盒模型练习', 'web_lab', T('10-22'), 'SUBMITTED', false,
    { description: '复现给定卡片的尺寸，分别用 content-box 与 border-box 实现。', latestSubmissionId: 's7b' },
    { knowledgePointIds: ['kp-web-box'], attemptsUsed: 2, canSubmit: false, submissionBlockedReason: 'SUBMISSION_CLOSED', aiPolicyVersion: 2,
      rubric: [R('r1', '尺寸正确', 60), R('r2', '两种盒模型对比说明', 40)] }),
  A('a8', 'o-db', 'ch-db-2', '单表查询基础', 'sql_text', T('10-17', '22:00:00'), 'REVIEWED', false,
    { description: '完成 8 道单表查询，覆盖条件、排序与聚合。', latestSubmissionId: 's8', publishedFeedbackId: 'f8' },
    { attemptsUsed: 1, canSubmit: false, submissionBlockedReason: 'RESUBMIT_AFTER_REVIEW', rubric: [R('r1', '查询正确', 80), R('r2', '书写规范', 20)] }),
  A('a9', 'o-web', 'ch-web-2', 'HTML 语义化页面', 'web_lab', T('10-15'), 'REVIEWED', false,
    { description: '用语义化标签重写一份课程介绍页面。', latestSubmissionId: 's9', publishedFeedbackId: 'f9' },
    { knowledgePointIds: ['kp-web-sem', 'kp-web-sel'], attemptsUsed: 1, canSubmit: false, submissionBlockedReason: 'RESUBMIT_AFTER_REVIEW',
      rubric: [R('r1', '语义结构', 50), R('r2', '可访问性', 30), R('r3', '样式组织', 20)] }),
  A('a10', 'o-se', 'ch-se-3', '用例图绘制', 'text', T('10-20'), 'REVIEWED', false,
    { description: '为“课程选课”系统绘制用例图，并说明各参与者。', latestSubmissionId: 's10', publishedFeedbackId: 'f10', unreadFeedback: true },
    { attemptsUsed: 1, canSubmit: false, submissionBlockedReason: 'RESUBMIT_AFTER_REVIEW', rubric: [R('r1', '参与者与用例', 50), R('r2', '关系使用正确', 50)] }),
];
// getWorkspace → WorkspaceDTO：只有一个 revision，没有版本历史
D.workspaces = {
  a1: { assignmentId: 'a1', revision: 7, activeFile: 'style.css', savedAt: T('10-27', '21:40:00'), canSave: true, saveBlockedReason: null, files: [
    { path: 'index.html', content: '<nav class="site-nav" aria-label="课程导航">\n  <ul>\n    <li><a href="#intro">简介</a></li>\n    <li><a href="#chapters">章节</a></li>\n    <li><a href="#tasks">作业</a></li>\n  </ul>\n</nav>' },
    { path: 'style.css', content: '.site-nav ul {\n  display: grid;\n  grid-template-areas: "intro chapters tasks";\n  gap: 16px;\n}\n\n@media (max-width: 768px) {\n  .site-nav ul { gap: 8px; }\n}' },
    { path: 'script.js', content: '' } ] },
  a3: { assignmentId: 'a3', revision: 3, activeFile: 'answer.md', savedAt: T('10-25', '22:10:00'), canSave: true, saveBlockedReason: null, files: [
    { path: 'answer.md', content: '## FCFS\n| 进程 | 到达 | 运行 | 完成 | 等待 |\n| P1 | 0 | 5 | 5 | 0 |\n| P2 | 1 | 3 | 8 | 4 |\n\n## RR (q=2)\n（未完成）' } ] },
  a7: { assignmentId: 'a7', revision: 5, activeFile: 'style.css', savedAt: T('10-21', '20:12:00'), canSave: true, saveBlockedReason: null, files: [
    { path: 'index.html', content: '<div class="card a">content-box</div>\n<div class="card b">border-box</div>' },
    { path: 'style.css', content: '.card { width: 240px; padding: 20px; border: 2px solid; }\n.a { box-sizing: content-box; }\n.b { box-sizing: border-box; }' },
    { path: 'script.js', content: '' } ] },
};

// listMySubmissions → SubmissionSummaryDTO
const S = (id, assignmentId, offeringId, attemptNumber, workspaceRevision, submittedAt, late, superseded, feedbackStatus) =>
  ({ id, assignmentId, offeringId, attemptNumber, workspaceRevision, submittedAt, late, superseded, feedbackStatus });
D.submissions = {
  a7: [S('s7b', 'a7', 'o-web', 2, 5, T('10-21', '20:16:00'), false, false, 'none'), S('s7a', 'a7', 'o-web', 1, 3, T('10-20', '22:41:00'), false, true, 'none')],
  a8: [S('s8', 'a8', 'o-db', 1, 4, T('10-16', '21:05:00'), false, false, 'published')],
  a9: [S('s9', 'a9', 'o-web', 1, 6, T('10-14', '23:20:00'), false, false, 'published')],
  a10: [S('s10', 'a10', 'o-se', 1, 2, T('10-19', '18:30:00'), false, false, 'published')],
};
// getSubmission → SubmissionDetailDTO：反思与文件只在提交详情里返回，SubmissionSummaryDTO 没有这两个字段
D.submissionDetails = {
  s7b: { reflection: '先按浮动写的，窄屏直接塌了；改用 Grid 后宽度还是超出，最后发现是 gap 算了三次。', files: [
    { path: 'index.html', content: '<div class="card a">content-box</div>\n<div class="card b">border-box</div>' },
    { path: 'style.css', content: '.card { width: 240px; padding: 20px; border: 2px solid; }\n.a { box-sizing: content-box; }\n.b { box-sizing: border-box; }' } ] },
  s7a: { reflection: '', files: [ { path: 'style.css', content: '.card { width: 240px; }' } ] },
  s8: { reflection: '第 7 题之前漏了聚合前的过滤条件，这次补上了。', files: [ { path: 'answer.sql', content: '-- 8 道单表查询\nSELECT ...' } ] },
  s9: { reflection: '', files: [ { path: 'index.html', content: '<main><h1>课程介绍</h1>…</main>' } ] },
  s10: { reflection: '不确定 include 和 extend 的方向，按课上例子画的。', files: [ { path: 'answer.md', content: '## 参与者\n- 学生\n- 教师\n\n## 用例\n…' } ] },
};

// StudentFeedbackDTO（getFeedback / learning-records.feedbackPage）
const F = (id, submissionId, offeringId, assignmentId, assignmentTitle, score, teacher, publishedAt, comment, rubricResults, knowledgeEvaluations, issueTags) =>
  ({ id, submissionId, offeringId, assignmentId, assignmentTitle, version: 1, status: 'published', score, maxScore: 100, rubricResults, comment,
     knowledgeEvaluations, issueTags, issueTagVersion: 1, teacher, publishedAt, messageId: 'm-' + id });
D.feedback = [
  F('f10', 's10', 'o-se', 'a10', '用例图绘制', 88, P.zhao, T('10-27', '19:58:00'), '参与者划分清楚；“管理员审核”与“发布课程”之间应是 include 而不是 extend。',
    [{ criterionId: 'r1', score: 48, comment: '' }, { criterionId: 'r2', score: 40, comment: 'include / extend 方向用反。' }],
    [{ knowledgePointId: 'kp-se-uml', result: 'needs_practice', note: '关系类型混用' }], ['概念混淆']),
  F('f8', 's8', 'o-db', 'a8', '单表查询基础', 90, P.li, T('10-25', '12:09:00'), 'WHERE 条件书写规范。排序部分建议补充多列 ORDER BY 的优先级说明。',
    [{ criterionId: 'r1', score: 74, comment: '第 7 题聚合前未过滤空值。' }, { criterionId: 'r2', score: 16, comment: '' }],
    [{ knowledgePointId: 'kp-db-select', result: 'meets_expectation', note: '' }], []),
  F('f9', 's9', 'o-web', 'a9', 'HTML 语义化页面', 85, P.wang, T('10-20', '14:55:00'), '语义标签使用正确；导航区缺少 aria-label。样式里两处用 !important 覆盖，说明对层叠顺序还不熟。',
    [{ criterionId: 'r1', score: 46, comment: '' }, { criterionId: 'r2', score: 22, comment: '导航区缺少可访问名称。' }, { criterionId: 'r3', score: 17, comment: '两处 !important。' }],
    [{ knowledgePointId: 'kp-web-sem', result: 'meets_expectation', note: '' }, { knowledgePointId: 'kp-web-sel', result: 'needs_practice', note: '用 !important 解决优先级冲突' }], ['样式覆盖']),
];

// getLearningRecords → LearningRecordsDTO（knowledge-v2；只有 Web 课程配置了知识点）
const K = (id, title, state, freshness, latestEvidenceAt, explanation, evidence) => ({ knowledgePointId: id, title, assessmentState: state, ruleVersion: 'knowledge-v2',
  asOf: T('10-28', '09:30:00'), latestEvidenceAt, evidenceCount: evidence.length, freshness, evidenceIds: evidence.map(e => e.id), explanation, evidence });
const E = (id, assignmentId, assignmentTitle, result, note, occurredAt, feedbackId = 'f9', submissionId = 's9') => ({ id, submissionId, feedbackId, assignmentId, assignmentTitle, result, note, occurredAt });
D.records = {
  'o-web': {
    offeringId: 'o-web', summary: { completedLabCount: 3, publishedFeedbackCount: 1, needsPracticeCount: 2 },
    knowledgeEvidence: [
      K('kp-web-sem', '语义化标签', 'basically_mastered', 'fresh', T('10-20', '14:55:00'), '最近一次评价达到预期。', [E('e1', 'a9', 'HTML 语义化页面', 'meets_expectation', '', T('10-20', '14:55:00'))]),
      K('kp-web-sel', '选择器优先级', 'needs_practice', 'fresh', T('10-20', '14:55:00'), '最近一次评价为“需要练习”：用 !important 解决优先级冲突。', [E('e2', 'a9', 'HTML 语义化页面', 'needs_practice', '用 !important 解决优先级冲突', T('10-20', '14:55:00'))]),
      K('kp-web-box', '盒模型与尺寸计算', 'learning', 'none', null, '《CSS 盒模型练习》已提交，等待批阅。', []),
      K('kp-web-grid', 'Grid 布局', 'needs_practice', 'stale', T('09-25', '16:00:00'), '唯一一条证据超过 30 天：grid-template-areas 命名与元素不对应。', [E('e3', 'a0', '课堂练习：三栏布局', 'needs_practice', '区域命名与元素不对应', T('09-25', '16:00:00'), 'f0', 's0')]),
      K('kp-web-flex', 'Flex 布局', 'insufficient_evidence', 'none', null, '还没有关联的已批阅作业。', []),
      K('kp-web-resp', '响应式断点', 'insufficient_evidence', 'none', null, '还没有关联的已批阅作业。', []),
    ],
    nextRecommendation: { knowledgePointId: 'kp-web-sel', title: '选择器优先级', reason: '《HTML 语义化页面》评价指出用 !important 覆盖样式。建议重读第 3 章“层叠与特异性”，再继续《响应式导航栏实现》。',
      sourceFeedbackId: 'f9', evidenceIds: ['e2'], target: { type: 'chapter', id: 'ch-web-3', offeringId: 'o-web' } },
  },
  'o-db': { offeringId: 'o-db', summary: { completedLabCount: 1, publishedFeedbackCount: 1, needsPracticeCount: null }, knowledgeEvidence: [], nextRecommendation: null },
  'o-os': { offeringId: 'o-os', summary: { completedLabCount: 0, publishedFeedbackCount: 0, needsPracticeCount: null }, knowledgeEvidence: [], nextRecommendation: null },
  'o-se': { offeringId: 'o-se', summary: { completedLabCount: 1, publishedFeedbackCount: 1, needsPracticeCount: null }, knowledgeEvidence: [], nextRecommendation: null },
};
// listMessages → NotificationDTO：type 只有五种，没有“逾期提醒”
const M = (id, offeringId, type, title, content, sender, createdAt, readAt, target) => ({ id, offeringId, type, title, content, sender, createdAt, readAt, target });
const tg = (type, id, offeringId) => ({ type, id, offeringId });
D.messages = [
  M('m1', 'o-web', 'assignment_published', '新作业《Grid 画廊布局》已发布', '11月6日 23:59 截止。', P.wang, T('10-28', '09:12:00'), null, tg('assignment', 'a5', 'o-web')),
  M('m2', 'o-web', 'course_notice', '第 6 章内容调整', '第 6 章“响应式与媒体查询”补充了断点选择的示例，《Grid 画廊布局》截止时间不变。', P.wang, T('10-28', '08:30:00'), null, tg('chapter', 'ch-web-6', 'o-web')),
  M('m-f10', 'o-se', 'feedback', '《用例图绘制》评价已发布', '88 分。参与者划分清楚；include 与 extend 的使用需要调整。', P.zhao, T('10-27', '19:58:00'), null, tg('feedback', 'f10', 'o-se')),
  M('m4', 'o-os', 'help_reply', '陈立老师回复了你的求助', '时间片轮转的平均等待时间怎么算', P.chen, T('10-27', '16:40:00'), null, tg('help_request', 'h2', 'o-os')),
  M('m5', null, 'system', '系统维护通知', '10月30日 02:00–04:00 进行例行维护，期间无法保存作业。', null, T('10-26', '18:00:00'), T('10-26', '20:00:00'), null),
  M('m-f8', 'o-db', 'feedback', '《单表查询基础》评价已发布', '90 分。WHERE 条件书写规范，排序部分建议补充说明。', P.li, T('10-25', '12:09:00'), T('10-25', '13:00:00'), tg('feedback', 'f8', 'o-db')),
  M('m7', 'o-db', 'course_notice', '期中实验安排', '第 9 周周三下午在实验楼 B204 进行，携带学生证。', P.li, T('10-24', '10:00:00'), T('10-24', '12:30:00'), null),
];

// listHelpRequests / getHelpRequest → HelpRequestDTO / HelpRequestDetailDTO（status: open / answered / closed）
const H = (id, offeringId, assignmentId, title, content, studentAttempt, workspaceRevision, status, createdAt, updatedAt, extra = {}) => ({
  id, offeringId, assignmentId, title, content, studentAttempt, workspaceRevision, sharedTutoringRequestIds: [], issueTags: [], status, createdAt, updatedAt,
  sharedSnapshot: null, sharedTutoringResults: [], replies: [], ...extra });
D.help = [
  H('h1', 'o-web', 'a1', 'Grid 区域命名后导航项不显示', '给 ul 设置了 grid-template-areas，但三个 li 都挤在第一格，窄屏下也不变化。', '在 @media 里只改了 gap，没有重新声明区域。', 7, 'open', T('10-28', '08:50:00'), T('10-28', '08:50:00'),
    { sharedTutoringRequestIds: ['tr2'], issueTags: ['布局异常'],
      sharedSnapshot: { files: [
        { path: 'index.html', content: '<nav class="site-nav" aria-label="课程导航">\n  <ul>\n    <li><a href="#intro">简介</a></li>\n    <li><a href="#chapters">章节</a></li>\n    <li><a href="#tasks">作业</a></li>\n  </ul>\n</nav>' },
        { path: 'style.css', content: '.site-nav ul {\n  display: grid;\n  grid-template-areas: "intro chapters tasks";\n  gap: 16px;\n}\n\n@media (max-width: 768px) {\n  .site-nav ul { gap: 8px; }\n}' } ], expiresAt: T('11-27'), contentUnavailableReason: null },
      sharedTutoringResults: [{ requestId: 'tr2', content: '检查你的 @media 块：里面是否重新声明了 grid-template-areas？', expiresAt: T('11-27'), contentUnavailableReason: null }] }),
  H('h2', 'o-os', 'a3', '时间片轮转的平均等待时间怎么算', 'RR 算出来的等待时间比 FCFS 还大，不确定是不是算错了。', 'P2 的等待时间我算成了 6。', 3, 'answered', T('10-27', '14:02:00'), T('10-27', '16:40:00'),
    { replies: [{ id: 'hr1', content: '要按每个进程“完成时间 − 到达时间 − 运行时间”分别算，再取平均。RR 的平均等待时间比 FCFS 大是可能的，写进比较里。', teacher: P.chen, createdAt: T('10-27', '16:40:00') }] }),
  H('h3', 'o-db', 'a8', 'ORDER BY 多列时的排序优先级', '两列排序时第二列好像没生效。', '', null, 'closed', T('10-16', '21:30:00'), T('10-17', '09:10:00'),
    { replies: [{ id: 'hr2', content: '按书写顺序依次比较，前一列相同时才看后一列。你的数据第一列没有重复值，所以看不出第二列的作用。', teacher: P.li, createdAt: T('10-17', '09:10:00') }] }),
];

// getAiPolicy → AiPolicyDTO：只有上限，没有已用次数
const POL = (assignmentId, version, x = {}) => ({ assignmentId, version, enabled: true, allowedActions: ['ask', 'concept', 'next_hint'], allowedModes: ['concept', 'debug_hint', 'guided_question'],
  restrictCompleteSolution: true, allowCodeBlocks: false, maxHintLevel: 3, requireAttemptFromLevel: 2, dailyUserLimit: 40, dailyAssignmentLimit: 12, perMinuteLimit: 3,
  maxOutputTokens: 600, boundaryText: '本作业只提供思路与排错提示，不给出完整代码。', ...x });
D.aiPolicies = {
  a1: POL('a1', 4), a2: POL('a2', 2, { boundaryText: '只解释连接方式与排错思路，不给出完整 SQL。' }), a3: POL('a3', 1, { allowedActions: ['ask', 'concept'], maxHintLevel: 2 }),
  a5: POL('a5', 1), a7: POL('a7', 2), a4: POL('a4', 1, { enabled: false }),
};

// listTutoringMessages → TutoringMessageDTO
const TM = (sequence, role, content, createdAt, x = {}) => ({ id: 'tm' + sequence, sequence, role, content, createdAt, tutoringRequestId: x.req || 'tr1', mode: x.mode || null,
  hintLevel: x.level || null, policyVersion: x.level ? 4 : null, contentUnavailableReason: null });
D.tutoring = {
  a1: { session: { id: 'ts1', assignmentId: 'a1', createdAt: T('10-27', '21:02:00'), status: 'active' }, messages: [
    TM(1, 'student', '我用了 grid-template-areas，但窄屏下导航项全部挤在一行，怎么回事？', T('10-27', '21:02:00')),
    TM(2, 'assistant', 'grid-template-areas 只描述区域划分，不会随屏宽变化。想一想：窄屏时你希望区域怎么排列？“不同屏宽用不同排列”的规则应该写在哪里？', T('10-27', '21:02:10'), { mode: 'concept', level: 1 }),
    TM(3, 'student', '应该写在媒体查询里？', T('10-27', '21:05:00'), { req: 'tr2' }),
    TM(4, 'assistant', '方向对了。检查你的 @media 块：里面是否重新声明了 grid-template-areas？另外留意断点值和你写的设计依据是否一致。', T('10-27', '21:05:12'), { req: 'tr2', mode: 'debug_hint', level: 2 }),
  ] },
};

// getChapter.resources → ResourceDTO（type 只有 markdown）
D.resources = {
  'ch-web-5': [
    { id: 'r-web-5-1', offeringId: 'o-web', chapterId: 'ch-web-5', knowledgePointId: 'kp-web-flex', title: '5.1 Flex：主轴与交叉轴', type: 'markdown', url: null, order: 1, archived: false,
      content: 'Flex 是一维布局。容器的 `flex-direction` 决定主轴方向，`justify-content` 沿主轴分配空间，`align-items` 沿交叉轴对齐。\n\n适合：导航条、按钮组、卡片内部的水平排列。' },
    { id: 'r-web-5-2', offeringId: 'o-web', chapterId: 'ch-web-5', knowledgePointId: 'kp-web-grid', title: '5.2 Grid：轨道与命名区域', type: 'markdown', url: null, order: 2, archived: false,
      content: 'Grid 是二维布局。`grid-template-columns` 定义列轨道，`grid-template-areas` 给区域命名，子元素用 `grid-area` 放进对应区域。\n\n区域名只描述结构，不随屏宽变化；需要不同排列时，在媒体查询里重新声明 `grid-template-areas`。' },
    { id: 'r-web-5-3', offeringId: 'o-web', chapterId: 'ch-web-5', knowledgePointId: null, title: '5.3 一维还是二维：怎么选', type: 'markdown', url: null, order: 3, archived: false,
      content: '内容决定尺寸时用 Flex，布局决定尺寸时用 Grid。两者可以嵌套：页面骨架用 Grid，骨架里的一行用 Flex。' },
  ],
};
D.knowledgePoints = {
  'ch-web-5': [{ id: 'kp-web-flex', title: 'Flex 布局' }, { id: 'kp-web-grid', title: 'Grid 布局' }],
};
})();
