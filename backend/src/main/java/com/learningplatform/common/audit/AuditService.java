package com.learningplatform.common.audit;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;

import tools.jackson.databind.json.JsonMapper;

/**
 * 追加式审计的统一入口。调用方只传受控字段；口令、令牌、Cookie 与完整正文一律禁止进入 metadata。
 * 与调用方同事务（REQUIRED）写入：业务事务失败时审计随之一同回滚，不产生"无业务的审计"。
 */
@Service
public class AuditService {

    public static final String ACTION_LOGIN_SUCCESS = "LOGIN_SUCCESS";
    public static final String ACTION_LOGIN_FAILURE = "LOGIN_FAILURE";

    private static final Pattern IDENTIFIER = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,63}");
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final AuditLogMapper mapper;
    private final Clock clock;

    public AuditService(AuditLogMapper mapper, Clock clock) {
        this.mapper = mapper;
        this.clock = clock;
    }

    /**
     * 追加一条审计。actorId/targetType/targetId 可为 null；action 与 requestId 必填且受控。
     * metadata 只接受可 JSON 序列化的标量/集合，调用方负责保证不含敏感数据。
     */
    public void record(String actorId, String action, String targetType, String targetId,
                       Map<String, Object> metadata, String requestId) {
        requireIdentifier(action, "action");
        if (targetType != null) {
            requireIdentifier(targetType, "targetType");
        }
        requireIdentifier(requestId, "requestId");
        String metadataJson = writeMetadata(metadata);
        AuditLog entry = new AuditLog(UUID.randomUUID().toString(), actorId, action, targetType,
                targetId, metadataJson, requestId, now());
        if (mapper.insert(entry) != 1) {
            throw new IllegalStateException("审计写入失败");
        }
    }

    private void requireIdentifier(String value, String field) {
        if (value == null || !IDENTIFIER.matcher(value).matches()) {
            throw new IllegalArgumentException("审计字段不合法：" + field);
        }
    }

    private String writeMetadata(Map<String, Object> metadata) {
        Map<String, Object> safe = metadata == null ? Map.of() : Map.copyOf(metadata);
        return JSON.writeValueAsString(safe);
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MICROS);
    }
}
