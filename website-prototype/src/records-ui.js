// Learning evidence and messages use the same course state as the other pages.
const recordsUI = (() => {
  const evidence = [
    ['语义化结构', '基本掌握', 'green', '个人介绍页、报名表单', '能够解释常用标签的选择'],
    ['CSS 盒模型', '需要巩固', 'orange', '个人介绍页', '建议再练习宽度与内边距的关系'],
    ['Flex 布局', '正在学习', 'blue', '响应式导航栏', '已在提示下尝试排查对齐问题'],
    ['媒体查询', '证据不足', 'gray', '等待相关实验提交', '完成练习后再更新判断']
  ];
  const hasWebCourse = () => learningUI.available().some(course => course.id === 'web');
  const sampleNote = () => `<p class="workspace-note">视觉原型 · 示例日期 ${learningUI.sampleDate}</p>`;

  function progress() {
    if (!hasWebCourse()) {
      return `<div class="workspace-page records-page">${workspaceHeading('学习记录', '查看作品反馈与知识点学习证据')}<section class="empty-state records-empty">${icon('chart')}<h2>当前课程暂无学习记录</h2><p>本原型的学习记录示例来自 Web 前端开发技术；你当前加入的课程暂未提供记录。</p><div class="state-actions">${button('查看我的课程', 'course', true)}</div></section>${sampleNote()}</div>`;
    }
    return `<div class="workspace-page records-page">
      ${workspaceHeading('学习记录', 'Web 前端开发技术 · 作品反馈与知识点学习证据', button('查看课程', 'course/web', true, 'chevron', '查看Web 前端开发技术课程'))}
      <section class="records-overview" aria-label="Web 前端开发技术学习概况">
        <dl class="records-counts">
          <div><dt>已完成实验</dt><dd>3</dd></div>
          <div><dt>收到教师评价</dt><dd>2</dd></div>
          <div><dt>建议巩固知识点</dt><dd>1</dd></div>
        </dl>
        <p>根据多次任务表现逐步更新，求助次数不会直接影响成绩。</p>
      </section>
      <div class="workspace-surface records-feedback-group">
        <section class="records-feedback" aria-labelledby="records-feedback-title">
          <div class="records-section-heading"><h2 id="records-feedback-title">最近的教师反馈</h2><span class="tag green">实验 03 · 已评价</span></div>
          <h3>个人介绍页</h3>
          <p>页面结构清晰，语义标签使用合理。注意卡片设置内边距后，实际宽度与预期是否一致。</p>
          <div class="records-feedback-source">${icon('file')}<span>课程教师 · <time datetime="2026-09-18">9 月 18 日</time></span></div>
        </section>
        <section class="records-next" aria-labelledby="records-next-title">
          <h2 id="records-next-title">下一步建议</h2>
          <h3>检查宽度与内边距的关系</h3>
          <p>根据上次作品反馈，在当前实验中比较两种 <code>box-sizing</code> 设置。</p>
          <div class="records-next-action">${button('查看练习', 'lab', true, 'arrow', '查看当前练习：响应式导航栏')}<span>当前练习：响应式导航栏</span></div>
        </section>
      </div>
      <section class="records-evidence" aria-labelledby="records-evidence-title">
        <div class="records-section-heading"><h2 id="records-evidence-title">知识点学习情况</h2><span>依据任务证据</span></div>
        <div class="workspace-surface records-evidence-surface">
          <div class="records-evidence-columns" aria-hidden="true"><span>知识点</span><span>学习情况</span><span>表现与任务证据</span></div>
          <ul class="records-evidence-list">${evidence.map(([title, state, color, task, description]) => `<li><h3>${title}</h3><div class="records-evidence-state"><span class="tag ${color}">${state}</span></div><div class="records-evidence-detail"><p>${description}</p><small>相关任务：${task}</small></div></li>`).join('')}</ul>
        </div>
      </section>
      ${sampleNote()}
    </div>`;
  }

  function messages() {
    const showFeedback = hasWebCourse();
    return `<div class="workspace-page messages-page">
      ${workspaceHeading('消息中心', '查看课程通知、教师反馈与系统提醒')}
      <div class="messages-summary"><span>${showFeedback ? 2 : 1} 条消息</span><span class="messages-unread-count">1 条未读</span></div>
      <section class="workspace-surface messages-surface" aria-label="课程消息">
        <div class="messages-columns" aria-hidden="true"><span>消息内容</span><span>来源</span><span>日期</span><span>阅读状态</span></div>
        <ul class="messages-list">
          <li>
            <div class="messages-row">
              <span class="messages-icon">${icon('bell')}</span>
              <div class="messages-content"><h2>本周实验提交说明已更新</h2><p>各课程的作业截止时间与提交要求已同步。</p></div>
              <div class="messages-meta"><span class="messages-source">课程通知</span><time datetime="2026-09-18">9 月 18 日</time><span class="messages-status"><span class="tag blue">未读</span></span></div>
            </div>
          </li>
          ${showFeedback ? `<li>
            <a class="messages-row messages-feedback" href="#progress" aria-label="查看教师反馈：Web 前端开发技术，个人介绍页">
              <span class="messages-icon">${icon('file')}</span>
              <div class="messages-content"><h2>Web 前端开发技术：个人介绍页</h2><p>李老师留下了新的修改建议，点击学习记录查看。</p><span class="messages-action">查看学习记录${icon('chevron')}</span></div>
              <div class="messages-meta"><span class="messages-source">教师反馈</span><time datetime="2026-09-17">9 月 17 日</time><span class="messages-status"><span class="tag gray">已读</span></span></div>
            </a>
          </li>` : ''}
        </ul>
      </section>
      ${sampleNote()}
    </div>`;
  }

  return { progress, messages };
})();
