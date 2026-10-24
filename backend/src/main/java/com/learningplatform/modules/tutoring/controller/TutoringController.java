package com.learningplatform.modules.tutoring.controller;
import java.util.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.Authentication;
import org.springframework.http.ResponseEntity;
import com.learningplatform.common.api.ApiResponse;
import com.learningplatform.common.web.RequestIdFilter;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.auth.model.SessionIdentity;
import com.learningplatform.modules.tutoring.service.TutoringService;
@RestController
@RequestMapping("/api/v1")
public class TutoringController {
 private final TutoringService service;public TutoringController(TutoringService service){this.service=service;}
 private UserDTO user(Authentication auth){return ((SessionIdentity)auth.getPrincipal()).user();}
 private ApiResponse<Object> response(Object data,HttpServletRequest req){return new ApiResponse<>(data,(String)req.getAttribute(RequestIdFilter.ATTRIBUTE_NAME));}
 @GetMapping("/teacher/assignments/{assignmentId}/ai-policy") public ApiResponse<Object> teacherPolicy(Authentication a,HttpServletRequest r,@PathVariable String assignmentId){return response(service.policy(user(a),assignmentId,true),r);}
 @PutMapping("/teacher/assignments/{assignmentId}/ai-policy") public ApiResponse<Object> updatePolicy(Authentication a,HttpServletRequest r,@PathVariable String assignmentId,@RequestBody Map<String,Object>b){return response(service.updatePolicy(user(a),assignmentId,b),r);}
 @GetMapping("/assignments/{assignmentId}/ai-policy") public ApiResponse<Object> policy(Authentication a,HttpServletRequest r,@PathVariable String assignmentId){return response(service.policy(user(a),assignmentId,false),r);}
 @GetMapping("/assignments/{assignmentId}/tutoring-sessions") public ApiResponse<Object> sessions(Authentication a,HttpServletRequest r,@PathVariable String assignmentId,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int pageSize){return response(service.sessions(user(a),assignmentId,page,pageSize),r);}
 @PostMapping("/tutoring/sessions") public ResponseEntity<ApiResponse<Object>> create(Authentication a,HttpServletRequest r,@RequestBody Map<String,Object>b){return ResponseEntity.status(201).body(response(service.create(user(a),b),r));}
 @GetMapping("/tutoring/sessions/{sessionId}/messages") public ApiResponse<Object> messages(Authentication a,HttpServletRequest r,@PathVariable String sessionId,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int pageSize){return response(service.messages(user(a),sessionId,page,pageSize),r);}
 @PostMapping("/tutoring/sessions/{sessionId}/messages") public ResponseEntity<ApiResponse<Object>> send(Authentication a,HttpServletRequest r,@PathVariable String sessionId,@RequestBody Map<String,Object>b){return ResponseEntity.status(202).body(response(service.send(user(a),sessionId,b),r));}
 @GetMapping("/tutoring/requests/{tutoringRequestId}") public ApiResponse<Object> request(Authentication a,HttpServletRequest r,@PathVariable String tutoringRequestId){return response(service.request(user(a),tutoringRequestId),r);}
}
