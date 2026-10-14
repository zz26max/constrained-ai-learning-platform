package com.learningplatform.modules.courses.service;
import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.courses.mapper.CourseMapper;
import com.learningplatform.modules.courses.model.CourseRows;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
/** 平台角色与具体班级成员身份分别校验，不能凭 teacher 角色读取别人的班。 */
@Service
public class CourseAccess {
    private final CourseMapper mapper;
    public CourseAccess(CourseMapper mapper) { this.mapper=mapper; }
    public record Context(CourseRows.Offering offering,CourseRows.Member member) {}
    public Context requireReader(UserDTO user,String offeringId) {
        if(!user.roles().contains("student")&&!user.roles().contains("teacher")) throw forbidden();
        CourseInput.uuid(offeringId);
        CourseRows.Offering offering=mapper.findOffering(offeringId);
        CourseRows.Member member=mapper.findMember(offeringId,user.id());
        if(offering==null||member==null||!"active".equals(member.status())
                ||!user.roles().contains(member.role())) throw notFound();
        return new Context(offering,member);
    }
    public Context requireTeacher(UserDTO user,String offeringId,boolean write) {
        role(user,"teacher"); Context context=requireReader(user,offeringId);
        if(!"teacher".equals(context.member().role())) throw notFound();
        if(write) active(context.offering()); return context;
    }
    public Context requireStudent(UserDTO user,String offeringId,boolean write) {
        role(user,"student"); Context context=requireReader(user,offeringId);
        if(!"student".equals(context.member().role())) throw notFound();
        if(write) active(context.offering()); return context;
    }
    public static void role(UserDTO user,String role) { if(!user.roles().contains(role)) throw forbidden(); }
    public static void active(CourseRows.Offering offering) {
        if(!"active".equals(offering.status())) throw new BusinessException(HttpStatus.CONFLICT,"OFFERING_ARCHIVED","教学班已归档。");
    }
    public static BusinessException notFound() { return new BusinessException(HttpStatus.NOT_FOUND,"NOT_FOUND","请求的资源不存在。"); }
    public static BusinessException forbidden() { return new BusinessException(HttpStatus.FORBIDDEN,"FORBIDDEN","权限不足。"); }
}

