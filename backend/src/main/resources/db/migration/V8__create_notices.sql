-- P1-D: 教学班公告表，支持全班公告与个人消息

CREATE TABLE notices (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    offering_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    author_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    target_student_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    title VARCHAR(200) NOT NULL,
    content VARCHAR(8000) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    KEY ix_notices_offering_created (offering_id, created_at DESC, id),
    CONSTRAINT fk_notices_offering FOREIGN KEY (offering_id) REFERENCES course_offerings(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_notices_author FOREIGN KEY (offering_id, author_id) REFERENCES offering_members(offering_id, user_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_notices_target FOREIGN KEY (offering_id, target_student_id) REFERENCES offering_members(offering_id, user_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE notices COMMENT '教学班公告：教师发布的班级通知或个人消息';
ALTER TABLE notices MODIFY COLUMN target_student_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'null=全班公告, 非null=个人消息目标学生';

-- 扩展 notifications 表的类型枚举以支持公告派发
ALTER TABLE notifications DROP CONSTRAINT ck_notifications_type;
ALTER TABLE notifications ADD CONSTRAINT ck_notifications_type CHECK (CAST(type AS BINARY) IN ('feedback_published','assignment_published','offering_archived','notice_published'));
