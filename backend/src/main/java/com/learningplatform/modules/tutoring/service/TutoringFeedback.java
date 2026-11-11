package com.learningplatform.modules.tutoring.service;

import java.util.List;

import com.learningplatform.modules.tutoring.service.TutoringFindings.FailedRule;

/** Turns failed checks into questions the student can verify. */
final class TutoringFeedback {
    private TutoringFeedback() {}

    static List<String> directives(List<FailedRule> failed) {
        return failed.stream().limit(TutoringFindings.MAX_ITEMS).map(TutoringFeedback::describe).toList();
    }

    static List<String> tokens(List<FailedRule> failed) {
        return failed.stream().limit(TutoringFindings.MAX_ITEMS).map(FailedRule::label).distinct().toList();
    }

    static boolean accepts(String content, List<String> tokens) {
        if (tokens.isEmpty()) return true;
        return content != null && (content.contains("？") || content.contains("?"))
                && tokens.stream().anyMatch(content::contains);
    }

    private static String describe(FailedRule rule) {
        String action = switch (rule.kind()) {
            case "exists" -> "请学生确认所需元素是否存在，以及它在页面结构中的位置。";
            case "text" -> "请学生根据题面比较当前页面文本和要求，并问他观察到了什么差异。";
            case "css" -> "请学生查看元素的实际样式，并核对哪条规则可能覆盖了它。";
            case "sql_query" -> "请学生检查能否执行查询，再根据题面核对行、列或排序。";
            case "sql_change" -> "请学生核对操作影响了哪些记录，再根据题面验证操作后的数据状态。";
            default -> "请学生描述预期和实际现象，并提出一个可验证的检查点。";
        };
        return "检查项「" + rule.label() + "」未通过。" + action;
    }
}
