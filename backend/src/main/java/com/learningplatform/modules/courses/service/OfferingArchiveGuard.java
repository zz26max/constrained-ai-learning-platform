package com.learningplatform.modules.courses.service;
import org.springframework.stereotype.Component;
/** 归档前的待批阅检查扩展点。 */
@Component
public class OfferingArchiveGuard {
    public void checkPendingReviews(String offeringId) {
        // P1-C 建立提交/评价表后，在这里查询当前且未发布评价的提交，
        // 若存在则抛出契约 ARCHIVE_PENDING_REVIEWS；P1-A 不建假表、不声称已检查不存在的提交。
    }
}

