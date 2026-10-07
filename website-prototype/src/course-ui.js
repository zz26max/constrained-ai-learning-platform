// Course detail layouts reuse the shared data, routes and prototype chapter controls.
const courseUI = (() => {
  const progress = c => learningUI.progress(c, 'detail-progress');
  const note = () => `<p class="workspace-note">视觉原型 · 示例数据 · 2026 秋季学期</p>`;
  const sectionHead = (title, detail = '') => `<header class="detail-section-heading"><h3>${title}</h3>${detail ? `<span>${detail}</span>` : ''}</header>`;
  function directory(chapters) {
    const expanded = !window.matchMedia('(max-width: 1000px)').matches;
    return `<aside class="detail-directory workspace-surface" aria-label="课程章节"><details${expanded ? ' open' : ''}><summary><span>课程章节</span><small>当前第 3 章</small>${icon('chevron')}</summary><div class="detail-chapter-list">${chapters.map((c, i) => `<button class="detail-chapter ${i === 2 ? 'selected' : ''}" data-chapter="${i}"${i === 2 ? ' aria-current="step"' : ''}><span class="detail-chapter-number">${i + 1}</span><span class="detail-chapter-name"><strong>${c[0]}</strong><small>${c[1]}</small><span class="detail-chapter-status">${c[2]}</span></span>${i < 2 ? icon('check') : ''}</button>`).join('')}</div><p class="detail-directory-note">${icon('book')}当前展示第 3 章样例。</p></details></aside>`;
  }
  function web(chapters) {
    const lessons = [
      ['3.1', 'Flex 弹性布局', '理解主轴与交叉轴，控制元素的排列和对齐。', '正在学习', 'blue'],
      ['3.2', '响应式设计与媒体查询', '根据视口宽度，为页面设置合适的布局断点。', '待学习', 'gray'],
      ['3.3', '常见布局问题排查', '识别溢出、对齐和空间分配中的问题。', '待学习', 'gray']
    ];
    return `<div class="workspace-page course-detail-page">${workspaceHeading('Web 前端开发技术', '计算机 2301 班 · 2026 秋季学期', button('返回我的课程', 'course', true, 'back'))}<div class="detail-frame">${directory(chapters)}<section class="detail-content workspace-surface" aria-labelledby="detail-chapter-title"><header class="detail-overview"><span class="detail-context">当前章节 · 第 3 章</span><h2 id="detail-chapter-title">CSS 布局与响应式设计</h2><p>掌握页面元素的排列方式，让网页在不同设备上都有合适的布局。</p><div class="detail-chapter-summary"><span>2 个实验任务</span><span>3 个知识点</span></div></header><section class="detail-section" aria-labelledby="detail-practice-title"><header class="detail-section-heading"><h3 id="detail-practice-title">本章实验</h3><span>在实践中理解布局</span></header><div class="detail-task-list"><article class="detail-task"><span class="detail-task-icon">${icon('code')}</span><div class="detail-task-copy"><h4>响应式导航栏</h4><p>基础实验 · Flex 与媒体查询</p></div>${button('进入实验', 'lab', false, 'arrow', '进入实验：响应式导航栏')}</article><article class="detail-task"><span class="detail-task-icon">${icon('grid')}</span><div class="detail-task-copy"><h4>商品卡片布局</h4><p>综合实验 · 布局与样式组织</p></div>${button('查看任务', 'task/cards', true, 'arrow', '查看任务：商品卡片布局')}</article></div></section><section class="detail-section" aria-labelledby="detail-knowledge-title"><header class="detail-section-heading"><h3 id="detail-knowledge-title">本章知识</h3></header><ol class="detail-lesson-list">${lessons.map(([number, title, text, status, color]) => `<li class="detail-lesson"><span class="detail-lesson-number">${number}</span><div><h4>${title}</h4><p>${text}</p></div><span class="tag ${color}">${status}</span></li>`).join('')}</ol></section></section></div>${note()}</div>`;
  }
  function other(c, id, related) {
    const work = related.length ? related.map(t => `<article class="detail-other-task"><span class="tag ${t.due < learningUI.sampleDate ? 'orange' : 'blue'}">${learningUI.deadline(t)}</span><h4>${t.title}</h4><p>${t.description}</p>${button('查看要求', `task/${t.id}`, false, 'arrow', `查看要求：${t.title}`)}</article>`).join('') : '<div class="detail-no-task"><h4>暂无待办作业</h4><p>可以先阅读本章资料，后续任务以教师安排为准。</p></div>';
    const workSection = `<section class="detail-other-work">${sectionHead('课程作业', related.length ? `${related.length} 项待办` : '')}${work}</section>`;
    const knowledgeSection = `<section class="detail-other-knowledge">${sectionHead('本章知识', `${c.resources.length} 个知识点`)}<div class="detail-resource-list">${c.resources.map(([title, text]) => `<details><summary>${title}</summary><p>${text}</p></details>`).join('')}</div></section>`;
    return `<div class="workspace-page course-detail-page" data-detail-course="${id}">${workspaceHeading(c.title, `${c.group} · ${c.teacher} · 2026 秋季学期`, button('返回我的课程', 'course', true, 'back'))}<section class="detail-content workspace-surface" aria-labelledby="detail-chapter-title"><header class="detail-overview"><span class="detail-context">当前章节 · 第 ${c.chapter} 章</span><h2 id="detail-chapter-title">${c.chapterTitle}</h2><p>查看本章学习资料，按任务要求完成实践。</p>${progress(c)}</header><div class="detail-other-body${related.length ? '' : ' no-tasks'}">${related.length ? workSection + knowledgeSection : knowledgeSection + workSection}</div></section>${note()}</div>`;
  }
  return { web, other };
})();
