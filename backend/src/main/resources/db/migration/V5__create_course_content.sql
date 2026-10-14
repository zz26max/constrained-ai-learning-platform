-- P1-A 教学班与内容：所有教学关系保留历史，物理删除默认 RESTRICT。
-- UUID 外键均与父键同型；跨班关联使用显式唯一复合父键。
CREATE TABLE courses (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    code VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    mark VARCHAR(32) NOT NULL,
    title VARCHAR(200) NOT NULL,
    description VARCHAR(8000) NOT NULL,
    status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'active',
    -- 受控配置导入没有登录操作者；此时为空，不伪造平台账户。
    created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_courses_code (code),
    CONSTRAINT fk_courses_creator FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_courses_status CHECK (CAST(status AS BINARY) IN ('active','archived'))
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE course_offerings (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    course_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    term_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    title VARCHAR(200) NOT NULL,
    group_name VARCHAR(200) NOT NULL,
    progress_unit VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'active',
    issue_tags_config JSON NULL,
    created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    KEY ix_course_offerings_term_status (term_id,status),
    CONSTRAINT fk_course_offerings_course FOREIGN KEY (course_id) REFERENCES courses(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_course_offerings_term FOREIGN KEY (term_id) REFERENCES terms(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_course_offerings_creator FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_course_offerings_status CHECK (CAST(status AS BINARY) IN ('active','archived')),
    CONSTRAINT ck_course_offerings_progress CHECK (CAST(progress_unit AS BINARY) IN ('chapter','assignment'))
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE offering_members (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    offering_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    role VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'active',
    joined_at DATETIME(6) NOT NULL,
    last_studied_at DATETIME(6) NULL,
    last_chapter_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_offering_members_offering_user (offering_id,user_id),
    UNIQUE KEY uq_offering_members_id_offering (id,offering_id),
    KEY ix_offering_members_user_status (user_id,status),
    KEY ix_offering_members_user_last_studied (user_id,last_studied_at),
    KEY ix_offering_members_last_chapter_offering (last_chapter_id,offering_id),
    CONSTRAINT fk_offering_members_offering FOREIGN KEY (offering_id) REFERENCES course_offerings(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_offering_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_offering_members_role CHECK (CAST(role AS BINARY) IN ('student','teacher')),
    CONSTRAINT ck_offering_members_status CHECK (CAST(status AS BINARY) IN ('active','inactive'))
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE course_invites (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    offering_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    code_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    max_uses INT NULL,
    used_count INT NOT NULL DEFAULT 0,
    revoked_at DATETIME(6) NULL,
    created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_course_invites_code_digest (code_digest),
    CONSTRAINT fk_course_invites_offering FOREIGN KEY (offering_id) REFERENCES course_offerings(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_course_invites_creator FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_course_invites_digest CHECK (CHAR_LENGTH(code_digest)=64 AND NOT REGEXP_LIKE(code_digest,'[^0-9a-f]','c')),
    CONSTRAINT ck_course_invites_uses CHECK (used_count>=0 AND (max_uses IS NULL OR (max_uses>=1 AND used_count<=max_uses))),
    CONSTRAINT ck_course_invites_expiry CHECK (expires_at>created_at)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE chapters (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    offering_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    position INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    summary VARCHAR(8000) NOT NULL,
    status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'draft',
    is_required TINYINT NOT NULL,
    content_version INT NOT NULL DEFAULT 1,
    published_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_chapters_offering_position (offering_id,position),
    UNIQUE KEY uq_chapters_id_offering (id,offering_id),
    KEY ix_chapters_offering_status_position (offering_id,status,position),
    CONSTRAINT fk_chapters_offering FOREIGN KEY (offering_id) REFERENCES course_offerings(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_chapters_position CHECK (position>=1),
    CONSTRAINT ck_chapters_status CHECK (CAST(status AS BINARY) IN ('draft','published','archived')),
    CONSTRAINT ck_chapters_required CHECK (is_required IN (0,1)),
    CONSTRAINT ck_chapters_content_version CHECK (content_version>=1),
    CONSTRAINT ck_chapters_publication CHECK ((CAST(status AS BINARY)='draft' AND published_at IS NULL) OR (CAST(status AS BINARY) IN ('published','archived') AND published_at IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 可选学习指针先以 NULL 建立；待章节存在后补循环关系，不关闭外键检查。
ALTER TABLE offering_members ADD CONSTRAINT fk_offering_members_last_chapter
    FOREIGN KEY (last_chapter_id,offering_id) REFERENCES chapters(id,offering_id) ON UPDATE RESTRICT ON DELETE RESTRICT;

CREATE TABLE knowledge_points (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    offering_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    title VARCHAR(200) NOT NULL,
    description VARCHAR(8000) NOT NULL,
    chapter_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    position INT NOT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_knowledge_points_id_offering (id,offering_id),
    CONSTRAINT fk_knowledge_points_offering FOREIGN KEY (offering_id) REFERENCES course_offerings(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_knowledge_points_chapter FOREIGN KEY (chapter_id,offering_id) REFERENCES chapters(id,offering_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_knowledge_points_position CHECK (position>=1)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE resources (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    offering_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    chapter_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    knowledge_point_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    title VARCHAR(200) NOT NULL,
    -- 保存 Markdown 原文，不在数据库或后端渲染 HTML。
    content_markdown MEDIUMTEXT NOT NULL,
    position INT NOT NULL,
    status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'active',
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    KEY ix_resources_chapter_status_position (chapter_id,status,position),
    CONSTRAINT fk_resources_offering FOREIGN KEY (offering_id) REFERENCES course_offerings(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_resources_chapter FOREIGN KEY (chapter_id,offering_id) REFERENCES chapters(id,offering_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_resources_knowledge_point FOREIGN KEY (knowledge_point_id,offering_id) REFERENCES knowledge_points(id,offering_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_resources_position CHECK (position>=1),
    CONSTRAINT ck_resources_status CHECK (CAST(status AS BINARY) IN ('active','archived')),
    CONSTRAINT ck_resources_content_size CHECK (OCTET_LENGTH(content_markdown)<=65536)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE chapter_progress (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    offering_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    member_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    chapter_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    completed_at DATETIME(6) NULL,
    last_opened_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_chapter_progress_member_chapter (member_id,chapter_id),
    KEY ix_chapter_progress_member_last_opened (member_id,last_opened_at),
    CONSTRAINT fk_chapter_progress_member FOREIGN KEY (member_id,offering_id) REFERENCES offering_members(id,offering_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_chapter_progress_chapter FOREIGN KEY (chapter_id,offering_id) REFERENCES chapters(id,offering_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_chapter_progress_status CHECK (CAST(status AS BINARY) IN ('in_progress','completed')),
    CONSTRAINT ck_chapter_progress_completion CHECK ((CAST(status AS BINARY)='in_progress' AND completed_at IS NULL) OR (CAST(status AS BINARY)='completed' AND completed_at IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
