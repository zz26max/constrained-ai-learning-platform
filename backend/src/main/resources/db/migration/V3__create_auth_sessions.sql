-- 有身份的数据库会话；迁移不创建任何会话，不修改已经执行的 V1/V2。
CREATE TABLE auth_sessions (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL
        COMMENT '随机会话令牌的 SHA-256 摘要，不保存原令牌',
    credential_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL
        COMMENT '创建时口令哈希与平台角色集合的 SHA-256 摘要，安全状态变更后拒绝旧会话',
    csrf_secret CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL
        COMMENT '独立随机 CSRF 秘密，HTTP 校验随下一步接入',
    expires_at DATETIME(6) NOT NULL COMMENT '绝对过期时间，续期时不修改',
    idle_expires_at DATETIME(6) NOT NULL COMMENT '空闲过期时间，不超过绝对期限',
    revoked_at DATETIME(6) NULL COMMENT '撤销时间，NULL 表示尚未撤销',
    last_seen_at DATETIME(6) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_auth_sessions_token_hash (token_hash),
    KEY ix_auth_sessions_user_id (user_id),
    KEY ix_auth_sessions_expires_at (expires_at),
    CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT ck_auth_sessions_token_hash CHECK (
        CHAR_LENGTH(token_hash) = 64 AND NOT REGEXP_LIKE(token_hash, '[^0-9a-f]', 'c')
    ),
    CONSTRAINT ck_auth_sessions_credential_hash CHECK (
        CHAR_LENGTH(credential_hash) = 64 AND NOT REGEXP_LIKE(credential_hash, '[^0-9a-f]', 'c')
    ),
    CONSTRAINT ck_auth_sessions_csrf_secret CHECK (
        CHAR_LENGTH(csrf_secret) = 64 AND NOT REGEXP_LIKE(csrf_secret, '[^0-9a-f]', 'c')
    ),
    CONSTRAINT ck_auth_sessions_times CHECK (
        created_at <= last_seen_at AND last_seen_at <= updated_at
        AND expires_at > created_at
        AND idle_expires_at > last_seen_at AND idle_expires_at <= expires_at
        AND (revoked_at IS NULL OR (revoked_at >= created_at AND revoked_at <= updated_at))
    )
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
