package com.learningplatform.modules.auth.dto;

import java.time.Instant;

/** /me/config 返回的学期摘要；只含展示与关联所需字段。 */
public record TermDTO(String id, String label, Instant startsAt, Instant endsAt) {
}
