ALTER TABLE assignment_checks
    ADD COLUMN policy_version INT NOT NULL DEFAULT 1,
    ADD CONSTRAINT ck_check_policy_revision CHECK (policy_version > 0),
    ADD CONSTRAINT uk_check_policy_revision UNIQUE (assignment_id, student_id, workspace_revision, policy_version);

ALTER TABLE assignment_checks DROP INDEX uk_check_revision;

-- Published classroom policies were frozen. Capture their version before the seed correction.
UPDATE assignment_checks c
JOIN assignment_check_policies p ON p.assignment_id = c.assignment_id
SET c.policy_version = p.version;

-- The introductory exercise uses the viewport declaration taught in the HTML chapter.
UPDATE assignment_check_policies
SET version = version + 1,
    config = JSON_SET(config,
        '$.rules[0].title', '文档头部的移动端声明使用设备宽度',
        '$.rules[0].selector', 'head>meta[name=viewport i]:is([content="width=device-width" i],[content^="width=device-width," i]):not([content*=",width" i],[content*=", width" i])',
        '$.rules[1].title', '页面标题保留原文',
        '$.rules[2].title', '提示文本保留原文')
WHERE assignment_id = '00000000-0000-4000-8000-000000000610'
  AND JSON_UNQUOTE(JSON_EXTRACT(config, '$.rules[0].id')) = 'viewport';

UPDATE assignment_requirements
SET requirement_text = '在 head 中设置移动端视口，让 content 以 width=device-width 开头。可以保留逗号后的缩放选项。'
WHERE assignment_id = '00000000-0000-4000-8000-000000000610'
  AND requirement_index = 2;
