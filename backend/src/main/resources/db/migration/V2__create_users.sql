-- 账户基础表：本次只建立数据结构，不初始化账号，也不提前创建会话或审计表。
-- 已应用的 Flyway 迁移保持不变，后续结构调整继续新增版本文件。

CREATE TABLE users (
    -- 应用生成规范小写 UUID；后续用户外键使用相同类型、字符集和排序规则。
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL
        COMMENT '用户 UUID，由应用生成',

    -- 用户名是登录标识，统一保存小写 ASCII；展示名称单独保存，可使用中文。
    username VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL
        COMMENT '规范化用户名，3 至 64 位小写 ASCII',
    display_name VARCHAR(100) NOT NULL COMMENT '用户展示名称',
    password_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL
        COMMENT '密码哈希，禁止保存明文密码',

    -- JSON 数组表示角色集合，禁止用逗号字符串；数据库检查受控值且不允许重复。
    roles JSON NOT NULL COMMENT '角色集合：student、teacher、admin',
    status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'active'
        COMMENT '账户状态：active 或 disabled',

    -- DATETIME 不自动转换时区，应用必须显式写入 UTC；不使用服务器本地时间默认值。
    created_at DATETIME(6) NOT NULL COMMENT '创建时刻，UTC',
    updated_at DATETIME(6) NOT NULL COMMENT '最近修改时刻，UTC',

    PRIMARY KEY (id),
    -- 唯一键已经为按用户名查询提供索引，无需再建普通 username 索引。
    UNIQUE KEY uq_users_username (username),
    -- 用“首字符合法 + 不存在非法字符”检查，避免正则 $ 对末尾换行的特殊匹配行为。
    CONSTRAINT ck_users_username CHECK (
        CHAR_LENGTH(username) BETWEEN 3 AND 64
        AND REGEXP_LIKE(username, '^[a-z0-9]', 'c')
        AND NOT REGEXP_LIKE(username, '[^a-z0-9._-]', 'c')
    ),
    CONSTRAINT ck_users_roles CHECK (
        JSON_SCHEMA_VALID(
            '{"type":"array","minItems":1,"maxItems":3,"uniqueItems":true,"items":{"type":"string","enum":["student","teacher","admin"]}}',
            roles
        )
    ),
    -- ascii_bin 比较可能忽略末尾空格；转为二进制后检查，状态必须逐字节完全相符。
    CONSTRAINT ck_users_status CHECK (CAST(status AS BINARY) IN ('active', 'disabled'))
) ENGINE = InnoDB
  DEFAULT CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '平台账户';
