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
        // offeringId/termId 可选过滤；指定 offeringId 时学生必须是该班成员。summary 与 items 基于同一派生视图。
        String offering=offeringId!=null?AssignmentInput.uuid(offeringId):null;
        String term=termId!=null?AssignmentInput.uuid(termId):null;
        if(offering!=null) access.requireStudent(user,offering,false);
        AssignmentCounts counts=mapper.getAssignmentCounts(user.id(),offering,term);
        List<AssignmentSummaryDTO> items=mapper.listStudentAssignments(user.id(),offering,term,filter,now(),offset(page,pageSize),pageSize);
        return new AssignmentListResponse(items,page,pageSize,count(counts,filter),summary(counts));
    }
    /** 本班学生返回 AssignmentDetailDTO；本班授课教师返回 TeacherAssignmentViewDTO（学生字段为 null）。 */
    public Object getAssignment(UserDTO user,String assignmentId) {
        Assignment assignment=assignmentOr404(assignmentId);
        CourseAccess.Context context=access.requireReader(user,assignment.offeringId());
        if("teacher".equals(context.member().role())) return teacherDetailView(assignment,context);
        if("draft".equals(assignment.status())) throw CourseAccess.notFound();
        Instant now=now();
        AssignmentSummaryDTO summary=mapper.findStudentAssignmentSummary(user.id(),null,null,assignment.id(),now);
        if(summary==null) throw CourseAccess.notFound();
        int attemptsUsed=mapper.countSubmissions(assignment.id(),user.id());
        String blockedReason=submitBlockedReason(assignment,context,attemptsUsed,"REVIEWED".equals(summary.assignmentState()),now);
        return studentView(assignment,summary,attemptsUsed,blockedReason);
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
        CourseAccess.Context context=access.requireStudent(user,assignment.offeringId(),false);
        if("draft".equals(assignment.status())) throw CourseAccess.notFound();
        // 业务阻断（归档）优先于输入校验；错误码即契约枚举 OFFERING_ARCHIVED / ASSIGNMENT_ARCHIVED。
        String blocked=saveBlockedReason(assignment,context);
        if(blocked!=null) throw blockedException(blocked);
        AssignmentInput.validateWorkspaceWrite(body,allowedPaths(assignment.type()));
        int baseRevision=AssignmentInput.integer(body,"baseRevision");
        List<FileDTO> files=AssignmentInput.workspaceFiles(body);
        String activeFile=(String)body.get("activeFile");
        Instant now=now();
        Workspace workspace=mapper.findWorkspace(assignment.id(),user.id());
        if(workspace==null) {
            // 首次保存：创建工作区。并发场景下可能重复 INSERT，需捕获并重试查询。
            if(baseRevision!=0) throw versionConflict(0);
            String id=UUID.randomUUID().toString();
            try {
                mapper.insertWorkspace(id,assignment.offeringId(),assignment.id(),user.id(),activeFile,now);
                for(FileDTO f:files) mapper.insertWorkspaceFile(id,f.path(),f.content());
                workspace=mapper.findWorkspace(assignment.id(),user.id());
            } catch(org.springframework.dao.DuplicateKeyException e) {
                // 并发线程已创建，重新查询并按乐观锁更新。
                workspace=mapper.findWorkspace(assignment.id(),user.id());
                if(workspace==null) throw e;
                if(baseRevision!=workspace.revision()) throw versionConflict(workspace.revision());
                int updated=mapper.updateWorkspace(workspace.id(),baseRevision,activeFile,now);
                if(updated==0) throw versionConflict(currentRevision(assignment,user));
                mapper.deleteWorkspaceFiles(workspace.id());
                for(FileDTO f:files) mapper.insertWorkspaceFile(workspace.id(),f.path(),f.content());
                workspace=mapper.findWorkspace(assignment.id(),user.id());
            }
        } else {
            // 乐观锁：检查 baseRevision 是否匹配当前 revision。
            if(baseRevision!=workspace.revision()) throw versionConflict(workspace.revision());
            int updated=mapper.updateWorkspace(workspace.id(),baseRevision,activeFile,now);
            if(updated==0) throw versionConflict(currentRevision(assignment,user));
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
        // 业务检查优先于输入校验，避免归档状态返回 VALIDATION_ERROR；错误码即契约的 SubmissionBlockedReason 枚举。
        int attemptsUsed=mapper.countSubmissions(assignment.id(),user.id());
        AssignmentSummaryDTO mine=mapper.findStudentAssignmentSummary(user.id(),null,null,assignment.id(),now());
        if(mine==null) throw CourseAccess.notFound();
        String blocked=submitBlockedReason(assignment,context,attemptsUsed,"REVIEWED".equals(mine.assignmentState()),now());
        if(blocked!=null) throw blockedException(blocked);
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
        // 未传（null）或 all 不加状态条件，返回 draft/published/archived 全部。
        String state=null;
        if(publicationState!=null&&!"all".equals(publicationState)) {
            if(!List.of("draft","published","archived").contains(publicationState)) throw AssignmentInput.invalid();
            state=publicationState;
        }
        List<TeacherAssignmentDTO> items=mapper.listTeacherAssignments(offeringId,state,offset(page,pageSize),pageSize)
                .stream().map(this::teacherAssignmentView).toList();
        int total=mapper.countTeacherAssignments(offeringId,state);
        return new AssignmentListResponse(items,page,pageSize,total,null);
    }
    @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public TeacherAssignmentDTO createAssignment(UserDTO user,String offeringId,Map<String,Object> body,String requestId) {
        access.requireTeacher(user,AssignmentInput.uuid(offeringId),true);
        AssignmentInput.checkCreateBody(body);
        AssignmentInput.Draft draft=AssignmentInput.parseDraft(body);
        validateAssociations(offeringId,draft,false);
        Instant now=now();String id=UUID.randomUUID().toString();
        mapper.insertAssignment(id,offeringId,draft.chapterId(),draft.title(),draft.description(),draft.estimatedMinutes(),
                draft.type(),"draft",draft.isRequired(),draft.dueAt(),draft.lateUntil(),draft.allowResubmit(),
                draft.maxAttempts(),draft.maxScore(),null,user.id(),now);
        insertRequirements(id,draft);insertRubric(id,draft);insertInitialFiles(id,draft);insertKnowledgePoints(id,offeringId,draft);
        audit.record(user.id(),"ASSIGNMENT_CREATED","assignment",id,Map.of(),requestId);
        return teacherAssignmentView(mapper.findAssignment(id));
    }
    public TeacherAssignmentDTO getTeacherAssignment(UserDTO user,String assignmentId) {
        Assignment assignment=assignmentOr404(assignmentId);
        access.requireTeacher(user,assignment.offeringId(),false);
        return teacherAssignmentView(assignment);
    }
    /** draft：与当前内容合并后整体重新校验（省略保持不变，null 仅清空 chapterId/lateUntil，数组整体替换）；
     *  published：仅 description/dueAt/lateUntil，改核心字段或缩短窗口为 409 ASSIGNMENT_ALREADY_PUBLISHED。 */
    @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public TeacherAssignmentDTO patchAssignment(UserDTO user,String assignmentId,Map<String,Object> body,String requestId) {
        Assignment assignment=assignmentOr404(assignmentId);
        access.requireTeacher(user,assignment.offeringId(),true);
        if("archived".equals(assignment.status())) throw assignmentArchived();
        AssignmentInput.checkPatchBody(body);
        Instant now=now();
        if("draft".equals(assignment.status())) {
            Map<String,Object> merged=contentMap(assignment);
            merged.putAll(body);
            AssignmentInput.Draft draft=AssignmentInput.parseDraft(merged);
            validateAssociations(assignment.offeringId(),draft,false);
            if(mapper.updateAssignmentDraft(assignment.id(),draft.chapterId(),draft.title(),draft.description(),
                    draft.estimatedMinutes(),draft.type(),draft.isRequired(),draft.dueAt(),draft.lateUntil(),
                    draft.allowResubmit(),draft.maxAttempts(),draft.maxScore(),now)==0) throw assignmentAlreadyPublished();
            if(body.containsKey("requirements")) { mapper.deleteRequirements(assignment.id());insertRequirements(assignment.id(),draft); }
            if(body.containsKey("rubric")) { mapper.deleteRubric(assignment.id());insertRubric(assignment.id(),draft); }
            if(body.containsKey("initialFiles")||body.containsKey("type")) {
                mapper.deleteInitialFiles(assignment.id());insertInitialFiles(assignment.id(),draft);
            }
            if(body.containsKey("knowledgePointIds")) {
                mapper.deleteKnowledgePoints(assignment.id());insertKnowledgePoints(assignment.id(),assignment.offeringId(),draft);
            }
        } else {
            for(String key:body.keySet()) {
                if(!List.of("description","dueAt","lateUntil").contains(key)) throw assignmentAlreadyPublished();
            }
            String description=body.containsKey("description")?AssignmentInput.textOrEmpty(body,"description",8000):assignment.description();
            Instant dueAt=body.containsKey("dueAt")?AssignmentInput.timestamp(body,"dueAt"):assignment.dueAt();
            Instant lateUntil=body.containsKey("lateUntil")?AssignmentInput.optionalTimestamp(body,"lateUntil"):assignment.lateUntil();
            // 不得缩短窗口：dueAt 不能提前；已有补交窗口不能清空或提前；原本为 null 保持 null 不算缩短。
            if(dueAt.isBefore(assignment.dueAt())) throw assignmentAlreadyPublished();
            if(assignment.lateUntil()!=null&&(lateUntil==null||lateUntil.isBefore(assignment.lateUntil()))) throw assignmentAlreadyPublished();
            if(lateUntil!=null&&!lateUntil.isAfter(dueAt)) throw AssignmentInput.invalid();
            mapper.updateAssignmentPublished(assignment.id(),description,dueAt,lateUntil,now);
        }
        audit.record(user.id(),"ASSIGNMENT_UPDATED","assignment",assignment.id(),Map.of(),requestId);
        return teacherAssignmentView(mapper.findAssignment(assignment.id()));
    }
    /** 首次发布：完整性校验（与创建同一套规则，另要求关联章节已发布）→ 条件更新 draft→published 并递增 contentVersion
     *  → 同事务为本班 active 学生写 assignment_published 通知。已发布重复调用按原结果返回，不重复提醒。 */
    @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public TeacherAssignmentDTO publishAssignment(UserDTO user,String assignmentId,String requestId) {
        Assignment assignment=assignmentOr404(assignmentId);
        access.requireTeacher(user,assignment.offeringId(),true);
        if("archived".equals(assignment.status())) throw assignmentArchived();
        if("draft".equals(assignment.status())) {
            AssignmentInput.Draft draft=AssignmentInput.parseDraft(contentMap(assignment));
            validateAssociations(assignment.offeringId(),draft,true);
            Instant now=now();
            if(mapper.publishAssignment(assignment.id(),now)==1) {
                // P1 无 AI 规则版本：current_ai_policy_id 保持 null，响应 aiPolicyVersion=null。
                int notified=0;
                for(String studentId:mapper.listActiveStudentIds(assignment.offeringId())) {
                    mapper.insertNotification(UUID.randomUUID().toString(),studentId,"assignment_published",
                            "新作业：".concat(assignment.title()),
                            "教师发布了新作业《".concat(assignment.title()).concat("》，请在截止前完成并提交。"),
                            assignment.offeringId(),assignment.id(),null,now);
                    notified++;
                }
                audit.record(user.id(),"ASSIGNMENT_PUBLISHED","assignment",assignment.id(),Map.of("notified",notified),requestId);
            }
        }
        return teacherAssignmentView(mapper.findAssignment(assignment.id()));
    }
    @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public TeacherAssignmentDTO archiveAssignment(UserDTO user,String assignmentId,String requestId) {
        Assignment assignment=assignmentOr404(assignmentId);
        access.requireTeacher(user,assignment.offeringId(),true);
        if("draft".equals(assignment.status())) {
            throw new BusinessException(HttpStatus.CONFLICT,"ASSIGNMENT_NOT_PUBLISHED","草稿作业不能归档。");
        }
        if("published".equals(assignment.status())) {
            if(mapper.countPendingReviews(assignment.id())>0) {
                throw new BusinessException(HttpStatus.CONFLICT,"ARCHIVE_PENDING_REVIEWS","存在未批阅的当前提交，无法归档作业。");
            }
            mapper.archiveAssignment(assignment.id(),now());
            audit.record(user.id(),"ASSIGNMENT_ARCHIVED","assignment",assignment.id(),Map.of(),requestId);
        }
        return teacherAssignmentView(mapper.findAssignment(assignment.id()));
    }
    /** 同班校验：章节必须属于本班（发布时还须已发布）；知识点必须属于本班，且绑定章节时须与作业章节一致。 */
    private void validateAssociations(String offeringId,AssignmentInput.Draft draft,boolean requirePublishedChapter) {
        if(draft.chapterId()!=null) {
            String status=mapper.findChapterStatus(draft.chapterId(),offeringId);
            if(status==null||(requirePublishedChapter&&!"published".equals(status))) throw AssignmentInput.invalid();
        }
        if(!draft.knowledgePointIds().isEmpty()) {
            List<AssignmentMapper.KnowledgePointRef> refs=mapper.listKnowledgePointRefs(offeringId,draft.knowledgePointIds());
            if(refs.size()!=draft.knowledgePointIds().size()) throw AssignmentInput.invalid();
            for(AssignmentMapper.KnowledgePointRef ref:refs) {
                if(ref.chapterId()!=null&&!ref.chapterId().equals(draft.chapterId())) throw AssignmentInput.invalid();
            }
        }
    }
    /** 把数据库中的作业内容还原为 AssignmentWriteDTO 形状的 Map，用于 PATCH 合并与发布前整体校验。 */
    private Map<String,Object> contentMap(Assignment a) {
        Map<String,Object> m=new java.util.HashMap<>();
        m.put("chapterId",a.chapterId());m.put("title",a.title());m.put("description",a.description());
        m.put("estimatedMinutes",a.estimatedMinutes());m.put("type",a.type());m.put("isRequired",a.isRequired());
        m.put("dueAt",a.dueAt().toString());m.put("lateUntil",a.lateUntil()==null?null:a.lateUntil().toString());
        m.put("allowResubmit",a.allowResubmit());m.put("maxAttempts",a.maxAttempts());m.put("maxScore",a.maxScore());
        m.put("requirements",mapper.getRequirements(a.id()).stream().map(AssignmentRequirement::requirementText).toList());
        List<Object> rubric=new ArrayList<>();
        for(AssignmentRows.RubricCriterion r:mapper.getRubric(a.id())) {
            Map<String,Object> item=new java.util.HashMap<>();
            item.put("criterionId",r.criterionId());item.put("title",r.title());
            item.put("description",r.description());item.put("maxScore",r.maxScore());
            rubric.add(item);
        }
        m.put("rubric",rubric);
        List<Object> files=new ArrayList<>();
        for(InitialFile f:mapper.getInitialFiles(a.id())) files.add(Map.of("path",f.filePath(),"content",f.content()));
        m.put("initialFiles",files);
        m.put("knowledgePointIds",new ArrayList<Object>(mapper.getKnowledgePointIds(a.id())));
        return m;
    }
    private void insertRequirements(String id,AssignmentInput.Draft d) {
        for(int i=0;i<d.requirements().size();i++) mapper.insertRequirement(id,i+1,d.requirements().get(i));
    }
    private void insertRubric(String id,AssignmentInput.Draft d) {
        for(AssignmentDTOs.RubricCriterion r:d.rubric()) mapper.insertRubric(id,r.criterionId(),r.title(),r.description(),r.maxScore());
    }
    private void insertInitialFiles(String id,AssignmentInput.Draft d) {
        for(FileDTO f:d.initialFiles()) mapper.insertInitialFile(id,f.path(),f.content());
    }
    private void insertKnowledgePoints(String id,String offeringId,AssignmentInput.Draft d) {
        for(String kp:d.knowledgePointIds()) mapper.insertKnowledgePoint(id,offeringId,kp);
    }
    private BusinessException assignmentArchived() {
        return new BusinessException(HttpStatus.CONFLICT,"ASSIGNMENT_ARCHIVED","归档作业拒绝继续教学写入。");
    }
    private BusinessException assignmentAlreadyPublished() {
        return new BusinessException(HttpStatus.CONFLICT,"ASSIGNMENT_ALREADY_PUBLISHED","已发布作业不能修改核心字段或缩短提交窗口。");
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
            if(baseVersion!=existing.baseVersion()) throw feedbackVersionConflict(existing.baseVersion());
            int updated=mapper.updateFeedbackDraft(existing.id(),baseVersion,overallComment,finalScore,now);
            if(updated==0) throw feedbackVersionConflict(existing.baseVersion());
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
    public FeedbackDTO publishFeedback(UserDTO user,String submissionId,Map<String,Object> body,String requestId) {
        int baseVersion=AssignmentInput.integer(body,"baseVersion");
        Submission submission=submissionOr404(submissionId);
        Feedback feedback=mapper.findFeedbackBySubmission(submission.id());
        if(feedback==null) throw CourseAccess.notFound();
        Assignment assignment=assignmentOr404(feedback.assignmentId());
        access.requireTeacher(user,feedback.offeringId(),true);
        if("archived".equals(assignment.status())) {
            throw new BusinessException(HttpStatus.CONFLICT,"ASSIGNMENT_ARCHIVED","归档作业拒绝继续教学写入。");
        }
        if("published".equals(feedback.status())) {
            throw new BusinessException(HttpStatus.CONFLICT,"FEEDBACK_ALREADY_PUBLISHED","反馈已发布，不可重复发布。");
        }
        if(feedback.baseVersion()!=baseVersion) {
            throw new BusinessException(HttpStatus.CONFLICT,"VERSION_CONFLICT","反馈版本冲突，请刷新后重试。");
        }
        Instant now=now();
        int updated=mapper.publishFeedback(feedback.id(),now);
        if(updated==0) {
            throw new BusinessException(HttpStatus.CONFLICT,"FEEDBACK_ALREADY_PUBLISHED","反馈已发布，不可重复发布。");
        }
        String notificationId=UUID.randomUUID().toString();
        String title="作业 "+assignment.title()+" 已获批阅";
        String content="教师已对您的提交进行批阅，请查看反馈详情。";
        mapper.insertNotification(notificationId,feedback.studentId(),"feedback",title,content,
                feedback.offeringId(),feedback.assignmentId(),feedback.id(),now);
        audit.record(user.id(),"FEEDBACK_PUBLISHED","feedback",feedback.id(),Map.of("notificationId",notificationId),requestId);
        return feedbackView(mapper.findFeedback(feedback.id()));
    }
    public FeedbackDTO getFeedback(UserDTO user,String feedbackId) {
        Feedback feedback=feedbackOr404(feedbackId);
        Submission submission=submissionOr404(feedback.submissionId());
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
        if(!notification.read()) {
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
        return saveBlockedReason(assignment,context)==null;
    }
    /** SaveBlockedReason：教学班归档优先于作业归档；截止、已评价、提交次数不阻止练习保存。 */
    private String saveBlockedReason(Assignment assignment,CourseAccess.Context context) {
        if(!"active".equals(context.offering().status())) return "OFFERING_ARCHIVED";
        if("archived".equals(assignment.status())) return "ASSIGNMENT_ARCHIVED";
        return null;
    }
    /** SubmissionBlockedReason，按契约枚举顺序取首项；null 表示允许提交。 */
    private String submitBlockedReason(Assignment assignment,CourseAccess.Context context,int attemptsUsed,boolean reviewed,Instant now) {
        if(!"active".equals(context.offering().status())) return "OFFERING_ARCHIVED";
        if("archived".equals(assignment.status())) return "ASSIGNMENT_ARCHIVED";
        if(reviewed) return "RESUBMIT_AFTER_REVIEW";
        if(!assignment.allowResubmit()&&attemptsUsed>=1) return "RESUBMIT_NOT_ALLOWED";
        if(attemptsUsed>=assignment.maxAttempts()) return "ATTEMPT_LIMIT_REACHED";
        // lateUntil=null 表示禁止补交：提交窗口在 dueAt 关闭。
        Instant deadline=assignment.lateUntil()!=null?assignment.lateUntil():assignment.dueAt();
        if(now.isAfter(deadline)) return "SUBMISSION_CLOSED";
        return null;
    }
    private BusinessException blockedException(String reason) {
        String message=switch(reason) {
            case "OFFERING_ARCHIVED"->"教学班已归档。";
            case "ASSIGNMENT_ARCHIVED"->"作业已归档。";
            case "RESUBMIT_AFTER_REVIEW"->"当前提交已有发布评价，不能重新提交。";
            case "RESUBMIT_NOT_ALLOWED"->"该作业不允许重新提交。";
            case "ATTEMPT_LIMIT_REACHED"->"已达到最大提交次数。";
            default->"提交窗口已关闭。";
        };
        return new BusinessException(HttpStatus.CONFLICT,reason,message);
    }
    private static java.util.Set<String> allowedPaths(String assignmentType) {
        return switch(assignmentType) {
            case "web_lab"->java.util.Set.of("index.html","style.css","script.js");
            case "sql_text"->java.util.Set.of("answer.sql");
            default->java.util.Set.of("answer.md");
        };
    }
    private int currentRevision(Assignment assignment,UserDTO user) {
        Workspace current=mapper.findWorkspace(assignment.id(),user.id());
        return current==null?0:current.revision();
    }
    private AssignmentDetailDTO studentView(Assignment a,AssignmentSummaryDTO s,int attemptsUsed,String blockedReason) {
        List<AssignmentRequirement> requirements=mapper.getRequirements(a.id());
        List<AssignmentRows.RubricCriterion> rubric=mapper.getRubric(a.id());
        List<String> knowledgePointIds=mapper.getKnowledgePointIds(a.id());
        return new AssignmentDetailDTO(a.id(),a.offeringId(),s.offeringStatus(),a.chapterId(),a.title(),a.type(),
                a.isRequired(),s.publicationState(),a.description(),a.dueAt(),s.assignmentState(),
                s.overdue(),s.latestSubmissionId(),s.publishedFeedbackId(),s.unreadFeedback(),
                requirements.stream().map(AssignmentRequirement::requirementText).toList(),
                a.estimatedMinutes(),a.maxScore(),
                rubric.stream().map(r->new AssignmentDTOs.RubricCriterion(r.criterionId(),r.title(),r.description(),r.maxScore())).toList(),
                knowledgePointIds,a.lateUntil(),a.allowResubmit(),a.maxAttempts(),attemptsUsed,
                blockedReason==null,blockedReason,a.currentAiPolicyId()!=null?1:null);
    }
    private TeacherAssignmentViewDTO teacherDetailView(Assignment a,CourseAccess.Context context) {
        List<AssignmentRequirement> requirements=mapper.getRequirements(a.id());
        List<AssignmentRows.RubricCriterion> rubric=mapper.getRubric(a.id());
        List<String> knowledgePointIds=mapper.getKnowledgePointIds(a.id());
        return new TeacherAssignmentViewDTO(a.id(),a.offeringId(),context.offering().status(),a.chapterId(),a.title(),a.type(),
                a.isRequired(),a.status(),a.description(),a.dueAt(),null,null,null,null,null,
                requirements.stream().map(AssignmentRequirement::requirementText).toList(),
                a.estimatedMinutes(),a.maxScore(),
                rubric.stream().map(r->new AssignmentDTOs.RubricCriterion(r.criterionId(),r.title(),r.description(),r.maxScore())).toList(),
                knowledgePointIds,a.lateUntil(),a.allowResubmit(),a.maxAttempts(),null,null,null,
                a.currentAiPolicyId()!=null?1:null);
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
    private BusinessException feedbackVersionConflict(int currentVersion) {
        return new BusinessException(HttpStatus.CONFLICT,"FEEDBACK_VERSION_CONFLICT","评价版本已过期，请刷新后重试。",
                Map.of("currentVersion",currentVersion));
    }
    private BusinessException versionConflict(int currentRevision) {
        return new BusinessException(HttpStatus.CONFLICT,"WORKSPACE_CONFLICT","工作区版本冲突，请刷新后重试。",
                Map.of("currentRevision",currentRevision));
    }
    private long offset(int page,int size) { return (long)(page-1)*size; }
    private Instant now() { return clock.instant().truncatedTo(ChronoUnit.MICROS); }
    // 响应包装记录
    public record AssignmentListResponse(List<?> items,int page,int pageSize,int total,Map<String,Integer> summary) {}
    public record SubmissionListResponse(List<?> items,int page,int pageSize,int total) {}
    public record SubmissionCreatedResponse(SubmissionSummaryDTO submission,boolean created) {}
    public record NotificationListResponse(List<NotificationDTO> items,int page,int pageSize,int total,int unreadCount) {}
}
