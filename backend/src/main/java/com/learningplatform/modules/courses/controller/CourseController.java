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

    @GetMapping("/offerings/{offeringId}/chapters")
    public ApiResponse<ChapterListDTO> listChapters(Authentication a,HttpServletRequest req,@PathVariable String offeringId){CourseInput.uuid(offeringId);return response(service.listChapters(user(a),offeringId),req);}
    @GetMapping("/chapters/{chapterId}")
    public ApiResponse<ChapterDetailDTO> getChapter(Authentication a,HttpServletRequest req,@PathVariable String chapterId){CourseInput.uuid(chapterId);return response(service.getChapter(user(a),chapterId),req);}
    @GetMapping("/resources/{resourceId}")
    public ApiResponse<ResourceDTO> getResource(Authentication a,HttpServletRequest req,@PathVariable String resourceId){CourseInput.uuid(resourceId);return response(service.getResource(user(a),resourceId),req);}
    @PutMapping("/chapters/{chapterId}/progress")
    public ApiResponse<ChapterProgressDTO> updateChapterProgress(Authentication a,HttpServletRequest req,@PathVariable String chapterId,@RequestBody Map<String,Object>b){CourseInput.uuid(chapterId);return response(service.updateChapterProgress(user(a),chapterId,b,id(req)),req);}
    @PostMapping("/me/learning-position")
    public ApiResponse<LearningPositionDTO> recordLearningPosition(Authentication a,HttpServletRequest req,@RequestBody Map<String,Object>b){return response(service.recordLearningPosition(user(a),b,id(req)),req);}
    @GetMapping("/teacher/offerings/{offeringId}/chapters")
    public ApiResponse<TeacherChapterListDTO> listTeacherChapters(Authentication a,HttpServletRequest req,@PathVariable String offeringId){CourseInput.uuid(offeringId);return response(service.listTeacherChapters(user(a),offeringId),req);}
    @PostMapping("/teacher/offerings/{offeringId}/chapters")
    public ResponseEntity<ApiResponse<TeacherChapterSummaryDTO>> createChapter(Authentication a,HttpServletRequest req,@PathVariable String offeringId,@RequestBody Map<String,Object>b){CourseInput.uuid(offeringId);var x=service.createChapter(user(a),offeringId,b,id(req));return ResponseEntity.status(HttpStatus.CREATED).body(response(x,req));}
    @GetMapping("/teacher/chapters/{chapterId}")
    public ApiResponse<TeacherChapterDetailDTO> getTeacherChapter(Authentication a,HttpServletRequest req,@PathVariable String chapterId){CourseInput.uuid(chapterId);return response(service.getTeacherChapter(user(a),chapterId),req);}
    @PatchMapping("/teacher/chapters/{chapterId}")
    public ApiResponse<TeacherChapterSummaryDTO> patchChapter(Authentication a,HttpServletRequest req,@PathVariable String chapterId,@RequestBody Map<String,Object>b){CourseInput.uuid(chapterId);return response(service.patchChapter(user(a),chapterId,b,id(req)),req);}
    @PostMapping("/teacher/chapters/{chapterId}/publish")
    public ApiResponse<TeacherChapterSummaryDTO> publishChapter(Authentication a,HttpServletRequest req,@PathVariable String chapterId,@RequestBody Map<String,Object>b){CourseInput.uuid(chapterId);CourseInput.empty(b);return response(service.publishChapter(user(a),chapterId,id(req)),req);}
    @PostMapping("/teacher/offerings/{offeringId}/knowledge-points")
    public ResponseEntity<ApiResponse<KnowledgePointDTO>> createKnowledgePoint(Authentication a,HttpServletRequest req,@PathVariable String offeringId,@RequestBody Map<String,Object>b){CourseInput.uuid(offeringId);var x=service.createKnowledgePoint(user(a),offeringId,b,id(req));return ResponseEntity.status(HttpStatus.CREATED).body(response(x,req));}
    @GetMapping("/teacher/offerings/{offeringId}/knowledge-points")
    public ApiResponse<KnowledgePointListDTO> listKnowledgePoints(Authentication a,HttpServletRequest req,@PathVariable String offeringId){CourseInput.uuid(offeringId);return response(service.listKnowledgePoints(user(a),offeringId),req);}
    @PatchMapping("/teacher/knowledge-points/{knowledgePointId}")
    public ApiResponse<KnowledgePointDTO> patchKnowledgePoint(Authentication a,HttpServletRequest req,@PathVariable String knowledgePointId,@RequestBody Map<String,Object>b){CourseInput.uuid(knowledgePointId);return response(service.patchKnowledgePoint(user(a),knowledgePointId,b,id(req)),req);}
    @PostMapping("/teacher/chapters/{chapterId}/resources")
    public ResponseEntity<ApiResponse<ResourceDTO>> createResource(Authentication a,HttpServletRequest req,@PathVariable String chapterId,@RequestBody Map<String,Object>b){CourseInput.uuid(chapterId);var x=service.createResource(user(a),chapterId,b,id(req));return ResponseEntity.status(HttpStatus.CREATED).body(response(x,req));}
    @PatchMapping("/teacher/resources/{resourceId}")
    public ApiResponse<ResourceDTO> patchResource(Authentication a,HttpServletRequest req,@PathVariable String resourceId,@RequestBody Map<String,Object>b){CourseInput.uuid(resourceId);return response(service.patchResource(user(a),resourceId,b,id(req)),req);}
    @DeleteMapping("/teacher/resources/{resourceId}")
    public ApiResponse<ResourceArchiveDTO> archiveResource(Authentication a,HttpServletRequest req,@PathVariable String resourceId){CourseInput.uuid(resourceId);return response(service.archiveResource(user(a),resourceId,id(req)),req);}
    private void query(String termId,int page,int size) { CourseInput.page(page,size);if(termId!=null) CourseInput.uuid(termId); }
    private UserDTO user(Authentication auth) { return ((SessionIdentity)auth.getPrincipal()).user(); }
    private String id(HttpServletRequest req) { return RequestIdFilter.getRequestId(req); }
    private <T> ApiResponse<T> response(T data,HttpServletRequest req) { return new ApiResponse<>(data,id(req)); }
}

