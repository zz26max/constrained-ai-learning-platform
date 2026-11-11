package com.learningplatform.modules.tutoring.service;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class TutoringFeedbackTest {
    private static Map<String, Object> policy() {
        return Map.of("kind", "web_lab", "rules", List.of(
                Map.of("id", "h1-title", "title", "页面标题", "selector", "h1", "check", "text", "expected", "课程作业", "width", 1440),
                Map.of("id", "viewport", "selector", "meta[name=viewport]", "check", "exists", "width", 390),
                Map.of("id", "nav-color", "selector", "nav", "check", "css", "expected", "rgb(0,0,0)", "property", "color", "width", 1440)));
    }

    private static Map<String, Object> result(String... failing) {
        var items = new java.util.ArrayList<Map<String, Object>>();
        for (String id : failing) items.add(Map.of("ruleId", id, "status", "fail", "message", "未通过"));
        return Map.of("items", items, "passed", 0, "total", failing.length);
    }

    @Test void mapsEachCheckKindToAnAction() {
        var directives = TutoringFeedback.directives(TutoringFindings.failedRules(policy(), result("h1-title", "viewport", "nav-color")));
        assertThat(directives).hasSize(3);
        assertThat(directives.get(0)).contains("页面标题", "文本", "差异");
        assertThat(directives.get(1)).contains("viewport", "元素是否存在");
        assertThat(directives.get(2)).contains("nav", "实际样式", "覆盖");
        assertThat(directives).noneMatch(line -> line.contains("课程作业") || line.contains("rgb("));
    }

    @Test void tokensUseTheSameLabelsAsTheDirectives() {
        assertThat(TutoringFeedback.tokens(TutoringFindings.failedRules(policy(), result("nav-color", "h1-title"))))
                .containsExactly("nav-color", "页面标题");
    }

    @Test void acceptsOnlyWhenTheRuleIsNamedAndAQuestionIsAsked() {
        var tokens = TutoringFeedback.tokens(TutoringFindings.failedRules(policy(), result("h1-title")));
        assertThat(TutoringFeedback.accepts("页面标题没通过，你期望的标题文本是什么？", tokens)).isTrue();
        assertThat(TutoringFeedback.accepts("页面标题没通过，请把它改成课程作业。", tokens)).isFalse();
        assertThat(TutoringFeedback.accepts("你的标题写错了吗？", tokens)).isFalse();
        assertThat(TutoringFeedback.accepts("随便回答。", List.of())).isTrue();
        assertThat(TutoringFeedback.accepts(null, tokens)).isFalse();
    }

    @Test void handlesMissingData() {
        assertThat(TutoringFeedback.directives(List.of())).isEmpty();
        var failed = TutoringFindings.failedRules(null, result("h1-title"));
        assertThat(TutoringFeedback.tokens(failed)).containsExactly("h1-title");
        assertThat(TutoringFeedback.directives(failed)).hasSize(1);
    }
}
