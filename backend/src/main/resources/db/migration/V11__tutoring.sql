-- P2-A immutable policy versions and retained tutoring tombstones.
CREATE TABLE ai_policies (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, assignment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, version INT NOT NULL,
 config JSON NOT NULL, created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, created_at DATETIME(6) NOT NULL,
 PRIMARY KEY(id), UNIQUE KEY uq_ai_policy_version(assignment_id,version), UNIQUE KEY uq_ai_policy_assignment(id,assignment_id),
 CONSTRAINT fk_ai_policy_assignment FOREIGN KEY(assignment_id) REFERENCES assignments(id),
 CONSTRAINT fk_ai_policy_creator FOREIGN KEY(created_by) REFERENCES users(id), CHECK(version>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE assignments ADD CONSTRAINT fk_assignment_current_policy FOREIGN KEY(current_ai_policy_id,id) REFERENCES ai_policies(id,assignment_id);
ALTER TABLE submissions ADD CONSTRAINT fk_submission_policy FOREIGN KEY(ai_policy_id,assignment_id) REFERENCES ai_policies(id,assignment_id);
CREATE TABLE tutoring_progress (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, assignment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, student_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 highest_delivered_hint_level INT NOT NULL DEFAULT 0, disclosure_summary TEXT NULL, disclosure_version INT NOT NULL DEFAULT 0,
 content_purged_at DATETIME(6) NULL, created_at DATETIME(6) NOT NULL, updated_at DATETIME(6) NOT NULL,
 PRIMARY KEY(id), UNIQUE KEY uq_tutoring_progress(student_id,assignment_id),
 FOREIGN KEY(assignment_id) REFERENCES assignments(id), FOREIGN KEY(student_id) REFERENCES users(id),
 CHECK(highest_delivered_hint_level BETWEEN 0 AND 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE tutoring_sessions (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, assignment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, student_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'active', next_message_sequence INT NOT NULL DEFAULT 1,
 created_at DATETIME(6) NOT NULL, updated_at DATETIME(6) NOT NULL,
 PRIMARY KEY(id), UNIQUE KEY uq_tutoring_session_owner(id,student_id,assignment_id),
 FOREIGN KEY(assignment_id) REFERENCES assignments(id), FOREIGN KEY(student_id) REFERENCES users(id),
 CHECK(status IN ('active','closed')), CHECK(next_message_sequence>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE tutoring_requests (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, student_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, assignment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 action VARCHAR(16) NOT NULL, content TEXT NULL, student_attempt TEXT NULL, workspace_revision INT NULL, workspace_snapshot JSON NULL,
 generation_policy_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL, review_policy_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL, review_version VARCHAR(32) NULL, reviewed_at DATETIME(6) NULL,
 hint_level INT NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'queued',
 pending_slot TINYINT GENERATED ALWAYS AS (CASE WHEN status IN ('queued','running') THEN 1 ELSE NULL END) STORED,
 result JSON NULL, fallback_reason VARCHAR(40) NULL, error_code VARCHAR(40) NULL,
 provider_call_count INT NOT NULL DEFAULT 0, input_tokens INT NULL, output_tokens INT NULL,
 started_at DATETIME(6) NULL, completed_at DATETIME(6) NULL, content_expires_at DATETIME(6) NOT NULL, content_purged_at DATETIME(6) NULL,
 created_at DATETIME(6) NOT NULL, updated_at DATETIME(6) NOT NULL,
 PRIMARY KEY(id), UNIQUE KEY uq_tutoring_request_session(id,session_id), UNIQUE KEY uq_pending_tutoring_request(student_id,assignment_id,pending_slot),
 KEY ix_tutoring_budget(student_id,created_at), KEY ix_tutoring_queue(status,created_at), KEY ix_tutoring_expiry(content_expires_at),
 FOREIGN KEY(session_id,student_id,assignment_id) REFERENCES tutoring_sessions(id,student_id,assignment_id),
 FOREIGN KEY(generation_policy_id,assignment_id) REFERENCES ai_policies(id,assignment_id),
 FOREIGN KEY(review_policy_id,assignment_id) REFERENCES ai_policies(id,assignment_id),
 CHECK(action IN ('ask','concept','next_hint')), CHECK(status IN ('queued','running','completed','fallback','failed')),
 CHECK(hint_level BETWEEN 1 AND 3), CHECK(provider_call_count BETWEEN 0 AND 2),
 CHECK(input_tokens IS NULL OR input_tokens>=0), CHECK(output_tokens IS NULL OR output_tokens>=0),
 CHECK(workspace_revision IS NULL OR workspace_revision>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE tutoring_messages (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, tutoring_request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 sequence INT NOT NULL, role VARCHAR(16) NOT NULL, content TEXT NULL, mode VARCHAR(32) NULL,
 hint_level INT NULL, policy_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL, created_at DATETIME(6) NOT NULL, content_purged_at DATETIME(6) NULL,
 PRIMARY KEY(id), UNIQUE KEY uq_tutoring_message_sequence(session_id,sequence), UNIQUE KEY uq_tutoring_message_role(tutoring_request_id,role),
 FOREIGN KEY(tutoring_request_id,session_id) REFERENCES tutoring_requests(id,session_id), FOREIGN KEY(policy_id) REFERENCES ai_policies(id),
 CHECK(role IN ('student','assistant')), CHECK(sequence>0),
 CHECK((role='student' AND mode IS NULL AND hint_level IS NULL AND policy_id IS NULL) OR
 (role='assistant' AND mode IN ('concept','debug_hint','guided_question','fallback') AND hint_level BETWEEN 1 AND 3 AND policy_id IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
