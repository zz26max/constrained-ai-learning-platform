package com.learningplatform.modules.checks;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import com.learningplatform.modules.courses.service.AssignmentInput;

final class CheckPolicy {
    private static final Set<String> WEB_RULE_KEYS =
            Set.of("id", "selector", "check", "expected", "property", "width");
    private static final Set<String> WEB_RULE_TITLED_KEYS =
            Set.of("id", "title", "selector", "check", "expected", "property", "width");

    private CheckPolicy() {}

    static void validate(Map<?, ?> config, String assignmentType) {
        if (!assignmentType.equals(config.get("kind"))) throw AssignmentInput.invalid();
        switch (assignmentType) {
            case "web_lab" -> validateWeb(config);
            case "sql_text" -> validateSql(config);
            default -> throw AssignmentInput.invalid();
        }
    }

    private static void validateWeb(Map<?, ?> config) {
        if (!config.keySet().equals(Set.of("kind", "rules")) ||
                !(config.get("rules") instanceof List<?> rules) || rules.isEmpty() || rules.size() > 20)
            throw AssignmentInput.invalid();
        var ids = new HashSet<String>();
        for (Object value : rules) {
            if (!(value instanceof Map<?, ?> rule)) throw AssignmentInput.invalid();
            var keys = rule.keySet();
            if (!keys.equals(WEB_RULE_KEYS) && !keys.equals(WEB_RULE_TITLED_KEYS))
                throw AssignmentInput.invalid();
            if (keys.contains("title") && !bounded(rule.get("title"), 60)) throw AssignmentInput.invalid();
            if (!(rule.get("id") instanceof String id) || !bounded(id, 64) || !ids.add(id) ||
                    !bounded(rule.get("selector"), 200) ||
                    !(rule.get("width") instanceof Integer width) || width < 320 || width > 1920 ||
                    !(rule.get("check") instanceof String check))
                throw AssignmentInput.invalid();
            Object expected = rule.get("expected"), property = rule.get("property");
            boolean valid = switch (check) {
                case "exists" -> expected == null && property == null;
                case "text" -> stringAtMost(expected, 1000) && property == null;
                case "css" -> stringAtMost(expected, 1000) && bounded(property, 100);
                default -> false;
            };
            if (!valid) throw AssignmentInput.invalid();
        }
    }

    private static void validateSql(Map<?, ?> config) {
        if (!config.keySet().equals(Set.of("kind", "mode", "seedSql", "verificationSql", "expectedRows", "ordered")) ||
                !bounded(config.get("seedSql"), 32000) || !(config.get("ordered") instanceof Boolean) ||
                !(config.get("expectedRows") instanceof List<?> rows) || rows.size() > 100)
            throw AssignmentInput.invalid();
        Object verification = config.get("verificationSql");
        if (!("query".equals(config.get("mode")) && verification == null) &&
                !("mutation".equals(config.get("mode")) && bounded(verification, 8000)))
            throw AssignmentInput.invalid();
        for (Object value : rows) {
            if (!(value instanceof List<?> row) || row.isEmpty() || row.size() > 30)
                throw AssignmentInput.invalid();
            for (Object cell : row) {
                if (cell != null && !stringAtMost(cell, 2000)) throw AssignmentInput.invalid();
            }
        }
    }

    /**
     * 学生视角回填规则标题：结果快照只存 ruleId，标题按发布后已冻结的配置映射，
     * 只补可读名称，不改判定结论，也不回显选择器与期望值。
     */
    static Map<String, Object> titled(Map<String, Object> result, Map<String, Object> config) {
        if (config == null || !(config.get("rules") instanceof List<?> rules)
                || !(result.get("items") instanceof List<?> items)) return result;
        Map<String, String> titles = new HashMap<>();
        for (Object value : rules) {
            if (value instanceof Map<?, ?> rule && rule.get("id") instanceof String id
                    && rule.get("title") instanceof String title) titles.put(id, title);
        }
        if (titles.isEmpty()) return result;
        List<Object> enriched = new ArrayList<>();
        for (Object value : items) {
            Map<String, Object> item = new LinkedHashMap<>();
            if (value instanceof Map<?, ?> source) source.forEach((key, cell) -> item.put(String.valueOf(key), cell));
            item.put("title", item.get("ruleId") instanceof String ruleId ? titles.get(ruleId) : null);
            enriched.add(item);
        }
        Map<String, Object> copy = new LinkedHashMap<>(result);
        copy.put("items", enriched);
        return copy;
    }

    private static boolean bounded(Object value, int max) {
        return value instanceof String text && !text.isBlank() && stringAtMost(text, max);
    }

    private static boolean stringAtMost(Object value, int max) {
        return value instanceof String text && text.codePointCount(0, text.length()) <= max;
    }
}
