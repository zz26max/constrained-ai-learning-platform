package com.learningplatform.modules.auth.dto;

/** 能力开关；P1 三项均为 false，P2 起按真实启用状态返回。 */
public record FeaturesDTO(boolean aiTutoring, boolean learningAnalytics, boolean serverChecks) {
}
