package com.learningplatform.modules.checks;

import java.util.Map;
import jakarta.servlet.http.HttpServletRequest;
import com.learningplatform.common.api.ApiResponse;
import com.learningplatform.common.web.RequestIdFilter;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.auth.model.SessionIdentity;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class CheckController {
    private final CheckService checks;

    public CheckController(CheckService checks) { this.checks = checks; }

    @GetMapping("/teacher/assignments/{assignmentId}/check-policy")
    public ApiResponse<CheckStore.Policy> policy(Authentication auth, HttpServletRequest request,
                                                @PathVariable String assignmentId) {
        return response(checks.policy(user(auth), assignmentId), request);
    }

    @PutMapping("/teacher/assignments/{assignmentId}/check-policy")
    public ApiResponse<CheckStore.Policy> savePolicy(Authentication auth, HttpServletRequest request,
                                                    @PathVariable String assignmentId, @RequestBody Map<String,Object> body) {
        return response(checks.savePolicy(user(auth), assignmentId, body), request);
    }

    @GetMapping("/assignments/{assignmentId}/checks")
    public ApiResponse<CheckService.Availability> availability(Authentication auth, HttpServletRequest request,
                                                             @PathVariable String assignmentId, @RequestParam int workspaceRevision) {
        return response(checks.availability(user(auth), assignmentId, workspaceRevision), request);
    }

    @PostMapping("/assignments/{assignmentId}/checks")
    public ResponseEntity<ApiResponse<CheckService.Accepted>> create(Authentication auth, HttpServletRequest request,
                                                                    @PathVariable String assignmentId, @RequestBody Map<String,Object> body) {
        return ResponseEntity.accepted().body(response(checks.create(user(auth), assignmentId, body), request));
    }

    @GetMapping("/checks/{checkId}")
    public ApiResponse<CheckStore.CheckView> get(Authentication auth, HttpServletRequest request, @PathVariable String checkId) {
        return response(checks.get(user(auth), checkId), request);
    }

    private static UserDTO user(Authentication auth) {
        return ((SessionIdentity) auth.getPrincipal()).user();
    }

    private static <T> ApiResponse<T> response(T data, HttpServletRequest request) {
        return new ApiResponse<>(data, RequestIdFilter.getRequestId(request));
    }
}
