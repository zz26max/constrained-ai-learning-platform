-- P2 前置：notifications 增加通用跳转目标列（多态，不加外键，由写入方校验归属）。
-- P1 用于 notice_published 消息继承公告 target（V9 的 notices.target_*）；其余消息类型两列为 NULL。

ALTER TABLE notifications
    ADD COLUMN target_type VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT '通知跳转目标类型：offering/chapter/resource/assignment/feedback/help_request；null=无跳转目标' AFTER related_feedback_id,
    ADD COLUMN target_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT '通知跳转目标 ID（多态引用，无外键，由写入方校验属于本班）' AFTER target_type,
    ADD CONSTRAINT ck_notifications_target_pair CHECK ((target_type IS NULL AND target_id IS NULL) OR (target_type IS NOT NULL AND target_id IS NOT NULL)),
    ADD CONSTRAINT ck_notifications_target_type CHECK (target_type IS NULL OR CAST(target_type AS BINARY) IN ('offering','chapter','resource','assignment','feedback','help_request'));
