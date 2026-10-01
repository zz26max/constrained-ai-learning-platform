// Sample state shared by the homepage, course directory and assignment pages.
const learningUI = (() => {
  const sampleDate = '2026-10-01';
  const scenario = new URLSearchParams(location.search).get('scenario') || 'default';
  let loadFailed = scenario === 'error';
  const joined = new Set(scenario === 'empty' ? [] : ['web', 'db', 'design']);
  const courses = {
    web: { title: 'Web 前端开发技术', mark: 'WEB', teacher: '李老师', group: '计算机 2301 班', chapter: 3, chapterTitle: 'CSS 布局与响应式设计', completed: 3, total: 8, percent: 38, unit: '实验', recent: true },
    db: { title: '数据库原理', mark: 'DB', teacher: '王老师', group: '计算机 2301 班', chapter: 5, chapterTitle: '关系数据库设计', completed: 5, total: 8, percent: 62, unit: '章节', resources: [['关系模式与约束', '识别主键、外键与完整性约束，说明它们如何保证数据的一致性。'], ['规范化设计', '从函数依赖出发，检查数据冗余及插入、删除、更新异常。'], ['SQL 查询复习', '先明确目标字段和筛选条件，再检查表之间的连接关系。']] },
    design: { title: '交互设计基础', mark: 'UX', teacher: '周老师', group: '数字媒体 2302 班', chapter: 1, chapterTitle: '从用户问题开始', completed: 1, total: 8, percent: 12, unit: '章节', resources: [['识别用户任务', '描述用户在具体情境中希望完成什么，先记录问题和目标。'], ['组织访谈问题', '围绕实际经历提问，记录用户采用的方法以及遇到的障碍。'], ['梳理操作流程', '标注任务入口、关键步骤、完成反馈与中断后的恢复路径。']] },
    network: { title: '计算机网络基础', mark: 'NET', teacher: '陈老师', group: '计算机 2301 班', chapter: 1, chapterTitle: '认识网络与协议', completed: 0, total: 8, percent: 0, unit: '章节', resources: [['网络分层', '理解协议分层如何协同传递数据。']] }
  };
  const tasks = [
    { id: 'nav', course: 'web', title: '响应式导航栏', due: '2026-09-22', state: '进行中', description: 'Flex 布局 / 媒体查询', type: '基础实验', route: 'lab' },
    { id: 'sql', course: 'db', title: 'SQL 查询练习', due: '2026-09-24', state: '待开始', description: '条件查询 / 表连接', type: '课程练习', route: 'task/sql' },
    { id: 'cards', course: 'web', title: '商品卡片布局', due: '2026-09-25', state: '待开始', description: '盒模型 / Flex 布局', type: '综合实验', route: 'task/cards' },
    { id: 'intro', course: 'web', title: '个人介绍页', due: '2026-09-17', state: '已评价', description: '语义化结构 / CSS 基础', type: '基础实验', route: 'progress', done: true },
    { id: 'form', course: 'web', title: '报名表单结构', due: '2026-09-12', state: '已评价', description: '表单标签 / 语义化结构', type: '基础实验', route: 'progress', done: true }
  ];
  const available = () => loadFailed ? [] : [...joined].map(id => ({ id, ...courses[id] }));
  const allTasks = () => tasks.filter(t => joined.has(t.course)).map(t => scenario === 'clear' ? { ...t, done: true, state: '已完成' } : t);
  const pending = () => loadFailed ? [] : allTasks().filter(t => !t.done).sort((a, b) => a.due.localeCompare(b.due));
  const feedbackCount = () => !loadFailed && joined.has('web') && scenario !== 'clear' ? 1 : 0;
  const dateLabel = d => `${Number(d.slice(5, 7))} 月 ${Number(d.slice(8, 10))} 日`;
  const overdue = t => !t.done && t.due < sampleDate;
  const deadline = t => t.done ? '已完成' : overdue(t) ? `已逾期 · ${dateLabel(t.due)}截止` : `${dateLabel(t.due)}截止`;
  const stateView = (title, text, actions, error = false) => `<section class="empty-state ${error ? 'state-error' : ''}" ${error ? 'role="alert"' : ''}>${icon(error ? 'refresh' : 'book')}<h2>${title}</h2><p>${text}</p><div class="state-actions">${actions}</div></section>`;
  const joinButton = () => `<button class="map-join" data-join>${icon('plus')}${joined.size ? '加入其他课程' : '加入课程'} <span>输入课程邀请码</span>${icon('chevron')}</button>`;
  const progress = c => `<div class="map-progress"><span>${c.unit}进度</span><div class="progress-track" role="progressbar" aria-label="${c.title}${c.unit}进度" aria-valuenow="${c.percent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${c.percent}%"></span></div><span>${c.completed} / ${c.total} 个${c.unit} <strong>${c.percent}%</strong></span></div>`;
  function card(c) {
    const task = pending().find(t => t.course === c.id);
    return `<section class="map-course map-${c.id}" aria-labelledby="course-${c.id}"><header class="map-course-info"><div class="map-course-meta"><span class="course-mark">${c.mark}${c.recent ? '<span>最近学习</span>' : ''}</span><span class="tag ${c.completed ? 'blue' : 'gray'}">${c.completed ? '学习中' : '待开始'}</span></div><h2 id="course-${c.id}"><a href="#course/${c.id}">${c.title}${icon('chevron')}</a></h2><p>${c.group} · ${c.teacher}</p></header><div class="map-chapter"><span>当前章节</span><a href="#course/${c.id}">第 ${c.chapter} 章 · ${c.chapterTitle}${icon('chevron')}</a></div>${task ? `<div class="map-practice"><div><span class="map-step">${c.recent ? '继续上次实验' : '待完成作业'} · ${task.state}</span><h3>${task.title}</h3>${c.recent ? '<p>上次编辑 style.css · 约 20 分钟</p>' : ''}<small class="${overdue(task) ? 'deadline-overdue' : ''}">${deadline(task)}</small></div>${button(c.recent ? '继续实验' : '查看作业', task.route, !c.recent)}</div>` : `<div class="map-course-entry">${button('查看课程', `course/${c.id}`, true)}</div>`}${progress(c)}${c.id === 'web' && feedbackCount() ? `<a class="map-feedback" href="#progress"><span>${icon('check')}个人介绍页 · 新反馈</span><span>查看反馈${icon('chevron')}</span></a>` : ''}</section>`;
  }
  function noticeCard() { return `<aside class="map-notice" aria-labelledby="map-notice-title"><div class="map-notice-heading"><h2 id="map-notice-title">${icon('bell')}最近通知</h2><a href="#messages" class="text-link">消息中心${icon('chevron')}</a></div><a class="map-notice-content" href="#messages"><h3>本周实验提交说明已更新</h3><p>请查看各课程的截止时间与提交要求。</p><small>课程教师 · 9 月 18 日</small></a></aside>`; }
  function home() {
    const list = available(), next = pending()[0];
    const intro = `<header class="map-intro"><h1>我的学习</h1><span>2026 秋季学期</span></header>`;
    if (loadFailed) return `<div class="course-map-home">${intro}${stateView('学习信息暂时无法加载', '课程和待办未能读取，请重试。此状态不表示你没有课程。', '<button class="button" data-retry>重新加载</button>' + button('查看使用帮助', 'help', true), true)}</div>`;
    return `<div class="course-map-home">${intro}<nav class="map-summary" aria-label="跨课程待办摘要"><span class="summary-label">${icon('calendar')}学习待办</span>${pending().length ? `<a href="#assignments"><strong>${pending().length}</strong> 项作业待完成${icon('chevron')}</a>` : '<span>暂无待办作业</span>'}${feedbackCount() ? `<a href="#progress"><strong>1</strong> 条新反馈${icon('chevron')}</a>` : ''}</nav>${next ? `<div class="priority-task"><span class="tag orange">优先处理</span><strong>${next.title}</strong><span>${courses[next.course].title} · ${deadline(next)}</span><a class="text-link" href="#task/${next.id}">查看任务要求${icon('chevron')}</a></div>` : list.length ? '<p class="priority-task">当前没有待办作业，可以继续学习或回顾课程资料。</p>' : ''}<div class="map-section-heading"><h2>我的课程 <span>${list.length} 门</span></h2><a class="text-link" href="#course">查看全部课程${icon('chevron')}</a></div>${list.length ? `<div class="map-grid">${list.map(card).join('')}${noticeCard()}</div>` : stateView('尚未加入课程', '使用教师提供的邀请码加入课程，随后查看章节、任务和反馈。', joinButton())}<footer class="map-bottom">${list.length ? joinButton() : '<span>加入课程后，学习任务会显示在这里。</span>'}<span>视觉原型 · 示例日期 ${sampleDate}</span></footer></div>`;
  }
  function catalog() { return `${heading('我的课程', '选择课程，查看章节、作业和学习资料', joinButton())}${loadFailed ? stateView('课程暂时无法加载', '请重新加载课程列表，或查看使用帮助。', '<button class="button" data-retry>重新加载</button>', true) : available().length ? `<div class="catalog-grid course-map-home">${available().map(card).join('')}</div>` : stateView('尚未加入课程', '输入课程邀请码，开始本学期的学习。', joinButton())}`; }
  function course(id, webPage) {
    const c = Object.hasOwn(courses, id) ? courses[id] : null;
    if (!c) return stateView('找不到这门课程', '请从课程列表重新选择。', button('返回我的课程', 'course'));
    if (id === 'web') return webPage();
    const related = pending().filter(t => t.course === id);
    return `${heading(c.title, `${c.group} · ${c.teacher} · 2026 秋季学期`, button('返回我的课程', 'course', true))}<section class="panel chapter-overview"><span class="tag blue">当前章节 · 第 ${c.chapter} 章</span><h2>${c.chapterTitle}</h2><p>查看本章学习资料，按任务要求完成实践。</p>${progress(c)}</section><section class="panel lesson-section"><h2 class="section-title">本章知识</h2><div class="course-resource-list">${c.resources.map(([title, text]) => `<details><summary>${title}</summary><p>${text}</p></details>`).join('')}</div></section><section class="section-space"><h2 class="section-title">课程作业</h2>${related.length ? related.map(t => `<article class="assignment panel"><div class="assignment-body"><span class="tag orange">${deadline(t)}</span><h2>${t.title}</h2><p>${t.description}</p></div>${button('查看要求', `task/${t.id}`)}</article>`).join('') : stateView('暂无待办作业', '可以先阅读本章资料，后续任务以教师安排为准。', '')}</section>`;
  }
  function taskPage(id) {
    const t = allTasks().find(t => t.id === id);
    if (!t) return stateView('找不到这项任务', '请返回作业列表重新选择。', button('返回作业任务', 'assignments'));
    const c = courses[t.course];
    const requirements = { nav: ['完成桌面与窄屏导航布局。', '检查菜单间距、换行和溢出情况。', '解释一项关键布局选择。'], sql: ['根据给定表结构编写筛选查询。', '使用表连接获取相关数据。', '解释查询条件与连接关系。'], cards: ['使用盒模型和 Flex 完成商品卡片布局。', '检查卡片间距与容器宽度。', '说明窄屏排列策略。'] };
    return `${heading(t.title, `${c.title} · ${t.type}`, button('返回作业任务', 'assignments', true))}<section class="panel"><span class="tag ${overdue(t) ? 'orange' : 'blue'}">${deadline(t)}</span><p>${overdue(t) ? '任务已超过截止时间，请先确认教师的补交要求。' : '请按教师安排完成任务。'}</p><h2 class="section-title">任务要求</h2><ol>${(requirements[id] || ['查看教师评价，按反馈巩固相关知识。']).map(r => `<li>${r}</li>`).join('')}</ol><p class="notice-text">提交及补交规则以教师说明为准。当前页面为任务示例。</p><div class="state-actions">${t.route === 'lab' ? button('继续实验', 'lab') : button('查看相关章节', `course/${t.course}`)}${button('查看课程通知', 'messages', true)}</div></section>`;
  }
  function assignments() {
    const list = loadFailed ? [] : allTasks(), todo = list.filter(t => !t.done).length;
    return `${heading('作业任务', '查看各课程的任务要求、期限和反馈')}<div class="filter-bar" role="group" aria-label="作业状态"><button class="filter active" data-filter="all">全部作业 <span>${list.length}</span></button><button class="filter" data-filter="todo">待完成 <span>${todo}</span></button><button class="filter" data-filter="done">已完成 <span>${list.length - todo}</span></button></div>${loadFailed ? stateView('作业暂时无法加载', '请重试，当前无法判断待办数量。', '<button class="button" data-retry>重新加载</button>', true) : list.length ? `<div class="assignment-list">${list.map(t => `<article class="assignment panel" data-status="${t.done ? 'done' : 'todo'}"><div class="assignment-body"><span class="tag ${t.done ? 'green' : overdue(t) ? 'orange' : 'blue'}">${t.state}${overdue(t) ? ' · 已逾期' : ''}</span><h2>${t.title}</h2><p>${courses[t.course].title} · ${t.description}</p><div class="assignment-details"><span>${icon('calendar')}${dateLabel(t.due)}${t.done ? '已提交' : '截止'}</span></div></div>${button(t.done ? '查看反馈' : '查看要求', t.done ? 'progress' : `task/${t.id}`, true)}</article>`).join('')}</div><div class="empty-state" data-filter-empty hidden><h2>暂无此类作业</h2><p>可以切换其他状态查看。</p></div>` : stateView('暂无作业任务', '加入课程后，教师发布的任务会显示在这里。', joinButton())}`;
  }
  function previewLinks() { return `<section class="panel prototype-states"><h2>原型状态预览</h2><p>这些入口用于检查示例状态；不连接真实课程服务。日期判断统一采用 ${sampleDate}，加入的课程仅保留在本次页面预览中。</p><div class="state-actions"><a class="button secondary" href="?scenario=empty#home">无课程</a><a class="button secondary" href="?scenario=clear#home">无待办</a><a class="button secondary" href="?scenario=error#home">加载失败</a><a class="button" href="?#home">默认状态</a></div></section>`; }
  function openJoin(trigger) {
    const dialog = document.querySelector('#join-course-dialog');
    dialog.innerHTML = `<button class="dialog-close icon-button" aria-label="关闭加入课程">×</button><h2 id="join-title">加入课程</h2><p id="join-description">输入教师提供的课程邀请码。</p><form class="join-form" novalidate><label for="invite-code">课程邀请码</label><input id="invite-code" name="inviteCode" autocomplete="off" aria-describedby="invite-hint invite-error" required><small id="invite-hint">示例邀请码：WEB2026、DB2026、UX2026、NET2026。仅在本次预览中加入课程。</small><p id="invite-error" class="form-error" role="alert"></p><div class="state-actions"><button class="button" type="submit">加入课程</button><button class="button secondary" type="button" data-close-dialog>取消</button></div></form>`;
    dialog.showModal();
    const input = dialog.querySelector('input');
    input.focus();
    dialog.querySelectorAll('.dialog-close,[data-close-dialog]').forEach(b => b.addEventListener('click', () => dialog.close()));
    dialog.onclose = () => trigger.isConnected ? trigger.focus() : document.querySelector('main h1')?.focus();
    dialog.querySelector('form').addEventListener('submit', e => {
      e.preventDefault();
      const code = input.value.trim().toUpperCase(), id = { WEB2026: 'web', DB2026: 'db', UX2026: 'design', NET2026: 'network' }[code];
      if (!id || joined.has(id)) {
        input.setAttribute('aria-invalid', 'true');
        dialog.querySelector('.form-error').textContent = !code ? '请输入课程邀请码。' : !id ? '邀请码无效，请检查后重新输入。' : '你已加入这门课程，请从课程列表进入。';
        input.focus(); return;
      }
      joined.add(id); loadFailed = false;
      dialog.close();
      location.hash = `course/${id}`;
      notice(`已在本次预览中加入${courses[id].title}。`);
    });
    input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); dialog.querySelector('.form-error').textContent = ''; });
  }
  function bind() {
    document.querySelectorAll('[data-join]').forEach(b => b.addEventListener('click', () => openJoin(b)));
    document.querySelectorAll('[data-retry]').forEach(b => b.addEventListener('click', () => { loadFailed = false; render(true); notice('示例数据已重新加载。'); }));
  }
  function records(page, content) {
    if (loadFailed) return `${heading(page, '学习信息暂时不可用')}${stateView('学习信息暂时无法加载', '请重新加载，当前无法判断学习记录。', '<button class="button" data-retry>重新加载</button>', true)}`;
    if (!joined.size) return `${heading(page, '课程与学习信息')} ${stateView('暂无学习信息', '加入课程后，可以在这里查看学习记录与课程通知。', joinButton())}`;
    return content();
  }
  const courseCountLabel = () => loadFailed ? '课程信息暂不可用' : `${joined.size} 门已加入课程`;
  return { home, catalog, course, taskPage, assignments, previewLinks, bind, available, pending, feedbackCount, dateLabel, deadline, sampleDate, records, courseCountLabel };
})();
