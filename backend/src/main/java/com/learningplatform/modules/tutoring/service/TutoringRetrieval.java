package com.learningplatform.modules.tutoring.service;

import java.util.*;

/** 课程资料召回：按作业知识点与章节取候选，再用问题/尝试描述做确定性打分，不引入向量库。 */
public final class TutoringRetrieval {
    public static final Selection EMPTY = new Selection(List.of(), List.of());
    private static final int MAX_RESOURCES = 2;
    private static final int MAX_EXCERPT = 900;
    private static final int MAX_TERMS = 40;
    private static final int CONTEXT_AROUND = 200;

    public record Selection(List<String> materials, List<Map<String, Object>> citations) {}

    private TutoringRetrieval() {}

    public static Selection select(List<Map<String, Object>> rows, String query) {
        if (rows == null || rows.isEmpty()) return EMPTY;
        List<String> terms = terms(query);
        var scored = new ArrayList<Map<String, Object>>();
        for (Object value : rows) {
            if (!(value instanceof Map<?, ?> row) || !(row.get("title") instanceof String title)
                    || !(row.get("id") instanceof String id)) continue;
            String content = Objects.toString(row.get("content_markdown"), "");
            int score = score(title, content, terms);
            scored.add(Map.of("id", id, "title", title, "content", content, "score", score));
        }
        if (scored.isEmpty()) return EMPTY;
        scored.sort(Comparator.<Map<String, Object>, Integer>comparing(m -> (Integer) m.get("score")).reversed()
                .thenComparing(m -> (String) m.get("title")));
        List<String> materials = new ArrayList<>();
        var citations = new ArrayList<Map<String, Object>>();
        for (var row : scored) {
            if (materials.size() >= MAX_RESOURCES) break;
            String title = (String) row.get("title");
            String content = (String) row.get("content");
            materials.add("课程资料《" + title + "》：" + excerpt(content, terms));
            citations.add(TutoringJson.map("resourceId", row.get("id"), "title", title));
        }
        return new Selection(List.copyOf(materials), List.copyOf(citations));
    }

    private static int score(String title, String content, List<String> terms) {
        int total = 0;
        for (String term : terms) total += 3 * count(title, term) + count(content, term);
        return total;
    }

    private static int count(String text, String term) {
        int occurrences = 0;
        for (int index = text.indexOf(term); index >= 0; index = text.indexOf(term, index + term.length())) occurrences++;
        return occurrences;
    }

    /** 取命中词附近的一段，避免把整篇讲义塞进上下文。 */
    static String excerpt(String content, List<String> terms) {
        if (content.length() <= MAX_EXCERPT) return content;
        int hit = -1;
        for (String term : terms) {
            int index = content.indexOf(term);
            if (index >= 0 && (hit < 0 || index < hit)) hit = index;
        }
        int start = hit < 0 ? 0 : Math.max(0, hit - CONTEXT_AROUND);
        if (start + MAX_EXCERPT > content.length()) start = content.length() - MAX_EXCERPT;
        return content.substring(start, start + MAX_EXCERPT);
    }

    /** 英文数字按词切分，中文按二元组切分；结果确定且可测。 */
    static List<String> terms(String query) {
        if (query == null || query.isBlank()) return List.of();
        var terms = new LinkedHashSet<String>();
        var ascii = new StringBuilder();
        var cjk = new StringBuilder();
        for (int index = 0; index < query.length(); index++) {
            char ch = query.charAt(index);
            if (isCjk(ch)) {
                if (!ascii.isEmpty()) { add(terms, ascii.toString()); ascii.setLength(0); }
                cjk.append(ch);
            } else if (Character.isLetterOrDigit(ch)) {
                if (!cjk.isEmpty()) { cjkToTerms(terms, cjk); cjk.setLength(0); }
                ascii.append(ch);
            } else {
                if (!ascii.isEmpty()) { add(terms, ascii.toString()); ascii.setLength(0); }
                if (!cjk.isEmpty()) { cjkToTerms(terms, cjk); cjk.setLength(0); }
            }
            if (terms.size() >= MAX_TERMS * 4) break;
        }
        if (!ascii.isEmpty()) add(terms, ascii.toString());
        if (!cjk.isEmpty()) cjkToTerms(terms, cjk);
        return terms.stream().limit(MAX_TERMS).toList();
    }

    private static void add(Set<String> terms, String token) {
        if (token.length() >= 2) terms.add(token.toLowerCase(Locale.ROOT));
    }

    private static void cjkToTerms(Set<String> terms, StringBuilder run) {
        if (run.length() == 1) { terms.add(run.toString()); return; }
        for (int index = 0; index + 1 < run.length(); index++) terms.add(run.substring(index, index + 2));
    }

    private static boolean isCjk(char ch) {
        return Character.UnicodeScript.of(ch) == Character.UnicodeScript.HAN;
    }
}
