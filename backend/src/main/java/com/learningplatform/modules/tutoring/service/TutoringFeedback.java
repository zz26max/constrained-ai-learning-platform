package com.learningplatform.modules.tutoring.service;

import java.util.*;

/** L4：把自动检查的失败项翻译成「该让学生做什么」的动作指令，并对回复做一次轻量校验。 */
public final class TutoringFeedback {
    private static final int MAX_ITEMS = 4;
    private TutoringFeedback() {}

    /** 结构化动作：每条形如「规则 x（选择器 y）未通过：<引导动作>；可以问：<问题>」。 */
    public static List<String> directives(Map<String, Object> policySnapshot, Map<String, Object> result) {
        if (result == null || !(result.get("items") instanceof List<?> items)) return List.of();
        Map<String, Map<?, ?>> rules = rules(policySnapshot);
        List<String> lines = new ArrayList<>();
        for (Object value : items) {
            if (lines.size() >= MAX_ITEMS) break;
            if (!(value instanceof Map<?, ?> item) || !"fail".equals(item.get("status"))) continue;
            String ruleId = Objects.toString(item.get("ruleId"), "unknown");
            Map<?, ?> rule = rules.get(ruleId);
            String selector = rule == null ? "" : Objects.toString(rule.get("selector"), "");
            String check = rule == null ? "" : Objects.toString(rule.get("check"), "");
            lines.add(describe(ruleId, selector, check));
        }
        return List.copyOf(lines);
    }

    /** 回复里应命中的词：规则 id、选择器、以及失败项类型对应的关键词。 */
    public static List<String> tokens(Map<String, Object> policySnapshot, Map<String, Object> result) {
        if (result == null || !(result.get("items") instanceof List<?> items)) return List.of();
        Map<String, Map<?, ?>> rules = rules(policySnapshot);
        var tokens = new LinkedHashSet<String>();
        for (Object value : items) {
            if (!(value instanceof Map<?, ?> item) || !"fail".equals(item.get("status"))) continue;
            String ruleId = Objects.toString(item.get("ruleId"), "");
            if (!ruleId.isBlank()) tokens.add(ruleId);
            if (rules.get(ruleId) instanceof Map<?, ?> rule) {
                String selector = Objects.toString(rule.get("selector"), "");
                if (selector.length() >= 2) tokens.add(selector);
                if ("css".equals(Objects.toString(rule.get("check"), ""))) {
                    String property = Objects.toString(rule.get("property"), "");
                    if (property.length() >= 3) tokens.add(property);
                }
            }
        }
        return List.copyOf(tokens);
    }

    /** 有失败项时：必须至少命中一个具体词，并且以提问收尾（引导而非代答）。 */
    public static boolean accepts(String content, List<String> tokens) {
        if (tokens.isEmpty()) return true;
        if (content == null) return false;
        boolean asks = content.contains("？") || content.contains("?");
        boolean mentions = tokens.stream().anyMatch(content::contains);
        return asks && mentions;
    }

    private static String describe(String ruleId, String selector, String check) {
        String where = selector.isBlank() ? "（无选择器）" : selector;
        return switch (check) {
            case "exists" -> "规则 " + ruleId + "（" + where + "）未通过：先让学生确认该元素是否存在，再问它在页面 DOM 中的位置；不要直接给标签。";
            case "text" -> "规则 " + ruleId + "（" + where + "）未通过：先让学生对照题面确认期望文本，再问当前文本是什么；不要直接给正确文案。";
            case "css" -> "规则 " + ruleId + "（" + where + "）未通过：先让学生用开发者工具确认该元素的实际样式，再问哪条规则可能覆盖了它；不要直接给新样式。";
            default -> "规则 " + ruleId + "（" + where + "）未通过：先让学生描述预期与实际现象，再问一个可验证的检查点；不要代写。";
        };
    }

    private static Map<String, Map<?, ?>> rules(Map<String, Object> policySnapshot) {
        Map<String, Map<?, ?>> byId = new HashMap<>();
        if (policySnapshot == null || !(policySnapshot.get("rules") instanceof List<?> rules)) return byId;
        for (Object value : rules) {
            if (value instanceof Map<?, ?> rule && rule.get("id") instanceof String id) byId.put(id, rule);
        }
        return byId;
    }
}
