package com.learningplatform.modules.courses.service;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import com.learningplatform.common.audit.AuditService;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.courses.dto.AssignmentDTOs.*;
import com.learningplatform.modules.courses.mapper.AssignmentMapper;
import com.learningplatform.modules.courses.model.AssignmentRows.NoticeRow;
import com.learningplatform.modules.courses.model.AssignmentRows.NoticeView;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
/**
 * P1-D 公告：创建、列表、详情，字段与错误码以 openapi 1.1.0 为准。
 * 可见性：全班公告（target_student_id 为空）对本班成员可见；定向给某学生的公告只对该学生与本班教师可见。
 */
@Service
public class NoticeService {
    private static final int TITLE_MAX=200;
    private static final int CONTENT_MAX=8000;
    /** notifications.content 为 VARCHAR(2000)，通知正文按字符截断，公告全文仍在 notices。 */
    private static final int NOTIFICATION_CONTENT_MAX=2000;
    private final AssignmentMapper mapper;
    private final CourseAccess access;
    private final AuditService audit;
    private final Clock clock;
    public NoticeService(AssignmentMapper mapper,CourseAccess access,AuditService audit,Clock clock) {
        this.mapper=mapper;this.access=access;this.audit=audit;this.clock=clock;
    }
    private Instant now() { return clock.instant().truncatedTo(ChronoUnit.MICROS); }
    /** 同一事务：写公告 + 为发布时全部 active 学生写 notice_published 通知；recipientCount 为实际生成的通知数。 */
    @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public NoticeDTO createNotice(String offeringId,UserDTO author,Map<String,Object> body,String requestId) {
        access.requireTeacher(author,AssignmentInput.uuid(offeringId),true);
        AssignmentInput.checkNoticeKeys(body);
        String title=noticeText(body,"title",1,TITLE_MAX);
        String content=noticeText(body,"content",0,CONTENT_MAX);
        if(body.get("target")!=null) {
            // notices 表没有 target 列且不允许自行加迁移：P1 无法保存跳转目标，明确拒绝而不是静默丢弃。
            throw AssignmentInput.invalidField("target","当前版本不支持公告跳转目标，请省略或传 null。");
        }
        String noticeId=UUID.randomUUID().toString();
        Instant now=now();
        mapper.insertNotice(new NoticeRow(noticeId,offeringId,author.id(),null,title,content,now));
        String notificationContent=truncate(content,NOTIFICATION_CONTENT_MAX);
        int notified=0;
        for(String studentId:mapper.listActiveStudentIds(offeringId)) {
            mapper.insertNotification(UUID.randomUUID().toString(),studentId,"notice_published",title,
                    notificationContent,offeringId,null,null,now);
            notified++;
        }
        audit.record(author.id(),"NOTICE_CREATED","notice",noticeId,Map.of("notified",notified),requestId);
        return toDto(mapper.findNoticeView(noticeId));
    }
    @Transactional(readOnly=true)
    public NoticePage listNotices(String offeringId,UserDTO user,int page,int pageSize) {
        AssignmentInput.page(page,pageSize);
        CourseAccess.Context context=access.requireReader(user,AssignmentInput.uuid(offeringId));
        String studentId="student".equals(context.member().role())?user.id():null;
        long offset=(long)(page-1)*pageSize;
        List<NoticeDTO> items=mapper.listNotices(offeringId,studentId,offset,pageSize).stream().map(NoticeService::toDto).toList();
        return new NoticePage(items,page,pageSize,mapper.countNotices(offeringId,studentId));
    }
    /** 不存在、非本班、他人的定向公告统一 404，不暴露存在性。 */
    @Transactional(readOnly=true)
    public NoticeDTO getNotice(String noticeId,UserDTO user) {
        NoticeView notice=mapper.findNoticeView(AssignmentInput.uuid(noticeId));
        if(notice==null) throw CourseAccess.notFound();
        CourseAccess.Context context=access.requireReader(user,notice.offeringId());
        if("student".equals(context.member().role())&&notice.targetStudentId()!=null
                &&!notice.targetStudentId().equals(user.id())) throw CourseAccess.notFound();
        return toDto(notice);
    }
    private static NoticeDTO toDto(NoticeView n) {
        return new NoticeDTO(n.id(),n.offeringId(),n.title(),n.content(),null,n.createdAt(),n.recipientCount());
    }
    /** 字符数（码点）校验，与 VARCHAR 字符长度一致；类型错误、缺失或越界为 422 并指明字段。 */
    private static String noticeText(Map<String,Object> body,String field,int min,int max) {
        if(!(body.get(field) instanceof String text)) throw AssignmentInput.invalidField(field,"必须是字符串。");
        int length=text.codePointCount(0,text.length());
        if(length<min||length>max) throw AssignmentInput.invalidField(field,"长度必须在 "+min+" 到 "+max+" 个字符之间。");
        return text;
    }
    private static String truncate(String text,int maxCodePoints) {
        if(text.codePointCount(0,text.length())<=maxCodePoints) return text;
        return text.substring(0,text.offsetByCodePoints(0,maxCodePoints));
    }
}
