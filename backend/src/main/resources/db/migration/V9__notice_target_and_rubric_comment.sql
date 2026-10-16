-- P1-D 收尾：公告跳转目标（多态，不加外键，由 Service 校验归属）+ 量规评语长度对齐契约 8000

ALTER TABLE notices
    ADD COLUMN target_type VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT '公告跳转目标类型：offering/chapter/resource/assignment/feedback/help_request；null=无跳转目标' AFTER target_student_id,
    ADD COLUMN target_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT '公告跳转目标 ID（多态引用，无外键，由 Service 校验属于本班）' AFTER target_type,
    ADD CONSTRAINT ck_notices_target_pair CHECK ((target_type IS NULL AND target_id IS NULL) OR (target_type IS NOT NULL AND target_id IS NOT NULL)),
    ADD CONSTRAINT ck_notices_target_type CHECK (target_type IS NULL OR CAST(target_type AS BINARY) IN ('offering','chapter','resource','assignment','feedback','help_request'));

ALTER TABLE feedback_rubric_scores MODIFY COLUMN comment VARCHAR(8000) NOT NULL;
