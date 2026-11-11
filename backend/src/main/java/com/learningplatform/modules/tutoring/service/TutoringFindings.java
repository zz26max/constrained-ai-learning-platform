package com.learningplatform.modules.tutoring.service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Extracts the public part of the failed checks. Selectors and expected results stay in the checker. */
final class TutoringFindings {
    static final int MAX_ITEMS = 4;

    private TutoringFindings() {}

    record FailedRule(String label, String kind) {}

    static List<FailedRule> failedRules(Map<String, Object> policy, Map<String, Object> result) {
        if (result == null || !(result.get("items") instanceof List<?> items)) return List.of();
        var rules = new HashMap<String, Map<?, ?>>();
        if (policy != null && policy.get("rules") instanceof List<?> configured) {
            for (Object value : configured) {
                if (value instanceof Map<?, ?> rule && rule.get("id") instanceof String id) rules.put(id, rule);
            }
        }
        var failed = new ArrayList<FailedRule>();
        for (Object value : items) {
            if (!(value instanceof Map<?, ?> item) || !"fail".equals(item.get("status"))) continue;
            String id = Objects.toString(item.get("ruleId"), "");
            if ("sql.result".equals(id) && policy != null && "sql_text".equals(policy.get("kind"))) {
                failed.add(new FailedRule("SQL 检查", "query".equals(policy.get("mode")) ? "sql_query" : "sql_change"));
                continue;
            }
            Map<?, ?> rule = rules.get(id);
            String label = rule != null && rule.get("title") instanceof String title && !title.isBlank() ? title : id;
            if (!label.isBlank()) failed.add(new FailedRule(label, rule == null ? "" : Objects.toString(rule.get("check"), "")));
        }
        return List.copyOf(failed);
    }

    static List<String> summarize(List<FailedRule> failed, int revision) {
        if (failed.isEmpty()) return List.of();
        int shown = Math.min(MAX_ITEMS, failed.size());
        var summary = new ArrayList<String>();
        summary.add("自动检查（检查版本 " + revision + "）：" + failed.size() + " 项未通过"
                + (shown < failed.size() ? "，以下仅列 " + shown + " 项" : ""));
        failed.stream().limit(shown).map(rule -> "检查项「" + rule.label() + "」未通过").forEach(summary::add);
        return List.copyOf(summary);
    }
}
