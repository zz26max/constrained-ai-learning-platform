package com.learningplatform.modules.analytics;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import com.learningplatform.modules.analytics.mapper.KnowledgeMapper.Evidence;
import com.learningplatform.modules.analytics.service.KnowledgeService;
import static org.assertj.core.api.Assertions.assertThat;

class KnowledgeRuleTest {
    private Evidence e(String assignment,String result) {return new Evidence(assignment,"submission","feedback",assignment,"Task",result,"Teacher finding",Instant.EPOCH);}
    @Test void latestTeacherConclusionOverridesOlderPassesAndActivity() {
        assertThat(KnowledgeService.state(List.of(e("3","insufficient_evidence"),e("2","meets_expectation"),e("1","meets_expectation")),true)).isEqualTo("insufficient_evidence");
        assertThat(KnowledgeService.state(List.of(e("3","needs_practice"),e("2","meets_expectation"),e("1","meets_expectation")),true)).isEqualTo("needs_practice");
    }
    @Test void onePassNeedsAnotherAssignmentAndOnlyRealActivityCanMeanLearning() {
        assertThat(KnowledgeService.state(List.of(e("1","meets_expectation")),false)).isEqualTo("insufficient_evidence");
        assertThat(KnowledgeService.state(List.of(e("1","meets_expectation")),true)).isEqualTo("learning");
        assertThat(KnowledgeService.state(List.of(),false)).isEqualTo("insufficient_evidence");
        assertThat(KnowledgeService.state(List.of(),true)).isEqualTo("learning");
    }
    @Test void repeatedEvidenceFromOneAssignmentCannotCountTwice() {
        assertThat(KnowledgeService.state(List.of(e("1","meets_expectation"),e("1","meets_expectation")),false)).isEqualTo("insufficient_evidence");
        assertThat(KnowledgeService.state(List.of(e("2","meets_expectation"),e("1","meets_expectation")),false)).isEqualTo("basically_mastered");
    }
}
