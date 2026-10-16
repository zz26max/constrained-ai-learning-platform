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
/** P1-B/C/D 作业、工作区、评价、通知与聚合的 HTTP 适配层。 */
@RestController
@RequestMapping("/api/v1")
public class AssignmentController {
    private final AssignmentService service;
    private final com.learningplatform.modules.courses.service.DashboardService dashboardService;
    private final com.learningplatform.modules.courses.service.NoticeService noticeService;
    private final com.learningplatform.modules.courses.service.TeacherStatsService statsService;
    public AssignmentController(AssignmentService service,
            com.learningplatform.modules.courses.service.DashboardService dashboardService,
            com.learningplatform.modules.courses.service.NoticeService noticeService,
            com.learningplatform.modules.courses.service.TeacherStatsService statsService) {
        this.service=service;this.dashboardService=dashboardService;
        this.noticeService=noticeService;this.statsService=statsService;
    }
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
    public ApiResponse<Object> getAssignment(Authentication auth,HttpServletRequest req,
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
    public ApiResponse<Object> getSubmission(Authentication auth,HttpServletRequest req,
            @PathVariable String submissionId) {
        AssignmentInput.uuid(submissionId);return response(service.getSubmission(user(auth),submissionId),req);
    }
    @GetMapping("/teacher/offerings/{offeringId}/assignments")
    public ApiResponse<?> listTeacherAssignments(Authentication auth,HttpServletRequest req,
            @PathVariable String offeringId,@RequestParam(required=false) String publicationState,
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
            @PathVariable String assignmentId,@RequestParam(required=false) String feedbackStatus,
            @RequestParam(defaultValue="true") boolean latestOnly,@RequestParam(defaultValue="1") int page,
            @RequestParam(defaultValue="20") int pageSize) {
        AssignmentInput.uuid(assignmentId);AssignmentInput.page(page,pageSize);
        SubmissionListResponse result=service.listTeacherSubmissions(user(auth),assignmentId,feedbackStatus,latestOnly,page,pageSize);
        return response(Map.of("items",result.items(),"page",result.page(),"pageSize",result.pageSize(),
                "total",result.total()),req);
    }
    @PostMapping("/teacher/submissions/{submissionId}/feedback")
    public ResponseEntity<ApiResponse<TeacherFeedbackDTO>> saveFeedback(Authentication auth,HttpServletRequest req,
            @PathVariable String submissionId,@RequestBody Map<String,Object> body) {
        AssignmentInput.uuid(submissionId);
        FeedbackSaveResult result=service.saveFeedback(user(auth),submissionId,body,id(req));
        return ResponseEntity.status(result.created()?HttpStatus.CREATED:HttpStatus.OK)
                .body(response(result.feedback(),req));
    }
    @PostMapping("/teacher/submissions/{submissionId}/feedback/publish")
    public ApiResponse<TeacherFeedbackDTO> publishFeedback(Authentication auth,HttpServletRequest req,
            @PathVariable String submissionId,@RequestBody Map<String,Object> body) {
        AssignmentInput.uuid(submissionId);
        return response(service.publishFeedback(user(auth),submissionId,body,id(req)),req);
    }
    @GetMapping("/me/feedback/{feedbackId}")
    public ApiResponse<StudentFeedbackViewDTO> getFeedback(Authentication auth,HttpServletRequest req,
            @PathVariable String feedbackId) {
        AssignmentInput.uuid(feedbackId);
        return response(service.getFeedback(user(auth),feedbackId),req);
    }
    @GetMapping("/me/messages")
    public ApiResponse<?> listMessages(Authentication auth,HttpServletRequest req,
            @RequestParam(required=false) String offeringId,@RequestParam(required=false) String type,
            @RequestParam(defaultValue="all") String read,
            @RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int pageSize) {
        AssignmentInput.page(page,pageSize);
        NotificationListResponse result=service.listMessages(user(auth),offeringId,type,read,page,pageSize);
        return response(Map.of("items",result.items(),"page",result.page(),"pageSize",result.pageSize(),
                "total",result.total(),"summary",Map.of("unreadCount",result.unreadCount())),req);
    }
    @PutMapping("/me/messages/{messageId}/read")
    public ApiResponse<MessageReadDTO> readMessage(Authentication auth,HttpServletRequest req,
            @PathVariable String messageId,@RequestBody Map<String,Object> body) {
        AssignmentInput.uuid(messageId);AssignmentInput.empty(body);
        return response(service.readMessage(user(auth),messageId,id(req)),req);
    }
    // P1-D 学生仪表盘与聚合
    @GetMapping("/me/dashboard")
    public ApiResponse<DashboardDTO> getDashboard(Authentication auth,HttpServletRequest req,
            @RequestParam(required=false) String termId) {
        return response(dashboardService.getDashboard(user(auth),termId),req);
    }
    @GetMapping("/me/offerings/{offeringId}/learning-records")
    public ApiResponse<LearningRecordsDTO> getLearningRecords(Authentication auth,HttpServletRequest req,
            @PathVariable String offeringId) {
        AssignmentInput.uuid(offeringId);
        return response(dashboardService.getLearningRecords(user(auth),offeringId),req);
    }
    @PutMapping("/me/offerings/{offeringId}/messages/mark-read")
    public ApiResponse<MarkedReadDTO> markMessagesRead(Authentication auth,HttpServletRequest req,
            @PathVariable String offeringId,@RequestParam(required=false) String type,
            @RequestBody Map<String,Object> body) {
        AssignmentInput.uuid(offeringId);AssignmentInput.empty(body);
        return response(dashboardService.markMessagesRead(user(auth),offeringId,type),req);
    }
    // P1-D 公告系统
    @PostMapping("/teacher/offerings/{offeringId}/notices")
    public ResponseEntity<ApiResponse<NoticeDTO>> createNotice(Authentication auth,HttpServletRequest req,
            @PathVariable String offeringId,@RequestBody Map<String,Object> body) {
        AssignmentInput.uuid(offeringId);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(response(noticeService.createNotice(offeringId,user(auth),body,id(req)),req));
    }
    @GetMapping("/offerings/{offeringId}/notices")
    public ApiResponse<NoticePage> listNotices(Authentication auth,HttpServletRequest req,
            @PathVariable String offeringId,@RequestParam(defaultValue="1") int page,
            @RequestParam(defaultValue="20") int pageSize) {
        AssignmentInput.uuid(offeringId);AssignmentInput.page(page,pageSize);
        return response(noticeService.listNotices(offeringId,user(auth),page,pageSize),req);
    }
    @GetMapping("/notices/{noticeId}")
    public ApiResponse<NoticeDTO> getNotice(Authentication auth,HttpServletRequest req,
            @PathVariable String noticeId) {
        AssignmentInput.uuid(noticeId);
        return response(noticeService.getNotice(noticeId,user(auth)),req);
    }
    // P1-D 教师统计
    @GetMapping("/teacher/offerings/{offeringId}/stats")
    public ApiResponse<OfferingStatsDTO> getOfferingStats(Authentication auth,HttpServletRequest req,
            @PathVariable String offeringId) {
        AssignmentInput.uuid(offeringId);
        return response(statsService.getOfferingStats(offeringId,user(auth)),req);
    }
    @GetMapping("/teacher/assignments/{assignmentId}/stats")
    public ApiResponse<AssignmentStatsDTO> getAssignmentStats(Authentication auth,HttpServletRequest req,
            @PathVariable String assignmentId) {
        AssignmentInput.uuid(assignmentId);
        return response(statsService.getAssignmentStats(assignmentId,user(auth)),req);
    }
    @GetMapping("/teacher/offerings/{offeringId}/students/{studentId}/learning-records")
    public ApiResponse<TeacherLearningRecordsDTO> getStudentLearningRecords(Authentication auth,HttpServletRequest req,
            @PathVariable String offeringId,@PathVariable String studentId,
            @RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int pageSize) {
        AssignmentInput.uuid(offeringId);AssignmentInput.uuid(studentId);AssignmentInput.page(page,pageSize);
        return response(statsService.getStudentLearningRecords(offeringId,studentId,user(auth),page,pageSize),req);
    }
    private UserDTO user(Authentication auth) { return ((SessionIdentity)auth.getPrincipal()).user(); }
    private String id(HttpServletRequest req) { return RequestIdFilter.getRequestId(req); }
    private <T> ApiResponse<T> response(T data,HttpServletRequest req) { return new ApiResponse<>(data,id(req)); }
}
