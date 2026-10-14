package com.learningplatform.modules.courses.service;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import com.learningplatform.common.audit.AuditService;
import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.courses.dto.CourseDTOs.*;
import com.learningplatform.modules.courses.mapper.CourseMapper;
import com.learningplatform.modules.courses.model.CourseRows.*;
import com.learningplatform.modules.courses.security.InviteCodeCodec;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/** 教学班与邀请的事务入口；认证会话已在过滤链中完成，不混入教学事务。 */
@Service
public class CourseService {
    private final CourseMapper mapper;
    private final CourseAccess access;
    private final CourseLearningQuery learning;
    private final InviteCodeCodec codes;
    private final OfferingArchiveGuard archiveGuard;
    private final AuditService audit;
    private final Clock clock;
    public CourseService(CourseMapper mapper,CourseAccess access,CourseLearningQuery learning,InviteCodeCodec codes,
            OfferingArchiveGuard archiveGuard,AuditService audit,Clock clock) {
        this.mapper=mapper;this.access=access;this.learning=learning;this.codes=codes;
        this.archiveGuard=archiveGuard;this.audit=audit;this.clock=clock;
    }
    public Page<BaseCourseDTO> listBaseCourses(UserDTO user,int page,int pageSize) {
        CourseAccess.role(user,"teacher");CourseInput.page(page,pageSize);
        return new Page<>(mapper.baseCourses(offset(page,pageSize),pageSize),page,pageSize,mapper.countBaseCourses());
    }
    public Page<OfferingDTO> listTeacherOfferings(UserDTO user,String termId,int page,int pageSize) {
        CourseAccess.role(user,"teacher");CourseInput.page(page,pageSize);
        String term=term(termId);
        if(term==null) return new Page<>(List.of(),page,pageSize,0);
        return new Page<>(mapper.offerings(user.id(),"teacher",term,"all",offset(page,pageSize),pageSize)
                .stream().map(this::view).toList(),page,pageSize,mapper.countOfferings(user.id(),"teacher",term,"all"));
    }
    @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public OfferingDTO createOffering(UserDTO user,Map<String,Object> body,String requestId) {
        CourseAccess.role(user,"teacher");validateOffering(body);
        String courseId=CourseInput.uuid(body,"courseId"),termId=CourseInput.uuid(body,"termId");
        if(mapper.activeCourse(courseId)==null||mapper.termExists(termId)==0) throw CourseAccess.notFound();
        Instant now=now();String id=UUID.randomUUID().toString();
        mapper.insertOffering(id,courseId,termId,CourseInput.text(body,"title",200),
                CourseInput.text(body,"groupName",200),CourseInput.text(body,"progressUnit",20),user.id(),now);
        mapper.insertMember(UUID.randomUUID().toString(),id,user.id(),"teacher",now);
        audit.record(user.id(),"OFFERING_CREATED","offering",id,Map.of(),requestId);
        return view(mapper.findOffering(id));
    }
    public OfferingDTO getOffering(UserDTO user,String offeringId) {
        return view(access.requireReader(user,offeringId).offering());
    }
    @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public OfferingDTO archiveOffering(UserDTO user,String offeringId,String requestId) {
        Offering offering=access.requireTeacher(user,offeringId,false).offering();
        if("active".equals(offering.status())) {
            archiveGuard.checkPendingReviews(offeringId);
            if(mapper.archive(offeringId,now())==1)
                audit.record(user.id(),"OFFERING_ARCHIVED","offering",offeringId,Map.of(),requestId);
        }
        return view(mapper.findOffering(offeringId));
    }
    public Page<MemberDTO> listMembers(UserDTO user,String offeringId,int page,int pageSize) {
        access.requireTeacher(user,offeringId,false);CourseInput.page(page,pageSize);
        return new Page<>(mapper.members(offeringId,offset(page,pageSize),pageSize),page,pageSize,mapper.countMembers(offeringId));
    }
    public Page<CourseSummaryDTO> listMyCourses(UserDTO user,String termId,String status,int page,int pageSize) {
        CourseAccess.role(user,"student");CourseInput.page(page,pageSize);
        if(!List.of("active","archived","all").contains(status)) throw CourseInput.invalid();
        String term=term(termId);
        if(term==null) return new Page<>(List.of(),page,pageSize,0);
        Instant now=now();
        List<CourseSummaryDTO> items=mapper.offerings(user.id(),"student",term,status,offset(page,pageSize),pageSize).stream().map(o->{
            Member m=mapper.findMember(o.id(),user.id());
            // 作业待办和反馈通知在 P1-B/C 接入；本包不查询不存在的表或制造作品记录。
            return new CourseSummaryDTO(o.id(),o.courseId(),o.title(),o.mark(),o.groupName(),o.termId(),o.termLabel(),
                    o.status(),mapper.teachers(o.id()),learning.currentChapter(o.id(),m.id(),m.lastChapterId()),
                    learning.progress(o.id(),m.id(),o.progressUnit(),now),m.lastStudiedAt(),0,0);
        }).toList();
        return new Page<>(items,page,pageSize,mapper.countOfferings(user.id(),"student",term,status));
    }
    @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public InviteCreatedDTO createInvite(UserDTO user,String offeringId,Map<String,Object> body,String requestId) {
        access.requireTeacher(user,offeringId,true);validateInvite(body);
        Instant now=now(),expires=CourseInput.timestamp(body,"expiresAt");
        if(!expires.isAfter(now)) throw CourseInput.invalid();
        String id=UUID.randomUUID().toString(),code=codes.generate();Integer max=CourseInput.optionalPositive(body,"maxUses");
        mapper.insertInvite(id,offeringId,codes.digest(code),expires,max,user.id(),now);
        audit.record(user.id(),"INVITE_CREATED","invite",id,Map.of(),requestId);
        return new InviteCreatedDTO(id,expires,max,0,null,now,code);
    }
    public Page<InviteDTO> listInvites(UserDTO user,String offeringId,int page,int pageSize) {
        access.requireTeacher(user,offeringId,false);CourseInput.page(page,pageSize);
        return new Page<>(mapper.invites(offeringId,offset(page,pageSize),pageSize).stream().map(this::inviteView).toList(),
                page,pageSize,mapper.countInvites(offeringId));
    }
    @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public InviteRevokedDTO revokeInvite(UserDTO user,String inviteId,String requestId) {
        CourseAccess.role(user,"teacher");CourseInput.uuid(inviteId);
        Invite invite=mapper.invite(inviteId);if(invite==null) throw CourseAccess.notFound();
        access.requireTeacher(user,invite.offeringId(),true);
        if(mapper.revokeInvite(inviteId,now())==1)
            audit.record(user.id(),"INVITE_REVOKED","invite",inviteId,Map.of(),requestId);
        Invite updated=mapper.invite(inviteId);return new InviteRevokedDTO(updated.id(),updated.revokedAt());
    }
    @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public EnrollmentDTO enroll(UserDTO user,Map<String,Object> body,String requestId) {
        CourseAccess.role(user,"student");validateEnrollment(body);Instant now=now();
        Invite invite=mapper.inviteByDigest(codes.digest(CourseInput.text(body,"inviteCode",128)));
        if(invite==null||invite.revokedAt()!=null||!invite.expiresAt().isAfter(now)) throw invalidInvite();
        Offering offering=mapper.findOffering(invite.offeringId());
        if(offering==null) throw invalidInvite();
        CourseAccess.active(offering);
        Member existing=mapper.findMember(offering.id(),user.id());
        if(existing!=null) return existingEnrollment(existing);
        try { mapper.insertMember(UUID.randomUUID().toString(),offering.id(),user.id(),"student",now); }
        catch(DuplicateKeyException exception) {
            // 仅成员自然唯一键的 1062 可解释为重复加入；其他数据错误保持服务端故障。
            if(!isMemberDuplicate(exception)) throw exception;
            Member concurrent=mapper.findMember(offering.id(),user.id());
            if(concurrent==null) throw exception;
            return existingEnrollment(concurrent);
        }
        // 新成员和名额消费同事务；条件更新失败将刚插入的成员一起回滚。
        if(mapper.consumeInvite(invite.id(),now)!=1) throw invalidInvite();
        audit.record(user.id(),"OFFERING_ENROLLED","offering",offering.id(),Map.of(),requestId);
        return new EnrollmentDTO(offering.id(),now,true);
    }
    private EnrollmentDTO existingEnrollment(Member member) {
        if(!"student".equals(member.role())) throw CourseAccess.forbidden();
        if(!"active".equals(member.status())) throw invalidInvite();
        return new EnrollmentDTO(member.offeringId(),member.joinedAt(),false);
    }
    private boolean isMemberDuplicate(DuplicateKeyException exception) {
        Throwable current=exception;
        while(current!=null) {
            if(current instanceof java.sql.SQLException sql&&sql.getErrorCode()==1062
                    &&sql.getMessage()!=null&&sql.getMessage().contains("uq_offering_members_offering_user")) return true;
            current=current.getCause();
        }
        return false;
    }
    public static void validateOffering(Map<String,Object> body) {
        CourseInput.fields(body,"courseId","title","groupName","termId","progressUnit");
        CourseInput.uuid(body,"courseId");CourseInput.uuid(body,"termId");
        CourseInput.text(body,"title",200);CourseInput.text(body,"groupName",200);
        if(!List.of("chapter","assignment").contains(CourseInput.text(body,"progressUnit",20))) throw CourseInput.invalid();
    }
    public static void validateInvite(Map<String,Object> body) {
        CourseInput.fields(body,"expiresAt","maxUses");CourseInput.timestamp(body,"expiresAt");CourseInput.optionalPositive(body,"maxUses");
    }
    public static void validateEnrollment(Map<String,Object> body) {
        CourseInput.fields(body,"inviteCode");CourseInput.text(body,"inviteCode",128);
    }
    private String term(String id) {
        if(id==null) return mapper.currentTermId();
        CourseInput.uuid(id);if(mapper.termExists(id)==0) throw CourseInput.invalid();return id;
    }
    private OfferingDTO view(Offering o) { return new OfferingDTO(o.id(),o.courseId(),o.title(),o.mark(),o.groupName(),
            o.termId(),o.termLabel(),o.status(),o.progressUnit(),mapper.teachers(o.id())); }
    private InviteDTO inviteView(Invite i) { return new InviteDTO(i.id(),i.expiresAt(),i.maxUses(),i.usedCount(),i.revokedAt(),i.createdAt()); }
    private long offset(int page,int size) { return (long)(page-1)*size; }
    private Instant now() { return clock.instant().truncatedTo(ChronoUnit.MICROS); }
    private BusinessException invalidInvite() { return new BusinessException(HttpStatus.BAD_REQUEST,"INVALID_INVITE_CODE","邀请码不可用。"); }
}

