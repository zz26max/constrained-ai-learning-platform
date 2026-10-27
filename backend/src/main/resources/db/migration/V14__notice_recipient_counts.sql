-- Freeze the actual fan-out count for new notices. NULL denotes legacy unknown counts.
ALTER TABLE notices
    ADD COLUMN recipient_count INT NULL COMMENT '实际生成的通知数；历史未知为 NULL',
    ADD CONSTRAINT ck_notices_recipient_count CHECK (recipient_count IS NULL OR recipient_count >= 0);

-- Only a unique, exact creation audit is evidence. Never infer a historical link
-- from a title or timestamp; malformed/missing/duplicate audits remain NULL.
UPDATE notices n
JOIN (
    SELECT target_id,
           MAX(CASE
               WHEN JSON_TYPE(JSON_EXTRACT(metadata, '$.notified')) = 'INTEGER'
                AND REGEXP_LIKE(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.notified')), '^(0|[1-9][0-9]{0,9})$', 'c')
               THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.notified')) AS UNSIGNED)
               ELSE NULL END) AS notified
    FROM audit_logs
    WHERE action = 'NOTICE_CREATED' AND target_type = 'notice'
    GROUP BY target_id
    HAVING COUNT(*) = 1
) a ON a.target_id = n.id
SET n.recipient_count = a.notified
WHERE a.notified BETWEEN 0 AND 2147483647;
