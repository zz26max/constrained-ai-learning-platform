package com.learningplatform.modules.tutoring.service;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class TutoringFindingsTest {
    private static Map<String, Object> policy() {
        return Map.of("kind", "web_lab", "rules", List.of(
                Map.of("id", "h1-title", "selector", "h1", "check", "text", "expected", "课程作业", "width", 1440),
                Map.of("id", "viewport", "selector", "meta[name=viewport]", "check", "exists", "width", 390),
                Map.of("id", "nav-color", "selector", "nav", "check", "css", "expected", "rgb(0, 0, 0)", "property", "color", "width", 1440)));
    }

    private static Map<String, Object> result(String... failing) {
        var items = new java.util.ArrayList<Map<String, Object>>();
        for (String id : failing) items.add(Map.of("ruleId", id, "status", "fail", "message", "未通过"));
        items.add(Map.of("ruleId", "h1-title", "status", "pass", "message", "符合"));
        return Map.of("items", items, "passed", 1, "total", failing.length + 1);
    }

    @Test void summarizesOnlyFailedRulesWithTheirSelectors() {
        var findings = TutoringFindings.build(policy(), result("h1-title", "viewport"), 3, 3);
        assertThat(findings).hasSize(3);
        assertThat(findings.getFirst()).isEqualTo("自动检查（检查版本 3）：2 项未通过");
        assertThat(findings.get(1)).contains("规则 h1-title", "h1", "文本需为「课程作业」");
        assertThat(findings.get(2)).contains("规则 viewport", "meta[name=viewport]", "元素需存在");
    }

    @Test void marksStaleChecksAndClipsExpectedValues() {
        var findings = TutoringFindings.build(policy(), result("nav-color"), 2, 5);
        assertThat(findings.getFirst()).contains("早于当前版本 5");
        assertThat(findings.get(1)).contains("color 需为「rgb(0, 0, 0)」");
        var longPolicy = Map.of("kind", "web_lab", "rules", List.of(
                Map.of("id", "big", "selector", "p", "check", "text", "expected", "x".repeat(400), "width", 1440)));
        var longFindings = TutoringFindings.build(longPolicy, result("big"), 1, 1);
        assertThat(longFindings.get(1)).endsWith("」").contains("…");
    }

    @Test void returnsEmptyWhenEverythingPassesOrDataIsMissing() {
        assertThat(TutoringFindings.build(policy(), Map.of("items", List.of(Map.of("ruleId", "h1-title", "status", "pass")), "passed", 1, "total", 1), 1, 1)).isEmpty();
        assertThat(TutoringFindings.build(policy(), null, 1, 1)).isEmpty();
        assertThat(TutoringFindings.build(null, result("h1-title"), 1, 1).get(1)).contains("规则 h1-title 未通过");
    }

    @Test void capsItemCountAndTotalLength() {
        var ids = new java.util.ArrayList<String>();
        for (int i = 0; i < 20; i++) ids.add("rule-" + i);
        var findings = TutoringFindings.build(Map.of("kind", "web_lab", "rules", List.of()), result(ids.toArray(new String[0])), 1, 1);
        assertThat(findings.getFirst()).contains("20 项未通过").contains("以下仅列 6 项");
        assertThat(findings).hasSize(7);
    }

    @Test void ablationLayersIgnoreUnknownNames() {
        assertThat(TutoringWorker.parseLayers(null)).isEmpty();
        assertThat(TutoringWorker.parseLayers("  ")).isEmpty();
        assertThat(TutoringWorker.parseLayers("static, INTERCEPT_OUTPUT ,unknown")).containsExactlyInAnyOrder("static", "intercept_output");
    }
}
