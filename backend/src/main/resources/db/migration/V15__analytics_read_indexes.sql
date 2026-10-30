-- P2 analytics reads by offering: 14-day activity window and class-wide current evidence.
CREATE INDEX ix_learning_offering_received ON learning_events(offering_id, received_at, type);

CREATE INDEX ix_evidence_offering_current ON knowledge_evidence(offering_id, is_current, student_id, knowledge_point_id, occurred_at);
