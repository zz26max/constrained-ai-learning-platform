package com.learningplatform.modules.auth.dto;

import java.time.Instant;
import java.util.List;

/** /me/config 响应：版本、服务器时间、时区、当前学期与能力开关。 */
public record ConfigDTO(String apiVersion, Instant serverTime, String timezone, String currentTermId,
                        List<TermDTO> terms, FeaturesDTO features) {
}
