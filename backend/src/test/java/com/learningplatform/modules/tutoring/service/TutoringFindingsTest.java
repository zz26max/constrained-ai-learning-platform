package com.learningplatform.modules.tutoring.service;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class TutoringFindingsTest {
    private static Map<String, Object> policy() {
        return Map.of("kind", "web_lab", "rules", List.of(
                Map.of("id", "h1-title", "title", "页面标题", "selector", "h1", "check", "text", "expected", "课程作业", "width", 1440),
                Map.of("id", "viewport", "selector", "meta[name=viewport]", "check", "exists", "width", 390),
                Map.of("id", "nav-color", "selector", "nav", "check", "css", "expected", "rgb(0, 0, 0)", "property", "color", "width", 1440)));
    }

    private static Map<String, Object> result(String... failing) {
        var items = new java.util.ArrayList<Map<String, Object>>();
        for (String id : failing) items.add(Map.of("ruleId", id, "status", "fail", "message", "未通过"));
        items.add(Map.of("ruleId", "h1-title", "status", "pass", "message", "符合"));
        return Map.of("items", items, "passed", 1, "total", failing.length + 1);
    }

    @Test void summarizesPublicLabelsWithoutSelectorsOrExpectedValues() {
        var failed = TutoringFindings.failedRules(policy(), result("h1-title", "viewport"));
        var findings = TutoringFindings.summarize(failed, 3);
        assertThat(findings).hasSize(3);
        assertThat(findings.getFirst()).isEqualTo("自动检查（检查版本 3）：2 项未通过");
        assertThat(findings.get(1)).contains("页面标题").doesNotContain("h1", "课程作业");
        assertThat(findings.get(2)).contains("viewport").doesNotContain("meta[name=viewport]");
    }

    @Test void recognizesSqlQueryAndMutationWithoutUsingVerificationData() {
        var query = TutoringFindings.failedRules(Map.of("kind", "sql_text", "mode", "query"), result("sql.result"));
        var mutation = TutoringFindings.failedRules(Map.of("kind", "sql_text", "mode", "mutation"), result("sql.result"));
        assertThat(TutoringFeedback.directives(query)).singleElement().asString().contains("核对行、列或排序");
        assertThat(TutoringFeedback.directives(mutation)).singleElement().asString().contains("验证操作后的数据状态");
    }

    @Test void returnsEmptyWhenEverythingPassesOrDataIsMissing() {
        assertThat(TutoringFindings.failedRules(policy(), result())).isEmpty();
        assertThat(TutoringFindings.failedRules(policy(), null)).isEmpty();
        assertThat(TutoringFindings.summarize(TutoringFindings.failedRules(null, result("h1-title")), 1).get(1)).contains("检查项「h1-title」未通过");
    }

    @Test void capsTheNumberOfShownItems() {
        var ids = new java.util.ArrayList<String>();
        for (int i = 0; i < 20; i++) ids.add("rule-" + i);
        var findings = TutoringFindings.summarize(TutoringFindings.failedRules(null, result(ids.toArray(new String[0]))), 1);
        assertThat(findings.getFirst()).contains("20 项未通过").contains("以下仅列 4 项");
        assertThat(findings).hasSize(5);
    }

    @Test void ablationLayersIgnoreUnknownNames() {
        assertThat(TutoringWorker.parseLayers(null)).isEmpty();
        assertThat(TutoringWorker.parseLayers("  ")).isEmpty();
        assertThat(TutoringWorker.parseLayers("static, INTERCEPT_OUTPUT ,unknown")).containsExactlyInAnyOrder("static", "intercept_output");
    }
}
