package com.learningplatform.modules.checks;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.learningplatform.common.exception.BusinessException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CheckPolicyTest {

    private static Map<String, Object> rule(String id, String title) {
        Map<String, Object> rule = new LinkedHashMap<>();
        rule.put("id", id);
        if (title != null) rule.put("title", title);
        rule.put("selector", "meta[name=viewport]");
        rule.put("check", "exists");
        rule.put("expected", null);
        rule.put("property", null);
        rule.put("width", 390);
        return rule;
    }

    private static Map<String, Object> config(Map<String, Object>... rules) {
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("kind", "web_lab");
        config.put("rules", List.of(rules));
        return config;
    }

    private static Map<String, Object> result() {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("ruleId", "viewport");
        item.put("status", "fail");
        item.put("message", "未通过，请检查对应结构、内容或样式。");
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("passed", 0);
        result.put("total", 1);
        result.put("items", List.of(item));
        result.put("output", "");
        result.put("truncated", false);
        return result;
    }

    @Test
    @DisplayName("规则标题可选：带标题与不带标题的配置都能保存")
    void acceptsTitledAndUntitledRules() {
        assertThatCode(() -> CheckPolicy.validate(config(rule("a", "移动端适配"), rule("b", null)), "web_lab"))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("规则标题校验：空白、超过 60 字或未登记的字段都被拒绝")
    void rejectsInvalidTitles() {
        assertThatThrownBy(() -> CheckPolicy.validate(config(rule("a", "  ")), "web_lab"))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> CheckPolicy.validate(config(rule("a", "x".repeat(61))), "web_lab"))
                .isInstanceOf(BusinessException.class);
        assertThatCode(() -> CheckPolicy.validate(config(rule("a", "x".repeat(60))), "web_lab"))
                .doesNotThrowAnyException();

        Map<String, Object> extra = rule("a", "标题");
        extra.put("hint", "未登记字段");
        assertThatThrownBy(() -> CheckPolicy.validate(config(extra), "web_lab"))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("回填时只补可读标题，判定结论、文案与统计字段都不变")
    void fillsTitlesWithoutChangingVerdict() {
        Map<String, Object> result = result();
        Map<String, Object> titled = CheckPolicy.titled(result, config(rule("viewport", "移动端适配")));

        @SuppressWarnings("unchecked")
        Map<String, Object> item = ((List<Map<String, Object>>) titled.get("items")).get(0);
        assertThat(item).containsEntry("title", "移动端适配")
                .containsEntry("status", "fail")
                .containsEntry("message", "未通过，请检查对应结构、内容或样式。");
        assertThat(titled).containsEntry("passed", 0).containsEntry("total", 1).containsEntry("truncated", false);
        assertThat(result.get("items")).isNotSameAs(titled.get("items"));
    }

    @Test
    @DisplayName("配置里没有标题时原样返回，不复制结果")
    void leavesResultUntouchedWithoutTitles() {
        Map<String, Object> result = result();
        assertThat(CheckPolicy.titled(result, config(rule("viewport", null)))).isSameAs(result);
        assertThat(CheckPolicy.titled(result, null)).isSameAs(result);
    }

    @Test
    @DisplayName("未知规则编号回填 null，不猜标题")
    void titleIsNullForUnknownRule() {
        @SuppressWarnings("unchecked")
        Map<String, Object> item = ((List<Map<String, Object>>)
                CheckPolicy.titled(result(), config(rule("other", "标题"))).get("items")).get(0);
        assertThat(item).containsEntry("title", null);
    }
}
