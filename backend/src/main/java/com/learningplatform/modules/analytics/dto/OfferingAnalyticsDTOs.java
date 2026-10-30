package com.learningplatform.modules.analytics.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/** 契约 1.2.0：教师班级活动与知识点掌握聚合。 */
public final class OfferingAnalyticsDTOs {
    private OfferingAnalyticsDTOs() {}

    public record ActivityDayDTO(String date, int activeStudentCount, int chapterOpenedCount,
            int resourceOpenedCount, int editorOpenedCount, int previewOpenedCount, int workspaceSavedCount,
            int assignmentSubmittedCount, int helpRequestCreatedCount, int tutoringCompletedCount) {}

    public record ActivityTotalsDTO(int activeStudentCount, int chapterOpenedCount, int resourceOpenedCount,
            int editorOpenedCount, int previewOpenedCount, int workspaceSavedCount, int assignmentSubmittedCount,
            int helpRequestCreatedCount, int tutoringCompletedCount) {}

    public record OfferingActivityDTO(String offeringId, String from, String to, List<ActivityDayDTO> days,
            ActivityTotalsDTO totals) {}

    public record KnowledgeStateDistributionDTO(int basicallyMastered, int needsPractice, int learning,
            int insufficientEvidence) {}

    public record KnowledgeMasterySummaryDTO(int assessmentCount, KnowledgeStateDistributionDTO distribution,
            BigDecimal masteryRate) {}

    public record KnowledgeMasteryItemDTO(String knowledgePointId, String title, String chapterId, int studentCount,
            int assessedStudentCount, KnowledgeStateDistributionDTO distribution, BigDecimal masteryRate) {}

    public record OfferingKnowledgeMasteryDTO(String offeringId, String ruleVersion, Instant asOf, int studentCount,
            int assessedStudentCount, int knowledgePointCount, KnowledgeMasterySummaryDTO summary,
            List<KnowledgeMasteryItemDTO> items) {}
}
