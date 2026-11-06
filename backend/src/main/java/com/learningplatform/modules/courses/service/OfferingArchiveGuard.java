package com.learningplatform.modules.courses.service;

import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.courses.mapper.AssignmentMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/** Called while holding the offering lifecycle lock in the archive transaction. */
@Component
public class OfferingArchiveGuard {
    private final AssignmentMapper assignments;

    public OfferingArchiveGuard(AssignmentMapper assignments) {
        this.assignments = assignments;
    }

    public void checkPendingReviews(String offeringId) {
        if (assignments.countOfferingPendingReviews(offeringId) > 0) {
            throw new BusinessException(HttpStatus.CONFLICT, "ARCHIVE_PENDING_REVIEWS",
                    "教学班仍有待批阅提交，暂不能归档。");
        }
    }
}
