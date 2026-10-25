package com.learningplatform.modules.analytics.controller;

import java.util.Map;
import com.learningplatform.common.api.ApiResponse;
import com.learningplatform.common.web.RequestIdFilter;
import com.learningplatform.modules.analytics.service.*;
import com.learningplatform.modules.auth.model.SessionIdentity;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class AnalyticsController {
    private final LearningEventService events;private final IssueTagService tags;
    private final com.learningplatform.modules.courses.service.DashboardService dashboard;
    public AnalyticsController(LearningEventService events,IssueTagService tags,com.learningplatform.modules.courses.service.DashboardService dashboard){this.events=events;this.tags=tags;this.dashboard=dashboard;}
    @GetMapping("/me/learning-records")
    public ApiResponse<?> records(Authentication auth,HttpServletRequest req,@RequestParam String offeringId,
            @RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int pageSize) {
        return new ApiResponse<>(dashboard.getLearningRecords(((SessionIdentity)auth.getPrincipal()).user(),offeringId,page,pageSize),RequestIdFilter.getRequestId(req));
    }
    @PostMapping("/me/learning-events")
    public ApiResponse<?> record(Authentication auth,HttpServletRequest req,@RequestBody Map<String,Object> body) {
        return new ApiResponse<>(events.record(((SessionIdentity)auth.getPrincipal()).user(),body),RequestIdFilter.getRequestId(req));
    }
    @GetMapping("/offerings/{offeringId}/issue-tags")
    public ApiResponse<?> tags(Authentication auth,HttpServletRequest req,@PathVariable String offeringId) {
        return new ApiResponse<>(tags.get(((SessionIdentity)auth.getPrincipal()).user(),offeringId),RequestIdFilter.getRequestId(req));
    }
}
