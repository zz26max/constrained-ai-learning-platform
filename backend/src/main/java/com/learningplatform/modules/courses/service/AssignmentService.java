package com.learningplatform.modules.courses.service;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import com.learningplatform.common.audit.AuditService;
import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.courses.dto.AssignmentDTOs;
import com.learningplatform.modules.courses.dto.AssignmentDTOs.*;
import com.learningplatform.modules.courses.mapper.AssignmentMapper;
import com.learningplatform.modules.courses.mapper.AssignmentMapper.AssignmentCounts;
import com.learningplatform.modules.courses.model.AssignmentRows;
import com.learningplatform.modules.courses.model.AssignmentRows.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
/** P1-B 作业与工作区的事务入口；乐观锁、幂等性、快照冻结、归档检查全部在此层实现。 */
@Service
public class AssignmentService {
    private final AssignmentMapper mapper;
    private final CourseAccess access;
    private final AuditService audit;
    private final Clock clock;
    public AssignmentService(AssignmentMapper mapper,CourseAccess access,AuditService audit,Clock clock) {
        this.mapper=mapper;this.access=access;this.audit=audit;this.clock=clock;
    }
    public AssignmentListResponse listMyAssignments(UserDTO user,String offeringId,String termId,String filter,int page,int pageSize) {
        CourseAccess.role(user,"student");AssignmentInput.page(page,pageSize);
        if(!List.of("all","todo","done").contains(filter)) throw AssignmentInput.invalid();
        // offeringId/termId 二选一过滤；学生必须是成员。
        if(offeringId!=null) {
            access.requireStudent(user,AssignmentInput.uuid(offeringId),false);
            AssignmentCounts counts=mapper.getAssignmentCounts(user.id(),offeringId,null);
            List<AssignmentSummaryDTO> items=mapper.listStudentAssignments(user.id(),offeringId,null,filter,offset(page,pageSize),pageSize);
            return new AssignmentListResponse(items,page,pageSize,count(counts,filter),summary(counts));
        } else {
            // termId 过滤或当前学期。
            String term=termId!=null?AssignmentInput.uuid(termId):null;
            AssignmentCounts counts=mapper.getAssignmentCounts(user.id(),null,term);
            List<AssignmentSummaryDTO> items=mapper.listStudentAssignments(user.id(),null,term,filter,offset(page,pageSize),pageSize);
            return new AssignmentListResponse(items,page,pageSize,count(counts,filter),summary(counts));
        }
    }
    public AssignmentDetailDTO getAssignment(UserDTO user,String assignmentId) {
        CourseAccess.role(user,"student");
        Assignment assignment=assignmentOr404(assignmentId);
        CourseAccess.Context context=access.requireStudent(user,assignment.offeringId(),false);
        if("draft".equals(assignment.status())) throw CourseAccess.notFound();
        int attemptsUsed=mapper.countSubmissions(assignment.id(),user.id());
        boolean canSubmit=canSubmit(assignment,context,attemptsUsed);
        String blockedReason=canSubmit?null:submitBlockedReason(assignment,context,attemptsUsed);
        return studentView(assignment,user.id(),attemptsUsed,canSubmit,blockedReason);
    }
    public WorkspaceDTO getWorkspace(UserDTO user,String assignmentId) {
        Assignment assignment=assignmentOr404(assignmentId);
        CourseAccess.Context context=access.requireStudent(user,assignment.offeringId(),false);
        if("draft".equals(assignment.status())) throw CourseAccess.notFound();
        Workspace workspace=mapper.findWorkspace(assignment.id(),user.id());
        if(workspace==null) {
            // 未保存：返回 revision=0 的模板，不创建记录。
            List<InitialFile> initialFiles=mapper.getInitialFiles(assignment.id());
            List<FileDTO> files=initialFiles.stream().map(f->new FileDTO(f.filePath(),f.content())).toList();
            String activeFile=initialFiles.isEmpty()?"index.html":initialFiles.get(0).filePath();
            boolean canSave=canSave(assignment,context);
            return new WorkspaceDTO(assignment.id(),0,files,activeFile,null,canSave,canSave?null:saveBlockedReason(assignment,context));
        }
        List<WorkspaceFile> files=mapper.getWorkspaceFiles(workspace.id());
        boolean canSave=canSave(assignment,context);
        return new WorkspaceDTO(assignment.id(),workspace.revision(),
                files.stream().map(f->new FileDTO(f.filePath(),f.content())).toList(),
                workspace.activeFile(),workspace.updatedAt(),canSave,canSave?null:saveBlockedReason(assignment,context));
    }
    @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public WorkspaceDTO saveWorkspace(UserDTO user,String assignmentId,Map<String,Object> body,String requestId) {
        Assignment assignment=assignmentOr404(assignmentId);
        CourseAccess.Context context=access.requireStudent(user,assignment.offeringId(),true);
        if("draft".equals(assignment.status())) throw CourseAccess.notFound();
        if(!canSave(assignment,context)) throw new BusinessException(HttpStatus.CONFLICT,"ASSIGNMENT_LOCKED",saveBlockedReason(assignment,context));
        AssignmentInput.validateWorkspaceWrite(body);
        int baseRevision=AssignmentInput.integer(body,"baseRevision");
        List<FileDTO> files=AssignmentInput.files(body,"files");
        String activeFile=AssignmentInput.activeFile(body,"activeFile");
        Instant now=now();
        Workspace workspace=mapper.findWorkspace(assignment.id(),user.id());
        if(workspace==null) {
            // 首次保存：创建工作区。并发场景下可能重复 INSERT，需捕获并重试查询。
            if(baseRevision!=0) throw versionConflict();
            String id=UUID.randomUUID().toString();
            try {
                mapper.insertWorkspace(id,assignment.offeringId(),assignment.id(),user.id(),activeFile,now);
                for(FileDTO f:files) mapper.insertWorkspaceFile(id,f.path(),f.content());
                workspace=mapper.findWorkspace(assignment.id(),user.id());
            } catch(org.springframework.dao.DuplicateKeyException e) {
                // 并发线程已创建，重新查询并按乐观锁更新。
                workspace=mapper.findWorkspace(assignment.id(),user.id());
                if(workspace==null) throw e;
                if(baseRevision!=workspace.revision()) throw versionConflict();
                int updated=mapper.updateWorkspace(workspace.id(),baseRevision,activeFile,now);
                if(updated==0) throw versionConflict();
                mapper.deleteWorkspaceFiles(workspace.id());
                for(FileDTO f:files) mapper.insertWorkspaceFile(workspace.id(),f.path(),f.content());
                workspace=mapper.findWorkspace(assignment.id(),user.id());
            }
        } else {
            // 乐观锁：检查 baseRevision 是否匹配当前 revision。
            if(baseRevision!=workspace.revision()) throw versionConflict();
            int updated=mapper.updateWorkspace(workspace.id(),baseRevision,activeFile,now);
            if(updated==0) throw versionConflict();
            mapper.deleteWorkspaceFiles(workspace.id());
            for(FileDTO f:files) mapper.insertWorkspaceFile(workspace.id(),f.path(),f.content());
            workspace=mapper.findWorkspace(assignment.id(),user.id());
        }
        audit.record(user.id(),"WORKSPACE_SAVED","workspace",workspace.id(),Map.of("revision",workspace.revision()),requestId);
        List<WorkspaceFile> savedFiles=mapper.getWorkspaceFiles(workspace.id());
        boolean canSave=canSave(assignment,context);
        return new WorkspaceDTO(assignment.id(),workspace.revision(),
                savedFiles.stream().map(f->new FileDTO(f.filePath(),f.content())).toList(),
                workspace.activeFile(),workspace.updatedAt(),canSave,canSave?null:saveBlockedReason(assignment,context));
    }
    @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public SubmissionCreatedResponse submitAssignment(UserDTO user,String assignmentId,Map<String,Object> body,String requestId) {
        Assignment assignment=assignmentOr404(assignmentId);
        CourseAccess.Context context=access.requireStudent(user,assignment.offeringId(),true);
        if("draft".equals(assignment.status())) throw CourseAccess.notFound();
        // 业务检查优先于输入校验，避免归档状态返回 VALIDATION_ERROR。
        int attemptsUsed=mapper.countSubmissions(assignment.id(),user.id());
        if(!canSubmit(assignment,context,attemptsUsed)) {
            throw new BusinessException(HttpStatus.CONFLICT,"SUBMISSION_BLOCKED",submitBlockedReason(assignment,context,attemptsUsed));
        }
        AssignmentInput.validateSubmissionWrite(body);
        int workspaceRevision=AssignmentInput.integer(body,"workspaceRevision");
        String reflection=AssignmentInput.text(body,"reflection",8000);
        // 幂等性：检查是否已提交过相同 workspaceRevision。
        Submission existing=mapper.findSubmissionByRevision(assignment.id(),user.id(),workspaceRevision);
        if(existing!=null) {
            // 自然幂等：返回原提交，不新建、不占次数、不覆盖 reflection。
            return new SubmissionCreatedResponse(submissionSummary(existing),false);
        }
        Workspace workspace=mapper.findWorkspace(assignment.id(),user.id());
        if(workspace==null||workspace.revision()<workspaceRevision) throw AssignmentInput.invalid();
        Instant now=now();boolean isLate=assignment.dueAt().isBefore(now);
        String submissionId=UUID.randomUUID().toString();
        int attemptNo=attemptsUsed+1;
        // 标记之前的提交为 superseded。
        mapper.markPreviousSubmissionsAsSuperseded(assignment.id(),user.id(),submissionId);
        // 创建提交快照。
        mapper.insertSubmission(submissionId,assignment.offeringId(),assignment.id(),workspace.id(),user.id(),
                attemptNo,workspaceRevision,reflection,assignment.contentVersion(),assignment.title(),
                assignment.maxScore(),assignment.currentAiPolicyId(),assignment.dueAt(),now,isLate,now);
        // 快照文件、要求、量表。
        List<WorkspaceFile> files=mapper.getWorkspaceFiles(workspace.id());
        for(WorkspaceFile f:files) mapper.insertSubmissionFile(submissionId,f.filePath(),f.content());
        List<AssignmentRequirement> requirements=mapper.getRequirements(assignment.id());
        for(int i=0;i<requirements.size();i++) {
            mapper.insertSubmissionRequirement(submissionId,requirements.get(i).requirementIndex(),requirements.get(i).requirementText());
        }
        List<AssignmentRows.RubricCriterion> rubric=mapper.getRubric(assignment.id());
        for(AssignmentRows.RubricCriterion r:rubric) {
            mapper.insertSubmissionRubric(submissionId,r.criterionId(),r.title(),r.description(),r.maxScore());
        }
        audit.record(user.id(),"ASSIGNMENT_SUBMITTED","submission",submissionId,Map.of("attemptNo",attemptNo),requestId);
        Submission submission=mapper.findSubmission(submissionId);
        return new SubmissionCreatedResponse(submissionSummary(submission),true);
    }
    public SubmissionListResponse listMySubmissions(UserDTO user,String assignmentId,int page,int pageSize) {
        Assignment assignment=assignmentOr404(assignmentId);
        access.requireStudent(user,assignment.offeringId(),false);
        if("draft".equals(assignment.status())) throw CourseAccess.notFound();
        AssignmentInput.page(page,pageSize);
        List<SubmissionSummaryDTO> items=mapper.listStudentSubmissions(assignment.id(),user.id(),offset(page,pageSize),pageSize);
        int total=mapper.countStudentSubmissions(assignment.id(),user.id());
        return new SubmissionListResponse(items,page,pageSize,total);
    }
    public SubmissionDetailDTO getSubmission(UserDTO user,String submissionId) {
        CourseAccess.role(user,"student");
        Submission submission=submissionOr404(submissionId);
        CourseAccess.Context context=access.requireStudent(user,submission.offeringId(),false);
        // 学生只能查看自己的提交。
        if(!submission.studentId().equals(user.id())) throw CourseAccess.notFound();
        return submissionDetail(submission);
    }
    // 教师端作业管理
    public AssignmentListResponse listTeacherAssignments(UserDTO user,String offeringId,String publicationState,int page,int pageSize) {
        access.requireTeacher(user,AssignmentInput.uuid(offeringId),false);
        AssignmentInput.page(page,pageSize);
        if(!List.of("draft","published","archived","all").contains(publicationState)) throw AssignmentInput.invalid();
        List<TeacherAssignmentDTO> items=mapper.listTeacherAssignments(offeringId,publicationState,offset(page,pageSize),pageSize);
        int total=mapper.countTeacherAssignments(offeringId,publicationState);
        return new AssignmentListResponse(items,page,pageSize,total,null);
    }
    @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public TeacherAssignmentDTO createAssignment(UserDTO user,String offeringId,Map<String,Object> body,String requestId) {
        access.requireTeacher(user,AssignmentInput.uuid(offeringId),true);
        AssignmentInput.validateAssignmentWrite(body);
        Instant now=now();String id=UUID.randomUUID().toString();
        String chapterId=AssignmentInput.optionalUuid(body,"chapterId");
        String title=AssignmentInput.text(body,"title",200);
        String description=AssignmentInput.text(body,"description",8000);
        int estimatedMinutes=AssignmentInput.integer(body,"estimatedMinutes");
        String type=AssignmentInput.text(body,"type",16);
        boolean isRequired=AssignmentInput.bool(body,"isRequired");
        Instant dueAt=AssignmentInput.timestamp(body,"dueAt");
        Instant lateUntil=AssignmentInput.optionalTimestamp(body,"lateUntil");
        boolean allowResubmit=AssignmentInput.bool(body,"allowResubmit");
        int maxAttempts=AssignmentInput.integer(body,"maxAttempts");
        BigDecimal maxScore=AssignmentInput.decimal(body,"maxScore");
        if(lateUntil!=null&&!lateUntil.isAfter(dueAt)) throw AssignmentInput.invalid();
        if(!List.of("web_lab","sql_text","text").contains(type)) throw AssignmentInput.invalid();
        mapper.insertAssignment(id,offeringId,chapterId,title,description,estimatedMinutes,type,"draft",
                isRequired,dueAt,lateUntil,allowResubmit,maxAttempts,maxScore,null,user.id(),now);
        List<String> requirements=AssignmentInput.stringList(body,"requirements");
        for(int i=0;i<requirements.size();i++) mapper.insertRequirement(id,i+1,requirements.get(i));
        @SuppressWarnings("unchecked")
        List<Map<String,Object>> rubricList=(List<Map<String,Object>>)body.get("rubric");
        if(rubricList!=null) {
            for(Map<String,Object> r:rubricList) {
                mapper.insertRubric(id,AssignmentInput.text(r,"criterionId",64),
                        AssignmentInput.text(r,"title",200),AssignmentInput.text(r,"description",8000),
                        AssignmentInput.decimal(r,"maxScore"));
            }
        }
        @SuppressWarnings("unchecked")
        List<Map<String,Object>> filesList=(List<Map<String,Object>>)body.get("initialFiles");
        if(filesList!=null) {
            for(Map<String,Object> f:filesList) {
                mapper.insertInitialFile(id,AssignmentInput.text(f,"path",64),AssignmentInput.text(f,"content",102400));
            }
        }
        List<String> knowledgePointIds=AssignmentInput.optionalStringList(body,"knowledgePointIds");
        if(knowledgePointIds!=null) {
            for(String kpId:knowledgePointIds) mapper.insertKnowledgePoint(id,offeringId,kpId);
        }
        audit.record(user.id(),"ASSIGNMENT_CREATED","assignment",id,Map.of(),requestId);
        return teacherAssignmentView(mapper.findAssignment(id));
    }
    public TeacherAssignmentDTO getTeacherAssignment(UserDTO user,String assignmentId) {
        Assignment assignment=assignmentOr404(assignmentId);
        access.requireTeacher(user,assignment.offeringId(),false);
        return teacherAssignmentView(assignment);
    }
    @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public TeacherAssignmentDTO patchAssignment(UserDTO user,String assignmentId,Map<String,Object> body,String requestId) {
        Assignment assignment=assignmentOr404(assignmentId);
        access.requireTeacher(user,assignment.offeringId(),true);
        if("archived".equals(assignment.status())) {
            throw new BusinessException(HttpStatus.CONFLICT,"ASSIGNMENT_ARCHIVED","归档作业拒绝继续教学写入。");
        }
        Instant now=now();
        if("draft".equals(assignment.status())) {
            // draft 可更新完整字段。
            AssignmentInput.validateAssignmentWrite(body);
            String chapterId=AssignmentInput.optionalUuid(body,"chapterId");
            String title=AssignmentInput.text(body,"title",200);
            String description=AssignmentInput.text(body,"description",8000);
            int estimatedMinutes=AssignmentInput.integer(body,"estimatedMinutes");
            String type=AssignmentInput.text(body,"type",16);
            boolean isRequired=AssignmentInput.bool(body,"isRequired");
            Instant dueAt=AssignmentInput.timestamp(body,"dueAt");
            Instant lateUntil=AssignmentInput.optionalTimestamp(body,"lateUntil");
            boolean allowResubmit=AssignmentInput.bool(body,"allowResubmit");
            int maxAttempts=AssignmentInput.integer(body,"maxAttempts");
            BigDecimal maxScore=AssignmentInput.decimal(body,"maxScore");
            if(lateUntil!=null&&!lateUntil.isAfter(dueAt)) throw AssignmentInput.invalid();
            if(!List.of("web_lab","sql_text","text").contains(type)) throw AssignmentInput.invalid();
            mapper.updateAssignmentDraft(assignment.id(),chapterId,title,description,estimatedMinutes,type,
                    isRequired,dueAt,lateUntil,allowResubmit,maxAttempts,maxScore,now);
            mapper.deleteRequirements(assignment.id());
            mapper.deleteRubric(assignment.id());
            mapper.deleteInitialFiles(assignment.id());
            mapper.deleteKnowledgePoints(assignment.id());
            List<String> requirements=AssignmentInput.stringList(body,"requirements");
            for(int i=0;i<requirements.size();i++) mapper.insertRequirement(assignment.id(),i+1,requirements.get(i));
            @SuppressWarnings("unchecked")
            List<Map<String,Object>> rubricList=(List<Map<String,Object>>)body.get("rubric");
            if(rubricList!=null) {
                for(Map<String,Object> r:rubricList) {
                    mapper.insertRubric(assignment.id(),AssignmentInput.text(r,"criterionId",64),
                            AssignmentInput.text(r,"title",200),AssignmentInput.text(r,"description",8000),
                            AssignmentInput.decimal(r,"maxScore"));
                }
            }
            @SuppressWarnings("unchecked")
            List<Map<String,Object>> filesList=(List<Map<String,Object>>)body.get("initialFiles");
            if(filesList!=null) {
                for(Map<String,Object> f:filesList) {
                    mapper.insertInitialFile(assignment.id(),AssignmentInput.text(f,"path",64),
                            AssignmentInput.text(f,"content",102400));
                }
            }
            List<String> knowledgePointIds=AssignmentInput.optionalStringList(body,"knowledgePointIds");
            if(knowledgePointIds!=null) {
                for(String kpId:knowledgePointIds) mapper.insertKnowledgePoint(assignment.id(),assignment.offeringId(),kpId);
            }
        } else {
            // published 仅允许更新 description、dueAt、lateUntil。
            AssignmentInput.validatePatch(body,"description","dueAt","lateUntil");
            String description=body.containsKey("description")?AssignmentInput.text(body,"description",8000):assignment.description();
            Instant dueAt=body.containsKey("dueAt")?AssignmentInput.timestamp(body,"dueAt"):assignment.dueAt();
            Instant lateUntil=body.containsKey("lateUntil")?AssignmentInput.optionalTimestamp(body,"lateUntil"):assignment.lateUntil();
            if(lateUntil!=null&&!lateUntil.isAfter(dueAt)) throw AssignmentInput.invalid();
            // 不得缩短窗口。
            if(dueAt.isBefore(assignment.dueAt())||
                    (lateUntil!=null&&assignment.lateUntil()!=null&&lateUntil.isBefore(assignment.lateUntil()))) {
                throw new BusinessException(HttpStatus.CONFLICT,"CANNOT_SHORTEN_DEADLINE","不得缩短已发布作业的截止时间。");
            }
            mapper.updateAssignmentPublished(assignment.id(),description,dueAt,lateUntil,now);
        }
        audit.record(user.id(),"ASSIGNMENT_UPDATED","assignment",assignment.id(),Map.of(),requestId);
        return teacherAssignmentView(mapper.findAssignment(assignment.id()));
    }
    @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public TeacherAssignmentDTO publishAssignment(UserDTO user,String assignmentId,String requestId) {
        Assignment assignment=assignmentOr404(assignmentId);
        access.requireTeacher(user,assignment.offeringId(),true);
        if("archived".equals(assignment.status())) {
            throw new BusinessException(HttpStatus.CONFLICT,"ASSIGNMENT_ARCHIVED","归档作业拒绝继续教学写入。");
        }
        if("draft".equals(assignment.status())) {
            Instant now=now();
            mapper.publishAssignment(assignment.id(),now);
            audit.record(user.id(),"ASSIGNMENT_PUBLISHED","assignment",assignment.id(),Map.of(),requestId);
        }
        return teacherAssignmentView(mapper.findAssignment(assignment.id()));
    }
    @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public TeacherAssignmentDTO archiveAssignment(UserDTO user,String assignmentId,String requestId) {
        Assignment assignment=assignmentOr404(assignmentId);
        access.requireTeacher(user,assignment.offeringId(),true);
        if("published".equals(assignment.status())) {
            // 归档检查：拒绝有待评阅提交的归档。
            int pendingReviews=mapper.countPendingReviews(assignment.id());
            if(pendingReviews>0) {
                throw new BusinessException(HttpStatus.CONFLICT,"PENDING_REVIEWS_EXIST","存在待评阅提交，无法归档作业。");
            }
            Instant now=now();
            mapper.archiveAssignment(assignment.id(),now);
            audit.record(user.id(),"ASSIGNMENT_ARCHIVED","assignment",assignment.id(),Map.of(),requestId);
        }
        return teacherAssignmentView(mapper.findAssignment(assignment.id()));
    }
    public SubmissionListResponse listTeacherSubmissions(UserDTO user,String assignmentId,int page,int pageSize) {
        Assignment assignment=assignmentOr404(assignmentId);
        access.requireTeacher(user,assignment.offeringId(),false);
        AssignmentInput.page(page,pageSize);
        List<TeacherSubmissionSummaryDTO> items=mapper.listAssignmentSubmissions(assignment.id(),offset(page,pageSize),pageSize);
        int total=mapper.countAssignmentSubmissions(assignment.id());
        return new SubmissionListResponse(items,page,pageSize,total);
    }
    @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public FeedbackDTO saveFeedbackDraft(UserDTO user,String submissionId,Map<String,Object> body,String requestId) {
        Submission submission=submissionOr404(submissionId);
        Assignment assignment=assignmentOr404(submission.assignmentId());
        access.requireTeacher(user,submission.offeringId(),true);
        if("archived".equals(assignment.status())) {
            throw new BusinessException(HttpStatus.CONFLICT,"ASSIGNMENT_ARCHIVED","归档作业拒绝继续教学写入。");
        }
        AssignmentInput.validateFeedbackWrite(body);
        String overallComment=AssignmentInput.text(body,"overallComment",8000);
        BigDecimal finalScore=AssignmentInput.optionalDecimal(body,"finalScore");
        @SuppressWarnings("unchecked")
        List<Map<String,Object>> rubricList=(List<Map<String,Object>>)body.get("rubricScores");
        Instant now=now();
        Feedback existing=mapper.findFeedbackBySubmission(submission.id());
        if(existing==null) {
            String feedbackId=UUID.randomUUID().toString();
            mapper.insertFeedback(feedbackId,submission.id(),submission.assignmentId(),submission.offeringId(),
                    submission.studentId(),user.id(),overallComment,finalScore,now);
            if(rubricList!=null) {
                for(Map<String,Object> r:rubricList) {
                    mapper.insertFeedbackRubricScore(feedbackId,AssignmentInput.text(r,"criterionId",64),
                            AssignmentInput.decimal(r,"score"),AssignmentInput.text(r,"comment",2000));
                }
            }
            audit.record(user.id(),"FEEDBACK_CREATED","feedback",feedbackId,Map.of(),requestId);
            return feedbackView(mapper.findFeedback(feedbackId));
        } else {
            if("published".equals(existing.status())) {
                throw new BusinessException(HttpStatus.CONFLICT,"FEEDBACK_ALREADY_PUBLISHED","已发布的反馈不可修改。");
            }
            int baseVersion=AssignmentInput.integer(body,"baseVersion");
            if(baseVersion!=existing.baseVersion()) throw versionConflict();
            int updated=mapper.updateFeedbackDraft(existing.id(),baseVersion,overallComment,finalScore,now);
            if(updated==0) throw versionConflict();
            mapper.deleteFeedbackRubricScores(existing.id());
            if(rubricList!=null) {
                for(Map<String,Object> r:rubricList) {
                    mapper.insertFeedbackRubricScore(existing.id(),AssignmentInput.text(r,"criterionId",64),
                            AssignmentInput.decimal(r,"score"),AssignmentInput.text(r,"comment",2000));
                }
            }
            audit.record(user.id(),"FEEDBACK_UPDATED","feedback",existing.id(),Map.of(),requestId);
            return feedbackView(mapper.findFeedback(existing.id()));
        }
    }
    @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public FeedbackDTO publishFeedback(UserDTO user,String feedbackId,String requestId) {
        Feedback feedback=feedbackOr404(feedbackId);
        Assignment assignment=assignmentOr404(feedback.assignmentId());
        access.requireTeacher(user,feedback.offeringId(),true);
        if("archived".equals(assignment.status())) {
            throw new BusinessException(HttpStatus.CONFLICT,"ASSIGNMENT_ARCHIVED","归档作业拒绝继续教学写入。");
        }
        if("published".equals(feedback.status())) {
            throw new BusinessException(HttpStatus.CONFLICT,"FEEDBACK_ALREADY_PUBLISHED","反馈已发布，不可重复发布。");
        }
        Instant now=now();
        int updated=mapper.publishFeedback(feedback.id(),now);
        if(updated==0) {
            throw new BusinessException(HttpStatus.CONFLICT,"FEEDBACK_ALREADY_PUBLISHED","反馈已发布，不可重复发布。");
        }
        String notificationId=UUID.randomUUID().toString();
        String title="作业 "+assignment.title()+" 已获批阅";
        String content="教师已对您的提交进行批阅，请查看反馈详情。";
        mapper.insertNotification(notificationId,feedback.studentId(),"feedback_published",title,content,
                feedback.offeringId(),feedback.assignmentId(),feedback.id(),now);
        audit.record(user.id(),"FEEDBACK_PUBLISHED","feedback",feedback.id(),Map.of("notificationId",notificationId),requestId);
        return feedbackView(mapper.findFeedback(feedback.id()));
    }
    public FeedbackDTO getFeedback(UserDTO user,String submissionId) {
        Submission submission=submissionOr404(submissionId);
        Feedback feedback=mapper.findFeedbackBySubmission(submission.id());
        if(feedback==null) throw CourseAccess.notFound();
        try {
            access.requireTeacher(user,submission.offeringId(),false);
            return feedbackView(feedback);
        } catch(BusinessException e) {
            access.requireStudent(user,submission.offeringId(),false);
            if(!submission.studentId().equals(user.id())) throw CourseAccess.notFound();
            if("draft".equals(feedback.status())) throw CourseAccess.notFound();
            return feedbackView(feedback);
        }
    }
    public NotificationListResponse listMyNotifications(UserDTO user,int page,int pageSize) {
        CourseAccess.role(user,"student");
        AssignmentInput.page(page,pageSize);
        List<NotificationDTO> items=mapper.listNotifications(user.id(),offset(page,pageSize),pageSize);
        int total=mapper.countNotifications(user.id());
        int unread=mapper.countUnreadNotifications(user.id());
        return new NotificationListResponse(items,page,pageSize,total,unread);
    }
    @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public void markNotificationRead(UserDTO user,String notificationId,String requestId) {
        CourseAccess.role(user,"student");
        Notification notification=notificationOr404(notificationId);
        if(!notification.recipientId().equals(user.id())) throw CourseAccess.notFound();
        if(!notification.isRead()) {
            Instant now=now();
            mapper.markNotificationRead(notification.id(),now);
            audit.record(user.id(),"NOTIFICATION_READ","notification",notification.id(),Map.of(),requestId);
        }
    }
    // 辅助方法
    private Assignment assignmentOr404(String id) {
        Assignment a=mapper.findAssignment(AssignmentInput.uuid(id));
        if(a==null) throw CourseAccess.notFound();
        return a;
    }
    private Submission submissionOr404(String id) {
        Submission s=mapper.findSubmission(AssignmentInput.uuid(id));
        if(s==null) throw CourseAccess.notFound();
        return s;
    }
    private Feedback feedbackOr404(String id) {
        Feedback f=mapper.findFeedback(AssignmentInput.uuid(id));
        if(f==null) throw CourseAccess.notFound();
        return f;
    }
    private Notification notificationOr404(String id) {
        Notification n=mapper.findNotification(AssignmentInput.uuid(id));
        if(n==null) throw CourseAccess.notFound();
        return n;
    }
    private FeedbackDTO feedbackView(Feedback f) {
        List<FeedbackRubricScore> scores=mapper.getFeedbackRubricScores(f.id());
        return new FeedbackDTO(f.id(),f.submissionId(),f.status(),f.baseVersion(),f.overallComment(),
                f.finalScore(),scores.stream().map(s->new RubricScore(s.criterionId(),s.score(),s.comment())).toList(),
                f.publishedAt(),f.updatedAt());
    }
    private boolean canSave(Assignment assignment,CourseAccess.Context context) {
        if(!"active".equals(context.offering().status())) return false;
        if("archived".equals(assignment.status())) return false;
        Instant now=now();
        if(assignment.lateUntil()!=null) return now.isBefore(assignment.lateUntil());
        return true;
    }
    private String saveBlockedReason(Assignment assignment,CourseAccess.Context context) {
        if(!"active".equals(context.offering().status())) return "教学班已归档。";
        if("archived".equals(assignment.status())) return "作业已归档。";
        Instant now=now();
        if(assignment.lateUntil()!=null&&!now.isBefore(assignment.lateUntil())) return "作业已截止。";
        return "保存已锁定。";
    }
    private boolean canSubmit(Assignment assignment,CourseAccess.Context context,int attemptsUsed) {
        if(!"active".equals(context.offering().status())) return false;
        if("archived".equals(assignment.status())) return false;
        Instant now=now();
        if(assignment.lateUntil()!=null&&!now.isBefore(assignment.lateUntil())) return false;
        if(!assignment.allowResubmit()&&attemptsUsed>=1) return false;
        if(attemptsUsed>=assignment.maxAttempts()) return false;
        return true;
    }
    private String submitBlockedReason(Assignment assignment,CourseAccess.Context context,int attemptsUsed) {
        if(!"active".equals(context.offering().status())) return "教学班已归档。";
        if("archived".equals(assignment.status())) return "作业已归档。";
        Instant now=now();
        if(assignment.lateUntil()!=null&&!now.isBefore(assignment.lateUntil())) return "作业已截止。";
        if(!assignment.allowResubmit()&&attemptsUsed>=1) return "不允许重新提交。";
        if(attemptsUsed>=assignment.maxAttempts()) return "已达到最大提交次数。";
        return "提交已锁定。";
    }
    private AssignmentDetailDTO studentView(Assignment a,String studentId,int attemptsUsed,boolean canSubmit,String blockedReason) {
        List<AssignmentRequirement> requirements=mapper.getRequirements(a.id());
        List<AssignmentRows.RubricCriterion> rubric=mapper.getRubric(a.id());
        List<String> knowledgePointIds=mapper.getKnowledgePointIds(a.id());
        Submission latest=mapper.findSubmissionByRevision(a.id(),studentId,Integer.MAX_VALUE);
        String latestSubmissionId=latest!=null?latest.id():null;
        Instant now=now();boolean overdue=a.dueAt().isBefore(now)&&(a.lateUntil()==null||a.lateUntil().isBefore(now));
        return new AssignmentDetailDTO(a.id(),a.offeringId(),a.status(),a.chapterId(),a.title(),a.type(),
                a.isRequired(),"published",a.description(),a.dueAt(),determineAssignmentState(a,attemptsUsed,now),
                overdue,latestSubmissionId,null,false,
                requirements.stream().map(AssignmentRequirement::requirementText).toList(),
                a.estimatedMinutes(),a.maxScore(),
                rubric.stream().map(r->new AssignmentDTOs.RubricCriterion(r.criterionId(),r.title(),r.description(),r.maxScore())).toList(),
                knowledgePointIds,a.lateUntil(),a.allowResubmit(),a.maxAttempts(),attemptsUsed,
                canSubmit,blockedReason,a.currentAiPolicyId()!=null?1:null);
    }
    private AssignmentDetailDTO teacherStudentView(Assignment a) {
        List<AssignmentRequirement> requirements=mapper.getRequirements(a.id());
        List<AssignmentRows.RubricCriterion> rubric=mapper.getRubric(a.id());
        List<String> knowledgePointIds=mapper.getKnowledgePointIds(a.id());
        return new AssignmentDetailDTO(a.id(),a.offeringId(),a.status(),a.chapterId(),a.title(),a.type(),
                a.isRequired(),"published",a.description(),a.dueAt(),null,false,null,null,false,
                requirements.stream().map(AssignmentRequirement::requirementText).toList(),
                a.estimatedMinutes(),a.maxScore(),
                rubric.stream().map(r->new AssignmentDTOs.RubricCriterion(r.criterionId(),r.title(),r.description(),r.maxScore())).toList(),
                knowledgePointIds,a.lateUntil(),a.allowResubmit(),a.maxAttempts(),0,false,null,
                a.currentAiPolicyId()!=null?1:null);
    }
    private String determineAssignmentState(Assignment a,int attemptsUsed,Instant now) {
        if(attemptsUsed==0) return "not_started";
        if("archived".equals(a.status())) return "archived";
        boolean overdue=a.dueAt().isBefore(now)&&(a.lateUntil()==null||a.lateUntil().isBefore(now));
        if(overdue) return "overdue";
        return "in_progress";
    }
    private TeacherAssignmentDTO teacherAssignmentView(Assignment a) {
        List<AssignmentRequirement> requirements=mapper.getRequirements(a.id());
        List<AssignmentRows.RubricCriterion> rubric=mapper.getRubric(a.id());
        List<String> knowledgePointIds=mapper.getKnowledgePointIds(a.id());
        List<InitialFile> initialFiles=mapper.getInitialFiles(a.id());
        int submittedCount=mapper.countAssignmentSubmissions(a.id());
        int pendingReviewCount=mapper.countPendingReviews(a.id());
        return new TeacherAssignmentDTO(a.chapterId(),a.title(),a.type(),a.isRequired(),a.description(),
                requirements.stream().map(AssignmentRequirement::requirementText).toList(),
                a.estimatedMinutes(),knowledgePointIds,a.dueAt(),a.lateUntil(),a.allowResubmit(),a.maxAttempts(),
                a.maxScore(),rubric.stream().map(r->new AssignmentDTOs.RubricCriterion(r.criterionId(),r.title(),r.description(),r.maxScore())).toList(),
                initialFiles.stream().map(f->new FileDTO(f.filePath(),f.content())).toList(),
                a.currentAiPolicyId()!=null?1:null,a.id(),a.offeringId(),a.status(),a.publishedAt(),
                submittedCount,pendingReviewCount);
    }
    private SubmissionSummaryDTO submissionSummary(Submission s) {
        return new SubmissionSummaryDTO(s.id(),s.assignmentId(),s.offeringId(),s.attemptNo(),s.workspaceRevision(),
                s.submittedAt(),s.isLate(),!s.isCurrent(),"pending");
    }
    private SubmissionDetailDTO submissionDetail(Submission s) {
        List<SubmissionFile> files=mapper.getSubmissionFiles(s.id());
        List<SubmissionRequirementSnapshot> requirements=mapper.getSubmissionRequirements(s.id());
        List<SubmissionRubricSnapshot> rubric=mapper.getSubmissionRubric(s.id());
        List<String> knowledgePointIds=mapper.getKnowledgePointIds(s.assignmentId());
        AssignmentSnapshot snapshot=new AssignmentSnapshot(s.assignmentTitleSnapshot(),
                requirements.stream().map(SubmissionRequirementSnapshot::requirementText).toList(),
                rubric.stream().map(r->new AssignmentDTOs.RubricCriterion(r.criterionId(),r.title(),r.description(),r.maxScore())).toList(),
                s.maxScoreSnapshot(),List.of(),s.contentVersion(),s.dueAtSnapshot(),s.aiPolicyId()!=null?1:null);
        return new SubmissionDetailDTO(s.id(),s.assignmentId(),s.offeringId(),s.attemptNo(),s.workspaceRevision(),
                s.submittedAt(),s.isLate(),!s.isCurrent(),"pending",
                files.stream().map(f->new FileDTO(f.filePath(),f.content())).toList(),
                s.reflection(),snapshot,null);
    }
    private int count(AssignmentCounts counts,String filter) {
        return switch(filter) {
            case "todo"->counts.todoCount();
            case "done"->counts.doneCount();
            default->counts.allCount();
        };
    }
    private Map<String,Integer> summary(AssignmentCounts counts) {
        return Map.of("allCount",counts.allCount(),"todoCount",counts.todoCount(),
                "doneCount",counts.doneCount(),"archivedIncompleteCount",counts.archivedIncompleteCount());
    }
    private BusinessException versionConflict() {
        return new BusinessException(HttpStatus.CONFLICT,"VERSION_CONFLICT","工作区版本冲突，请刷新后重试。");
    }
    private long offset(int page,int size) { return (long)(page-1)*size; }
    private Instant now() { return clock.instant().truncatedTo(ChronoUnit.MICROS); }
    // 响应包装记录
    public record AssignmentListResponse(List<?> items,int page,int pageSize,int total,Map<String,Integer> summary) {}
    public record SubmissionListResponse(List<?> items,int page,int pageSize,int total) {}
    public record SubmissionCreatedResponse(SubmissionSummaryDTO submission,boolean created) {}
    public record NotificationListResponse(List<NotificationDTO> items,int page,int pageSize,int total,int unreadCount) {}
}
