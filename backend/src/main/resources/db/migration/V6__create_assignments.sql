-- P1-B 作业、工作区与提交：完整作品生命周期，支持草稿、多次提交与快照归档。
-- 评价在 P1-C 迁移；AI 政策在 P2 迁移；检查运行在 P3 迁移。

-- 作业主表：draft/published/archived 生命周期，发布后冻结 content_version。
CREATE TABLE assignments (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    offering_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    chapter_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    title VARCHAR(200) NOT NULL,
    description VARCHAR(8000) NOT NULL,
    estimated_minutes INT NOT NULL,
    type VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'draft',
    is_required TINYINT NOT NULL,
    due_at DATETIME(6) NOT NULL,
    late_until DATETIME(6) NULL,
    allow_resubmit TINYINT NOT NULL,
    max_attempts INT NOT NULL,
    max_score DECIMAL(6,2) NOT NULL,
    content_version INT NOT NULL DEFAULT 0,
    -- P1 为 NULL；P2 绑定生效政策版本。
    current_ai_policy_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    published_at DATETIME(6) NULL,
    created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_assignments_id_offering (id,offering_id),
    KEY ix_assignments_offering_status_due (offering_id,status,due_at,id),
    KEY ix_assignments_due_at (due_at),
    KEY ix_assignments_chapter_offering (chapter_id,offering_id),
    CONSTRAINT fk_assignments_offering FOREIGN KEY (offering_id) REFERENCES course_offerings(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_assignments_chapter FOREIGN KEY (chapter_id,offering_id) REFERENCES chapters(id,offering_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_assignments_creator FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_assignments_estimated_minutes CHECK (estimated_minutes>=1),
    CONSTRAINT ck_assignments_type CHECK (CAST(type AS BINARY) IN ('web_lab','sql_text','text')),
    CONSTRAINT ck_assignments_status CHECK (CAST(status AS BINARY) IN ('draft','published','archived')),
    CONSTRAINT ck_assignments_required CHECK (is_required IN (0,1)),
    CONSTRAINT ck_assignments_late_until CHECK (late_until IS NULL OR late_until>due_at),
    CONSTRAINT ck_assignments_allow_resubmit CHECK (allow_resubmit IN (0,1)),
    CONSTRAINT ck_assignments_max_attempts CHECK (max_attempts>=1),
    CONSTRAINT ck_assignments_max_score CHECK (max_score>0 AND max_score<=9999.99),
    CONSTRAINT ck_assignments_content_version CHECK (content_version>=0),
    CONSTRAINT ck_assignments_publication CHECK ((CAST(status AS BINARY)='draft' AND published_at IS NULL AND content_version=0) OR (CAST(status AS BINARY) IN ('published','archived') AND published_at IS NOT NULL AND content_version>=1))
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 作业要求：多条文本，复合主键。
CREATE TABLE assignment_requirements (
    assignment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    requirement_index INT NOT NULL,
    requirement_text VARCHAR(8000) NOT NULL,
    PRIMARY KEY (assignment_id,requirement_index),
    CONSTRAINT fk_assignment_requirements_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_assignment_requirements_index CHECK (requirement_index>=1)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 作业量表：多条评分标准，复合主键。
CREATE TABLE assignment_rubric_criteria (
    assignment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    criterion_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    title VARCHAR(200) NOT NULL,
    description VARCHAR(8000) NOT NULL,
    max_score DECIMAL(6,2) NOT NULL,
    PRIMARY KEY (assignment_id,criterion_id),
    CONSTRAINT fk_assignment_rubric_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_assignment_rubric_criterion_id CHECK (CHAR_LENGTH(criterion_id)>=1 AND CHAR_LENGTH(criterion_id)<=64 AND NOT REGEXP_LIKE(criterion_id,'[^a-zA-Z0-9_-]','c')),
    CONSTRAINT ck_assignment_rubric_max_score CHECK (max_score>0 AND max_score<=9999.99)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 作业关联知识点：多对多。
CREATE TABLE assignment_knowledge_points (
    assignment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    offering_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    knowledge_point_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (assignment_id,knowledge_point_id),
    CONSTRAINT fk_assignment_kp_assignment FOREIGN KEY (assignment_id,offering_id) REFERENCES assignments(id,offering_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_assignment_kp_knowledge_point FOREIGN KEY (knowledge_point_id,offering_id) REFERENCES knowledge_points(id,offering_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 作业初始文件模板：path 使用 ENUM 枚举固定路径。
CREATE TABLE assignment_initial_files (
    assignment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    file_path VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    content MEDIUMTEXT NOT NULL,
    PRIMARY KEY (assignment_id,file_path),
    CONSTRAINT fk_assignment_initial_files_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_assignment_initial_files_path CHECK (CAST(file_path AS BINARY) IN ('index.html','style.css','script.js','answer.sql','answer.md')),
    CONSTRAINT ck_assignment_initial_files_size CHECK (OCTET_LENGTH(content)<=102400)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 学生工作区：每学生每作业唯一，revision 乐观锁。
CREATE TABLE workspaces (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    offering_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    assignment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    student_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    revision INT NOT NULL DEFAULT 1,
    active_file VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_workspaces_assignment_student (assignment_id,student_id),
    UNIQUE KEY uq_workspaces_id_assignment_student (id,assignment_id,student_id),
    KEY ix_workspaces_student_assignment (student_id,assignment_id),
    CONSTRAINT fk_workspaces_assignment FOREIGN KEY (assignment_id,offering_id) REFERENCES assignments(id,offering_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_workspaces_student FOREIGN KEY (offering_id,student_id) REFERENCES offering_members(offering_id,user_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_workspaces_revision CHECK (revision>=1),
    CONSTRAINT ck_workspaces_active_file CHECK (CAST(active_file AS BINARY) IN ('index.html','style.css','script.js','answer.sql','answer.md'))
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 工作区文件：当前文件列表，使用 JSON 存储 [{path,content}]。
CREATE TABLE workspace_files (
    workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    file_path VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    content MEDIUMTEXT NOT NULL,
    PRIMARY KEY (workspace_id,file_path),
    CONSTRAINT fk_workspace_files_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_workspace_files_path CHECK (CAST(file_path AS BINARY) IN ('index.html','style.css','script.js','answer.sql','answer.md')),
    CONSTRAINT ck_workspace_files_size CHECK (OCTET_LENGTH(content)<=102400)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 提交快照：不可变，唯一键保证幂等。
CREATE TABLE submissions (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    offering_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    assignment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    workspace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    student_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    attempt_no INT NOT NULL,
    workspace_revision INT NOT NULL,
    reflection VARCHAR(8000) NOT NULL,
    content_version INT NOT NULL,
    assignment_title_snapshot VARCHAR(200) NOT NULL,
    max_score_snapshot DECIMAL(6,2) NOT NULL,
    -- P1 为 NULL；P2 引用 AI 政策。
    ai_policy_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    due_at_snapshot DATETIME(6) NOT NULL,
    submitted_at DATETIME(6) NOT NULL,
    is_late TINYINT NOT NULL,
    is_current TINYINT NOT NULL DEFAULT 1,
    current_slot TINYINT GENERATED ALWAYS AS (CASE WHEN is_current=1 THEN 1 ELSE NULL END) STORED,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_submissions_assignment_student_attempt (assignment_id,student_id,attempt_no),
    UNIQUE KEY uq_submissions_assignment_student_revision (assignment_id,student_id,workspace_revision),
    UNIQUE KEY uq_submissions_current (assignment_id,student_id,current_slot),
    UNIQUE KEY uq_submissions_id_assignment_student_offering (id,assignment_id,student_id,offering_id),
    KEY ix_submissions_assignment_current_submitted (assignment_id,is_current,submitted_at,id),
    KEY ix_submissions_student_submitted (student_id,submitted_at),
    CONSTRAINT fk_submissions_workspace FOREIGN KEY (workspace_id,assignment_id,student_id) REFERENCES workspaces(id,assignment_id,student_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_submissions_assignment FOREIGN KEY (assignment_id,offering_id) REFERENCES assignments(id,offering_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_submissions_attempt_no CHECK (attempt_no>=1),
    CONSTRAINT ck_submissions_workspace_revision CHECK (workspace_revision>=1),
    CONSTRAINT ck_submissions_content_version CHECK (content_version>=1),
    CONSTRAINT ck_submissions_max_score CHECK (max_score_snapshot>0 AND max_score_snapshot<=9999.99),
    CONSTRAINT ck_submissions_is_late CHECK (is_late IN (0,1)),
    CONSTRAINT ck_submissions_is_current CHECK (is_current IN (0,1))
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 提交文件快照：不可变。
CREATE TABLE submission_files (
    submission_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    file_path VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    content MEDIUMTEXT NOT NULL,
    PRIMARY KEY (submission_id,file_path),
    CONSTRAINT fk_submission_files_submission FOREIGN KEY (submission_id) REFERENCES submissions(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_submission_files_path CHECK (CAST(file_path AS BINARY) IN ('index.html','style.css','script.js','answer.sql','answer.md')),
    CONSTRAINT ck_submission_files_size CHECK (OCTET_LENGTH(content)<=102400)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 提交要求快照：不可变。
CREATE TABLE submission_requirements_snapshot (
    submission_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    requirement_index INT NOT NULL,
    requirement_text VARCHAR(8000) NOT NULL,
    PRIMARY KEY (submission_id,requirement_index),
    CONSTRAINT fk_submission_requirements_submission FOREIGN KEY (submission_id) REFERENCES submissions(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_submission_requirements_index CHECK (requirement_index>=1)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 提交量表快照：不可变。
CREATE TABLE submission_rubric_snapshot (
    submission_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    criterion_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    title VARCHAR(200) NOT NULL,
    description VARCHAR(8000) NOT NULL,
    max_score DECIMAL(6,2) NOT NULL,
    PRIMARY KEY (submission_id,criterion_id),
    CONSTRAINT fk_submission_rubric_submission FOREIGN KEY (submission_id) REFERENCES submissions(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_submission_rubric_criterion_id CHECK (CHAR_LENGTH(criterion_id)>=1 AND CHAR_LENGTH(criterion_id)<=64 AND NOT REGEXP_LIKE(criterion_id,'[^a-zA-Z0-9_-]','c')),
    CONSTRAINT ck_submission_rubric_max_score CHECK (max_score>0 AND max_score<=9999.99)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
