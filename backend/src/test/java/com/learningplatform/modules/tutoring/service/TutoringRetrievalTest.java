package com.learningplatform.modules.tutoring.service;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class TutoringRetrievalTest {
    private static Map<String, Object> row(String id, String title, String content, int position) {
        return Map.of("id", id, "title", title, "content_markdown", content, "position", position);
    }

    private static final String ID1 = "00000000-0000-4000-8000-000000000011";
    private static final String ID2 = "00000000-0000-4000-8000-000000000012";
    private static final String ID3 = "00000000-0000-4000-8000-000000000013";

    @Test void ranksResourcesByQuestionOverlapAndCapsAtTwo() {
        var rows = List.of(
                row(ID1, "盒模型与间距", "边距、内边距与盒子宽度：content-box 与 border-box 的差别。", 1),
                row(ID2, "按钮与事件绑定", "按钮点击没有反应时，先检查 script 是否加载、事件是否绑定到按钮。", 2),
                row(ID3, "CSS 选择器", "类选择器、后代选择器与优先级。", 3));
        var selection = TutoringRetrieval.select(rows, "按钮点了没有反应，事件是不是没绑上？");
        assertThat(selection.materials()).hasSize(2);
        assertThat(selection.materials().getFirst()).contains("按钮与事件绑定").contains("课程资料《");
        assertThat(selection.citations()).hasSize(2);
        assertThat(selection.citations().getFirst()).containsEntry("resourceId", ID2);
        assertThat(selection.materials().get(1)).doesNotContain("按钮与事件绑定");
    }

    @Test void fallsBackToPositionOrderWhenNothingMatches() {
        var rows = List.of(row(ID1, "第一章资料", "阅读材料。", 1), row(ID3, "第二章资料", "阅读材料。", 2));
        var selection = TutoringRetrieval.select(rows, "zzz qqq");
        assertThat(selection.materials()).hasSize(2);
        assertThat(selection.citations().getFirst()).containsEntry("resourceId", ID1);
    }

    @Test void handlesEmptyInputs() {
        assertThat(TutoringRetrieval.select(List.of(), "问题")).isEqualTo(TutoringRetrieval.EMPTY);
        assertThat(TutoringRetrieval.select(null, "问题")).isEqualTo(TutoringRetrieval.EMPTY);
        assertThat(TutoringRetrieval.select(List.of(Map.of("title", "无 id")), "问题")).isEqualTo(TutoringRetrieval.EMPTY);
    }

    @Test void excerptIsBoundedAndCentredOnTheFirstHit() {
        String filler = "abcdefghij".repeat(200);
        String content = filler + "事件绑定" + filler;
        String excerpt = TutoringRetrieval.excerpt(content, List.of("事件绑定"));
        assertThat(excerpt).hasSize(900).contains("事件绑定");
        assertThat(TutoringRetrieval.excerpt("短内容", List.of("x"))).isEqualTo("短内容");
    }

    @Test void termsMixCjkBigramsAndAsciiTokens() {
        assertThat(TutoringRetrieval.terms("按钮 margin-top 无效"))
                .contains("按钮", "margin", "top", "无效")
                .hasSizeLessThanOrEqualTo(40);
        assertThat(TutoringRetrieval.terms("")).isEmpty();
        assertThat(TutoringRetrieval.terms("a")).isEmpty();
        assertThat(TutoringRetrieval.terms("图")).containsExactly("图");
    }
}
