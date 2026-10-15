package com.learningplatform.modules.courses.controller;
import java.util.Map;
import com.learningplatform.common.api.ApiResponse;
import com.learningplatform.common.web.RequestIdFilter;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.auth.model.SessionIdentity;
import com.learningplatform.modules.courses.dto.AssignmentDTOs.*;
import com.learningplatform.modules.courses.service.AssignmentInput;
import com.learningplatform.modules.courses.service.AssignmentService;
import com.learningplatform.modules.courses.service.AssignmentService.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
/** P1-B 作业与工作区的 HTTP 适配层。 */
@RestController
@RequestMapping("/api/v1")
public class AssignmentController {
    private final AssignmentService service;
    public AssignmentController(AssignmentService service) { this.service=service; }
    @GetMapping("/me/assignments")
    public ApiResponse<?> listMyAssignments(Authentication auth,HttpServletRequest req,
            @RequestParam(required=false) String offeringId,@RequestParam(required=false) String termId,
            @RequestParam(defaultValue="all") String filter,@RequestParam(defaultValue="1") int page,
            @RequestParam(defaultValue="20") int pageSize) {
        AssignmentInput.page(page,pageSize);
        AssignmentListResponse result=service.listMyAssignments(user(auth),offeringId,termId,filter,page,pageSize);
        return response(Map.of("items",result.items(),"page",result.page(),"pageSize",result.pageSize(),
                "total",result.total(),"summary",result.summary()),req);
    }
    @GetMapping("/assignments/{assignmentId}")
    public ApiResponse<AssignmentDetailDTO> getAssignment(Authentication auth,HttpServletRequest req,
            @PathVariable String assignmentId) {
        AssignmentInput.uuid(assignmentId);return response(service.getAssignment(user(auth),assignmentId),req);
    }
    @GetMapping("/assignments/{assignmentId}/workspace")
    public ApiResponse<WorkspaceDTO> getWorkspace(Authentication auth,HttpServletRequest req,
            @PathVariable String assignmentId) {
        AssignmentInput.uuid(assignmentId);return response(service.getWorkspace(user(auth),assignmentId),req);
    }
    @PutMapping("/assignments/{assignmentId}/workspace")
    public ApiResponse<WorkspaceDTO> saveWorkspace(Authentication auth,HttpServletRequest req,
            @PathVariable String assignmentId,@RequestBody Map<String,Object> body) {
        AssignmentInput.uuid(assignmentId);return response(service.saveWorkspace(user(auth),assignmentId,body,id(req)),req);
    }
    @PostMapping("/assignments/{assignmentId}/submissions")
    public ResponseEntity<ApiResponse<?>> submitAssignment(Authentication auth,HttpServletRequest req,
            @PathVariable String assignmentId,@RequestBody Map<String,Object> body) {
        AssignmentInput.uuid(assignmentId);SubmissionCreatedResponse result=service.submitAssignment(user(auth),assignmentId,body,id(req));
        return ResponseEntity.status(result.created()?HttpStatus.CREATED:HttpStatus.OK)
                .body(response(result.submission(),req));
    }
    @GetMapping("/assignments/{assignmentId}/submissions")
    public ApiResponse<?> listMySubmissions(Authentication auth,HttpServletRequest req,
            @PathVariable String assignmentId,@RequestParam(defaultValue="1") int page,
            @RequestParam(defaultValue="20") int pageSize) {
        AssignmentInput.uuid(assignmentId);AssignmentInput.page(page,pageSize);
        SubmissionListResponse result=service.listMySubmissions(user(auth),assignmentId,page,pageSize);
        return response(Map.of("items",result.items(),"page",result.page(),"pageSize",result.pageSize(),
                "total",result.total()),req);
    }
    @GetMapping("/submissions/{submissionId}")
    public ApiResponse<SubmissionDetailDTO> getSubmission(Authentication auth,HttpServletRequest req,
            @PathVariable String submissionId) {
        AssignmentInput.uuid(submissionId);return response(service.getSubmission(user(auth),submissionId),req);
    }
    @GetMapping("/teacher/offerings/{offeringId}/assignments")
    public ApiResponse<?> listTeacherAssignments(Authentication auth,HttpServletRequest req,
            @PathVariable String offeringId,@RequestParam(defaultValue="all") String publicationState,
            @RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int pageSize) {
        AssignmentInput.uuid(offeringId);AssignmentInput.page(page,pageSize);
        AssignmentListResponse result=service.listTeacherAssignments(user(auth),offeringId,publicationState,page,pageSize);
        return response(Map.of("items",result.items(),"page",result.page(),"pageSize",result.pageSize(),
                "total",result.total()),req);
    }
    @PostMapping("/teacher/offerings/{offeringId}/assignments")
    public ResponseEntity<ApiResponse<TeacherAssignmentDTO>> createAssignment(Authentication auth,
            HttpServletRequest req,@PathVariable String offeringId,@RequestBody Map<String,Object> body) {
        AssignmentInput.uuid(offeringId);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(response(service.createAssignment(user(auth),offeringId,body,id(req)),req));
    }
    @GetMapping("/teacher/assignments/{assignmentId}")
    public ApiResponse<TeacherAssignmentDTO> getTeacherAssignment(Authentication auth,HttpServletRequest req,
            @PathVariable String assignmentId) {
        AssignmentInput.uuid(assignmentId);return response(service.getTeacherAssignment(user(auth),assignmentId),req);
    }
    @PatchMapping("/teacher/assignments/{assignmentId}")
    public ApiResponse<TeacherAssignmentDTO> patchAssignment(Authentication auth,HttpServletRequest req,
            @PathVariable String assignmentId,@RequestBody Map<String,Object> body) {
        AssignmentInput.uuid(assignmentId);return response(service.patchAssignment(user(auth),assignmentId,body,id(req)),req);
    }
    @PostMapping("/teacher/assignments/{assignmentId}/publish")
    public ApiResponse<TeacherAssignmentDTO> publishAssignment(Authentication auth,HttpServletRequest req,
            @PathVariable String assignmentId,@RequestBody Map<String,Object> body) {
        AssignmentInput.uuid(assignmentId);AssignmentInput.empty(body);
        return response(service.publishAssignment(user(auth),assignmentId,id(req)),req);
    }
    @PostMapping("/teacher/assignments/{assignmentId}/archive")
    public ApiResponse<TeacherAssignmentDTO> archiveAssignment(Authentication auth,HttpServletRequest req,
            @PathVariable String assignmentId,@RequestBody Map<String,Object> body) {
        AssignmentInput.uuid(assignmentId);AssignmentInput.empty(body);
        return response(service.archiveAssignment(user(auth),assignmentId,id(req)),req);
    }
    @GetMapping("/teacher/assignments/{assignmentId}/submissions")
    public ApiResponse<?> listTeacherSubmissions(Authentication auth,HttpServletRequest req,
            @PathVariable String assignmentId,@RequestParam(defaultValue="1") int page,
            @RequestParam(defaultValue="20") int pageSize) {
        AssignmentInput.uuid(assignmentId);AssignmentInput.page(page,pageSize);
        SubmissionListResponse result=service.listTeacherSubmissions(user(auth),assignmentId,page,pageSize);
        return response(Map.of("items",result.items(),"page",result.page(),"pageSize",result.pageSize(),
                "total",result.total()),req);
    }
    private UserDTO user(Authentication auth) { return ((SessionIdentity)auth.getPrincipal()).user(); }
    private String id(HttpServletRequest req) { return RequestIdFilter.getRequestId(req); }
    private <T> ApiResponse<T> response(T data,HttpServletRequest req) { return new ApiResponse<>(data,id(req)); }
}
