package com.learningplatform.modules.courses.service;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.courses.dto.AssignmentDTOs.*;
import com.learningplatform.modules.courses.mapper.AssignmentMapper;
import com.learningplatform.modules.courses.mapper.TermMapper;
import com.learningplatform.modules.courses.model.CourseRows;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
/** P1-D 仪表盘与学习记录服务 */
@Service
public class DashboardService {
    private final AssignmentMapper mapper;
    private final TermMapper termMapper;
    private final CourseAccess access;
    public DashboardService(AssignmentMapper mapper,TermMapper termMapper,CourseAccess access) {
        this.mapper=mapper;this.termMapper=termMapper;this.access=access;
    }
    @Transactional(readOnly=true)
    public DashboardDTO getDashboard(UserDTO user,String termId) {
        String termLabel=null;
        if(termId!=null) {
            var terms=termMapper.findAllOrdered();
            termLabel=terms.stream().filter(t->t.id().equals(termId)).findFirst().map(t->t.label()).orElse(null);
        }
        int courseCount=mapper.countStudentOfferings(user.id(),termId);
        int pendingAssignmentCount=mapper.countPendingAssignments(user.id(),termId);
        int unreadMessageCount=mapper.countUnreadMessages(user.id());
        AssignmentSummaryDTO currentAssignment=mapper.findCurrentAssignment(user.id(),termId);
        Object currentLearning=null;String excludeId=null;
        if(currentAssignment!=null) {
            currentLearning=new CurrentAssignment("assignment",currentAssignment.id(),currentAssignment.title(),
                    currentAssignment.dueAt(),currentAssignment.assignmentState());
            excludeId=currentAssignment.id();
        } else {
            CourseRows.Chapter chapter=mapper.findCurrentLearningChapter(user.id(),termId);
            if(chapter!=null) currentLearning=new CurrentLearningChapter("chapter",chapter.offeringId(),
                    chapter.id(),chapter.title());
        }
        List<AssignmentSummaryDTO> otherPending=mapper.listOtherPendingAssignments(user.id(),termId,excludeId,2);
        StudentFeedbackDTO recentFeedback=mapper.findRecentFeedback(user.id());
        List<CourseSummaryDTO> courses=mapper.listDashboardCourses(user.id(),termId,6);
        com.learningplatform.modules.courses.model.AssignmentRows.MessageRow recentRow=mapper.findRecentNotice(user.id());
        NotificationDTO recentNotice=recentRow==null?null:AssignmentService.notification(recentRow);
        return new DashboardDTO(termId,termLabel,Instant.now(),courseCount,pendingAssignmentCount,
                unreadMessageCount,currentLearning,otherPending,recentFeedback,courses,recentNotice);
    }
    @Transactional(readOnly=true)
    public LearningRecordsDTO getLearningRecords(UserDTO user,String offeringId,int page,int pageSize) {
        access.requireStudent(user,offeringId,false);
        LearningRecordSummary summary=mapper.getLearningRecordSummary(offeringId,user.id());
        int offset=(page-1)*pageSize;
        List<StudentFeedbackDTO> feedback=mapper.listStudentFeedback(offeringId,user.id(),offset,pageSize);
        int totalFeedback=mapper.countStudentFeedback(offeringId,user.id());
        int totalPages=(totalFeedback+pageSize-1)/pageSize;
        PaginationInfo pageInfo=new PaginationInfo(page,pageSize,totalFeedback,totalPages);
        return new LearningRecordsDTO(offeringId,summary,feedback,pageInfo,null,null);
    }
    @Transactional
    public void markMessagesRead(UserDTO user,String offeringId,String type) {
        mapper.markMessagesRead(user.id(),offeringId,type,Instant.now());
    }
}
