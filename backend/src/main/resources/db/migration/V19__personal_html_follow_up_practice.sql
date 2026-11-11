-- Extend the existing personal HTML practice with a second task on document structure.
INSERT INTO assignments
    (id, offering_id, chapter_id, title, description, estimated_minutes, type, status, is_required,
     due_at, late_until, allow_resubmit, max_attempts, max_score, content_version, published_at,
     created_by, created_at, updated_at)
VALUES
    ('00000000-0000-4000-8000-000000000612', '00000000-0000-4000-8000-000000000210',
     '00000000-0000-4000-8000-000000000310', '迁移练习：整理学习记录页的 HTML 结构',
     '把首页练习里用到的文档结构迁移到学习记录页。先阅读本章的《HTML 文档结构》，再把移动端声明和正文放到合适的位置，最后运行自动检查。',
     15, 'web_lab', 'published', 1, '2030-12-31 23:59:59.000000', NULL, 1, 5, 100.00, 1,
     '2026-01-01 00:00:00.000000', NULL, '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000');

INSERT INTO assignment_initial_files (assignment_id, file_path, content) VALUES
    ('00000000-0000-4000-8000-000000000612', 'index.html',
     '<!doctype html>\n<html lang="zh-CN">\n<head>\n  <meta charset="utf-8">\n  <title>学习记录</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>我的学习记录</h1>\n  <p>今天复习了 HTML 文档结构。</p>\n</body>\n</html>\n'),
    ('00000000-0000-4000-8000-000000000612', 'style.css',
     'body { margin: 0; padding: 1rem; font-family: system-ui, sans-serif; }\nmain { max-width: 42rem; margin: auto; }\n'),
    ('00000000-0000-4000-8000-000000000612', 'script.js', '');

INSERT INTO assignment_requirements (assignment_id, requirement_index, requirement_text) VALUES
    ('00000000-0000-4000-8000-000000000612', 1, '在文档头部声明视口宽度与设备宽度一致。'),
    ('00000000-0000-4000-8000-000000000612', 2, '用 main 元素包住页面标题和正文段落，保留原文字。');

INSERT INTO assignment_knowledge_points (assignment_id, offering_id, knowledge_point_id) VALUES
    ('00000000-0000-4000-8000-000000000612', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000510');

INSERT INTO assignment_check_policies (assignment_id, version, config) VALUES
    ('00000000-0000-4000-8000-000000000612', 1,
     '{"kind":"web_lab","rules":[{"id":"mobile-viewport","title":"文档头部的移动端声明","selector":"head > meta[name=viewport][content*=''width=device-width'']","check":"exists","expected":null,"property":null,"width":390},{"id":"main-title","title":"正文区域的标题","selector":"body main h1","check":"text","expected":"我的学习记录","property":null,"width":390},{"id":"main-content","title":"正文区域的段落","selector":"body main p","check":"text","expected":"今天复习了 HTML 文档结构。","property":null,"width":390}]}');

INSERT INTO ai_policies (id, assignment_id, version, config, created_by, created_at)
SELECT '00000000-0000-4000-8000-000000000712', '00000000-0000-4000-8000-000000000612', 1,
       config, NULL, '2026-01-01 00:00:00.000000'
FROM ai_policies WHERE id = '00000000-0000-4000-8000-000000000710';

UPDATE assignments SET current_ai_policy_id = '00000000-0000-4000-8000-000000000712'
WHERE id = '00000000-0000-4000-8000-000000000612';
