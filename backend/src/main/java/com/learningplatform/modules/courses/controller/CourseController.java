package com.learningplatform.modules.courses.controller;
import java.util.List;
import java.util.Map;
import com.learningplatform.common.api.ApiResponse;
import com.learningplatform.common.web.RequestIdFilter;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.auth.model.SessionIdentity;
import com.learningplatform.modules.courses.dto.CourseDTOs.*;
import com.learningplatform.modules.courses.service.CourseInput;
import com.learningplatform.modules.courses.service.CourseService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

/** HTTP 适配：基本输入校验、状态码和信封；事务与归属在 Service 中。 */
@RestController
@RequestMapping("/api/v1")
public class CourseController {
    private final CourseService service;
    public CourseController(CourseService service) { this.service=service; }
    @GetMapping("/teacher/courses")
    public ApiResponse<Page<BaseCourseDTO>> listBaseCourses(Authentication auth,HttpServletRequest req,
            @RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int pageSize) {
        CourseInput.page(page,pageSize);return response(service.listBaseCourses(user(auth),page,pageSize),req);
    }
    @GetMapping("/teacher/offerings")
    public ApiResponse<Page<OfferingDTO>> listTeacherOfferings(Authentication auth,HttpServletRequest req,
            @RequestParam(required=false) String termId,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int pageSize) {
        query(termId,page,pageSize);return response(service.listTeacherOfferings(user(auth),termId,page,pageSize),req);
    }
    @PostMapping("/teacher/offerings")
    public ResponseEntity<ApiResponse<OfferingDTO>> createOffering(Authentication auth,HttpServletRequest req,
            @RequestBody Map<String,Object> body) {
        CourseService.validateOffering(body);
        return ResponseEntity.status(HttpStatus.CREATED).body(response(service.createOffering(user(auth),body,id(req)),req));
    }
    @GetMapping("/offerings/{offeringId}")
    public ApiResponse<OfferingDTO> getOffering(Authentication auth,HttpServletRequest req,@PathVariable String offeringId) {
        CourseInput.uuid(offeringId);return response(service.getOffering(user(auth),offeringId),req);
    }
    @PostMapping("/teacher/offerings/{offeringId}/archive")
    public ApiResponse<OfferingDTO> archiveOffering(Authentication auth,HttpServletRequest req,@PathVariable String offeringId,
            @RequestBody Map<String,Object> body) {
        CourseInput.uuid(offeringId);CourseInput.empty(body);return response(service.archiveOffering(user(auth),offeringId,id(req)),req);
    }
    @GetMapping("/teacher/offerings/{offeringId}/members")
    public ApiResponse<Page<MemberDTO>> listMembers(Authentication auth,HttpServletRequest req,@PathVariable String offeringId,
            @RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int pageSize) {
        CourseInput.uuid(offeringId);CourseInput.page(page,pageSize);return response(service.listMembers(user(auth),offeringId,page,pageSize),req);
    }
    @GetMapping("/me/courses")
    public ApiResponse<Page<CourseSummaryDTO>> listMyCourses(Authentication auth,HttpServletRequest req,
            @RequestParam(required=false) String termId,@RequestParam(defaultValue="active") String status,
            @RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int pageSize) {
        query(termId,page,pageSize);if(!List.of("active","archived","all").contains(status)) throw CourseInput.invalid();
        return response(service.listMyCourses(user(auth),termId,status,page,pageSize),req);
    }
    @PostMapping("/teacher/offerings/{offeringId}/invites")
    public ResponseEntity<ApiResponse<InviteCreatedDTO>> createInvite(Authentication auth,HttpServletRequest req,@PathVariable String offeringId,
            @RequestBody Map<String,Object> body) {
        CourseInput.uuid(offeringId);CourseService.validateInvite(body);
        return ResponseEntity.status(HttpStatus.CREATED).body(response(service.createInvite(user(auth),offeringId,body,id(req)),req));
    }
    @GetMapping("/teacher/offerings/{offeringId}/invites")
    public ApiResponse<Page<InviteDTO>> listInvites(Authentication auth,HttpServletRequest req,@PathVariable String offeringId,
            @RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int pageSize) {
        CourseInput.uuid(offeringId);CourseInput.page(page,pageSize);return response(service.listInvites(user(auth),offeringId,page,pageSize),req);
    }
    @PostMapping("/teacher/invites/{inviteId}/revoke")
    public ApiResponse<InviteRevokedDTO> revokeInvite(Authentication auth,HttpServletRequest req,@PathVariable String inviteId,
            @RequestBody Map<String,Object> body) {
        CourseInput.uuid(inviteId);CourseInput.empty(body);return response(service.revokeInvite(user(auth),inviteId,id(req)),req);
    }
    @PostMapping("/me/enrollments")
    public ResponseEntity<ApiResponse<EnrollmentDTO>> enroll(Authentication auth,HttpServletRequest req,@RequestBody Map<String,Object> body) {
        CourseService.validateEnrollment(body);EnrollmentDTO result=service.enroll(user(auth),body,id(req));
        return ResponseEntity.status(result.created()?HttpStatus.CREATED:HttpStatus.OK).body(response(result,req));
    }
    private void query(String termId,int page,int size) { CourseInput.page(page,size);if(termId!=null) CourseInput.uuid(termId); }
    private UserDTO user(Authentication auth) { return ((SessionIdentity)auth.getPrincipal()).user(); }
    private String id(HttpServletRequest req) { return RequestIdFilter.getRequestId(req); }
    private <T> ApiResponse<T> response(T data,HttpServletRequest req) { return new ApiResponse<>(data,id(req)); }
}

