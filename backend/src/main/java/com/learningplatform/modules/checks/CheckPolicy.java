package com.learningplatform.modules.checks;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import com.learningplatform.modules.courses.service.AssignmentInput;

final class CheckPolicy {
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
            if (!(value instanceof Map<?, ?> rule) ||
                    !rule.keySet().equals(Set.of("id", "selector", "check", "expected", "property", "width")) ||
                    !(rule.get("id") instanceof String id) || !bounded(id, 64) || !ids.add(id) ||
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

    private static boolean bounded(Object value, int max) {
        return value instanceof String text && !text.isBlank() && stringAtMost(text, max);
    }

    private static boolean stringAtMost(Object value, int max) {
        return value instanceof String text && text.codePointCount(0, text.length()) <= max;
    }
}
