package com.learningplatform.modules.courses.service;
import java.util.List;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.courses.dto.AssignmentDTOs.*;
import com.learningplatform.modules.courses.mapper.AssignmentMapper;
import com.learningplatform.modules.courses.model.AssignmentRows.Assignment;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
/** P1-D 教师统计服务 */
@Service
public class TeacherStatsService {
    private final AssignmentMapper mapper;
    private final CourseAccess access;
    public TeacherStatsService(AssignmentMapper mapper,CourseAccess access) {
        this.mapper=mapper;this.access=access;
    }
    @Transactional(readOnly=true)
    public OfferingStatsDTO getOfferingStats(String offeringId,UserDTO user) {
        access.requireTeacher(user,offeringId,false);
        return mapper.getOfferingStats(offeringId);
    }
    @Transactional(readOnly=true)
    public AssignmentStatsDTO getAssignmentStats(String assignmentId,UserDTO user) {
        Assignment assignment=mapper.findAssignment(assignmentId);
        if(assignment==null) throw new com.learningplatform.common.exception.BusinessException(
                org.springframework.http.HttpStatus.NOT_FOUND,"NOT_FOUND","Assignment not found");
        access.requireTeacher(user,assignment.offeringId(),false);
        return mapper.getAssignmentStats(assignmentId);
    }
    @Transactional(readOnly=true)
    public LearningRecordsDTO getStudentLearningRecords(String offeringId,String studentId,UserDTO teacher,int page,int pageSize) {
        access.requireTeacher(teacher,offeringId,false);
        LearningRecordSummary summary=mapper.getLearningRecordSummary(offeringId,studentId);
        int offset=(page-1)*pageSize;
        List<StudentFeedbackDTO> feedback=mapper.listStudentFeedback(offeringId,studentId,offset,pageSize);
        int totalFeedback=mapper.countStudentFeedback(offeringId,studentId);
        int totalPages=(totalFeedback+pageSize-1)/pageSize;
        PaginationInfo pageInfo=new PaginationInfo(page,pageSize,totalFeedback,totalPages);
        return new LearningRecordsDTO(offeringId,summary,feedback,pageInfo,null,null);
    }
}
