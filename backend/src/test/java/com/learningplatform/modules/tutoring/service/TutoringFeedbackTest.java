package com.learningplatform.modules.tutoring.service;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class TutoringFeedbackTest {
    private static Map<String, Object> policy() {
        return Map.of("kind", "web_lab", "rules", List.of(
                Map.of("id", "h1-title", "selector", "h1", "check", "text", "expected", "课程作业", "width", 1440),
                Map.of("id", "viewport", "selector", "meta[name=viewport]", "check", "exists", "width", 390),
                Map.of("id", "nav-color", "selector", "nav", "check", "css", "expected", "rgb(0,0,0)", "property", "color", "width", 1440)));
    }

    private static Map<String, Object> result(String... failing) {
        var items = new java.util.ArrayList<Map<String, Object>>();
        for (String id : failing) items.add(Map.of("ruleId", id, "status", "fail", "message", "未通过"));
        return Map.of("items", items, "passed", 0, "total", failing.length);
    }

    @Test void mapsEachCheckKindToAnAction() {
        var directives = TutoringFeedback.directives(policy(), result("h1-title", "viewport", "nav-color"));
        assertThat(directives).hasSize(3);
        assertThat(directives.get(0)).contains("h1", "文本", "期望文本");
        assertThat(directives.get(1)).contains("meta[name=viewport]", "元素是否存在");
        assertThat(directives.get(2)).contains("nav", "实际样式", "覆盖");
        assertThat(directives).allMatch(line -> line.contains("不要直接"));
    }

    @Test void tokensIncludeRuleSelectorAndCssProperty() {
        assertThat(TutoringFeedback.tokens(policy(), result("nav-color")))
                .contains("nav-color", "nav", "color");
        assertThat(TutoringFeedback.tokens(policy(), result("h1-title"))).contains("h1-title", "h1");
    }

    @Test void acceptsOnlyWhenTheRuleIsNamedAndAQuestionIsAsked() {
        var tokens = TutoringFeedback.tokens(policy(), result("h1-title"));
        assertThat(TutoringFeedback.accepts("规则 h1 没通过，你期望的标题文本是什么？", tokens)).isTrue();
        assertThat(TutoringFeedback.accepts("规则 h1 没通过，请把它改成课程作业。", tokens)).isFalse();
        assertThat(TutoringFeedback.accepts("你的标题写错了吗？", tokens)).isFalse();
        assertThat(TutoringFeedback.accepts("随便回答。", List.of())).isTrue();
        assertThat(TutoringFeedback.accepts(null, tokens)).isFalse();
    }

    @Test void handlesMissingData() {
        assertThat(TutoringFeedback.directives(policy(), null)).isEmpty();
        assertThat(TutoringFeedback.tokens(null, result("h1-title"))).containsExactly("h1-title");
        assertThat(TutoringFeedback.directives(null, result("h1-title"))).hasSize(1);
    }
}
