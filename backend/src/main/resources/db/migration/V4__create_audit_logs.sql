-- 追加式安全审计：不记录口令、令牌、Cookie 或完整正文；用户删除时匿名化 actor，审计行保留。
CREATE TABLE audit_logs (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL
        COMMENT '审计条目 UUID，由应用生成',
    actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL
        COMMENT '操作账户 UUID；匿名失败为 NULL，账户删除后置 NULL',
    action VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL
        COMMENT '受控动作名，如 LOGIN_SUCCESS / LOGIN_FAILURE',
    target_type VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL
        COMMENT '受控目标类型，如 user',
    target_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL
        COMMENT '目标对象 UUID',
    metadata JSON NOT NULL
        COMMENT '受控审计元数据；不包含口令、令牌、Cookie 或完整正文',
    request_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL
        COMMENT '关联业务请求标识',
    created_at DATETIME(6) NOT NULL COMMENT '创建时刻，UTC',
    PRIMARY KEY (id),
    KEY ix_audit_logs_actor_time (actor_id, created_at),
    KEY ix_audit_logs_action_time (action, created_at),
    CONSTRAINT fk_audit_logs_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT ck_audit_logs_action CHECK (
        CHAR_LENGTH(action) BETWEEN 1 AND 64 AND NOT REGEXP_LIKE(action, '[^A-Za-z0-9._-]', 'c')
    ),
    CONSTRAINT ck_audit_logs_target_type CHECK (
        target_type IS NULL OR (CHAR_LENGTH(target_type) BETWEEN 1 AND 64
            AND NOT REGEXP_LIKE(target_type, '[^A-Za-z0-9._-]', 'c'))
    ),
    CONSTRAINT ck_audit_logs_request_id CHECK (
        CHAR_LENGTH(request_id) BETWEEN 1 AND 64 AND NOT REGEXP_LIKE(request_id, '[^A-Za-z0-9._-]', 'c')
    )
) ENGINE = InnoDB
  DEFAULT CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '追加式安全审计日志';
