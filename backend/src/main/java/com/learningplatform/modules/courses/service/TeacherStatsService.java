package com.learningplatform.modules.courses.service;
import java.util.List;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.courses.dto.AssignmentDTOs.*;
import com.learningplatform.modules.courses.mapper.AssignmentMapper;
import com.learningplatform.modules.courses.mapper.CourseMapper;
import com.learningplatform.modules.courses.model.AssignmentRows.Assignment;
import com.learningplatform.modules.courses.model.AssignmentRows.AssignmentStatsRow;
import com.learningplatform.modules.courses.model.CourseRows;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
/** P1-D 教师统计与学生学习记录；字段与错误码以 openapi 1.1.0 为准。 */
@Service
public class TeacherStatsService {
    private final AssignmentMapper mapper;
    private final CourseMapper courseMapper;
    private final CourseAccess access;
    private final AssignmentService assignments;
    private final com.learningplatform.modules.analytics.service.KnowledgeService knowledge;
    public TeacherStatsService(AssignmentMapper mapper,CourseMapper courseMapper,CourseAccess access,AssignmentService assignments,
            com.learningplatform.modules.analytics.service.KnowledgeService knowledge) {
        this.mapper=mapper;this.courseMapper=courseMapper;this.access=access;this.assignments=assignments;this.knowledge=knowledge;
    }
    @Transactional(readOnly=true)
    public OfferingStatsDTO getOfferingStats(String offeringId,UserDTO user) {
        access.requireTeacher(user,AssignmentInput.uuid(offeringId),false);
        var row=mapper.getOfferingStats(offeringId);
        return new OfferingStatsDTO(row.studentCount(),row.activeAssignmentCount(),row.pendingReviewCount(),row.pendingHelpCount());
    }
    /** 作业不存在或不属于本人任教班级统一 404。 */
    @Transactional(readOnly=true)
    public AssignmentStatsDTO getAssignmentStats(String assignmentId,UserDTO user) {
        CourseAccess.role(user,"teacher");
        Assignment assignment=mapper.findAssignment(AssignmentInput.uuid(assignmentId));
        if(assignment==null) throw CourseAccess.notFound();
        access.requireTeacher(user,assignment.offeringId(),false);
        AssignmentStatsRow row=mapper.getAssignmentStats(assignmentId);
        return new AssignmentStatsDTO(row.studentCount(),row.submittedStudentCount(),row.pendingReviewCount(),
                row.reviewedStudentCount(),knowledge.commonIssues(assignmentId,assignment.offeringId()));
    }
    /** 目标必须是本班 active 学生，否则 404；评价为已发布评价的教师视图，分页，其余字段与学生端同一份数据。 */
    @Transactional(readOnly=true)
    public TeacherLearningRecordsDTO getStudentLearningRecords(String offeringId,String studentId,UserDTO teacher,int page,int pageSize) {
        access.requireTeacher(teacher,AssignmentInput.uuid(offeringId),false);
        AssignmentInput.uuid(studentId);AssignmentInput.page(page,pageSize);
        CourseRows.Member member=courseMapper.findMember(offeringId,studentId);
        if(member==null||!"student".equals(member.role())||!"active".equals(member.status())) throw CourseAccess.notFound();
        StudentBrief student=mapper.findStudentBrief(studentId);
        if(student==null) throw CourseAccess.notFound();
        long offset=(long)(page-1)*pageSize;
        List<TeacherFeedbackDTO> items=mapper.listPublishedFeedbackIdsPage(studentId,offeringId,null,offset,pageSize)
                .stream().map(assignments::teacherFeedbackById).toList();
        int total=mapper.countPublishedFeedback(studentId,offeringId,null);
        TeacherFeedbackDTO recent=page==1?(items.isEmpty()?null:items.get(0))
                :mapper.listPublishedFeedbackIdsPage(studentId,offeringId,null,0,1).stream()
                        .map(assignments::teacherFeedbackById).findFirst().orElse(null);
        var analysis=knowledge.analyze(studentId,offeringId);
        LearningSummary summary=new LearningSummary(mapper.countCompletedLabs(offeringId,studentId),total,analysis.needsPracticeCount());
        return new TeacherLearningRecordsDTO(offeringId,summary,recent,new TeacherFeedbackPage(items,page,pageSize,total),
                analysis.assessments(),analysis.recommendation(),student);
    }
}
