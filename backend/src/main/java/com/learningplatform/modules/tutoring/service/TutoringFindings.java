package com.learningplatform.modules.tutoring.service;

import java.util.*;

/** 把最近一次自动检查压缩成少量可交给模型的发现项；只含规则元数据，不含学生原文。 */
public final class TutoringFindings {
    private static final int MAX_ITEMS = 6;
    private static final int MAX_CHARS = 1200;
    private static final int MAX_EXPECTED = 120;

    private TutoringFindings() {}

    public static List<String> build(Map<String, Object> policySnapshot, Map<String, Object> result,
                                     int checkRevision, Integer requestRevision) {
        if (result == null || !(result.get("items") instanceof List<?> items)) return List.of();
        Map<String, Map<?, ?>> rules = rules(policySnapshot);
        List<String> lines = new ArrayList<>();
        int failed = 0;
        for (Object value : items) {
            if (!(value instanceof Map<?, ?> item) || !"fail".equals(item.get("status"))) continue;
            failed++;
            if (lines.size() >= MAX_ITEMS) continue;
            String ruleId = Objects.toString(item.get("ruleId"), "unknown");
            Map<?, ?> rule = rules.get(ruleId);
            String line = rule == null ? "规则 " + ruleId + " 未通过" : describe(ruleId, rule);
            if (chars(lines) + line.length() > MAX_CHARS) continue;
            lines.add(line);
        }
        if (failed == 0) return List.of();
        String header = "自动检查（检查版本 " + checkRevision
                + (requestRevision != null && requestRevision > checkRevision ? "，早于当前版本 " + requestRevision : "")
                + "）：" + failed + " 项未通过"
                + (failed > lines.size() ? "，以下仅列 " + lines.size() + " 项" : "");
        List<String> out = new ArrayList<>(lines.size() + 1);
        out.add(header);
        out.addAll(lines);
        return List.copyOf(out);
    }

    private static Map<String, Map<?, ?>> rules(Map<String, Object> policySnapshot) {
        Map<String, Map<?, ?>> byId = new HashMap<>();
        if (policySnapshot == null || !(policySnapshot.get("rules") instanceof List<?> rules)) return byId;
        for (Object value : rules) {
            if (value instanceof Map<?, ?> rule && rule.get("id") instanceof String id) byId.put(id, rule);
        }
        return byId;
    }

    private static String describe(String ruleId, Map<?, ?> rule) {
        String selector = Objects.toString(rule.get("selector"), "");
        String expected = clip(Objects.toString(rule.get("expected"), null));
        String property = clip(Objects.toString(rule.get("property"), null));
        String requirement = switch (Objects.toString(rule.get("check"), "")) {
            case "exists" -> "元素需存在";
            case "text" -> "文本需为「" + expected + "」";
            case "css" -> property + " 需为「" + expected + "」";
            default -> "检查方式未知";
        };
        return "规则 " + ruleId + "：定位 " + (selector.isBlank() ? "（未配置）" : selector) + "，" + requirement;
    }

    private static String clip(String value) {
        if (value == null || value.isBlank()) return "（空）";
        return value.codePointCount(0, value.length()) <= MAX_EXPECTED ? value
                : value.substring(0, value.offsetByCodePoints(0, MAX_EXPECTED)) + "…";
    }

    private static int chars(List<String> lines) {
        int total = 0;
        for (String line : lines) total += line.length();
        return total;
    }
}
