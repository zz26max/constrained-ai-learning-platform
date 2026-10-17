package com.learningplatform.modules.courses.service;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.courses.dto.AssignmentDTOs.*;
import com.learningplatform.modules.courses.dto.CourseDTOs;
import com.learningplatform.modules.courses.mapper.AssignmentMapper;
import com.learningplatform.modules.courses.mapper.CourseMapper;
import com.learningplatform.modules.courses.mapper.TermMapper;
import com.learningplatform.modules.courses.model.AssignmentRows;
import com.learningplatform.modules.courses.model.AssignmentRows.DashboardOfferingRow;
import com.learningplatform.modules.courses.model.AssignmentRows.Workspace;
import com.learningplatform.modules.courses.model.CourseRows;
import com.learningplatform.modules.courses.model.Term;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.stereotype.Service;
/** P1-D 学生首页、学习记录与批量标记已读；字段与错误码以 openapi 1.1.0 为准。 */
@Service
public class DashboardService {
    private static final int MAX_COURSES=6;
    private static final int MAX_OTHER_PENDING=2;
    private static final int FEEDBACK_PAGE_SIZE=20;
    private static final List<String> MESSAGE_TYPES=List.of("course_notice","assignment_published","feedback","system","help_reply");
    private final AssignmentMapper mapper;
    private final CourseMapper courseMapper;
    private final TermMapper termMapper;
    private final CourseAccess access;
    private final CourseLearningQuery learning;
    private final AssignmentService assignments;
    private final Clock clock;
    public DashboardService(AssignmentMapper mapper,CourseMapper courseMapper,TermMapper termMapper,CourseAccess access,
            CourseLearningQuery learning,AssignmentService assignments,Clock clock) {
        this.mapper=mapper;this.courseMapper=courseMapper;this.termMapper=termMapper;this.access=access;
        this.learning=learning;this.assignments=assignments;this.clock=clock;
    }
    private Instant now() { return clock.instant().truncatedTo(ChronoUnit.MICROS); }
    /** 未传 termId 取当前学期；无当前学期时返回空首页（学期为 null）。非法 UUID 422，不存在的学期 404。 */
    @Transactional(readOnly=true)
    public DashboardDTO getDashboard(UserDTO user,String termId) {
        CourseAccess.role(user,"student");
        Instant now=now();
        String term;
        if(termId==null) term=courseMapper.currentTermId();
        else {
            AssignmentInput.uuid(termId);
            if(courseMapper.termExists(termId)==0) throw CourseAccess.notFound();
            term=termId;
        }
        if(term==null) return new DashboardDTO(null,null,now,0,0,0,null,List.of(),null,List.of(),null);
        String termLabel=termMapper.findAllOrdered().stream().filter(t->t.id().equals(term)).findFirst()
                .map(Term::label).orElse(null);
        String studentId=user.id();
        int courseCount=mapper.countDashboardOfferings(studentId,term);
        int pending=mapper.getAssignmentCounts(studentId,null,term).todoCount();
        int unread=mapper.countUnreadMessagesInTerm(studentId,term);
        List<DashboardOfferingRow> offerings=mapper.listDashboardOfferings(studentId,term,MAX_COURSES);
        List<AssignmentSummaryDTO> todo=mapper.listStudentAssignments(studentId,null,term,"todo",now,0,MAX_OTHER_PENDING+1);
        Object currentLearning=null;
        List<AssignmentSummaryDTO> others=List.of();
        if(!todo.isEmpty()) {
            currentLearning=currentAssignment(todo.get(0),studentId);
            others=new ArrayList<>(todo.subList(1,todo.size()));
        } else currentLearning=currentChapter(offerings);
        List<String> feedbackIds=mapper.listPublishedFeedbackIds(studentId,null,term,1);
        StudentFeedbackViewDTO recentFeedback=feedbackIds.isEmpty()?null:assignments.getFeedback(user,feedbackIds.get(0));
        AssignmentRows.MessageRow noticeRow=mapper.findRecentNotice(studentId,term);
        NotificationDTO recentNotice=noticeRow==null?null:AssignmentService.notification(noticeRow);
        List<CourseDTOs.CourseSummaryDTO> courses=offerings.stream().map(o->course(o,studentId,now)).toList();
        return new DashboardDTO(term,termLabel,now,courseCount,pending,unread,currentLearning,others,recentFeedback,courses,recentNotice);
    }
    /** 待办作业按截止时间、ID 升序的第一项；有工作区时附恢复位置。 */
    private CurrentAssignment currentAssignment(AssignmentSummaryDTO a,String studentId) {
        Workspace w=mapper.findWorkspace(a.id(),studentId);
        ResumeDTO resume=w==null?null:new ResumeDTO(w.activeFile(),w.updatedAt(),w.revision());
        return new CurrentAssignment("assignment",a.offeringId(),a.chapterId(),a.id(),a.title(),a.description(),a.type(),
                a.assignmentState(),a.dueAt(),a.overdue(),resume);
    }
    /** 无待办时取最近学习教学班的当前章节（offerings 已按最近学习时间排序）；都没有返回 null。 */
    private CurrentLearningChapter currentChapter(List<DashboardOfferingRow> offerings) {
        for(DashboardOfferingRow o:offerings) {
            CourseDTOs.CurrentChapter c=courseMapper.currentChapter(o.offeringId(),o.memberId(),o.lastChapterId());
            if(c==null) continue;
            CourseRows.Chapter chapter=courseMapper.chapter(c.id());
            return new CurrentLearningChapter("chapter",o.offeringId(),c.id(),c.title(),chapter==null?"":chapter.summary());
        }
        return null;
    }
    private CourseDTOs.CourseSummaryDTO course(DashboardOfferingRow o,String studentId,Instant now) {
        CourseDTOs.ProgressDTO progress="assignment".equals(o.progressUnit())?assignmentProgress(o,studentId,now)
                :learning.progress(o.offeringId(),o.memberId(),o.progressUnit(),now);
        int pending=mapper.getAssignmentCounts(studentId,o.offeringId(),null).todoCount();
        int unreadFeedback=mapper.countUnreadFeedbackInOffering(studentId,o.offeringId());
        return new CourseDTOs.CourseSummaryDTO(o.offeringId(),o.courseId(),o.title(),o.mark(),o.groupName(),o.termId(),
                o.termLabel(),o.status(),courseMapper.teachers(o.offeringId()),
                learning.currentChapter(o.offeringId(),o.memberId(),o.lastChapterId()),progress,o.lastStudiedAt(),pending,unreadFeedback);
    }
    /** progressUnit=assignment：分母为本班已发布必做作业，分子为本人已有提交的必做作业；total=0 时 percent=0 且 notConfigured。 */
    private CourseDTOs.ProgressDTO assignmentProgress(DashboardOfferingRow o,String studentId,Instant now) {
        int total=mapper.assignmentProgressTotal(o.offeringId());
        int completed=mapper.assignmentProgressCompleted(o.offeringId(),studentId);
        int percent=total==0?0:BigDecimal.valueOf(completed).multiply(BigDecimal.valueOf(100))
                .divide(BigDecimal.valueOf(total),0,RoundingMode.HALF_UP).intValueExact();
        return new CourseDTOs.ProgressDTO("assignment",completed,total,percent,total==0,now);
    }
    @Transactional(readOnly=true)
    public LearningRecordsDTO getLearningRecords(UserDTO user,String offeringId) {
        return getLearningRecords(user,offeringId,1,FEEDBACK_PAGE_SIZE);
    }
    @Transactional(readOnly=true)
    public LearningRecordsDTO getLearningRecords(UserDTO user,String offeringId,int page,int pageSize) {
        CourseAccess.role(user,"student");
        access.requireStudent(user,offeringId,false);
        AssignmentInput.page(page,pageSize);
        String studentId=user.id();
        List<String> ids=mapper.listPublishedFeedbackIdsPage(studentId,offeringId,null,(long)(page-1)*pageSize,pageSize);
        List<StudentFeedbackViewDTO> items=ids.stream().map(id->assignments.getFeedback(user,id)).toList();
        List<String> recentIds=mapper.listPublishedFeedbackIds(studentId,offeringId,null,1);
        StudentFeedbackViewDTO recent=recentIds.isEmpty()?null:assignments.getFeedback(user,recentIds.get(0));
        int total=mapper.countPublishedFeedback(studentId,offeringId,null);
        LearningSummary summary=new LearningSummary(mapper.countCompletedLabs(offeringId,studentId),total,null);
        return new LearningRecordsDTO(offeringId,summary,recent,
                new FeedbackPage(items,page,pageSize,total),List.of(),null);
    }
    /** 只更新本人、该班、可选 type 范围内的未读消息；重复调用幂等（已读行不再改写 readAt）。 */
    @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public MarkedReadDTO markMessagesRead(UserDTO user,String offeringId,String type) {
        CourseAccess.role(user,"student");
        access.requireStudent(user,offeringId,false);
        String dbType=null;
        if(type!=null) {
            if(!MESSAGE_TYPES.contains(type)) throw AssignmentInput.invalidField("type","不是受支持的消息类型。");
            dbType=AssignmentService.dbMessageType(type);
        }
        Instant now=now();
        // help_reply 在 P1 没有对应的个人消息类型：无可更新行，仍返回 markedAt。
        if(type==null||dbType!=null) mapper.markMessagesRead(user.id(),offeringId,dbType,now);
        return new MarkedReadDTO(now);
    }
}
