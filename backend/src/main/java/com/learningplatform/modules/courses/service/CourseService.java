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
import com.learningplatform.modules.courses.model.CourseRows;
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
        if(mapper.activeCourse(courseId)==null) throw CourseAccess.notFound();
        if(mapper.termExists(termId)==0) throw CourseInput.invalid();
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

    public ChapterListDTO listChapters(UserDTO u, String oid) {
        var x = access.requireReader(u, oid);
        return new ChapterListDTO(oid, mapper.chapters(x.offering().id(), true).stream()
                .map(c -> summary(c, x.member().id())).toList());
    }

    public ChapterDetailDTO getChapter(UserDTO u, String id) {
        var c = chapterOr404(id);
        access.requireReader(u, c.offeringId());
        if (!"published".equals(c.status())) throw CourseAccess.notFound();
        return detail(c, u);
    }

    public ResourceDTO getResource(UserDTO u, String id) {
        var r = mapper.resource(CourseInput.uuid(id));
        if (r == null) throw CourseAccess.notFound();
        access.requireReader(u, r.offeringId());
        var c = mapper.chapter(r.chapterId());
        if (c == null || !"published".equals(c.status()) || !"active".equals(r.status())) {
            throw CourseAccess.notFound();
        }
        return resourceView(r);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED, rollbackFor = Exception.class)
    public ChapterProgressDTO updateChapterProgress(UserDTO u, String id, Map<String, Object> b, String req) {
        CourseInput.fields(b, "status");
        String st = CourseInput.text(b, "status", 20);
        if (!List.of("in_progress", "completed").contains(st)) throw CourseInput.invalid();
        var c = chapterOr404(id);
        var x = access.requireStudent(u, c.offeringId(), true);
        if (!"published".equals(c.status())) throw CourseAccess.notFound();
        Instant n = now();
        var old = mapper.chapterProgress(x.member().id(), c.id());
        if (old == null) {
            try {
                mapper.insertProgress(UUID.randomUUID().toString(), c.offeringId(), x.member().id(), c.id(), st,
                        "completed".equals(st) ? n : null, n);
            } catch (DuplicateKeyException e) {
                old = mapper.chapterProgress(x.member().id(), c.id());
                mapper.updateProgress(x.member().id(), c.id(), st, "completed".equals(st) ? n : null, n);
            }
        } else {
            mapper.updateProgress(x.member().id(), c.id(), st, "completed".equals(st) ? n : null, n);
        }
        var p = mapper.chapterProgress(x.member().id(), c.id());
        audit.record(u.id(), "CHAPTER_PROGRESS_UPDATED", "chapter", c.id(), Map.of("status", p.status()), req);
        return new ChapterProgressDTO(c.id(), progressView(p),
                learning.progress(c.offeringId(), x.member().id(), x.offering().progressUnit(), n));
    }

    @Transactional(isolation = Isolation.READ_COMMITTED, rollbackFor = Exception.class)
    public LearningPositionDTO recordLearningPosition(UserDTO u, Map<String, Object> b, String req) {
        CourseInput.fields(b, "offeringId", "chapterId", "assignmentId");
        String oid = CourseInput.uuid(b, "offeringId");
        if ((b.containsKey("chapterId") && b.get("chapterId") == null)
                || (b.containsKey("assignmentId") && b.get("assignmentId") == null)) {
            throw CourseInput.invalid();
        }
        boolean hc = b.containsKey("chapterId");
        boolean ha = b.containsKey("assignmentId");
        if (hc == ha) throw CourseInput.invalid();
        var x = access.requireStudent(u, oid, true);
        if (ha) throw CourseAccess.notFound();
        String cid = CourseInput.uuid(String.valueOf(b.get("chapterId")));
        var c = chapterOr404(cid);
        if (!oid.equals(c.offeringId()) || !"published".equals(c.status())) throw CourseAccess.notFound();
        Instant n = now();
        if (mapper.chapterProgress(x.member().id(), cid) == null) {
            try {
                mapper.insertProgress(UUID.randomUUID().toString(), oid, x.member().id(), cid, "in_progress", null, n);
            } catch (DuplicateKeyException e) {
                mapper.touchProgress(x.member().id(), cid, n);
            }
        } else {
            mapper.touchProgress(x.member().id(), cid, n);
        }
        mapper.updateLearningPosition(oid, u.id(), cid, n);
        audit.record(u.id(), "LEARNING_POSITION_RECORDED", "chapter", cid, Map.of(), req);
        return new LearningPositionDTO(oid, cid, n);
    }

    public TeacherChapterListDTO listTeacherChapters(UserDTO u, String oid) {
        var x = access.requireTeacher(u, oid, false);
        return new TeacherChapterListDTO(oid, mapper.chapters(x.offering().id(), false).stream()
                .map(this::teacherSummary).toList());
    }

    @Transactional(isolation = Isolation.READ_COMMITTED, rollbackFor = Exception.class)
    public TeacherChapterSummaryDTO createChapter(UserDTO u, String oid, Map<String, Object> b, String req) {
        access.requireTeacher(u, oid, true);
        validateChapterWrite(b);
        int no = integer(b, "number");
        ensureChapterPositionFree(oid, no, null);
        Instant n = now();
        String id = UUID.randomUUID().toString();
        try {
            mapper.insertChapter(id, oid, no, string(b, "title", 200), textAllowEmpty(b, "summary", 8000), bool(b, "isRequired"), n);
        } catch (DuplicateKeyException exception) {
            if (!isChapterPositionDuplicate(exception)) throw exception;
            throw CourseInput.invalid();
        }
        audit.record(u.id(), "CHAPTER_CREATED", "chapter", id, Map.of(), req);
        return teacherSummary(mapper.chapter(id));
    }

    public TeacherChapterDetailDTO getTeacherChapter(UserDTO u, String id) {
        var c = chapterOr404(id);
        access.requireTeacher(u, c.offeringId(), false);
        return teacherDetail(c);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED, rollbackFor = Exception.class)
    public TeacherChapterSummaryDTO patchChapter(UserDTO u, String id, Map<String, Object> b, String req) {
        var c = chapterOr404(id);
        access.requireTeacher(u, c.offeringId(), true);
        validatePatch(b, "number", "title", "summary", "isRequired");
        if ("archived".equals(c.status())) {
            throw new BusinessException(HttpStatus.CONFLICT, "CHAPTER_ARCHIVED", "归档章节拒绝继续教学写入。");
        }
        int no = b.containsKey("number") ? integer(b, "number") : c.position();
        String t = b.containsKey("title") ? string(b, "title", 200) : c.title();
        String s = b.containsKey("summary") ? textAllowEmpty(b, "summary", 8000) : c.summary();
        boolean ir = b.containsKey("isRequired") ? bool(b, "isRequired") : c.isRequired();
        if ("published".equals(c.status())
                && ((b.containsKey("number") && no != c.position())
                        || (b.containsKey("isRequired") && ir != c.isRequired()))) {
            throw new BusinessException(HttpStatus.CONFLICT, "CHAPTER_ALREADY_PUBLISHED", "已发布章节的位置与必修属性已冻结。");
        }
        ensureChapterPositionFree(c.offeringId(), no, c.id());
        try {
            mapper.updateChapter(c.id(), no, t, s, ir, c.contentVersion() + 1, now());
        } catch (DuplicateKeyException exception) {
            if (!isChapterPositionDuplicate(exception)) throw exception;
            throw CourseInput.invalid();
        }
        audit.record(u.id(), "CHAPTER_UPDATED", "chapter", c.id(), Map.of(), req);
        return teacherSummary(mapper.chapter(c.id()));
    }

    @Transactional(isolation = Isolation.READ_COMMITTED, rollbackFor = Exception.class)
    public TeacherChapterSummaryDTO publishChapter(UserDTO u, String id, String req) {
        var c = chapterOr404(id);
        access.requireTeacher(u, c.offeringId(), true);
        if ("archived".equals(c.status())) {
            throw new BusinessException(HttpStatus.CONFLICT, "CHAPTER_ARCHIVED", "归档章节拒绝继续教学写入。");
        }
        if ("draft".equals(c.status())) {
            mapper.publishChapter(c.id(), now());
            audit.record(u.id(), "CHAPTER_PUBLISHED", "chapter", c.id(), Map.of(), req);
        }
        return teacherSummary(mapper.chapter(c.id()));
    }

    @Transactional(isolation = Isolation.READ_COMMITTED, rollbackFor = Exception.class)
    public KnowledgePointDTO createKnowledgePoint(UserDTO u, String oid, Map<String, Object> b, String req) {
        access.requireTeacher(u, oid, true);
        validateKnowledgeWrite(b);
        String cid = optionalUuid(b, "chapterId");
        validateChapterAssociation(oid, cid);
        String id = UUID.randomUUID().toString();
        mapper.insertKnowledgePoint(id, oid, cid, string(b, "title", 200), string(b, "description", 8000),
                integer(b, "order"), now());
        audit.record(u.id(), "KNOWLEDGE_POINT_CREATED", "knowledge_point", id, Map.of(), req);
        return knowledgeView(mapper.knowledgePoint(id));
    }

    public KnowledgePointListDTO listKnowledgePoints(UserDTO u, String oid) {
        access.requireTeacher(u, oid, false);
        return new KnowledgePointListDTO(oid, mapper.knowledgePoints(oid, null).stream()
                .map(this::knowledgeView).toList());
    }

    @Transactional(isolation = Isolation.READ_COMMITTED, rollbackFor = Exception.class)
    public KnowledgePointDTO patchKnowledgePoint(UserDTO u, String id, Map<String, Object> b, String req) {
        var old = mapper.knowledgePoint(CourseInput.uuid(id));
        if (old == null) throw CourseAccess.notFound();
        access.requireTeacher(u, old.offeringId(), true);
        validatePatch(b, "chapterId", "title", "description", "order");
        String cid = b.containsKey("chapterId") ? optionalUuid(b, "chapterId") : old.chapterId();
        if (b.containsKey("chapterId") && !java.util.Objects.equals(cid, old.chapterId())
                && mapper.resourceCountForKnowledgePoint(old.id()) > 0) {
            throw CourseInput.invalid();
        }
        validateChapterAssociation(old.offeringId(), cid);
        mapper.updateKnowledgePoint(old.id(), cid,
                b.containsKey("title") ? string(b, "title", 200) : old.title(),
                b.containsKey("description") ? string(b, "description", 8000) : old.description(),
                b.containsKey("order") ? integer(b, "order") : old.position(), now());
        audit.record(u.id(), "KNOWLEDGE_POINT_UPDATED", "knowledge_point", old.id(), Map.of(), req);
        return knowledgeView(mapper.knowledgePoint(old.id()));
    }

    @Transactional(isolation = Isolation.READ_COMMITTED, rollbackFor = Exception.class)
    public ResourceDTO createResource(UserDTO u, String id, Map<String, Object> b, String req) {
        var c = chapterOr404(id);
        access.requireTeacher(u, c.offeringId(), true);
        validateResourceWrite(b);
        String kp = optionalUuid(b, "knowledgePointId");
        if ("archived".equals(c.status())) {
            throw new BusinessException(HttpStatus.CONFLICT, "CHAPTER_ARCHIVED", "归档章节拒绝继续教学写入。");
        }
        validateKnowledgeForChapter(kp, c);
        String rid = UUID.randomUUID().toString();
        mapper.insertResource(rid, c.offeringId(), c.id(), kp, string(b, "title", 200),
                markdown(b, "content"), integer(b, "order"), now());
        audit.record(u.id(), "RESOURCE_CREATED", "resource", rid, Map.of(), req);
        return resourceView(mapper.resource(rid));
    }

    @Transactional(isolation = Isolation.READ_COMMITTED, rollbackFor = Exception.class)
    public ResourceDTO patchResource(UserDTO u, String id, Map<String, Object> b, String req) {
        var old = mapper.resource(CourseInput.uuid(id));
        if (old == null) throw CourseAccess.notFound();
        access.requireTeacher(u, old.offeringId(), true);
        if ("archived".equals(old.status())) throw CourseAccess.notFound();
        validatePatch(b, "knowledgePointId", "title", "content", "order");
        var c = chapterOr404(old.chapterId());
        if ("archived".equals(c.status())) {
            throw new BusinessException(HttpStatus.CONFLICT, "CHAPTER_ARCHIVED", "归档章节拒绝继续教学写入。");
        }
        String kp = b.containsKey("knowledgePointId") ? optionalUuid(b, "knowledgePointId") : old.knowledgePointId();
        validateKnowledgeForChapter(kp, c);
        int updated = mapper.updateResource(old.id(), kp,
                b.containsKey("title") ? string(b, "title", 200) : old.title(),
                b.containsKey("content") ? markdown(b, "content") : old.contentMarkdown(),
                b.containsKey("order") ? integer(b, "order") : old.position(), now());
        if (updated == 0) throw CourseAccess.notFound();
        audit.record(u.id(), "RESOURCE_UPDATED", "resource", old.id(), Map.of(), req);
        return resourceView(mapper.resource(old.id()));
    }

    @Transactional(isolation = Isolation.READ_COMMITTED, rollbackFor = Exception.class)
    public ResourceArchiveDTO archiveResource(UserDTO u, String id, String req) {
        var old = mapper.resource(CourseInput.uuid(id));
        if (old == null) throw CourseAccess.notFound();
        access.requireTeacher(u, old.offeringId(), true);
        if ("active".equals(old.status())) {
            mapper.archiveResource(old.id(), now());
            audit.record(u.id(), "RESOURCE_ARCHIVED", "resource", old.id(), Map.of(), req);
        }
        return new ResourceArchiveDTO(old.id(), true);
    }

    private CourseRows.Chapter chapterOr404(String id){CourseInput.uuid(id);var c=mapper.chapter(id);if(c==null)throw CourseAccess.notFound();return c;}
    private ChapterSummaryDTO summary(CourseRows.Chapter c,String mid){return new ChapterSummaryDTO(c.id(),c.offeringId(),c.position(),c.title(),c.summary(),c.isRequired(),c.status(),progressView(mapper.chapterProgress(mid,c.id())),c.contentVersion(),mapper.resources(c.id(),true).size(),mapper.assignmentCountForChapter(c.id(),true));}
    private TeacherChapterSummaryDTO teacherSummary(CourseRows.Chapter c){return new TeacherChapterSummaryDTO(c.id(),c.offeringId(),c.position(),c.title(),c.summary(),c.isRequired(),c.status(),null,c.contentVersion(),mapper.resources(c.id(),false).size(),mapper.assignmentCountForChapter(c.id(),false));}
    private ChapterDetailDTO detail(CourseRows.Chapter c,UserDTO u){var x=access.requireReader(u,c.offeringId());var p=mapper.chapterProgress(x.member().id(),c.id());var rs=mapper.resources(c.id(),true);return new ChapterDetailDTO(c.id(),c.offeringId(),c.position(),c.title(),c.summary(),c.isRequired(),c.status(),p==null?new com.learningplatform.modules.courses.dto.CourseDTOs.ChapterProgress("not_started",null):progressView(p),c.contentVersion(),rs.size(),mapper.assignmentCountForChapter(c.id(),true),rs.stream().map(this::resourceView).toList(),mapper.knowledgePoints(c.offeringId(),c.id()).stream().map(this::knowledgeView).toList(),List.of());}
    private TeacherChapterDetailDTO teacherDetail(CourseRows.Chapter c){var rs=mapper.resources(c.id(),false);return new TeacherChapterDetailDTO(c.id(),c.offeringId(),c.position(),c.title(),c.summary(),c.isRequired(),c.status(),null,c.contentVersion(),rs.size(),mapper.assignmentCountForChapter(c.id(),false),rs.stream().map(this::resourceView).toList(),mapper.knowledgePoints(c.offeringId(),c.id()).stream().map(this::knowledgeView).toList(),List.of());}
    private com.learningplatform.modules.courses.dto.CourseDTOs.ChapterProgress progressView(CourseRows.ChapterProgress p){return p==null?null:new com.learningplatform.modules.courses.dto.CourseDTOs.ChapterProgress(p.status(),p.completedAt());}
    private ResourceDTO resourceView(CourseRows.Resource r){return new ResourceDTO(r.id(),r.offeringId(),r.chapterId(),r.knowledgePointId(),r.title(),"markdown",r.contentMarkdown(),null,r.position(),"archived".equals(r.status()));}
    private KnowledgePointDTO knowledgeView(CourseRows.KnowledgePoint p){return new KnowledgePointDTO(p.id(),p.offeringId(),p.chapterId(),p.title(),p.description(),p.position());}
    private void validateChapterWrite(Map<String,Object>b){CourseInput.fields(b,"number","title","summary","isRequired");integer(b,"number");string(b,"title",200);textAllowEmpty(b,"summary",8000);bool(b,"isRequired");}
    private void validateKnowledgeWrite(Map<String,Object>b){CourseInput.fields(b,"chapterId","title","description","order");string(b,"title",200);string(b,"description",8000);integer(b,"order");}
    private void validateResourceWrite(Map<String,Object>b){CourseInput.fields(b,"knowledgePointId","title","type","content","url","order");requireKeys(b,"title","type","content","url","order");if(!"markdown".equals(string(b,"type",20))||b.get("url")!=null)throw CourseInput.invalid();string(b,"title",200);markdown(b,"content");integer(b,"order");}
    private void validatePatch(Map<String, Object> b, String... fs) {
        CourseInput.fields(b, fs);
        if (b.isEmpty()) throw CourseInput.invalid();
        for (String k : b.keySet()) {
            if (b.get(k) == null && !List.of("knowledgePointId", "chapterId").contains(k)) {
                throw CourseInput.invalid();
            }
        }
    }
    private int integer(Map<String,Object>b,String k){Object x=b.get(k);if(!(x instanceof Number n)||n.longValue()<1||n.longValue()>Integer.MAX_VALUE||n.doubleValue()!=n.longValue())throw CourseInput.invalid();return n.intValue();}
    private boolean bool(Map<String,Object>b,String k){Object x=b.get(k);if(!(x instanceof Boolean))throw CourseInput.invalid();return (Boolean)x;}
    private String string(Map<String,Object>b,String k,int max){return CourseInput.text(b,k,max);}
    private String textAllowEmpty(Map<String,Object>b,String k,int max){return CourseInput.textAllowEmpty(b,k,max);}
    private String markdown(Map<String,Object>b,String k){String x=CourseInput.textAllowEmpty(b,k,65536);if(x.getBytes(java.nio.charset.StandardCharsets.UTF_8).length>65536)throw CourseInput.invalid();return x;}
    private void requireKeys(Map<String,Object>b,String...ks){for(String k:ks)if(!b.containsKey(k))throw CourseInput.invalid();}
    private String optionalUuid(Map<String,Object>b,String k){Object x=b.get(k);if(x==null)return null;if(!(x instanceof String))throw CourseInput.invalid();return CourseInput.uuid((String)x);}
    private void validateChapterAssociation(String oid,String cid){if(cid!=null){var c=mapper.chapter(cid);if(c==null||!oid.equals(c.offeringId()))throw CourseInput.invalid();}}
    private void validateKnowledgeForChapter(String id,CourseRows.Chapter c){if(id!=null){var p=mapper.knowledgePoint(id);if(p==null||!c.offeringId().equals(p.offeringId())||(p.chapterId()!=null&&!c.id().equals(p.chapterId())))throw CourseInput.invalid();}}
    private void ensureChapterPositionFree(String oid,int no,String ex){for(var c:mapper.chapters(oid,false))if(c.position()==no&&!c.id().equals(ex))throw CourseInput.invalid();}
    private boolean isChapterPositionDuplicate(DuplicateKeyException exception) {
        Throwable current=exception;
        while(current!=null) {
            if(current instanceof java.sql.SQLException sql && sql.getErrorCode()==1062
                    && sql.getMessage()!=null && sql.getMessage().contains("uq_chapters_offering_position")) return true;
            current=current.getCause();
        }
        return false;
    }
    private BusinessException invalidInvite() { return new BusinessException(HttpStatus.BAD_REQUEST,"INVALID_INVITE_CODE","邀请码不可用。"); }
}

