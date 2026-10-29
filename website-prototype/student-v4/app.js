// 知学学生端 V4 原型：无依赖 hash 路由，路径与 FRONTEND §4 同形，页面函数返回 HTML 字符串。
// 数据只读 window.DEMO（字段名与 DTO 一致）；每个区块的 data-op 标注对应的 operationId。
const D = window.DEMO;
const NOW = new Date(D.serverTime);
const app = document.getElementById('app');

const ICON = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
  task: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11l2 2 4-4M9 17h6"/>',
  chart: '<path d="M4 20h16M7 16v-5M12 16V6M17 16v-8"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5V14M12 17.5v.01"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5 0-1.2-1-1.5-1-2.5s.8-1.5 2-1.5H17a4 4 0 0 0 4-4c0-4.7-4-8.5-9-8.5z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  send: '<path d="M4 12 20 4l-6 16-3-7z"/>',
  file: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
};
const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

/* ---------- 时间：一律按北京时间显示 ---------- */
const DTF = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
const parts = iso => Object.fromEntries(DTF.formatToParts(new Date(iso)).map(p => [p.type, p.value]));
const md = iso => { const p = parts(iso); return `${p.month}月${p.day}日`; };
const hm = iso => { const p = parts(iso); return `${p.hour}:${p.minute}`; };
const wd = iso => parts(iso).weekday;
const at = iso => `${md(iso)} ${hm(iso)}`;
const dayKey = iso => { const p = parts(iso); return `${p.year}-${p.month.padStart(2, '0')}-${p.day.padStart(2, '0')}`; };
const TODAY = dayKey(D.serverTime);
const LOADED = Date.now();
const nowIso = () => new Date(NOW.getTime() + Date.now() - LOADED).toISOString(); // 演示时钟从 serverTime 起走
function relDue(iso) {
  const diff = new Date(iso) - NOW, day = 864e5;
  if (diff < 0) return { text: `已过 ${Math.max(1, Math.floor(-diff / day))} 天`, tone: 'late' };
  if (dayKey(iso) === TODAY) return { text: '今天截止', tone: 'urgent' };
  const d = Math.floor(diff / day), h = Math.floor(diff % day / 36e5);
  return { text: d < 1 ? `还剩 ${h} 小时` : d < 3 ? `还剩 ${d} 天 ${h} 小时` : `还剩 ${d} 天`, tone: d < 3 ? 'urgent' : '' };
}
/* ---------- 查找与派生 ---------- */
const course = id => D.courses.find(c => c.offeringId === id);
const asg = id => D.assignments.find(a => a.id === id);
const chapterOf = id => Object.values(D.chapters).flat().find(c => c.id === id);
const fbById = id => D.feedback.find(f => f.id === id);
const teacherName = c => c.teachers.map(t => t.displayName).join('、');
const chLabel = id => { const c = chapterOf(id); return c ? `第 ${c.number} 章 · ${c.title}` : ''; };
const isTodo = a => a.offeringStatus === 'active' && a.publicationState === 'published' && ['NOT_STARTED', 'IN_PROGRESS'].includes(a.assignmentState);
const unreadCount = () => D.messages.filter(m => !m.readAt).length;
const todoList = () => D.assignments.filter(isTodo).sort((x, y) => new Date(x.dueAt) - new Date(y.dueAt) || x.id.localeCompare(y.id));
const pad2 = n => String(n).padStart(2, '0');
const termAssignments = () => D.assignments.filter(a => course(a.offeringId).termId === D.term.id);
const dueOn = k => termAssignments().filter(a => dayKey(a.dueAt) === k);
// 日历默认选中最近有作业的一天：先往后找，找不到再往前找，都没有才回到今天
function pickCalDay(y, m) {
  const n = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const days = Array.from({ length: n }, (_, i) => `${y}-${pad2(m + 1)}-${pad2(i + 1)}`).filter(k => dueOn(k).length);
  return days.find(k => k >= TODAY) || days[days.length - 1] || TODAY;
}

// 列表只有 assignmentState + overdue：逾期项能否补交要等详情的 canSubmit / lateUntil
// 状态词表：未开始 / 进行中 / 已逾期 / 已截止 / 待批阅 / 已批阅。相对时间（还剩 N 天）是副信息，不进状态名。
const LIST_STATE = {
  NOT_STARTED: ['未开始', 'st-todo'], IN_PROGRESS: ['进行中', 'st-todo'], OVERDUE: ['已逾期', 'st-late'],
  SUBMITTED: ['待批阅', 'st-wait'], REVIEWED: ['已批阅', 'st-done'],
};
const listKey = a => isTodo(a) && a.overdue ? 'OVERDUE' : a.assignmentState;
const chip = k => `<span class="chip ${LIST_STATE[k][1]}">${LIST_STATE[k][0]}</span>`;
// 详情多一层：canSubmit + lateUntil + submissionBlockedReason
function detailState(a) {
  const d = a.detail;
  if (a.assignmentState === 'REVIEWED') return ['已批阅', 'st-done', ''];
  if (a.assignmentState === 'SUBMITTED') return ['待批阅', 'st-wait', d.canSubmit ? `截止前仍可提交新版本（已用 ${d.attemptsUsed}/${d.maxAttempts} 次）。` : '已过截止时间，等待教师批阅。'];
  if (a.overdue && d.canSubmit) return ['已逾期 · 可补交', 'st-late', `补交截止 ${at(d.lateUntil)}，提交会标记为逾期。`];
  if (a.overdue) return ['已截止', 'st-closed', BLOCK[d.submissionBlockedReason] || '已过截止时间。'];
  return [LIST_STATE[a.assignmentState][0], 'st-todo', ''];
}
const BLOCK = {
  SUBMISSION_CLOSED: '已过截止时间，且本作业不接受补交。', ATTEMPT_LIMIT_REACHED: '提交次数已用完。',
  RESUBMIT_AFTER_REVIEW: '评价已发布，P1 不支持批阅后重交。', RESUBMIT_NOT_ALLOWED: '本作业不允许重交。',
  OFFERING_ARCHIVED: '课程已归档，只能查看。', ASSIGNMENT_ARCHIVED: '作业已归档，只能查看。',
};
const TYPE = { web_lab: ['WEB', '网页实验'], sql_text: ['SQL', 'SQL 作答'], text: ['TEXT', '文本作答'] };
const typeTag = t => `<span class="tag" title="${TYPE[t][1]}">${TYPE[t][0]}</span>`;
const mark = c => `<span class="mark">${esc(c.mark)}</span>`;
const op = (name, planned = false) => ` data-op="${name}${planned ? ' · planned' : ''}"`;

/* ---------- 消息类型：五种，没有“逾期提醒” ---------- */
const MTYPE = { course_notice: '课程公告', assignment_published: '作业发布', feedback: '教师评价', help_reply: '求助回复', system: '系统' };

/* ---------- 登录页：左侧学习路径，右侧登录卡 ---------- */
function login() {
  return `<main class="login" id="main" tabindex="-1">
  <aside class="login-brand-panel">
    <div class="login-lock">
      <span class="brand-mark">知</span>
      <span class="login-brandname"><b>知学</b><small>学习平台</small></span>
    </div>
    <div class="lp-body">
      <p class="lp-lead">每一次尝试，<br><span>都值得记录。</span></p>
      <p class="lp-sub">提问、修改和卡住的地方都会留下记录，帮你看清自己是怎么一步步学会的。</p>
      <figure class="lp-path">
        <svg viewBox="0 0 640 150" aria-hidden="true" focusable="false">
          <path class="lp-line" d="M40 132H120L180 112H280L340 86H440L500 58H560" pathLength="100"/>
          <circle class="lp-ring" cx="560" cy="58" r="14"/>
          <circle class="lp-dot" style="--d:.55s" cx="80" cy="132" r="4.5"/>
          <circle class="lp-dot" style="--d:1s" cx="240" cy="112" r="4.5"/>
          <circle class="lp-dot" style="--d:1.4s" cx="400" cy="86" r="4.5"/>
          <circle class="lp-dot lp-dot-end" style="--d:1.8s" cx="560" cy="58" r="6.5"/>
        </svg>
        <figcaption class="lp-steps"><span>读要求</span><span>问 AI</span><span>自己写</span><span>看反馈</span></figcaption>
      </figure>
    </div>
    <p class="lp-foot">账号由学校统一发放 · 仅限本校师生</p>
  </aside>
  <section class="login-pane" aria-labelledby="login-t">
    <div class="login-card">
      <div class="login-eyebrow-row">
        <p class="login-eyebrow">${D.term.label} · 学生端</p>
        <button type="button" class="link-btn login-help" data-action="login-help">登录遇到问题？</button>
      </div>
      <h1 id="login-t" tabindex="-1">登录</h1>
      <p class="login-sub">使用学校统一账号（学号 / 工号）登录。</p>
      <form class="login-form" data-action="login" novalidate>
        <div class="field col">
          <label for="login-user">学号 / 工号</label>
          <input class="input" id="login-user" name="username" autocomplete="username" required>
        </div>
        <div class="field col">
          <div class="login-labelrow">
            <label for="login-pass">密码</label>
            <button type="button" class="link-btn login-forgot" data-action="login-help">忘记密码？</button>
          </div>
          <span class="pw">
            <input class="input" id="login-pass" type="password" name="password" autocomplete="current-password" required>
            <button type="button" class="pw-toggle" data-action="pw-toggle" aria-label="显示密码">显示</button>
          </span>
        </div>
        <label class="check login-check"><input type="checkbox" name="remember" checked> 记住登录状态</label>
        <p class="login-error" role="alert" hidden></p>
        <button class="btn primary login-submit" type="submit">登录<span class="login-arrow" aria-hidden="true">→</span></button>
      </form>
      <p class="login-note">请使用本人账号登录，不要与他人共享密码。</p>
    </div>
    <footer class="login-legal">© 2026 知学学习平台 · 仅限本校师生使用</footer>
  </section>
  <dialog id="login-help-dlg" aria-labelledby="lh-t"><form method="dialog">
    <div class="dlg-head"><h2 id="lh-t">登录帮助</h2><p class="meta">学生使用学号，教师使用工号登录。</p></div>
    <div class="dlg-body">
      <p>账号由学校统一发放。忘记密码、账号被锁定，或登录后看不到课程时，请联系课程管理员处理。</p>
      <p class="meta">在公共电脑登录时，请不要勾选“记住登录状态”。</p>
    </div>
    <div class="dlg-foot"><button class="btn" value="close">关闭</button></div>
  </form></dialog>
</main>`;
}

/* ---------- 路由 ---------- */
const R = {
  home: '#/student/home', courses: '#/course', course: id => `#/course/${id}`, chapter: (o, c) => `#/course/${o}/chapter/${c}`,
  asgs: '#/student/assignments', asg: id => `#/student/assignments/${id}`, ws: id => `#/student/workspaces/${id}`,
  tutor: id => `#/student/assignments/${id}/tutoring`, helpNew: id => `#/student/assignments/${id}/help`,
  helps: '#/student/help-requests', help: id => `#/student/help-requests/${id}`,
  progress: id => `#/student/progress/${id}`, msgs: '#/student/messages', cal: '#/student/calendar', spec: '#/spec',
  login: '#/login',
};
// 消息 target 是受控资源描述，由前端映射成路由，不当作任意 URL
function targetHref(t) {
  if (!t) return null;
  if (t.type === 'offering') return R.course(t.id);
  if (t.type === 'chapter') return R.chapter(t.offeringId, t.id);
  if (t.type === 'assignment') return R.asg(t.id);
  if (t.type === 'feedback') { const f = fbById(t.id); return f ? R.asg(f.assignmentId) + '?tab=feedback' : R.progress(t.offeringId); }
  if (t.type === 'help_request') return R.help(t.id);
  return null;
}
/* ---------- 外壳 ---------- */
const NAV = [
  ['home', '学习首页', 'home', R.home], ['courses', '我的课程', 'book', R.courses], ['asgs', '我的作业', 'task', R.asgs],
  ['progress', '学习记录', 'chart', R.progress('o-web')], ['cal', '学习日历', 'cal', R.cal], ['msgs', '消息通知', 'bell', R.msgs], ['helps', '我的求助', 'help', R.helps],
];
function shell(active, crumbs, body) {
  const n = unreadCount();
  return `<a class="skip" href="#main" data-action="skip">跳到主要内容</a><div class="shell">
  <aside class="sidebar">
    <div class="brand"><span class="brand-mark">知</span><b>知学</b></div>
    <nav class="nav" aria-label="主导航">
      ${NAV.map(([k, label, ic, href]) => `<a href="${href}" class="${active === k ? 'on' : ''}" aria-label="${label}" ${active === k ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span>${k === 'msgs' && n ? `<span class="count" aria-label="${n} 条未读">${n}</span>` : ''}</a>`).join('')}
    </nav>
    <div class="sidebar-foot"><span class="avatar">${esc(D.me.displayName[0])}</span><div>${esc(D.me.displayName)}<small>${esc(D.me.username)}</small></div><a class="btn ghost sm" href="${R.login}" style="margin-left:auto">退出</a></div>
  </aside>
  <div class="main">
    <header class="topbar">
      <div class="crumbs">${crumbs}</div><div class="spacer"></div>
      <a class="btn ghost sm proto" href="${R.spec}" ${active === 'spec' ? 'aria-current="page"' : ''}>原型说明</a>
      <button class="btn ghost sm op-toggle" data-action="toggle-op" aria-pressed="${document.body.classList.contains('show-op')}" title="显示接口标注与判定说明">显示接口</button>
      <span class="term">${esc(D.term.label)}</span>
      <a class="btn ghost sm top-logout" href="${R.login}">退出</a>
    </header>
    <main class="page" id="main" tabindex="-1">${body}</main>
  </div></div>`;
}
const crumb = (...ps) => ps.map((p, i) => i === ps.length - 1 ? `<b>${esc(p[0])}</b>` : `<a href="${p[1]}">${esc(p[0])}</a><span aria-hidden="true">/</span>`).join('');
const sec = (title, right, body, attrs = '') => `<section class="sec"${attrs}><div class="sec-h"><h2>${title}</h2>${right || ''}</div>${body}</section>`;
const empty = (title, text, action = '') => `<div class="empty"><b>${title}</b><p>${text}</p>${action}</div>`;
const progressBar = p => p.notConfigured ? '<span class="meta">未配置章节</span>' : `<div class="bar" role="progressbar" aria-valuenow="${p.percent}" aria-valuemin="0" aria-valuemax="100" aria-label="章节进度"><i style="width:${p.percent}%"></i></div>`;

/* ---------- 首页：getDashboard ---------- */
// 首页只回答两件事：现在做什么、接下来有什么。逾期项留在“我的作业”，不在这里重复。
function home() {
  const todo = todoList(), cl = D.dashboard.currentLearning, clCourse = cl ? course(cl.offeringId) : null;
  const resume = cl?.type === 'assignment' ? cl.resume : null;
  const fb = [...D.feedback].sort((x, y) => new Date(y.publishedAt) - new Date(x.publishedAt))[0];
  const hour = +parts(D.serverTime).hour, hello = hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
  const rd = cl?.type === 'assignment' ? relDue(cl.dueAt) : null;
  // 倒计时是第二视觉层：只放大剩余时间，截止日期与保存信息退回 13px
  const cd = !rd ? null
    : rd.tone === 'late' ? { label: '已逾期', value: rd.text.replace(/^已过\s*/, ''), tone: 'late' }
    : rd.text === '今天截止' ? { label: '今天截止', value: hm(cl.dueAt), tone: 'urgent' }
    : { label: '距离截止', value: rd.text.replace(/^还剩\s*/, ''), tone: rd.tone };

  // 当前任务是页面上唯一带框的块：细线卡片把来源与状态、标题、动作与时间收成一个整体
  const current = !cl ? empty('没有待完成的学习任务', '', `<a class="btn" href="${R.courses}">我的课程</a>`)
    : cl.type === 'chapter' ? `<div class="current"${op('getDashboard.currentLearning')}>
      <div class="current-top"><span class="eyebrow">${esc(clCourse?.title || '')}</span></div>
      <h3><a href="${R.chapter(cl.offeringId, cl.chapterId)}">${esc(cl.title)}</a></h3>
      <div class="current-foot"><div class="current-actions"><a class="btn primary" href="${R.chapter(cl.offeringId, cl.chapterId)}">继续阅读</a></div></div></div>`
    : `<div class="current"${op('getDashboard.currentLearning')}>
      <div class="current-top"><span class="eyebrow">${esc(clCourse.title)}</span>${chip(cl.overdue ? 'OVERDUE' : cl.assignmentState)}</div>
      <h3><a href="${R.asg(cl.assignmentId)}">${esc(cl.title)}</a></h3>
      <div class="current-foot">
        <div class="current-side">
          <div class="current-actions">
            ${cl.overdue ? `<a class="btn primary" href="${R.asg(cl.assignmentId)}">查看作业详情</a>` : `<a class="btn primary" href="${R.ws(cl.assignmentId)}">${resume ? '继续作答' : '开始作答'}</a>`}
            ${D.aiPolicies[cl.assignmentId]?.enabled ? `<a class="quiet-link" href="${R.tutor(cl.assignmentId)}">${icon('spark')}AI 辅导</a>` : ''}
            ${cl.overdue ? '' : `<a class="quiet-link" href="${R.asg(cl.assignmentId)}">查看要求</a>`}
          </div>
          ${resume ? `<span class="meta current-saved">上次保存 ${at(resume.savedAt)}</span>` : ''}
        </div>
        <div class="due">
          <span class="meta">${cd.label}</span>
          <b class="due-value ${cd.tone}">${cd.value}</b>
          <span class="meta">${md(cl.dueAt)} ${wd(cl.dueAt)} ${hm(cl.dueAt)}</span>
        </div>
      </div>${cl.overdue ? '<p class="meta note api-note">逾期作业能否补交，由作业详情页的服务端判定（canSubmit / lateUntil）。</p>' : ''}</div>`;

  // 接下来：只列未来的截止，当前任务和逾期项都不在这里重复
  const next = todo.filter(a => a.id !== (cl?.type === 'assignment' ? cl.assignmentId : null) && new Date(a.dueAt) >= NOW).slice(0, 3);
  const nextRow = a => { const r = relDue(a.dueAt), oc = course(a.offeringId); return `<a class="next-row" href="${R.asg(a.id)}">
      <span class="next-date"><b>${md(a.dueAt)}</b><span>${wd(a.dueAt)} ${hm(a.dueAt)}</span></span>
      <span class="next-main"><b>${esc(a.title)}</b><span class="meta">${esc(oc.title)}</span></span>
      <span class="rel ${r.tone}">${r.text}</span></a>`; };

  // 最新评价压成一块：分数、作业来源与一句话评语
  const fbBlock = fb ? `<a class="home-fb" href="${R.asg(fb.assignmentId)}?tab=feedback">
      <span class="home-fb-score">${fb.score}<small>/${fb.maxScore}</small></span>
      <span class="home-fb-main"><b>${esc(fb.assignmentTitle)}</b>
        <span class="meta">${esc(course(fb.offeringId).title)} · ${esc(fb.teacher.displayName)}</span>
        <span class="home-fb-comment">${esc(fb.comment)}</span></span></a>`
    : '<p class="meta">还没有已发布的评价。</p>';

  return `<header class="page-head"><div><h1 class="greet" tabindex="-1">${hello}，${esc(D.me.displayName)}</h1></div></header>
  <div class="home">
    ${sec('当前任务', '', current)}
    ${sec('接下来', `<a href="${R.asgs}">全部</a>`, next.length ? `<div class="next-list">${next.map(nextRow).join('')}</div>` : '<p class="meta">近期没有新的截止。</p>', op('listMyAssignments'))}
    ${sec('最新评价', fb ? `<a href="${R.progress(fb.offeringId)}">学习记录</a>` : '', fbBlock, op('getDashboard.recentFeedback'))}
  </div>`;
}
const state = {
  cTerm: D.term.id, cStatus: 'active',
  aFilter: 'todo', aCourse: 'all', aPage: 1,
  mRead: 'all', mType: 'all', hStatus: 'all',
  recPage: 1,
  cal: { y: +parts(D.serverTime).year, m: +parts(D.serverTime).month - 1, sel: pickCalDay(+parts(D.serverTime).year, +parts(D.serverTime).month - 1) },
  ws: {}, tutor: { action: 'ask', attach: true, pending: false, error: '', sent: [] },
};

/* ---------- 我的课程：listMyCourses ---------- */
function courses() {
  const list = D.courses.filter(c => (state.cTerm === 'all' || c.termId === state.cTerm) && (state.cStatus === 'all' || c.status === state.cStatus));
  const sel = (key, opts) => `<select class="select" data-model="${key}">${opts.map(([v, l]) => `<option value="${v}" ${state[key] === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  return `<header class="page-head"><div><h1 tabindex="-1">我的课程</h1><p>按最近学习排序。</p></div><button class="btn" data-action="enroll">${icon('plus')}加入课程</button></header>
  <div class="filters"><label class="field">学期${sel('cTerm', [...D.terms.map(t => [t.id, t.label]), ['all', '全部学期']])}</label>
    <label class="field">状态${sel('cStatus', [['active', '进行中'], ['archived', '已归档'], ['all', '全部']])}</label><span class="meta">共 ${list.length} 门</span></div>
  ${list.length ? `<div class="course-list"${op('listMyCourses')}>${list.map(c => `<article class="course">
      <div class="course-main">${mark(c)}<div class="grow"><h2><a href="${R.course(c.offeringId)}">${esc(c.title)}</a></h2>
        <span class="meta">${esc(c.groupName)} · ${esc(teacherName(c))} · ${esc(c.termLabel)}${c.status === 'archived' ? ' · <span class="tag">已归档</span>' : ''}</span></div></div>
      <div class="course-prog">${progressBar(c.progress)}<span class="meta num">已完成 ${c.progress.completed}/${c.progress.total} 章</span></div>
      <div class="course-now"><span class="meta">${c.currentChapter ? `${c.status === 'archived' ? '最后学习' : '当前'}：第 ${c.currentChapter.number} 章 · ${esc(c.currentChapter.title)}` : '尚未开始'}${c.lastStudiedAt ? ` · ${at(c.lastStudiedAt)}` : ''}</span>
        <span class="meta">${c.pendingAssignmentCount ? `<b>${c.pendingAssignmentCount}</b> 项待办` : '无待办'}${c.unreadFeedbackCount ? ` · <b>${c.unreadFeedbackCount}</b> 条新评价` : ''}</span></div>
      <a class="btn sm" href="${R.course(c.offeringId)}">${c.status === 'archived' ? '查看' : '进入课程'}</a></article>`).join('')}</div>`
    : empty('没有符合条件的课程', '切换学期或状态，或用教师给的邀请码加入课程。')}
  <dialog id="enroll-dlg" aria-labelledby="enroll-t"><form method="dialog">
    <div class="dlg-head"><h2 id="enroll-t">加入课程</h2><p class="meta">输入任课教师提供的邀请码。</p></div>
    <div class="dlg-body"><label class="field col">邀请码<input class="input" name="code" autocomplete="off" placeholder="例如 WEB-2301-7K"></label></div>
    <div class="dlg-foot"><button class="btn" value="cancel">取消</button><button class="btn primary" value="ok" data-action="enroll-ok"${op('enroll')}>加入</button></div>
  </form></dialog>`;
}

/* ---------- 课程主页：getOffering + listChapters ---------- */
function courseHome(id) {
  const c = course(id); if (!c) return notFound('课程');
  const chs = D.chapters[id] || [], asgs = D.assignments.filter(a => a.offeringId === id);
  const resume = chs.find(x => x.id === c.currentChapter?.id);
  return `<header class="page-head"><div><div class="eyebrow">${esc(c.groupName)} · ${esc(teacherName(c))}</div><h1 tabindex="-1">${esc(c.title)}</h1>
      <p>已完成 ${c.progress.completed}/${c.progress.total} 章${c.lastStudiedAt ? ` · 最近学习 ${at(c.lastStudiedAt)}` : ''}</p></div>
    ${resume ? `<a class="btn primary" href="${R.chapter(id, resume.id)}">继续第 ${resume.number} 章</a>` : ''}</header>
  <nav class="subnav" aria-label="课程"><a class="on" aria-current="page" href="${R.course(id)}">章节</a><a href="${R.asgs}?offering=${id}">作业</a><a href="${R.progress(id)}">学习记录</a><a href="${R.msgs}?offering=${id}">公告</a></nav>
  ${chs.length ? `<ol class="toc"${op('listChapters')}>${chs.map(ch => {
      const st = ch.studentProgress?.status, ca = asgs.filter(a => a.chapterId === ch.id);
      return `<li class="toc-row ${st}"><span class="toc-n">${st === 'completed' ? icon('check') : ch.number}</span>
        <div class="grow"><a href="${R.chapter(id, ch.id)}"><b>第 ${ch.number} 章 · ${esc(ch.title)}</b></a><span class="meta">${esc(ch.summary)}</span>
          ${ca.length ? `<span class="toc-asg">${ca.map(a => `<a href="${R.asg(a.id)}">${esc(a.title)}</a>${chip(listKey(a))}`).join('')}</span>` : ''}</div>
        <span class="meta toc-st">${st === 'completed' ? `已完成 · ${md(ch.studentProgress.completedAt)}` : st === 'in_progress' ? '学习中' : '未开始'}</span></li>`; }).join('')}</ol>`
    : empty('还没有已发布的章节', '教师发布章节后会出现在这里。')}
  <p class="meta note api-note">学生只能看到已发布章节，接口不返回未发布章节的数量或开放时间。</p>`;
}

/* ---------- 章节：getChapter ---------- */
function chapter(oid, cid) {
  const c = course(oid), ch = chapterOf(cid); if (!c || !ch) return notFound('章节');
  const chs = D.chapters[oid], i = chs.indexOf(ch), prev = chs[i - 1], next = chs[i + 1];
  const res = D.resources[cid] || [], kps = D.knowledgePoints[cid] || [], asgs = D.assignments.filter(a => a.chapterId === cid);
  const done = ch.studentProgress.status === 'completed';
  return `<header class="page-head"><div><div class="eyebrow">${esc(c.title)} · 第 ${ch.number} 章</div><h1 tabindex="-1">${esc(ch.title)}</h1><p>${esc(ch.summary)}</p></div>
    <button class="btn ${done ? '' : 'primary'}" data-action="chapter-done" data-v="${cid}"${op('updateChapterProgress')}>${done ? `${icon('check')}已完成` : '标记为已完成'}</button></header>
  <div class="read-grid"><article class="reader"${op('getChapter.resources')}>
    ${res.length ? res.map(r => `<section class="res" id="${r.id}"><h2>${esc(r.title)}</h2>${mdLite(r.content)}</section>`).join('') : empty('本章还没有资料', '可以先完成章内作业。')}
    <nav class="pager" aria-label="章节翻页">${prev ? `<a href="${R.chapter(oid, prev.id)}">← 第 ${prev.number} 章 · ${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a href="${R.chapter(oid, next.id)}">第 ${next.number} 章 · ${esc(next.title)} →</a>` : ''}</nav>
  </article>
  <aside class="col side">
    ${res.length ? sec('本章资料', '', `<ol class="mini-toc">${res.map(r => `<li><a href="#${r.id}" data-action="anchor">${esc(r.title)}</a></li>`).join('')}</ol>`) : ''}
    ${sec('章内作业', '', asgs.length ? `<div class="rows">${asgs.map(a => `<a class="row" href="${R.asg(a.id)}"><div class="grow"><b>${esc(a.title)}</b><span class="meta">${md(a.dueAt)} ${hm(a.dueAt)} 截止</span></div>${chip(listKey(a))}</a>`).join('')}</div>` : '<p class="meta">本章没有作业。</p>', op('getChapter.assignments'))}
    ${kps.length ? sec('知识点', `<a href="${R.progress(oid)}">掌握情况</a>`, `<p class="kp-line">${kps.map(k => `<span class="tag">${esc(k.title)}</span>`).join('')}</p>`, op('getChapter.knowledgePoints')) : ''}
  </aside></div>`;
}
// 资料只支持 markdown；原型只渲染段落和行内代码，内容先转义
const mdLite = s => s.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/`([^`]+)`/g, '<code>$1</code>')}</p>`).join('');
const notFound = what => empty(`${what}不存在或不可访问`, '链接可能已失效，或你不是该课程的成员。', `<a class="btn" href="${R.home}">回到首页</a>`);
/* ---------- 我的作业：listMyAssignments（filter = all / todo / done；page / pageSize） ---------- */
const A_PAGE = 10;
function assignments() {
  const scope = D.assignments.filter(a => state.aCourse === 'all' ? course(a.offeringId).termId === D.term.id : a.offeringId === state.aCourse);
  const done = a => ['SUBMITTED', 'REVIEWED'].includes(a.assignmentState);
  const summary = { todoCount: scope.filter(isTodo).length, doneCount: scope.filter(done).length };
  summary.allCount = scope.length; summary.archivedIncompleteCount = summary.allCount - summary.todoCount - summary.doneCount;
  const items = scope.filter(a => state.aFilter === 'all' || (state.aFilter === 'todo' ? isTodo(a) : done(a)))
    .sort((x, y) => state.aFilter === 'done' ? new Date(y.dueAt) - new Date(x.dueAt) : new Date(x.dueAt) - new Date(y.dueAt));
  const pages = Math.max(1, Math.ceil(items.length / A_PAGE));
  state.aPage = Math.min(Math.max(1, state.aPage), pages);
  const pageItems = items.slice((state.aPage - 1) * A_PAGE, state.aPage * A_PAGE);
  const ctx = state.aCourse === 'all' ? null : course(state.aCourse);
  const tabs = [['todo', '未提交', summary.todoCount], ['done', '已提交', summary.doneCount], ['all', '全部', summary.allCount]];
  const row = a => {
    const c = course(a.offeringId), r = relDue(a.dueAt), k = listKey(a), fb = a.publishedFeedbackId && fbById(a.publishedFeedbackId);
    const side = k === 'OVERDUE' ? '打开详情查看能否补交' : k === 'REVIEWED' && fb ? `${fb.score} 分${a.unreadFeedback ? ' · <b class="new">新评价</b>' : ''}` : k === 'SUBMITTED' ? '等待批阅' : D.workspaces[a.id] ? `已保存 · ${at(D.workspaces[a.id].savedAt)}` : '尚未开始';
    return `<a class="trow" href="${R.asg(a.id)}">
      <span class="t-due"><b class="num">${md(a.dueAt)}</b><span class="meta">${wd(a.dueAt)} ${hm(a.dueAt)}</span>${isTodo(a) ? `<span class="rel ${r.tone}">${r.text}</span>` : ''}</span>
      <span class="t-main"><b>${esc(a.title)}</b><span class="meta">${typeTag(a.type)}${esc(c.title)}${a.chapterId ? ` · 第 ${chapterOf(a.chapterId)?.number} 章` : ''}</span></span>
      <span class="t-state">${chip(k)}<span class="meta">${side}</span></span><span class="chev">${icon('chev')}</span></a>`;
  };
  const courseOpts = [...D.courses.filter(c => c.termId === D.term.id), ...(ctx && ctx.termId !== D.term.id ? [ctx] : [])];
  return `<header class="page-head"><div><h1 tabindex="-1">我的作业</h1><p>${esc(D.term.label)} · 截止时间为北京时间</p></div></header>
  <div class="tabs" role="tablist"${op('listMyAssignments.summary')}>${tabs.map(([k, l, n]) => `<button role="tab" aria-selected="${state.aFilter === k}" class="${state.aFilter === k ? 'on' : ''}" data-action="afilter" data-v="${k}">${l}<span class="n">${n}</span></button>`).join('')}</div>
  <div class="filters"><label class="field">课程<select class="select" data-model="aCourse"><option value="all">全部课程</option>${courseOpts.map(c => `<option value="${c.offeringId}" ${state.aCourse === c.offeringId ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}</select></label>
    ${ctx ? `<span class="meta">只看 ${esc(ctx.title)} · <a href="${R.asgs}?offering=all">全部课程</a></span>` : ''}
    ${summary.archivedIncompleteCount ? `<span class="meta">另有 ${summary.archivedIncompleteCount} 项已归档未完成，只在“全部”中显示</span>` : ''}</div>
  ${items.length ? `<div class="table"${op('listMyAssignments')}><div class="thead" aria-hidden="true"><span>截止</span><span>作业</span><span>状态</span><span></span></div>${pageItems.map(row).join('')}</div>
    <div class="pagination"><span class="meta">第 ${state.aPage} / ${pages} 页 · 共 ${items.length} 项</span><span class="pager-btns">
      <button class="btn sm" data-action="apage" data-v="${state.aPage - 1}" ${state.aPage <= 1 ? 'disabled' : ''}>上一页</button>
      <button class="btn sm" data-action="apage" data-v="${state.aPage + 1}" ${state.aPage >= pages ? 'disabled' : ''}>下一页</button></span></div>`
    : empty(state.aFilter === 'todo' ? '没有未提交的作业' : '没有符合条件的作业', '切换课程或标签查看其他作业。')}
  <p class="meta note api-note">列表只有 assignmentState 与 overdue：逾期作业能否补交要读详情（canSubmit、lateUntil），列表统一显示“已逾期”。分页对应 page / pageSize。</p>`;
}
/* ---------- 作业详情：getAssignment + listMySubmissions + getFeedback + getAiPolicy ---------- */
function assignmentDetail(id, q) {
  const a = asg(id); if (!a) return notFound('作业');
  const c = course(a.offeringId), d = a.detail, [label, cls, note] = detailState(a), r = relDue(a.dueAt);
  const subs = D.submissions[id] || [], fb = a.publishedFeedbackId && fbById(a.publishedFeedbackId), pol = D.aiPolicies[id], ws = D.workspaces[id];
  const tab = q.get('tab') || (fb ? 'feedback' : 'req');
  const tabs = [['req', '要求与评分标准'], ['subs', `提交记录 ${subs.length}`], ...(fb ? [['feedback', '教师评价']] : [])];
  const editable = !a.overdue || d.canSubmit;
  const body = {
    req: `<div${op('getAssignment')}><p class="lead">${esc(a.description)}</p>
      ${d.requirements.length ? `<h3>要求</h3><ol class="req">${d.requirements.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
      <h3>评分标准 <span class="meta">满分 ${d.maxScore}</span></h3>
      <table class="grid-table"><thead><tr><th>评分项</th><th class="r">分值</th></tr></thead><tbody>${d.rubric.map(x => `<tr><td>${esc(x.title)}</td><td class="r num">${x.maxScore}</td></tr>`).join('')}</tbody></table></div>`,
    subs: subs.length ? `<div class="subs"${op('listMySubmissions')}>${subs.map(s => {
        const det = D.submissionDetails[s.id];
        const st = s.superseded ? '<span class="meta">已被新提交替代</span>' : s.feedbackStatus === 'published' ? '<span class="chip st-done">已批阅</span>' : '<span class="chip st-wait">待批阅</span>';
        return `<details class="sub"><summary><span class="sub-top"><b>第 ${s.attemptNumber} 次</b>${st}</span>
          <span class="meta">${at(s.submittedAt)}${s.late ? ' · <span class="tag t-late">逾期</span>' : ''} · 工作区 r${s.workspaceRevision}</span><span class="chev" aria-hidden="true">${icon('chev')}</span></summary>
          <div class="sub-body"${op('getSubmission')}>${det ? `<h4>我的反思</h4>
            <p>${det.reflection ? esc(det.reflection) : '<span class="meta">这次没有写反思。</span>'}</p>
            <h4>提交的文件</h4><ul class="file-list">${det.files.map(f => `<li><code>${esc(f.path)}</code>
              <details class="file-peek"><summary>查看内容</summary><pre>${esc(f.content)}</pre></details></li>`).join('')}</ul>`
            : '<p class="meta">提交内容已过保留期，无法查看。</p>'}</div></details>`;
      }).join('')}</div>`
      : empty('还没有提交', editable ? '在工作区完成作答后提交。' : '这项作业已不能提交。'),
    feedback: fb ? `<div class="fb-detail"${op('getFeedback')}>
      <div class="fb-score"><span class="score big">${fb.score}<small>/${fb.maxScore}</small></span><div><b>${esc(fb.teacher.displayName)}</b><span class="meta">发布于 ${at(fb.publishedAt)}${fb.issueTags.length ? ' · ' + fb.issueTags.map(t => `<span class="tag">${esc(t)}</span>`).join('') : ''}</span></div></div>
      <blockquote>${esc(fb.comment)}</blockquote>
      <table class="grid-table"><thead><tr><th>评分项</th><th class="r">得分</th><th>说明</th></tr></thead><tbody>${fb.rubricResults.map(x => { const rc = d.rubric.find(y => y.criterionId === x.criterionId); return `<tr><td>${esc(rc?.title)}</td><td class="r num">${x.score}/${rc?.maxScore}</td><td class="meta">${esc(x.comment) || '—'}</td></tr>`; }).join('')}</tbody></table>
      ${fb.knowledgeEvaluations.length ? `<h3>知识点评价</h3><ul class="plain">${fb.knowledgeEvaluations.map(k => `<li><span class="kres ${k.result}">${KRES[k.result]}</span> ${esc(kpTitle(k.knowledgePointId))}${k.note ? `<span class="meta"> · ${esc(k.note)}</span>` : ''}</li>`).join('')}</ul>` : ''}</div>` : '',
  };
  return `<header class="page-head"><div><div class="eyebrow"><a href="${R.course(c.offeringId)}">${esc(c.title)}</a>${a.chapterId ? ` · <a href="${R.chapter(c.offeringId, a.chapterId)}">${chLabel(a.chapterId)}</a>` : ''}</div>
      <h1 tabindex="-1">${esc(a.title)}</h1>
      <p class="meta-line">${typeTag(a.type)}<span>${a.isRequired ? '必做' : '选做'}</span><span>预计 ${d.estimatedMinutes} 分钟</span><span>满分 ${d.maxScore}</span></p></div></header>
  <div class="detail-grid"><div class="col">
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<a role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" href="${R.asg(id)}?tab=${k}">${l}</a>`).join('')}</div>
    ${body[tab] || body.req}
  </div>
  <aside class="col side">
    <section class="status-box"${op('getAssignment.canSubmit / lateUntil / submissionBlockedReason')}>
      <div class="status-top"><span class="chip ${cls}">${label}</span>${a.unreadFeedback ? '<b class="new">新评价</b>' : ''}</div>
      <dl class="facts col1"><div><dt>截止</dt><dd>${md(a.dueAt)} ${wd(a.dueAt)} ${hm(a.dueAt)}${isTodo(a) ? ` <span class="rel ${r.tone}">${r.text}</span>` : ''}</dd></div>
        ${d.lateUntil ? `<div><dt>补交截止</dt><dd>${at(d.lateUntil)}</dd></div>` : '<div><dt>补交</dt><dd>不接受补交</dd></div>'}
        <div><dt>提交次数</dt><dd>${d.attemptsUsed}/${d.maxAttempts}${d.allowResubmit ? ' · 批阅前可重交' : ''}</dd></div>
        <div><dt>工作区</dt><dd>${ws ? `r${ws.revision} · ${at(ws.savedAt)}` : '未创建'}</dd></div></dl>
      ${note ? `<p class="meta">${note}</p>` : ''}
      <div class="stack-btns">${editable && a.assignmentState !== 'REVIEWED' ? `<a class="btn primary" href="${R.ws(id)}">${ws ? '继续作答' : '开始作答'}</a>` : `<a class="btn" href="${R.ws(id)}">查看作答（只读）</a>`}</div>
    </section>
    ${sec('需要帮助', '', `<div class="help-opts${pol?.enabled ? '' : ' one'}">
      ${pol?.enabled ? `<a class="opt" href="${R.tutor(id)}"${op('getAiPolicy')}><b>${icon('spark')}AI 辅导</b><span class="meta">只给思路和排错提示，不给完整答案。提示最多 ${pol.maxHintLevel} 级，每天本作业 ${pol.dailyAssignmentLimit} 次。</span></a>`
        : '<div class="opt off"><b>AI 辅导未开启</b><span class="meta">教师没有为这项作业启用。</span></div>'}
      <a class="opt" href="${R.helpNew(id)}"><b>${icon('help')}问老师</b><span class="meta">附上你的尝试和工作区版本，${esc(teacherName(c))}回复后会收到消息。</span></a></div>`)}
    ${d.knowledgePointIds.length ? sec('关联知识点', `<a href="${R.progress(c.offeringId)}">掌握情况</a>`, `<p class="kp-line">${d.knowledgePointIds.map(k => `<span class="tag">${esc(kpTitle(k))}</span>`).join('')}</p>`) : ''}
  </aside></div>`;
}
const KRES = { meets_expectation: '达到预期', needs_practice: '需要练习', insufficient_evidence: '证据不足' };
const kpTitle = id => Object.values(D.records).flatMap(r => r.knowledgeEvidence).find(k => k.knowledgePointId === id)?.title || Object.values(D.knowledgePoints).flat().find(k => k.id === id)?.title || ({ 'kp-se-uml': '用例关系', 'kp-db-select': '单表查询', 'kp-db-join': '连接查询', 'kp-db-index': '索引设计' })[id] || id;
/* ---------- 作答工作区：getWorkspace / saveWorkspace / submitAssignment ---------- */
const TEMPLATE = { web_lab: ['index.html', 'style.css', 'script.js'], sql_text: ['answer.sql'], text: ['answer.md'] };
function wsState(id) {
  const a = asg(id);
  if (!state.ws[id]) {
    const w = D.workspaces[id] || { assignmentId: id, revision: 0, activeFile: TEMPLATE[a.type][0], savedAt: null, canSave: a.offeringStatus === 'active', saveBlockedReason: null, files: TEMPLATE[a.type].map(path => ({ path, content: '' })) };
    state.ws[id] = { w, files: Object.fromEntries(w.files.map(f => [f.path, f.content])), active: w.activeFile, dirty: false, saving: false, preview: false };
  }
  return state.ws[id];
}
function workspace(id) {
  const a = asg(id); if (!a) return notFound('作业');
  const s = wsState(id), d = a.detail, c = course(a.offeringId);
  const readOnly = wsReadOnly(a, s);
  const canSubmit = d.canSubmit && s.w.revision > 0 && !s.dirty;
  const saveTitle = s.dirty ? '' : '工作区没有新的修改';
  return `<div class="ws-head"${op('getWorkspace')}>
    <div class="grow"><a class="meta" href="${R.asg(id)}">← ${esc(c.title)} · 作业详情</a><h1 tabindex="-1">${esc(a.title)}</h1></div>
    <span class="save-st" id="save-st" role="status">${saveText(s)}</span>
    ${a.type === 'web_lab' ? `<button class="btn" data-action="ws-preview" aria-pressed="${s.preview}">${s.preview ? '关闭预览' : '预览'}</button>` : ''}
    <button class="btn" data-action="ws-save" ${readOnly || !s.dirty || s.saving ? 'disabled' : ''} title="${saveTitle}">保存版本</button>
    ${D.aiPolicies[id]?.enabled ? `<a class="btn" href="${R.tutor(id)}">${icon('spark')}AI 辅导</a>` : ''}
    <button class="btn primary" data-action="ws-submit" ${canSubmit && !readOnly ? '' : 'disabled'} title="${canSubmit ? '' : d.canSubmit ? (s.dirty ? '先保存版本再提交' : '先保存一次才能提交') : esc(BLOCK[d.submissionBlockedReason] || '')}"${op('submitAssignment')}>提交 r${s.w.revision}</button></div>
  ${readOnly ? `<p class="notice-bar">${esc(BLOCK[d.submissionBlockedReason] || '工作区只读。')} 可以查看内容，不能保存。</p>` : ''}
  <p class="meta note api-note ws-note">每次“保存版本”调用 saveWorkspace(baseRevision)，服务端生成新的 revision 并记下保存时间；提交只接受已保存的版本，所以有未保存修改时提交按钮不可用。</p>
  <div class="ws ${s.preview ? 'with-preview' : ''}">
    <div class="editor">
      <div class="file-tabs" role="tablist">${Object.keys(s.files).map(p => `<button role="tab" aria-selected="${s.active === p}" class="${s.active === p ? 'on' : ''}" data-action="ws-file" data-v="${p}">${icon('file')}${p}</button>`).join('')}</div>
      <textarea id="code" class="code" spellcheck="false" aria-label="${s.active}" ${readOnly ? 'readonly' : ''} data-ws="${id}">${esc(s.files[s.active])}</textarea>
    </div>
    ${s.preview ? `<div class="preview"><div class="preview-bar"><span class="meta">隔离预览 · 不代表检查通过</span><button class="btn ghost sm" data-action="ws-preview-reset">重新加载</button></div>
      <iframe sandbox="allow-scripts" title="网页预览" srcdoc="${esc(previewDoc(s.files))}"></iframe></div>` : ''}
  </div>
  <dialog id="submit-dlg" aria-labelledby="sub-t"><form method="dialog">
    <div class="dlg-head"><h2 id="sub-t">提交第 ${d.attemptsUsed + 1} 次</h2><p class="meta">将提交工作区版本 r${s.w.revision}（${s.w.savedAt ? at(s.w.savedAt) : ''} 保存）。${a.overdue ? '已过截止时间，本次提交会标记为逾期。' : ''}${d.allowResubmit ? '批阅前可以再次提交，旧提交会被替代。' : '提交后不能修改。'}</p></div>
    <div class="dlg-body"><label class="field col">反思（可选，随提交保存）<textarea class="input" name="reflection" rows="4" placeholder="这次遇到的主要问题、你是怎么解决的"></textarea></label></div>
    <div class="dlg-foot"><button class="btn" value="cancel">取消</button><button class="btn primary" value="ok" data-action="ws-submit-ok" data-v="${id}">确认提交</button></div>
  </form></dialog>`;
}
const saveText = s => s.saving ? '保存中…' : s.dirty ? '有未保存的修改' : s.w.savedAt ? `已保存 r${s.w.revision} · ${hm(s.w.savedAt)}` : '还没有保存';
const previewDoc = f => `<!doctype html><html><head><meta charset="utf-8"><style>${(f['style.css'] || '').replace(/<\//g, '<\\/')}</style></head><body>${f['index.html'] || ''}</body></html>`;
/* ---------- AI 辅导：getAiPolicy / listTutoringMessages / sendTutoringMessage / getTutoringRequest ---------- */
const MODE = { concept: '概念解释', debug_hint: '排错提示', guided_question: '引导提问', fallback: '安全模板' };
const ACTION = { ask: '提问', concept: '解释概念', next_hint: '下一级提示' };
const NEXT = { try_and_report: '按提示改一下，再告诉我结果', review_concept: '建议先回看相关章节', request_teacher_help: '建议向老师求助', none: '' };
function tutoring(id) {
  const a = asg(id); if (!a) return notFound('作业');
  const pol = D.aiPolicies[id], c = course(a.offeringId), t = state.tutor;
  const head = `<header class="page-head"><div><div class="eyebrow"><a href="${R.asg(id)}">${esc(a.title)}</a> · ${esc(c.title)}</div><h1 tabindex="-1">AI 辅导</h1></div>
    <a class="btn" href="${R.ws(id)}">回到工作区</a></header>`;
  if (!pol?.enabled) return head + empty('这项作业没有开启 AI 辅导', '教师可以按作业开启。遇到问题可以直接问老师。', `<a class="btn" href="${R.helpNew(id)}">问老师</a>`);
  const conv = D.tutoring[id] ||= { session: null, messages: [] };
  const level = Math.max(0, ...conv.messages.filter(m => m.role === 'assistant' && m.mode !== 'fallback').map(m => m.hintLevel || 0));
  const target = t.action === 'next_hint' ? level + 1 : t.action === 'concept' ? 1 : Math.max(1, level);
  const needAttempt = target >= pol.requireAttemptFromLevel, ws = D.workspaces[id];
  // 接口只给上限；已用次数由本次会话的消息推导（仅原型演示，不是契约字段）
  const usedToday = conv.messages.filter(m => m.role === 'student' && dayKey(m.createdAt) === TODAY).length;
  const atCap = level >= pol.maxHintLevel;
  const recent = t.sent.filter(ts => Date.now() - ts < 60e3).length;
  const limited = recent >= pol.perMinuteLimit, exhausted = usedToday >= pol.dailyAssignmentLimit;
  const stop = limited ? `发送太频繁：每分钟最多 ${pol.perMinuteLimit} 次，请稍后再发。` : exhausted ? `本作业今天的 ${pol.dailyAssignmentLimit} 次辅导已用完，建议问老师。` : t.error;
  const bubble = m => m.contentUnavailableReason ? `<div class="msg ai"><span class="lv">内容不可用</span><p class="meta">这条回复已过保留期，无法查看。</p></div>` : m.role === 'student'
    ? `<div class="msg me"><p>${esc(m.content)}</p><span class="meta">${hm(m.createdAt)}</span></div>`
    : `<div class="msg ai ${m.mode === 'fallback' ? 'fallback' : ''}"><span class="lv">${m.mode === 'fallback' ? '安全模板 · 不计入提示层级' : `第 ${m.hintLevel} 级 · ${MODE[m.mode]}`}</span><p>${esc(m.content)}</p>${m.next && NEXT[m.next] ? `<span class="next">${NEXT[m.next]}</span>` : ''}</div>`;
  return head + `<div class="tutor-grid"><div class="chat-col">
    <div class="chat" id="chat"${op('listTutoringMessages')}>${conv.messages.length ? conv.messages.map(bubble).join('')
      : '<p class="meta chat-empty">还没有提问。描述你遇到的问题，或请 AI 解释一个概念。</p>'}
      ${t.pending ? `<div class="msg ai pending" role="status"><span class="lv">${t.pending === 'queued' ? '排队中' : '生成中'}</span><p>回复经过审核后才会显示。</p></div>` : ''}
      ${atCap ? `<div class="chat-cap"><p>已达最高层级 ${level}/${pol.maxHintLevel}：这已经是本作业能给到的最具体提示。还卡住的话，把尝试和报错一起发给老师。</p><a class="btn sm" href="${R.helpNew(id)}">问老师</a></div>` : ''}</div>
    <form class="composer" data-action="tutor-form"${op('sendTutoringMessage')}>
      ${stop ? `<p class="notice-bar" role="alert">${esc(stop)}</p>` : ''}
      <div class="seg" role="radiogroup" aria-label="提问方式">${pol.allowedActions.map(k => `<button type="button" role="radio" aria-checked="${t.action === k}" class="${t.action === k ? 'on' : ''}" data-action="tact" data-v="${k}" ${k === 'next_hint' && atCap ? 'disabled' : ''}>${ACTION[k]}</button>`).join('')}
        ${atCap ? '<span class="meta cap-note">提示层级已用尽</span>' : ''}</div>
      <label class="sr" for="tq">问题</label><textarea id="tq" class="input" rows="2" placeholder="${t.action === 'concept' ? '想了解哪个概念？例如：grid-template-areas' : '描述现象和你期望的结果'}"></textarea>
      <label class="field col">${needAttempt ? `我的尝试（第 ${pol.requireAttemptFromLevel} 级起必填）` : '我的尝试（可选）'}<textarea id="tatt" class="input" rows="2" placeholder="你已经试过什么，结果如何"></textarea></label>
      <div class="composer-foot">${ws ? `<label class="check"><input type="checkbox" data-action="tattach" ${t.attach ? 'checked' : ''}> 附上工作区 r${ws.revision}</label>` : '<span class="meta">工作区还没有保存，不能附上代码</span>'}
        <span class="meta">今天已用 ${usedToday}/${pol.dailyAssignmentLimit} 次 · 目标第 ${Math.min(target, pol.maxHintLevel)} 级</span>
        <button class="btn primary" ${t.pending || limited || exhausted || (t.action === 'next_hint' && atCap) ? 'disabled' : ''}>${icon('send')}发送</button></div>
    </form></div>
  <aside class="col side">${sec('本作业的辅导规则', '', `<p class="lead-sm">${esc(pol.boundaryText)}</p>
      <dl class="facts col1"${op('getAiPolicy')}><div><dt>当前层级</dt><dd><span class="levels">${Array.from({ length: pol.maxHintLevel }, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('')}</span> 第 ${level}/${pol.maxHintLevel} 级</dd></div>
        <div><dt>完整答案</dt><dd>不提供</dd></div><div><dt>代码块</dt><dd>不生成</dd></div>
        <div><dt>需附尝试</dt><dd>第 ${pol.requireAttemptFromLevel} 级起</dd></div>
        <div><dt>次数上限</dt><dd>本作业每天 ${pol.dailyAssignmentLimit} 次 · 每分钟 ${pol.perMinuteLimit} 次</dd></div></dl>
      <p class="meta note api-note">接口只返回上限，不返回已用次数；界面上的“今天已用”由会话消息在本地统计。超出时发送返回 RATE_LIMITED。</p>`)}
    ${sec('仍然没解决', '', `<p class="meta">问老师时可以附上本次对话里已经给出的提示。</p><a class="btn" href="${R.helpNew(id)}">问老师</a>`)}
  </aside></div>`;
}
/* ---------- 学习记录：getMyLearningRecords（knowledge-v2） ---------- */
const KSTATE = { basically_mastered: ['基本掌握', 'k-ok'], needs_practice: ['需要练习', 'k-warn'], learning: ['学习中', 'k-mid'], insufficient_evidence: ['证据不足', 'k-none'] };
const FRESH = { fresh: '证据较新', stale: '证据超过 30 天', none: '暂无证据' };
// 知识点 → 所在章节：契约没有章节字段，用章内知识点表反查
const kpChapter = kpId => { const hit = Object.entries(D.knowledgePoints).find(([, ks]) => ks.some(k => k.id === kpId)); return hit ? chapterOf(hit[0]) : null; };
// 学习节奏：契约没有行为字段，这里只做客户端聚合（近 7 天的提交 / 求助 / AI 提问 / 保存版本）
function rhythm(oid) {
  const rows = Array.from({ length: 7 }, (_, i) => ({ k: dayKey(new Date(NOW.getTime() - (6 - i) * 864e5).toISOString()), sub: 0, help: 0, ask: 0, save: 0 }));
  const add = (iso, key) => { const r = rows.find(x => x.k === dayKey(iso)); if (r) r[key] += 1; };
  Object.values(D.submissions).flat().filter(s => s.offeringId === oid && !s.superseded).forEach(s => add(s.submittedAt, 'sub'));
  D.help.filter(h => h.offeringId === oid).forEach(h => add(h.createdAt, 'help'));
  Object.entries(D.tutoring).forEach(([aid, conv]) => { if (asg(aid)?.offeringId === oid) conv.messages.filter(m => m.role === 'student').forEach(m => add(m.createdAt, 'ask')); });
  Object.entries(D.workspaces).forEach(([aid, w]) => { if (asg(aid)?.offeringId === oid && w.savedAt) add(w.savedAt, 'save'); });
  return rows;
}
const FB_PAGE = 5;
function progress(oid) {
  const c = course(oid) || D.courses[0], rec = D.records[c.offeringId] || { summary: {}, knowledgeEvidence: [], nextRecommendation: null };
  const fbs = D.feedback.filter(f => f.offeringId === c.offeringId).sort((x, y) => new Date(y.publishedAt) - new Date(x.publishedAt));
  const kps = [...rec.knowledgeEvidence].sort((x, y) => ['needs_practice', 'learning', 'insufficient_evidence', 'basically_mastered'].indexOf(x.assessmentState) - ['needs_practice', 'learning', 'insufficient_evidence', 'basically_mastered'].indexOf(y.assessmentState));
  const rc = rec.nextRecommendation, rh = rhythm(c.offeringId), rmax = Math.max(1, ...rh.map(r => r.sub + r.help + r.ask + r.save));
  const rt = rh.reduce((a, r) => ({ sub: a.sub + r.sub, help: a.help + r.help, ask: a.ask + r.ask, save: a.save + r.save }), { sub: 0, help: 0, ask: 0, save: 0 });
  const fbPages = Math.max(1, Math.ceil(fbs.length / FB_PAGE));
  state.recPage = Math.min(Math.max(1, state.recPage), fbPages);
  const fbShown = fbs.slice((state.recPage - 1) * FB_PAGE, state.recPage * FB_PAGE);
  return `<header class="page-head"><div><h1 tabindex="-1">学习记录</h1><p>掌握判断只依据已批阅作业里的知识点评价，不代表考试成绩。</p></div>
    <label class="field">课程<select class="select" data-action="rec-course">${D.courses.map(x => `<option value="${x.offeringId}" ${x.offeringId === c.offeringId ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select></label></header>
  <dl class="stats"${op('getMyLearningRecords.summary')}>
    <div><dt>章节进度</dt><dd><b class="num">${c.progress.completed}</b>/${c.progress.total}</dd></div>
    <div><dt>已完成实验</dt><dd><b class="num">${rec.summary.completedLabCount ?? 0}</b></dd></div>
    <div><dt>已发布评价</dt><dd><b class="num">${rec.summary.publishedFeedbackCount ?? 0}</b></dd></div>
    <div><dt>需要练习的知识点</dt><dd>${rec.summary.needsPracticeCount == null ? '<span class="meta">未配置知识点</span>' : `<b class="num">${rec.summary.needsPracticeCount}</b>`}</dd></div></dl>
  ${rc ? `<div class="reco"${op('nextRecommendation')}><div class="grow"><span class="eyebrow">下一步</span><b>${esc(rc.title)}</b><p>${esc(rc.reason)}</p></div><a class="btn" href="${targetHref(rc.target)}">去复习</a></div>` : ''}
  ${sec('最近 7 天', '<span class="meta">提交 · 求助 · AI 提问 · 保存版本</span>', `<div class="rhythm">${rh.map(r => { const n = r.sub + r.help + r.ask + r.save, w = parts(`${r.k}T12:00:00+08:00`).weekday;
      return `<div class="rday"><span class="rbar" aria-hidden="true"><i class="${n ? '' : 'none'}" style="height:${Math.round(n / rmax * 100)}%"></i></span>
        <b class="num">${n || '·'}</b><span class="meta">${w.replace('周', '')} ${+r.k.slice(5, 7)}/${+r.k.slice(8)}</span>
        <span class="sr">提交 ${r.sub}，求助 ${r.help}，AI 提问 ${r.ask}，保存 ${r.save}</span></div>`; }).join('')}</div>
    <p class="meta">近 7 天合计：提交 ${rt.sub} · 求助 ${rt.help} · AI 提问 ${rt.ask} · 保存 ${rt.save}</p>
    <p class="meta note api-note">没有学习行为分析接口；这张图是前端把提交记录、求助、辅导消息和工作区保存时间按天聚合得到的，不是服务端统计。</p>`)}
  <div class="records-grid"><div class="col">
    ${sec('知识点', kps.length ? `<span class="meta">规则 knowledge-v2 · ${at(kps[0].asOf)} 计算</span>` : '', kps.length ? `<div class="kp-list"${op('getMyLearningRecords.knowledgeEvidence')}>${kps.map(k => { const ch = kpChapter(k.knowledgePointId); return `<details class="kp">
        <summary><span class="kstate ${KSTATE[k.assessmentState][1]}">${KSTATE[k.assessmentState][0]}</span><b>${esc(k.title)}</b><span class="meta">${k.evidenceCount} 条证据 · ${FRESH[k.freshness]}</span></summary>
        <div class="kp-body"><p>${esc(k.explanation)}</p>${ch ? `<p class="meta">关联章节 · <a href="${R.chapter(c.offeringId, ch.id)}">第 ${ch.number} 章 · ${esc(ch.title)}</a></p>` : ''}${k.evidence.length ? `<ul class="plain">${k.evidence.map(e => `<li><span class="kres ${e.result}">${KRES[e.result]}</span> ${asg(e.assignmentId) ? `<a href="${R.asg(e.assignmentId)}?tab=feedback">${esc(e.assignmentTitle)}</a>` : esc(e.assignmentTitle)}<span class="meta"> · ${md(e.occurredAt)}${e.note ? ' · ' + esc(e.note) : ''}</span></li>`).join('')}</ul>` : ''}</div></details>`; }).join('')}</div>`
      : empty('这门课没有配置知识点', '教师给作业关联知识点并发布评价后，这里会显示掌握情况。', `<a class="btn" href="${R.asgs}?offering=${c.offeringId}">查看这门课的作业</a>`))}
  </div><div class="col">
    ${sec('评价历史', `<span class="meta">${fbs.length} 份</span>`, fbs.length ? `<div class="rows"${op('getMyLearningRecords.feedbackPage')}>${fbShown.map(f => `<a class="row fb-row" href="${R.asg(f.assignmentId)}?tab=feedback"><span class="score">${f.score}</span>
        <div class="grow"><b>${esc(f.assignmentTitle)}</b><span class="meta">${esc(f.teacher.displayName)} · ${at(f.publishedAt)}</span><p class="clamp">${esc(f.comment)}</p></div></a>`).join('')}</div>
      ${fbPages > 1 ? `<div class="pagination"><span class="meta">第 ${state.recPage} / ${fbPages} 页</span><span class="pager-btns">
        <button class="btn sm" data-action="recpage" data-v="${state.recPage - 1}" ${state.recPage <= 1 ? 'disabled' : ''}>上一页</button>
        <button class="btn sm" data-action="recpage" data-v="${state.recPage + 1}" ${state.recPage >= fbPages ? 'disabled' : ''}>下一页</button></span></div>` : ''}`
      : '<p class="meta">还没有已发布的评价。</p>')}
  </div></div>`;
}

/* ---------- 日历：listMyAssignments（按 dueAt 落在当月） ---------- */
function calendar() {
  const { y, m, sel } = state.cal, pad = n => String(n).padStart(2, '0');
  const first = new Date(Date.UTC(y, m, 1)), lead = (first.getUTCDay() + 6) % 7, days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, i) => { const d = new Date(Date.UTC(y, m, i - lead + 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; });
  const on = dueOn, selEvs = on(sel), [sy, sm, sd] = sel.split('-').map(Number);
  return `<header class="page-head"><div><h1 tabindex="-1">学习日历</h1><p>作业截止时间 · 北京时间。<span class="api-note">没有排课接口，因此不显示上课时间。</span></p></div></header>
  <div class="cal-wrap"><div>
    <div class="cal-bar"><h2>${y} 年 ${m + 1} 月</h2><div class="spacer"></div><button class="btn sm" data-action="cal-today">今天</button><button class="btn sm" data-action="cal-move" data-v="-1" aria-label="上一月">‹</button><button class="btn sm" data-action="cal-move" data-v="1" aria-label="下一月">›</button></div>
    <div class="cal" role="grid"${op('listMyAssignments')}><div class="cal-dow" role="row">${['一', '二', '三', '四', '五', '六', '日'].map(d => `<span role="columnheader">周${d}</span>`).join('')}</div>
      <div class="cal-cells">${cells.map(k => { const e = on(k), out = +k.slice(5, 7) !== m + 1; return `<button role="gridcell" class="cal-cell ${out ? 'out' : ''} ${k === TODAY ? 'today' : ''} ${k === sel ? 'sel' : ''}" data-action="cal-sel" data-v="${k}" aria-label="${+k.slice(5, 7)}月${+k.slice(8)}日，${e.length ? `${e.length} 项截止：${e.map(a => a.title).join('、')}` : '没有作业截止'}" aria-selected="${k === sel}">
        <span class="n">${+k.slice(8)}</span>${e.slice(0, 2).map(a => `<span class="ev ${listKey(a).toLowerCase()}">${esc(a.title)}</span>`).join('')}${e.length > 2 ? `<span class="more">+${e.length - 2}</span>` : ''}</button>`; }).join('')}</div></div>
  </div>
  <aside class="col side">${sec(`${sm}月${sd}日 ${parts(`${sel}T12:00:00+08:00`).weekday}`, '', selEvs.length ? `<div class="rows">${selEvs.map(a => `<a class="row" href="${R.asg(a.id)}"><div class="grow"><b>${esc(a.title)}</b><span class="meta">${esc(course(a.offeringId).title)} · ${hm(a.dueAt)}</span></div>${chip(listKey(a))}</a>`).join('')}</div>` : '<p class="meta">这一天没有截止的作业。</p>')}</aside></div>`;
}
/* ---------- 消息：listMessages（type / read 筛选） ---------- */
function messages(q) {
  const oid = q.get('offering');
  const list = D.messages.filter(m => (!oid || m.offeringId === oid) && (state.mType === 'all' || m.type === state.mType) && (state.mRead === 'all' || (state.mRead === 'unread' ? !m.readAt : m.readAt)))
    .sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt));
  const groups = [...new Set(list.map(m => dayKey(m.createdAt)))];
  const label = k => k === TODAY ? '今天' : k === dayKey(new Date(NOW - 864e5).toISOString()) ? '昨天' : `${+k.slice(5, 7)}月${+k.slice(8)}日`;
  const n = unreadCount(), oc = oid && course(oid);
  return `<header class="page-head"><div><h1 tabindex="-1">消息通知</h1><p>${oc ? `${esc(oc.title)} · <a href="${R.msgs}">查看全部课程</a> · ` : ''}${n ? `${n} 条未读` : '全部已读'}</p></div>
    <button class="btn" data-action="read-all" ${n ? '' : 'disabled'}${op('readAllMessages', true)} title="接口状态 planned，正式版上线前可改为逐条 readMessage">全部标为已读</button></header>
  <div class="filters"><div class="seg" role="radiogroup" aria-label="阅读状态">${[['all', '全部'], ['unread', '未读'], ['read', '已读']].map(([k, l]) => `<button role="radio" aria-checked="${state.mRead === k}" class="${state.mRead === k ? 'on' : ''}" data-action="mread-f" data-v="${k}">${l}</button>`).join('')}</div>
    <label class="field">类型<select class="select" data-model="mType"><option value="all">全部类型</option>${Object.entries(MTYPE).map(([k, l]) => `<option value="${k}" ${state.mType === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
  ${list.length ? `<div class="msg-list"${op('listMessages')}>${groups.map(g => `<h3 class="day-h">${label(g)}</h3>${list.filter(m => dayKey(m.createdAt) === g).map(m => { const href = targetHref(m.target), c = m.offeringId && course(m.offeringId); return `
    <article class="mrow ${m.readAt ? '' : 'unread'}">
      <div class="grow"><span class="kind">${MTYPE[m.type]}${c ? ` · ${esc(c.title)}` : ''}${m.sender ? ` · ${esc(m.sender.displayName)}` : ''}</span>
        <h4>${m.readAt ? '' : '<span class="sr">未读：</span>'}${esc(m.title)}</h4><p>${esc(m.content)}</p></div>
      <div class="m-side"><span class="meta num">${hm(m.createdAt)}</span>${m.readAt ? '' : '<span class="unread-tag">未读</span>'}
        ${href ? `<a class="btn sm" href="${href}" data-action="mopen" data-v="${m.id}">查看</a>` : ''}${m.readAt ? '' : `<button class="btn ghost sm" data-action="mread" data-v="${m.id}"${op('readMessage')}>标为已读</button>`}</div></article>`; }).join('')}`).join('')}</div>`
    : empty('没有符合条件的消息', '切换筛选条件查看其他消息。')}
  <p class="meta note api-note">消息类型只有课程公告、作业发布、教师评价、求助回复和系统五种。作业逾期没有消息提醒，逾期作业只在“我的作业”里标出。</p>`;
}

/* ---------- 求助：listHelpRequests / getHelpRequest / createHelpRequest ---------- */
const HST = { open: ['等待回复', 'st-wait'], answered: ['已回复', 'st-done'], closed: ['已关闭', 'st-closed'] };
function helps() {
  const list = D.help.filter(h => state.hStatus === 'all' || h.status === state.hStatus).sort((x, y) => new Date(y.updatedAt) - new Date(x.updatedAt));
  return `<header class="page-head"><div><h1 tabindex="-1">我的求助</h1><p>求助都关联到具体作业，从作业详情的“问老师”发起。</p></div></header>
  <div class="tabs" role="tablist">${[['all', '全部'], ...Object.entries(HST).map(([k, v]) => [k, v[0]])].map(([k, l]) => `<button role="tab" aria-selected="${state.hStatus === k}" class="${state.hStatus === k ? 'on' : ''}" data-action="hstatus" data-v="${k}">${l}<span class="n">${k === 'all' ? D.help.length : D.help.filter(h => h.status === k).length}</span></button>`).join('')}</div>
  ${list.length ? `<div class="rows boxed"${op('listHelpRequests')}>${list.map(h => { const a = asg(h.assignmentId);
      const unread = D.messages.some(m => m.type === 'help_reply' && m.target?.id === h.id && !m.readAt); return `<a class="row" href="${R.help(h.id)}">
      <div class="grow"><b>${esc(h.title)}${unread ? ' <span class="new">新回复</span>' : ''}</b><span class="meta">${esc(a.title)} · ${esc(course(h.offeringId).title)} · ${at(h.createdAt)}</span></div>
      <span class="chip ${HST[h.status][1]}">${HST[h.status][0]}</span><span class="chev">${icon('chev')}</span></a>`; }).join('')}</div>`
    : empty('没有符合条件的求助', '做作业遇到问题时，可以先用 AI 辅导，仍解决不了再问老师。')}`;
}
function helpDetail(id) {
  const h = D.help.find(x => x.id === id); if (!h) return notFound('求助');
  // 打开详情即视为读了这条求助的回复通知：侧栏未读数与列表“新回复”随之消失
  D.messages.filter(m => m.type === 'help_reply' && m.target?.id === h.id && !m.readAt).forEach(m => { m.readAt = nowIso(); });
  const a = asg(h.assignmentId), c = course(h.offeringId), snap = h.sharedSnapshot;
  return `<header class="page-head"><div><div class="eyebrow"><a href="${R.asg(a.id)}">${esc(a.title)}</a> · ${esc(c.title)}</div><h1 tabindex="-1">${esc(h.title)}</h1>
    <p class="meta-line"><span class="chip ${HST[h.status][1]}">${HST[h.status][0]}</span><span>${at(h.createdAt)} 发起</span>${h.issueTags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</p></div></header>
  <div class="detail-grid"><div class="col"${op('getHelpRequest')}>
    ${sec('我的问题', '', `<p>${esc(h.content)}</p>${h.studentAttempt ? `<h3>我的尝试</h3><p>${esc(h.studentAttempt)}</p>` : ''}`)}
    ${sec('附上的工作区快照', snap ? `<span class="meta">${h.workspaceRevision ? `r${h.workspaceRevision} · ` : ''}保留至 ${md(snap.expiresAt)}</span>` : '', snap
      ? (snap.contentUnavailableReason ? '<p class="meta">快照已过保留期，无法查看。</p>'
        : `<div class="snap"${op('getHelpRequest.sharedSnapshot')}>${snap.files.map(f => `<details class="snap-file"><summary><code>${esc(f.path)}</code></summary><pre>${esc(f.content)}</pre></details>`).join('')}</div>`)
      : '<p class="meta">发起求助时没有附上代码。</p>')}
    ${h.sharedTutoringResults.length ? sec('附上的 AI 提示', '', h.sharedTutoringResults.map(r => `<blockquote>${r.content ? esc(r.content) : '内容已过保留期'}</blockquote><p class="meta">保留至 ${md(r.expiresAt)}</p>`).join('')) : ''}
    ${sec('老师回复', '', h.replies.length ? h.replies.map(r => `<div class="reply"><span class="meta">${esc(r.teacher.displayName)} · ${at(r.createdAt)}</span><p>${esc(r.content)}</p></div>`).join('') : '<p class="meta">老师还没有回复。回复后会收到“求助回复”消息。</p>')}
  </div><aside class="col side">${sec('共享内容', '', `<dl class="facts col1"><div><dt>工作区版本</dt><dd>${h.workspaceRevision ? `r${h.workspaceRevision}` : '未附上'}</dd></div>
      ${h.sharedSnapshot ? `<div><dt>快照保留至</dt><dd>${md(h.sharedSnapshot.expiresAt)}</dd></div>` : ''}<div><dt>AI 提示</dt><dd>${h.sharedTutoringRequestIds.length} 条</dd></div></dl>`)}</aside></div>`;
}
function helpNew(aid) {
  const a = asg(aid); if (!a) return notFound('作业');
  const c = course(a.offeringId), ws = D.workspaces[aid], conv = D.tutoring[aid];
  const hints = (conv?.messages || []).filter(m => m.role === 'assistant');
  return `<header class="page-head"><div><div class="eyebrow"><a href="${R.asg(aid)}">${esc(a.title)}</a> · ${esc(c.title)}</div><h1 tabindex="-1">问老师</h1><p>${esc(teacherName(c))}会看到你的问题、尝试和勾选共享的内容。</p></div></header>
  <form class="form" data-action="help-form" data-v="${aid}"${op('createHelpRequest')}>
    <label class="field col">标题<input class="input" name="title" required maxlength="80" placeholder="一句话说清问题"></label>
    <label class="field col">问题描述<textarea class="input" name="content" rows="4" required placeholder="现象是什么，你期望的结果是什么"></textarea></label>
    <label class="field col">我的尝试<textarea class="input" name="attempt" rows="3" placeholder="已经试过哪些办法，结果如何"></textarea></label>
    <fieldset class="share"><legend>共享内容</legend>
      ${ws ? `<label class="check"><input type="checkbox" name="ws" checked> 当前工作区 r${ws.revision}（${at(ws.savedAt)} 保存）</label>` : '<p class="meta">工作区还没有保存，无法共享代码。</p>'}
      ${hints.map(m => `<label class="check"><input type="checkbox" name="tr" value="${m.tutoringRequestId}"> AI 第 ${m.hintLevel} 级提示：${esc(m.content.slice(0, 40))}…</label>`).join('')}
    </fieldset>
    <div class="form-foot"><a class="btn" href="${R.asg(aid)}">取消</a><button class="btn primary">发送求助</button></div>
  </form>`;
}
/* ---------- 原型说明 ---------- */
function spec() {
  const P = [
    ['学习首页', R.home, 'getDashboard'], ['我的课程', R.courses, 'listMyCourses · enroll'], ['课程主页', R.course('o-web'), 'getOffering · listChapters'],
    ['章节', R.chapter('o-web', 'ch-web-5'), 'getChapter · updateChapterProgress'], ['我的作业', R.asgs, 'listMyAssignments'],
    ['作业详情', R.asg('a1'), 'getAssignment · listMySubmissions · getFeedback · getAiPolicy'], ['作答工作区', R.ws('a1'), 'getWorkspace · saveWorkspace · submitAssignment'],
    ['AI 辅导', R.tutor('a1'), 'getAiPolicy · listTutoringMessages · sendTutoringMessage · getTutoringRequest'], ['学习记录', R.progress('o-web'), 'getMyLearningRecords'],
    ['学习日历', R.cal, 'listMyAssignments'], ['消息通知', R.msgs, 'listMessages · readMessage · readAllMessages（planned）'],
    ['我的求助', R.helps, 'listHelpRequests · getHelpRequest'], ['问老师', R.helpNew('a1'), 'createHelpRequest'],
  ];
  const fixes = [
    ['当前任务', 'getDashboard.currentLearning 由服务端选择“还能动手”的一项；首页不再取待办列表第一条，避免把已截止作业当成当前任务。'],
    ['工作区版本', 'WorkspaceDTO 只有一个 revision，没有版本历史。改为显式“保存版本”生成新 revision；提交只引用已保存的版本，不做输入自动保存。'],
    ['提交反思', 'SubmissionSummaryDTO 没有 reflection / files；提交记录展开后按 getSubmission 读详情，列表只显示次数、时间、revision 与状态。'],
    ['AI 剩余次数', 'AiPolicyDTO 只有上限，不返回已用次数。界面显示上限，并区分“本地已用”与“服务端拒绝（RATE_LIMITED）”。'],
    ['AI 边界', '索要完整代码/答案时不升级提示层级，返回安全模板并复述 boundaryText；层级用尽后给出“问老师”出口。'],
    ['列表状态', '列表没有 canSubmit / lateUntil，逾期项统一显示“已逾期”，能否补交在详情页判断。状态词统一为未开始 / 进行中 / 已逾期 / 已截止 / 待批阅 / 已批阅。'],
    ['知识点证据', 'evidenceCount 没有上限，去掉“x/3”。知识点面板只按章内知识点表反查所属章节。'],
    ['学习节奏', '没有学习行为分析接口；“最近 7 天”由提交、求助、辅导消息和工作区 savedAt 在前端按天聚合，并在说明里标注为客户端统计。'],
    ['求助快照', 'SharedSnapshot 在保留期内返回文件；过期时 files 为 null 且带 contentUnavailableReason，界面显示“已过保留期”。'],
    ['分页', 'listMyAssignments 支持 page / pageSize，前端按 10 条分页；评价历史在同一页内按 5 条切片。'],
    ['首页安排', '首页只放三块：当前任务取 getDashboard.currentLearning；接下来由 listMyAssignments 客户端取未来 3 条（排除当前项与逾期项）；最新一条评价取 getDashboard.recentFeedback。逾期项统一在“我的作业”处理，首页不重复。'],
  ];
  return `<header class="page-head"><div><h1 tabindex="-1">原型说明</h1><p>路由与 FRONTEND §4 一致；样式令牌沿用 FRONTEND §9 的 M1。顶栏“显示接口”会在每个区块上标出对应的 operationId，同时放出默认收起的判定说明。</p></div></header>
  ${sec('页面与接口', '', `<table class="grid-table"><thead><tr><th>页面</th><th>路由</th><th>接口</th></tr></thead><tbody>${P.map(([n, h, o]) => `<tr><td><a href="${h}">${n}</a></td><td><code>${h.slice(1).split('?')[0]}</code></td><td class="meta">${o}</td></tr>`).join('')}</tbody></table>`)}
  ${sec('这一版改了什么', '', `<ul class="plain rules">
    <li>首页收成三块：当前任务（32px 标题、大号倒计时、一个主按钮，AI 辅导与查看要求降为文字链接）、接下来（未来 3 条，不含逾期）、最新评价（分数加一句话）。去掉顶部计数、右栏“最近动态”、时间窗筛选与分区横线。</li>
    <li>当前任务用一张细线卡片收拢：来源与状态在顶部，标题居中段，底部横线之下左侧是动作、右侧是倒计时；卡片是首页唯一带框的块，其余两块仍用空白分组。</li>
    <li>“当前任务”改读 getDashboard.currentLearning：服务端挑出还能动手的一项，逾期不可提交的作业不再占据首页主位。</li>
    <li>工作区去掉输入自动保存，改成显式“保存版本”：一次保存一个 revision，有未保存修改时提交按钮不可用；提交时写的反思会随提交保存，并能在提交记录里回看。</li>
    <li>提交记录改成可展开条目，反思与文件按 getSubmission 读取；AI 辅导补齐限流、日上限、层级用尽与索要完整答案四类拒绝路径。</li>
    <li>学习记录增加“最近 7 天”的小柱图（提交 / 求助 / AI 提问 / 保存版本），知识点显示关联章节，评价历史分页；日历默认落到最近有作业的一天。</li>
    <li>我的作业按 10 条分页，课程筛选跨页保留；从课程主页进作业列表、再点开作业，返回时不会丢掉课程上下文。</li>
    <li>求助详情能直接看发起时附上的工作区快照；列表对未读的教师回复标“新回复”，打开详情后未读计数同步减少。</li>
    <li>状态词统一为“未开始 / 进行中 / 已逾期 / 已截止 / 待批阅 / 已批阅”，相对时间只作副信息；窄屏顶栏补“退出”，同路由切换 tab 不再跳回页首。</li>
    <li>登录页按 6:4 左右分栏：左侧深色品牌栏占六成，用一条逐段画出的学习路径（读要求 → 问 AI → 自己写 → 看反馈）交代平台怎么帮学生；右侧四成是常规可读的登录卡——标签在上、48px 输入框、主按钮通栏。进入时路径从左到右画出，节点和步骤依次出现，减少动态时直接给终态。</li></ul>`)}
  ${sec('更早的版面调整', '', `<ul class="plain rules"><li>接口判定类的说明文字默认收起，只在顶栏“显示接口”打开时出现；页面上不再出现 operationId、错误码和字段名。</li><li>首页只回答两个问题：现在做什么、接下来有什么。课程列表从首页移除（入口在侧栏），腾出的空间改成 56px 分区间距与 72px 行高——密度降下来，页面不是变空。</li><li>首页减线：去掉分区横线，分组改由空白加 13px 灰色标签承担；问候语压到 20px 让位，任务标题升到 26px——一屏只有一个焦点。</li><li>“最近动态”每条从三行压成两行；“当前任务”只在真的保存过工作区时才显示“上次保存”。</li><li>首页“近期安排”的时间窗由四张卡片改成一行文字筛选；“当前任务”把状态并入标题行，事实收成一条行内事实。</li><li>登录页把常驻的七行调参面板收进“效果设置”，画面之上补品牌与一句定位。</li><li>“原型说明”从侧栏主导航移到顶栏，与“显示接口”一起作为原型工具，不占学生的学习路径。</li><li>按钮尺寸与规范对齐：主要操作 44px、次要按钮 36px、分段控件 40px；窄屏图标导航补上可访问名。</li></ul>`)}
  ${sec('与接口对齐的判定', '', `<table class="grid-table"><tbody>${fixes.map(([a, b]) => `<tr><th scope="row">${a}</th><td>${b}</td></tr>`).join('')}</tbody></table>`)}
  ${sec('状态与颜色', '', `<p class="kp-line">${Object.keys(LIST_STATE).map(chip).join('')}<span class="chip st-late">已逾期 · 可补交</span><span class="chip st-closed">已截止</span></p>
    <p class="meta">蓝色只表示操作、选中和进度；绿色完成；橙色临近截止、逾期或需要练习；红色错误或已截止。状态都带文字，不只靠颜色。登录页左侧品牌栏用墨蓝底和白色透明度分层，不额外引入颜色。</p>`)}
  ${sec('布局规则', '', `<ul class="plain rules"><li>页面是“页头 + 分区标签 + 列表或表格”，不在面板里再套面板。</li><li>分组靠空白和字号，横线只分隔同一组里的条目；分区标签用 13px 灰字，不与内容争字号。</li><li>每屏只有一个焦点：首页的焦点是“当前任务”，标题 32px，倒计时 28px 作第二层；其余正文 15px、辅助 13px，中间不留半档字号。</li><li>只有表格、对话框、工作区编辑器，以及首页的当前任务卡带边框；其余页面不使用渐变、装饰阴影和插画，阴影只给对话框与提示条；登录页例外：品牌栏可用深色底，登录卡带边框。</li><li>主要操作 44px，次要按钮 36px，其他可点击控件不低于 40px。</li><li>窄于 860px 时侧栏变为顶部菜单，表格改为单列，右侧栏移到主内容下方。</li><li>接口判定类的说明默认不出现，只在“显示接口”打开时显示；界面上不出现 operationId、错误码和字段名。</li></ul>`)}`;
}

/* ---------- 路由 ---------- */
function route() {
  const [path, qs = ''] = (location.hash.slice(1) || R.home.slice(1)).split('?');
  const seg = path.split('/').filter(Boolean), q = new URLSearchParams(qs);
  const T = D.term.label;
  const m = (...p) => p.length === seg.length && p.every((x, i) => x === '*' || x === seg[i]);
  // 从作业详情回列表时保留课程筛选；列表的“我的作业”crumbs 永远回到全部课程
  const asgList = state.aCourse === 'all' ? R.asgs : `${R.asgs}?offering=${state.aCourse}`;
  if (m('student', 'home')) return ['home', [[T, R.home], ['学习首页']], home(), '学习首页'];
  if (m('course')) return ['courses', [['我的课程']], courses(), '我的课程'];
  if (m('course', '*')) { const c = course(seg[1]); return ['courses', [['我的课程', R.courses], [c?.title || '课程']], courseHome(seg[1]), c?.title]; }
  if (m('course', '*', 'chapter', '*')) { const c = course(seg[1]), ch = chapterOf(seg[3]); return ['courses', [['我的课程', R.courses], [c?.title || '课程', R.course(seg[1])], [ch ? `第 ${ch.number} 章` : '章节']], chapter(seg[1], seg[3]), ch?.title]; }
  if (m('student', 'assignments')) {
    const off = q.get('offering');
    if (off === 'all') state.aCourse = 'all'; else if (off && course(off)) state.aCourse = off;
    const ctx = state.aCourse === 'all' ? null : course(state.aCourse);
    return ['asgs', ctx ? [['我的作业', `${R.asgs}?offering=all`], [ctx.title]] : [['我的作业']], assignments(), '我的作业'];
  }
  if (m('student', 'assignments', '*')) { const a = asg(seg[2]); return ['asgs', [['我的作业', asgList], [a?.title || '作业']], assignmentDetail(seg[2], q), a?.title]; }
  if (m('student', 'assignments', '*', 'tutoring')) { const a = asg(seg[2]); return ['asgs', [['我的作业', asgList], [a?.title || '作业', R.asg(seg[2])], ['AI 辅导']], tutoring(seg[2]), 'AI 辅导']; }
  if (m('student', 'assignments', '*', 'help')) { const a = asg(seg[2]); return ['helps', [['我的作业', asgList], [a?.title || '作业', R.asg(seg[2])], ['问老师']], helpNew(seg[2]), '问老师']; }
  if (m('student', 'workspaces', '*')) { const a = asg(seg[2]); return ['asgs', [['我的作业', asgList], [a?.title || '作业', R.asg(seg[2])], ['作答']], workspace(seg[2]), '作答', 'wide']; }
  if (m('student', 'progress', '*') || m('student', 'progress')) {
    const c = course(seg[2]) || D.courses[0];
    return ['progress', [['我的课程', R.courses], [c.title, R.course(c.offeringId)], ['学习记录']], progress(c.offeringId), '学习记录'];
  }
  if (m('student', 'calendar')) return ['cal', [[T, R.home], ['学习日历']], calendar(), '学习日历'];
  if (m('student', 'messages')) { const oc = course(q.get('offering')); return ['msgs', oc ? [['消息通知', R.msgs], [oc.title]] : [['消息通知']], messages(q), '消息通知']; }
  if (m('student', 'help-requests')) return ['helps', [['我的求助']], helps(), '我的求助'];
  if (m('student', 'help-requests', '*')) return ['helps', [['我的求助', R.helps], ['求助详情']], helpDetail(seg[2]), '求助详情'];
  if (m('spec')) return ['spec', [['原型说明']], spec(), '原型说明'];
  if (m('login')) return ['login', [['登录']], login(), '登录', null, true];
  return ['home', [['页面不存在']], notFound('页面'), '页面不存在'];
}
let lastPath = '';
// 登录页进入时把学习路径画一遍；减少动态设置下直接给终态
function playLogin() {
  const page = document.querySelector('.login');
  if (!page || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  page.classList.remove('is-live');
  void page.offsetWidth;
  page.classList.add('is-live');
}
function render(keepScroll = false) {
  const y = scrollY, [active, crumbs, body, title, mode, bare] = route();
  document.title = `${title || '知学'} · 知学`;
  if (bare) { app.innerHTML = body; }
  else { app.innerHTML = shell(active, crumb(...crumbs), body); }
  if (!bare) {
    app.querySelector('.page').classList.toggle('wide', mode === 'wide');
    const chat = document.getElementById('chat'); if (chat) chat.scrollTop = chat.scrollHeight;
  }
  const path = location.hash.split('?')[0];
  if (keepScroll) scrollTo(0, y);
  else { scrollTo(0, 0); if (path !== lastPath) app.querySelector('h1')?.focus({ preventScroll: true }); }
  lastPath = path;
  playLogin();
}
function toast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2600);
}
/* ---------- 交互（只改内存中的 DEMO，模拟接口返回） ---------- */
const HINT = {
  concept: ['concept', '区域名只是给网格区域起名字，尺寸由 grid-template-columns / rows 决定。你现在想弄清楚的是命名、尺寸，还是排列顺序？', 'review_concept'],
  ask: ['debug_hint', '先确认问题在哪一层：在开发者工具里选中 ul，看窄屏下 grid-template-areas 的计算值有没有变化。', 'try_and_report'],
  next_hint: ['guided_question', '对照你的 @media 块：里面的选择器和外面的特异性一样吗？如果只写了 gap，区域排列会从哪里继承？', 'try_and_report'],
};
const markRead = id => { const m = D.messages.find(x => x.id === id); if (m && !m.readAt) m.readAt = nowIso(); };
// 显式保存：一次点击 = 一个 revision（对应 saveWorkspace(baseRevision)）；不做输入自动保存，避免版本号被每次停顿顶高
function commitVersion(id) {
  const s = state.ws[id]; if (!s || s.saving || !s.dirty) return;
  s.saving = true; updateSave(s); syncWs(id);
  setTimeout(() => {
    s.w.revision += 1; s.w.savedAt = nowIso();
    s.w.files = Object.entries(s.files).map(([path, content]) => ({ path, content }));
    s.w.activeFile = s.active; D.workspaces[id] = s.w;
    s.saving = false; s.dirty = false; render(true);
  }, 350);
}
const updateSave = s => { const el = document.getElementById('save-st'); if (el) el.textContent = saveText(s); };
const wsReadOnly = (a, s) => a.assignmentState === 'REVIEWED' || (a.overdue && !a.detail.canSubmit) || !s.w.canSave;
function syncWs(id) {
  const a = asg(id), s = state.ws[id]; if (!a || !s) return;
  const can = a.detail.canSubmit && s.w.revision > 0 && !s.dirty && !s.saving;
  const b = document.querySelector('[data-action="ws-submit"]');
  if (b) { b.disabled = !can || wsReadOnly(a, s); b.textContent = `提交 r${s.w.revision}`; b.title = can ? '' : a.detail.canSubmit ? (s.dirty ? '先保存版本再提交' : '先保存一次才能提交') : (BLOCK[a.detail.submissionBlockedReason] || ''); }
  const sv = document.querySelector('[data-action="ws-save"]');
  if (sv) { sv.disabled = wsReadOnly(a, s) || !s.dirty || s.saving; sv.title = s.dirty ? '' : '工作区没有新的修改'; }
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]'); if (!el) return;
  const act = el.dataset.action, v = el.dataset.v;
  switch (act) {
    case 'skip': e.preventDefault(); document.getElementById('main').focus(); break;
    case 'anchor': e.preventDefault(); document.getElementById(el.getAttribute('href').slice(1))?.scrollIntoView({ block: 'start' }); break;
    case 'toggle-op': document.body.classList.toggle('show-op'); el.setAttribute('aria-pressed', document.body.classList.contains('show-op')); break;
    case 'enroll': document.getElementById('enroll-dlg').showModal(); break;
    case 'login-help': document.getElementById('login-help-dlg')?.showModal(); break;
    case 'pw-toggle': {
      const input = el.closest('.pw').querySelector('input');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      el.textContent = show ? '隐藏' : '显示';
      el.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
      input.focus();
      break;
    }
    case 'enroll-ok': { const code = el.form.code.value.trim(); if (!code) { e.preventDefault(); el.form.code.focus(); break; } setTimeout(() => toast(`邀请码 ${code} 无效或已过期（原型演示 enroll 的失败提示）`)); break; }
    case 'chapter-done': { const ch = chapterOf(v); const done = ch.studentProgress.status === 'completed'; ch.studentProgress = done ? { status: 'in_progress', completedAt: null } : { status: 'completed', completedAt: nowIso() };
      const c = course(ch.offeringId); c.progress.completed += done ? -1 : 1; c.progress.percent = Math.round(c.progress.completed / c.progress.total * 100); render(true); toast(done ? '已改回学习中' : '已标记为完成'); break; }
    case 'afilter': state.aFilter = v; state.aPage = 1; render(true); break;
    case 'apage': state.aPage = +v; render(true); break;
    case 'recpage': state.recPage = +v; render(true); break;
    case 'hstatus': state.hStatus = v; render(true); break;
    case 'mread-f': state.mRead = v; render(true); break;
    case 'mread': markRead(v); render(true); break;
    case 'mopen': markRead(v); break;
    case 'read-all': D.messages.forEach(m => markRead(m.id)); render(true); toast('已全部标为已读'); break;
    case 'cal-sel': state.cal.sel = v; render(true); break;
    case 'cal-today': state.cal = { y: +TODAY.slice(0, 4), m: +TODAY.slice(5, 7) - 1, sel: TODAY }; render(true); break;
    case 'cal-move': { const d = new Date(Date.UTC(state.cal.y, state.cal.m + +v, 1)); state.cal.y = d.getUTCFullYear(); state.cal.m = d.getUTCMonth(); state.cal.sel = pickCalDay(state.cal.y, state.cal.m); render(true); break; }
    case 'ws-file': { const id = location.hash.split('/')[3]; state.ws[id].active = v; render(true); break; }
    case 'ws-preview': { const id = location.hash.split('/')[3]; state.ws[id].preview = !state.ws[id].preview; render(true); break; }
    case 'ws-preview-reset': { const id = location.hash.split('/')[3], f = document.querySelector('.preview iframe'); f.srcdoc = previewDoc(state.ws[id].files); break; }
    case 'ws-save': { const id = location.hash.split('/')[3]; commitVersion(id); break; }
    case 'ws-submit': { const id = location.hash.split('/')[3], s = state.ws[id];
      if (!s || s.dirty || s.w.revision < 1) { toast(s?.dirty ? '先保存版本再提交' : '还没有可提交的版本'); break; }
      document.getElementById('submit-dlg').showModal(); break; }
    case 'ws-submit-ok': { const a = asg(v), s = state.ws[v], subs = D.submissions[v] ||= [];
      if (s.dirty || s.w.revision < 1) { toast('先保存版本再提交'); break; }
      if (subs.some(x => x.workspaceRevision === s.w.revision && !x.superseded)) { toast(`r${s.w.revision} 已经提交过，返回原提交`); break; } // 同 revision 幂等
      const sid = 's' + Date.now();
      D.submissionDetails[sid] = { reflection: (el.form.elements.reflection?.value || '').trim(), files: s.w.files.map(f => ({ path: f.path, content: f.content })) };
      subs.forEach(x => (x.superseded = true));
      subs.unshift({ id: sid, assignmentId: v, offeringId: a.offeringId, attemptNumber: a.detail.attemptsUsed + 1, workspaceRevision: s.w.revision, submittedAt: nowIso(), late: a.overdue, superseded: false, feedbackStatus: 'none' });
      a.detail.attemptsUsed += 1; a.assignmentState = 'SUBMITTED'; a.overdue = false; a.detail.canSubmit = a.detail.allowResubmit && a.detail.attemptsUsed < a.detail.maxAttempts && new Date(a.dueAt) > NOW;
      if (!a.detail.canSubmit) a.detail.submissionBlockedReason = a.detail.attemptsUsed >= a.detail.maxAttempts ? 'ATTEMPT_LIMIT_REACHED' : 'SUBMISSION_CLOSED';
      setTimeout(() => { location.hash = R.asg(v) + '?tab=subs'; toast('已提交，等待教师批阅'); }); break; }
    case 'tact': state.tutor.action = v; state.tutor.error = ''; render(true); break;
    case 'tattach': state.tutor.attach = el.checked; break;
  }
});
document.addEventListener('submit', e => {
  const f = e.target, act = f.dataset.action; if (!act) return;
  e.preventDefault();
  if (act === 'login') {
    const err = f.querySelector('.login-error'), u = f.elements.username, p = f.elements.password;
    const fail = (msg, field) => { err.textContent = msg; err.hidden = false; field.setAttribute('aria-invalid', 'true'); field.focus(); };
    [u, p].forEach(x => x.removeAttribute('aria-invalid'));
    err.hidden = true;
    if (!u.value.trim()) return fail('请输入学号或工号。', u);
    if (!p.value) return fail('请输入密码。', p);
    const btn = f.querySelector('button[type="submit"]');
    btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = '正在登录…';
    setTimeout(() => { location.hash = R.home; }, 550);
    return;
  }
  if (act === 'tutor-form') {
    const id = location.hash.split('/')[3], pol = D.aiPolicies[id], conv = D.tutoring[id], t = state.tutor;
    const q = f.querySelector('#tq').value.trim(), attempt = f.querySelector('#tatt').value.trim();
    const level = Math.max(0, ...conv.messages.filter(m => m.role === 'assistant' && m.mode !== 'fallback').map(m => m.hintLevel || 0));
    const target = Math.min(t.action === 'next_hint' ? level + 1 : t.action === 'concept' ? 1 : Math.max(1, level), pol.maxHintLevel);
    const recent = t.sent.filter(ts => Date.now() - ts < 60e3).length;
    const usedToday = conv.messages.filter(m => m.role === 'student' && dayKey(m.createdAt) === TODAY).length;
    // 服务端拒绝在界面上要有落点：限流 / 日上限 / 层级用尽都留在表单上方，而不是静默失败
    const fail = msg => { t.error = msg; render(true); };
    if (recent >= pol.perMinuteLimit) return fail(`发送太频繁：每分钟最多 ${pol.perMinuteLimit} 次，请稍后再发。`);
    if (usedToday >= pol.dailyAssignmentLimit) return fail(`本作业今天的 ${pol.dailyAssignmentLimit} 次辅导已用完，建议问老师。`);
    if (t.action === 'next_hint' && level >= pol.maxHintLevel) return fail(`已达最高层级 ${level}/${pol.maxHintLevel}，继续追问会重复同一级提示。`);
    if (!q && t.action !== 'next_hint') { toast('先写下你的问题'); f.querySelector('#tq').focus(); return; }
    if (target >= pol.requireAttemptFromLevel && !attempt) { toast(`第 ${pol.requireAttemptFromLevel} 级提示起需要写下你的尝试`); f.querySelector('#tatt').focus(); return; }
    t.error = ''; t.sent.push(Date.now());
    const seq = conv.messages.length + 1, req = 'tr' + Date.now();
    conv.messages.push({ id: 'tm' + seq, sequence: seq, role: 'student', content: q || '请给我下一级提示', createdAt: nowIso(), tutoringRequestId: req, mode: null, hintLevel: null, policyVersion: null, contentUnavailableReason: null });
    t.pending = 'queued'; render(true);
    setTimeout(() => { t.pending = 'running'; render(true); }, 400);
    setTimeout(() => { // getTutoringRequest → completed
      const offBoundary = /完整代码|完整答案|全部代码|直接给.*答案|代码发我|答案发我/.test(q);
      const [mode, content, next] = offBoundary
        ? ['fallback', `${pol.boundaryText} 这道题需要你自己写出关键结构：先说明试到哪一步、期望结果是什么，我再按层级给提示。`, 'try_and_report']
        : HINT[t.action];
      conv.messages.push({ id: 'tm' + (seq + 1), sequence: seq + 1, role: 'assistant', content, createdAt: nowIso(), tutoringRequestId: req, mode, hintLevel: offBoundary ? null : target, policyVersion: pol.version, contentUnavailableReason: null, next });
      t.pending = false; render(true);
    }, 1200);
  }
  if (act === 'help-form') {
    const aid = f.dataset.v, a = asg(aid), fd = new FormData(f), ws = D.workspaces[aid];
    const h = { id: 'h' + Date.now(), offeringId: a.offeringId, assignmentId: aid, title: fd.get('title'), content: fd.get('content'), studentAttempt: fd.get('attempt') || '',
      workspaceRevision: fd.get('ws') && ws ? ws.revision : null, sharedTutoringRequestIds: fd.getAll('tr'), issueTags: [], status: 'open', createdAt: nowIso(), updatedAt: nowIso(),
      sharedSnapshot: fd.get('ws') && ws ? { files: ws.files.map(f => ({ path: f.path, content: f.content })), expiresAt: new Date(NOW.getTime() + 30 * 864e5).toISOString(), contentUnavailableReason: null } : null,
      sharedTutoringResults: (D.tutoring[aid]?.messages || []).filter(m => m.role === 'assistant' && fd.getAll('tr').includes(m.tutoringRequestId)).map(m => ({ requestId: m.tutoringRequestId, content: m.content, expiresAt: new Date(NOW.getTime() + 30 * 864e5).toISOString(), contentUnavailableReason: null })),
      replies: [] };
    D.help.unshift(h); location.hash = R.help(h.id); toast('求助已发送');
  }
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.closest('.login-form')) {
    const err = el.form.querySelector('.login-error');
    if (err) err.hidden = true;
    el.removeAttribute('aria-invalid');
  }
  if (el.id === 'code') {
    const id = el.dataset.ws, s = state.ws[id]; if (!s) return;
    s.files[s.active] = el.value;
    if (!s.dirty) { s.dirty = true; updateSave(s); syncWs(id); }
  }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.model) { state[el.dataset.model] = el.value; if (el.dataset.model === 'aCourse') state.aPage = 1; render(true); }
  if (el.dataset.action === 'rec-course') { state.recPage = 1; location.hash = R.progress(el.value); }
});
// 同一路由只换查询参数（如作业详情的 tab）时保留滚动位置，不回到页首
addEventListener('hashchange', () => render(location.hash.split('?')[0] === lastPath));
addEventListener('beforeunload', e => { if (Object.values(state.ws).some(s => s.dirty)) e.preventDefault(); });
render();
