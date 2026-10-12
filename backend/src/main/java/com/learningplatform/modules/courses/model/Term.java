package com.learningplatform.modules.courses.model;

import java.time.Instant;

/** terms 表的一行；学期是只读配置，本学期只有受控管理流程会修改。 */
public record Term(String id, String label, Instant startsAt, Instant endsAt,
                   Boolean current, Instant createdAt, Instant updatedAt) {
}
