CREATE TABLE assignment_check_policies (
    assignment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    version INT NOT NULL,
    config JSON NULL,
    CONSTRAINT fk_check_policy_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
    CONSTRAINT ck_check_policy_version CHECK (version > 0)
) ENGINE=InnoDB;

CREATE TABLE check_queue_guard (id TINYINT NOT NULL PRIMARY KEY) ENGINE=InnoDB;
INSERT INTO check_queue_guard(id) VALUES (1);

CREATE TABLE assignment_checks (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    assignment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    student_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    workspace_revision INT NOT NULL,
    checker_version VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL,
    policy_snapshot JSON NULL,
    file_snapshot JSON NULL,
    result JSON NULL,
    error JSON NULL,
    lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    lease_until DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL,
    completed_at DATETIME(6) NULL,
    CONSTRAINT fk_checks_workspace FOREIGN KEY (assignment_id,student_id)
        REFERENCES workspaces(assignment_id,student_id) ON DELETE CASCADE,
    CONSTRAINT uk_check_revision UNIQUE (assignment_id,student_id,workspace_revision),
    CONSTRAINT ck_check_revision CHECK (workspace_revision > 0),
    CONSTRAINT ck_check_status CHECK (status IN ('queued','running','completed','error')),
    INDEX ix_checks_queue (status,created_at,id),
    INDEX ix_checks_student (student_id,status),
    INDEX ix_checks_lease (status,lease_until)
) ENGINE=InnoDB;
