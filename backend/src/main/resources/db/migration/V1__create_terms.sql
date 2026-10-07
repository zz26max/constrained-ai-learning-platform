-- Flyway 版本迁移：V1 是版本号，双下划线之后是本次变更的说明。
-- 应用启动时，Flyway 按版本执行未应用的迁移，并保存执行记录与校验值。
-- 此文件一旦应用到共享数据库，就不要修改；之后的结构变更应新增 V2、V3 等迁移。
-- 本轮只建立学期基础表；账户、会话、审计及开发演示数据随对应功能加入。

CREATE TABLE terms (
    -- 应用生成规范小写 UUID；后续引用此主键的外键必须使用相同类型和排序规则。
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL
        COMMENT '学期 UUID，由应用生成',
    label VARCHAR(200) NOT NULL COMMENT '学期展示名称，不作为关联主键',

    -- DATETIME 不会自动转换时区。连接会话固定为 UTC，应用也必须按 UTC 存取。
    starts_at DATETIME(6) NOT NULL COMMENT '学期开始时刻，UTC',
    ends_at DATETIME(6) NOT NULL COMMENT '学期结束时刻，UTC',
    is_current TINYINT NOT NULL DEFAULT 0 COMMENT '是否当前学期：0 否，1 是',

    -- 当前学期生成 1，历史学期生成 NULL；应用不能直接写入这个生成列。
    -- MySQL 唯一索引允许多个 NULL，因此历史学期可以有多条，当前学期最多一条。
    current_slot TINYINT
        GENERATED ALWAYS AS (CASE WHEN is_current = 1 THEN 1 ELSE NULL END) STORED,

    -- 不使用依赖宿主机时区的默认值，由后续管理功能显式写入 UTC 时刻。
    created_at DATETIME(6) NOT NULL COMMENT '创建时刻，UTC',
    updated_at DATETIME(6) NOT NULL COMMENT '最近修改时刻，UTC',

    PRIMARY KEY (id),
    CONSTRAINT ck_terms_current CHECK (is_current IN (0, 1)),
    CONSTRAINT ck_terms_time_range CHECK (ends_at > starts_at),
    UNIQUE KEY uq_terms_current (current_slot)
) ENGINE = InnoDB
  DEFAULT CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '学期基础配置';
