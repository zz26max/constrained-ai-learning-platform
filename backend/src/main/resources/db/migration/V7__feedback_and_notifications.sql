-- P1-C: 教师评价与学生通知模块，实现草稿-发布生命周期与原子通知派发

-- 教师对学生提交的批阅反馈：draft 可修改、published 不可变
CREATE TABLE feedback (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    submission_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    assignment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    offering_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    student_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    teacher_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'draft',
    base_version INT NOT NULL DEFAULT 0,
    overall_comment VARCHAR(8000) NOT NULL,
    final_score DECIMAL(6,2) NULL,
    published_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_feedback_submission (submission_id),
    KEY ix_feedback_student_published (student_id,published_at,id),
    KEY ix_feedback_offering_status (offering_id,status,created_at),
    CONSTRAINT fk_feedback_submission FOREIGN KEY (submission_id,assignment_id,student_id,offering_id) REFERENCES submissions(id,assignment_id,student_id,offering_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_feedback_teacher FOREIGN KEY (offering_id,teacher_id) REFERENCES offering_members(offering_id,user_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_feedback_status CHECK (CAST(status AS BINARY) IN ('draft','published')),
    CONSTRAINT ck_feedback_base_version CHECK (base_version>=0),
    CONSTRAINT ck_feedback_final_score CHECK (final_score IS NULL OR (final_score>=0 AND final_score<=9999.99)),
    CONSTRAINT ck_feedback_publication CHECK ((CAST(status AS BINARY)='draft' AND published_at IS NULL) OR (CAST(status AS BINARY)='published' AND published_at IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 评价细项评分：按量表标准打分
CREATE TABLE feedback_rubric_scores (
    feedback_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    criterion_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    score DECIMAL(6,2) NOT NULL,
    comment VARCHAR(2000) NOT NULL,
    PRIMARY KEY (feedback_id,criterion_id),
    CONSTRAINT fk_feedback_rubric_feedback FOREIGN KEY (feedback_id) REFERENCES feedback(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_feedback_rubric_criterion_id CHECK (CHAR_LENGTH(criterion_id)>=1 AND CHAR_LENGTH(criterion_id)<=64 AND NOT REGEXP_LIKE(criterion_id,'[^a-zA-Z0-9_-]','c')),
    CONSTRAINT ck_feedback_rubric_score CHECK (score>=0 AND score<=9999.99)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 学生通知表：反馈发布、作业发布等事件通知
CREATE TABLE notifications (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    recipient_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    type VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    title VARCHAR(200) NOT NULL,
    content VARCHAR(2000) NOT NULL,
    related_offering_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    related_assignment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    related_feedback_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    is_read TINYINT NOT NULL DEFAULT 0,
    read_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    KEY ix_notifications_recipient_created (recipient_id,is_read,created_at DESC,id),
    KEY ix_notifications_feedback (related_feedback_id),
    CONSTRAINT fk_notifications_recipient FOREIGN KEY (recipient_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_notifications_offering FOREIGN KEY (related_offering_id) REFERENCES course_offerings(id) ON UPDATE RESTRICT ON DELETE SET NULL,
    CONSTRAINT fk_notifications_assignment FOREIGN KEY (related_assignment_id) REFERENCES assignments(id) ON UPDATE RESTRICT ON DELETE SET NULL,
    CONSTRAINT fk_notifications_feedback FOREIGN KEY (related_feedback_id) REFERENCES feedback(id) ON UPDATE RESTRICT ON DELETE SET NULL,
    CONSTRAINT ck_notifications_type CHECK (CAST(type AS BINARY) IN ('feedback_published','assignment_published','offering_archived')),
    CONSTRAINT ck_notifications_is_read CHECK (is_read IN (0,1)),
    CONSTRAINT ck_notifications_read_at CHECK ((is_read=0 AND read_at IS NULL) OR (is_read=1 AND read_at IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

COMMENT ON TABLE feedback IS '教师对提交的批阅反馈：draft 可编辑、published 不可变';
COMMENT ON COLUMN feedback.status IS '状态：draft-草稿可编辑, published-已发布不可变';
COMMENT ON COLUMN feedback.base_version IS '乐观锁版本号，draft 更新时递增';
COMMENT ON TABLE notifications IS '学生通知：反馈发布、作业发布等事件';
COMMENT ON COLUMN notifications.type IS '通知类型：feedback_published, assignment_published, offering_archived';
