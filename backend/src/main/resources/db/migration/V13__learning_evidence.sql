-- P2: learning events start here; historical audit records are not learning facts.
CREATE TABLE learning_events (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 offering_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 assignment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 chapter_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 client_event_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 source_event_key VARCHAR(192) CHARACTER SET ascii COLLATE ascii_bin NULL,
 session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 type VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 source VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 occurred_at DATETIME(6) NOT NULL, received_at DATETIME(6) NOT NULL, payload JSON NOT NULL,
 UNIQUE KEY uq_learning_client(user_id,client_event_id), UNIQUE KEY uq_learning_source(source_event_key),
 KEY ix_learning_user(user_id,offering_id,occurred_at),
 CONSTRAINT fk_learning_member FOREIGN KEY(offering_id,user_id) REFERENCES offering_members(offering_id,user_id),
 CONSTRAINT fk_learning_assignment FOREIGN KEY(assignment_id,offering_id) REFERENCES assignments(id,offering_id),
 CONSTRAINT fk_learning_chapter FOREIGN KEY(chapter_id,offering_id) REFERENCES chapters(id,offering_id),
 CONSTRAINT ck_learning_source CHECK(source IN ('client','server','checker')),
 CONSTRAINT ck_learning_keys CHECK((source='client' AND client_event_id IS NOT NULL AND session_id IS NOT NULL AND source_event_key IS NULL) OR (source IN ('server','checker') AND client_event_id IS NULL AND source_event_key IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE submission_knowledge_snapshot (
 submission_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 knowledge_point_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 title VARCHAR(200) NOT NULL, description TEXT NOT NULL,
 PRIMARY KEY(submission_id,knowledge_point_id),
 CONSTRAINT fk_sks_submission FOREIGN KEY(submission_id) REFERENCES submissions(id),
 CONSTRAINT fk_sks_knowledge FOREIGN KEY(knowledge_point_id) REFERENCES knowledge_points(id)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE feedback ADD UNIQUE KEY uq_feedback_id_submission(id,submission_id), ADD COLUMN issue_tag_version INT NULL;
CREATE TABLE feedback_knowledge_evaluations (
 feedback_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 knowledge_point_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 result VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, note VARCHAR(8000) NOT NULL,
 PRIMARY KEY(feedback_id,knowledge_point_id),
 CONSTRAINT fk_fke_feedback FOREIGN KEY(feedback_id) REFERENCES feedback(id),
 CONSTRAINT fk_fke_knowledge FOREIGN KEY(knowledge_point_id) REFERENCES knowledge_points(id),
 CONSTRAINT ck_fke_result CHECK(result IN ('meets_expectation','needs_practice','insufficient_evidence'))
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE feedback_issue_tags (
 feedback_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 tag VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 PRIMARY KEY(feedback_id,tag), CONSTRAINT fk_fit_feedback FOREIGN KEY(feedback_id) REFERENCES feedback(id)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE knowledge_evidence (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 student_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 offering_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 knowledge_point_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 assignment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 submission_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 feedback_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 feedback_published_version INT NOT NULL, result VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 note VARCHAR(8000) NOT NULL, occurred_at DATETIME(6) NOT NULL,
 is_current TINYINT NOT NULL, current_slot TINYINT GENERATED ALWAYS AS (CASE WHEN is_current=1 THEN 1 ELSE NULL END) STORED,
 rule_version VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 UNIQUE KEY uq_current_knowledge_evidence(student_id,assignment_id,knowledge_point_id,current_slot),
 UNIQUE KEY uq_knowledge_evidence_source(feedback_id,feedback_published_version,knowledge_point_id),
 KEY ix_knowledge_assessment(student_id,offering_id,knowledge_point_id,is_current,occurred_at,id),
 CONSTRAINT fk_ke_member FOREIGN KEY(offering_id,student_id) REFERENCES offering_members(offering_id,user_id),
 CONSTRAINT fk_ke_knowledge FOREIGN KEY(knowledge_point_id,offering_id) REFERENCES knowledge_points(id,offering_id),
 CONSTRAINT fk_ke_submission FOREIGN KEY(submission_id,assignment_id,student_id,offering_id) REFERENCES submissions(id,assignment_id,student_id,offering_id),
 CONSTRAINT fk_ke_feedback FOREIGN KEY(feedback_id,submission_id) REFERENCES feedback(id,submission_id),
 CONSTRAINT ck_ke_current CHECK(is_current IN (0,1)),
 CONSTRAINT ck_ke_result CHECK(result IN ('meets_expectation','needs_practice','insufficient_evidence'))
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- P1 accepted only empty knowledge evaluations, so there is no historical evidence to invent.
-- Controlled initial vocabulary, only for offerings without an existing configuration.
UPDATE course_offerings SET issue_tags_config=JSON_OBJECT('version',1,'items',JSON_ARRAY(
 JSON_OBJECT('tag','layout_overflow','title','布局溢出','description','窄屏或内容变化时布局溢出'),
 JSON_OBJECT('tag','flex_alignment','title','弹性对齐','description','Flex 对齐或分布问题'),
 JSON_OBJECT('tag','box_model','title','盒模型','description','内边距、边框或宽度计算问题')))
WHERE issue_tags_config IS NULL;
