CREATE TABLE help_requests (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 offering_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 assignment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 student_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 title VARCHAR(200) NOT NULL,
 content TEXT NOT NULL,
 student_attempt TEXT NOT NULL,
 workspace_revision INT NULL,
 shared_snapshot JSON NULL,
 shared_snapshot_expires_at DATETIME(6) NULL,
 shared_snapshot_purged_at DATETIME(6) NULL,
 shared_tutoring_request_ids JSON NOT NULL,
 issue_tags JSON NOT NULL,
 issue_tag_version INT NULL,
 status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(6) NOT NULL,
 updated_at DATETIME(6) NOT NULL,
 UNIQUE KEY uq_help_id_offering(id,offering_id),
 KEY ix_help_student_created(student_id,created_at,id),
 KEY ix_help_offering_status(offering_id,status,created_at,id),
 CONSTRAINT fk_help_assignment FOREIGN KEY(assignment_id,offering_id) REFERENCES assignments(id,offering_id),
 CONSTRAINT fk_help_student FOREIGN KEY(offering_id,student_id) REFERENCES offering_members(offering_id,user_id),
 CONSTRAINT ck_help_status CHECK(status IN ('open','answered','closed')),
 CONSTRAINT ck_help_snapshot CHECK((workspace_revision IS NULL AND shared_snapshot_expires_at IS NULL AND shared_snapshot IS NULL) OR (workspace_revision>=1 AND shared_snapshot_expires_at IS NOT NULL)),
 CONSTRAINT ck_help_content CHECK(CHAR_LENGTH(content) BETWEEN 1 AND 8000 AND CHAR_LENGTH(student_attempt) BETWEEN 1 AND 8000)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE help_replies (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 help_request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 offering_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 author_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 content TEXT NOT NULL,
 created_at DATETIME(6) NOT NULL,
 KEY ix_help_replies_request(help_request_id,created_at,id),
 CONSTRAINT fk_help_reply_request FOREIGN KEY(help_request_id,offering_id) REFERENCES help_requests(id,offering_id),
 CONSTRAINT fk_help_reply_author FOREIGN KEY(offering_id,author_id) REFERENCES offering_members(offering_id,user_id),
 CONSTRAINT ck_help_reply_content CHECK(CHAR_LENGTH(content) BETWEEN 1 AND 8000)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
ALTER TABLE notifications ADD COLUMN related_help_reply_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 ADD COLUMN source_event_key VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin NULL,
 ADD UNIQUE KEY uq_notifications_source_event(source_event_key),
 ADD CONSTRAINT fk_notifications_help_reply FOREIGN KEY(related_help_reply_id) REFERENCES help_replies(id);
ALTER TABLE notifications DROP CONSTRAINT ck_notifications_type;
ALTER TABLE notifications ADD CONSTRAINT ck_notifications_type CHECK(CAST(type AS BINARY) IN ('feedback_published','assignment_published','offering_archived','notice_published','help_reply'));
