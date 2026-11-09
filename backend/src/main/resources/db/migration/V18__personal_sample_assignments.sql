-- V18: 给个人课程（Web 开发基础·个人学习）补两份示例作业，让个人模式也能走「学 → 练 → 判 → AI」闭环。
-- 迁移不创建账号（延续 V16 约束）：示例作业与默认 AI 政策由迁移分发，因此两者的 created_by 允许为 NULL。
-- 所有 INSERT 使用 INSERT IGNORE，重复执行安全。

-- 1. 系统分发的示例内容没有人类创建者（与 V16 对 course_offerings 的处理一致）
ALTER TABLE assignments
    MODIFY created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;
ALTER TABLE ai_policies
    MODIFY created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;

-- 2. 示例作业：Web 静态检查（缺 viewport，用来触发 L4 的“先反问”）
INSERT IGNORE INTO assignments
(id, offering_id, chapter_id, title, description, estimated_minutes, type, status, is_required,
 due_at, late_until, allow_resubmit, max_attempts, max_score, content_version, published_at, current_ai_policy_id,
 created_by, created_at, updated_at)
VALUES
('00000000-0000-4000-8000-000000000610', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000310',
 '示例练习：补全首页的移动端声明',
 '这是一个自带检查规则的示例作业。页面已经能显示标题与提示文本，但手机上会整体缩小——请找到原因并修复，然后点「检查」验证。',
 20, 'web_lab', 'published', 1,
 '2030-12-31 23:59:59.000000', NULL, 1, 5, 100.00, 1, '2026-01-01 00:00:00.000000', NULL,
 NULL, '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000'),
('00000000-0000-4000-8000-000000000611', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000314',
 '示例练习：统计作业数量',
 '示例 SQL 作业：先用 SELECT COUNT(*) 统计 assignments 表里的记录数，再点「检查」对照预期结果。',
 15, 'sql_text', 'published', 1,
 '2030-12-31 23:59:59.000000', NULL, 1, 5, 100.00, 1, '2026-01-01 00:00:00.000000', NULL,
 NULL, '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000');

-- 3. 初始文件：Web 缺 viewport；SQL 故意写成 SELECT *，检查会失败
INSERT IGNORE INTO assignment_initial_files (assignment_id, file_path, content) VALUES
('00000000-0000-4000-8000-000000000610', 'index.html',
'<!doctype html>\n<html lang="zh-CN">\n<head>\n  <meta charset="utf-8">\n  <title>我的第一个网页</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>我的第一个网页</h1>\n  <p class="hint">点击按钮后显示提示</p>\n  <button id="go" type="button">显示提示</button>\n  <script src="script.js"></script>\n</body>\n</html>\n'),
('00000000-0000-4000-8000-000000000610', 'style.css',
'body {margin: 0; padding: 24px; font-family: system-ui}\nh1 {font-size: 28px}\n.hint {color: #555}\n'),
('00000000-0000-4000-8000-000000000610', 'script.js',
"document.querySelector('#go').addEventListener('click', () => {\n  document.querySelector('.hint').textContent = '点击按钮后显示提示'\n})\n"),
('00000000-0000-4000-8000-000000000611', 'answer.sql',
'-- 提示：用 COUNT(*) 统计记录数\nSELECT * FROM assignments;\n');

-- 4. 作业要求
INSERT IGNORE INTO assignment_requirements (assignment_id, requirement_index, requirement_text) VALUES
('00000000-0000-4000-8000-000000000610', 1, '页面需包含 h1 标题与 .hint 提示文本。'),
('00000000-0000-4000-8000-000000000610', 2, '手机浏览时内容不应整体缩小（提示：head 里缺少移动端声明）。'),
('00000000-0000-4000-8000-000000000611', 1, '使用 SELECT COUNT(*) 统计 assignments 表的记录数。');

-- 5. 关联知识点（Web 作业挂到第 1 章的两个知识点，供 AI 召回讲义）
INSERT IGNORE INTO assignment_knowledge_points (assignment_id, offering_id, knowledge_point_id) VALUES
('00000000-0000-4000-8000-000000000610', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000510'),
('00000000-0000-4000-8000-000000000610', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000511');

-- 6. 判题规则：Web 三条（viewport 故意不通过），SQL 查询模式
INSERT IGNORE INTO assignment_check_policies (assignment_id, version, config) VALUES
('00000000-0000-4000-8000-000000000610', 1,
 '{"kind":"web_lab","rules":[{"id":"viewport","selector":"meta[name=viewport]","check":"exists","expected":null,"property":null,"width":390},{"id":"h1-title","selector":"h1","check":"text","expected":"我的第一个网页","property":null,"width":1440},{"id":"hint-text","selector":".hint","check":"text","expected":"点击按钮后显示提示","property":null,"width":1440}]}'),
('00000000-0000-4000-8000-000000000611', 1,
 '{"kind":"sql_text","mode":"query","seedSql":"CREATE TABLE assignments (id INT PRIMARY KEY, title VARCHAR(50)); INSERT INTO assignments VALUES (1, ''HTML''), (2, ''CSS'');","verificationSql":null,"expectedRows":[["2"]],"ordered":false}');

-- 7. 默认 AI 政策（引导模式，与 TutoringService.defaults 一致；启用状态由迁移给出，教师可再改）
INSERT IGNORE INTO ai_policies (id, assignment_id, version, config, created_by, created_at) VALUES
('00000000-0000-4000-8000-000000000710', '00000000-0000-4000-8000-000000000610', 1,
 '{"enabled":true,"allowedActions":["ask","concept","next_hint"],"allowedModes":["concept","debug_hint","guided_question"],"restrictCompleteSolution":true,"allowCodeBlocks":false,"maxHintLevel":3,"requireAttemptFromLevel":2,"dailyUserLimit":30,"dailyAssignmentLimit":12,"perMinuteLimit":3,"maxOutputTokens":800}',
 NULL, '2026-01-01 00:00:00.000000'),
('00000000-0000-4000-8000-000000000711', '00000000-0000-4000-8000-000000000611', 1,
 '{"enabled":true,"allowedActions":["ask","concept","next_hint"],"allowedModes":["concept","debug_hint","guided_question"],"restrictCompleteSolution":true,"allowCodeBlocks":false,"maxHintLevel":3,"requireAttemptFromLevel":2,"dailyUserLimit":30,"dailyAssignmentLimit":12,"perMinuteLimit":3,"maxOutputTokens":800}',
 NULL, '2026-01-01 00:00:00.000000');

-- 8. 绑定当前生效政策（作业行先于政策插入，这里回填）
UPDATE assignments SET current_ai_policy_id = '00000000-0000-4000-8000-000000000710'
 WHERE id = '00000000-0000-4000-8000-000000000610' AND current_ai_policy_id IS NULL;
UPDATE assignments SET current_ai_policy_id = '00000000-0000-4000-8000-000000000711'
 WHERE id = '00000000-0000-4000-8000-000000000611' AND current_ai_policy_id IS NULL;
