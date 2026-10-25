package com.learningplatform.modules.helprequests;
import java.util.Map;
import com.learningplatform.common.api.ApiResponse;
import com.learningplatform.common.web.RequestIdFilter;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.auth.model.SessionIdentity;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/v1")
public class HelpController {
 private final HelpService service;
 public HelpController(HelpService service){this.service=service;}
 @PostMapping("/me/help-requests") @ResponseStatus(HttpStatus.CREATED)
 public ApiResponse<?> create(Authentication a,HttpServletRequest r,@RequestBody Map<String,Object> body){return response(service.create(user(a),body),r);}
 @GetMapping("/me/help-requests")
 public ApiResponse<?> list(Authentication a,HttpServletRequest r,@RequestParam(required=false) String offeringId,@RequestParam(required=false) String status,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int pageSize){return response(service.list(user(a),offeringId,status,page,pageSize,false),r);}
 @GetMapping("/me/help-requests/{helpRequestId}")
 public ApiResponse<?> detail(Authentication a,HttpServletRequest r,@PathVariable String helpRequestId){return response(service.detail(user(a),helpRequestId,false),r);}
 @GetMapping("/teacher/offerings/{offeringId}/help-requests")
 public ApiResponse<?> teacherList(Authentication a,HttpServletRequest r,@PathVariable String offeringId,@RequestParam(required=false) String status,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int pageSize){return response(service.list(user(a),offeringId,status,page,pageSize,true),r);}
 @GetMapping("/teacher/help-requests/{helpRequestId}")
 public ApiResponse<?> teacherDetail(Authentication a,HttpServletRequest r,@PathVariable String helpRequestId){return response(service.detail(user(a),helpRequestId,true),r);}
 @PostMapping("/teacher/help-requests/{helpRequestId}/replies") @ResponseStatus(HttpStatus.CREATED)
 public ApiResponse<?> reply(Authentication a,HttpServletRequest r,@PathVariable String helpRequestId,@RequestBody Map<String,Object> body){return response(service.reply(user(a),helpRequestId,body),r);}
 @PutMapping("/teacher/help-requests/{helpRequestId}/status")
 public ApiResponse<?> close(Authentication a,HttpServletRequest r,@PathVariable String helpRequestId,@RequestBody Map<String,Object> body){return response(service.close(user(a),helpRequestId,body),r);}
 private static UserDTO user(Authentication a){return ((SessionIdentity)a.getPrincipal()).user();}
 private static ApiResponse<?> response(Object value,HttpServletRequest r){return new ApiResponse<>(value,RequestIdFilter.getRequestId(r));}
}
