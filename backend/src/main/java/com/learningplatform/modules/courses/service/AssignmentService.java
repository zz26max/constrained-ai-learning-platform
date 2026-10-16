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
import com.learningplatform.modules.courses.dto.CourseDTOs;
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
        // 不在此处用 write=true：归档拦截要放在幂等检查之后，同 revision 重复提交即使班级已归档也应返回原提交。
        CourseAccess.Context context=access.requireStudent(user,assignment.offeringId(),false);
        if("draft".equals(assignment.status())) throw CourseAccess.notFound();
        AssignmentInput.validateSubmissionWrite(body);
        int workspaceRevision=AssignmentInput.integer(body,"workspaceRevision");
        String reflection=AssignmentInput.text(body,"reflection",8000);
        Instant now=now();
        // 锁顺序：工作区行 → 当前提交行。同一学生同一作业的并发提交在工作区行上排队；
        // 与 saveFeedback/publishFeedback（submission 行 → feedback 行）没有交叉锁序。
        Workspace workspace=mapper.findWorkspaceForUpdate(assignment.id(),user.id());
        if(workspace!=null) {
            // 自然幂等（先于任何业务阻断）：同 revision 已提交则返回原提交，不新建、不占次数、不覆盖 reflection。
            Submission existing=mapper.findSubmissionByRevision(assignment.id(),user.id(),workspaceRevision);
            if(existing!=null) return new SubmissionCreatedResponse(submissionSummary(existing),false);
        }
        Submission currentSubmission=mapper.findCurrentSubmissionForUpdate(assignment.id(),user.id());
        Feedback currentFeedback=currentSubmission==null?null:mapper.findFeedbackBySubmission(currentSubmission.id());
        boolean reviewed=currentFeedback!=null&&"published".equals(currentFeedback.status());
        int attemptsUsed=mapper.countSubmissions(assignment.id(),user.id());
        String blocked=submitBlockedReason(assignment,context,attemptsUsed,reviewed,now);
        if(blocked!=null) throw blockedException(blocked);
        // 提交的必须是服务器当前已保存的 revision；否则 WORKSPACE_CONFLICT 并带回当前版本。
        if(workspace==null) throw versionConflict(0);
        if(workspaceRevision!=workspace.revision()) throw versionConflict(workspace.revision());
        boolean isLate=assignment.dueAt().isBefore(now);
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
    /** 本班授课教师返回 TeacherSubmissionDetailDTO；提交本人返回 SubmissionDetailDTO；其他人（含同班他人）404。 */
    public Object getSubmission(UserDTO user,String submissionId) {
        Submission submission=submissionOr404(submissionId);
        CourseAccess.Context context=access.requireReader(user,submission.offeringId());
        if("teacher".equals(context.member().role())) return teacherSubmissionDetail(submission);
        if(!submission.studentId().equals(user.id())) throw CourseAccess.notFound();
        return studentSubmissionDetail(submission);
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
    /** feedbackStatus 可选 none/draft/published；latestOnly 默认 true（只含当前提交），false 含历史版本。 */
    public SubmissionListResponse listTeacherSubmissions(UserDTO user,String assignmentId,String feedbackStatus,
            boolean latestOnly,int page,int pageSize) {
        Assignment assignment=assignmentOr404(assignmentId);
        access.requireTeacher(user,assignment.offeringId(),false);
        AssignmentInput.page(page,pageSize);
        if(feedbackStatus!=null&&!List.of("none","draft","published").contains(feedbackStatus)) {
            throw AssignmentInput.invalidField("feedbackStatus","必须是 none、draft 或 published。");
        }
        List<TeacherSubmissionSummaryDTO> items=mapper.listAssignmentSubmissions(assignment.id(),feedbackStatus,latestOnly,
                offset(page,pageSize),pageSize).stream()
                .map(r->new TeacherSubmissionSummaryDTO(r.id(),r.assignmentId(),r.offeringId(),r.attemptNumber(),
                        r.workspaceRevision(),r.submittedAt(),r.late(),r.superseded(),r.feedbackStatus(),
                        new StudentBrief(r.studentId(),r.studentUsername(),r.studentDisplayName()))).toList();
        int total=mapper.countTeacherSubmissions(assignment.id(),feedbackStatus,latestOnly);
        return new SubmissionListResponse(items,page,pageSize,total);
    }
    /** saveFeedback 的结果：created=true 对应 201，否则 200。 */
    public record FeedbackSaveResult(TeacherFeedbackDTO feedback,boolean created) {}
    /**
     * 保存评价草稿（契约 saveFeedback）。锁顺序：submission 行 → feedback 行。
     * 版本从 1 起；baseVersion 为客户端所见版本（尚无评价时为 0），每次成功保存 +1。
     */
    @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public FeedbackSaveResult saveFeedback(UserDTO user,String submissionId,Map<String,Object> body,String requestId) {
        Submission probe=submissionOr404(submissionId);
        access.requireTeacher(user,probe.offeringId(),true);
        Submission submission=mapper.findSubmissionForUpdate(probe.id());
        if(submission==null) throw CourseAccess.notFound();
        Assignment assignment=assignmentOr404(submission.assignmentId());
        if("archived".equals(assignment.status())) throw assignmentArchived();
        AssignmentInput.FeedbackDraft draft=AssignmentInput.parseFeedbackWrite(body);
        if(!submission.isCurrent()) throw submissionSuperseded();
        Feedback existing=mapper.findFeedbackBySubmissionForUpdate(submission.id());
        if(existing!=null&&"published".equals(existing.status())) {
            throw new BusinessException(HttpStatus.CONFLICT,"FEEDBACK_ALREADY_PUBLISHED","已发布的评价不能覆盖为草稿。");
        }
        int currentVersion=existing==null?0:existing.baseVersion();
        if(draft.baseVersion()!=currentVersion) throw feedbackVersionConflict(currentVersion);
        AssignmentInput.checkFeedbackAgainstSnapshot(draft.score(),draft.rubricResults(),
                mapper.getSubmissionRubric(submission.id()),submission.maxScoreSnapshot());
        Instant now=now();
        String feedbackId;
        boolean created=existing==null;
        if(created) {
            feedbackId=UUID.randomUUID().toString();
            mapper.insertFeedback(feedbackId,submission.id(),submission.assignmentId(),submission.offeringId(),
                    submission.studentId(),user.id(),draft.comment(),draft.score(),now);
        } else {
            feedbackId=existing.id();
            int updated=mapper.updateFeedbackDraft(feedbackId,draft.baseVersion(),user.id(),draft.comment(),draft.score(),now);
            if(updated==0) throw feedbackVersionConflict(latestVersion(submission.id()));
            mapper.deleteFeedbackRubricScores(feedbackId);
        }
        for(RubricResultDTO r:draft.rubricResults()) {
            mapper.insertFeedbackRubricScore(feedbackId,r.criterionId(),r.score(),r.comment());
        }
        audit.record(user.id(),created?"FEEDBACK_CREATED":"FEEDBACK_UPDATED","feedback",feedbackId,Map.of(),requestId);
        return new FeedbackSaveResult(teacherFeedbackView(mapper.findFeedback(feedbackId),submission),created);
    }
    /**
     * 发布评价（契约 publishFeedback）。同事务：锁 submission → 确认仍为当前提交 → 锁 feedback →
     * baseVersion 乐观校验 → 重验分值 → 发布并 version+1 → 写 feedback_published 通知（按评价去重）→ 审计。
     * 已发布的重复请求：baseVersion 等于发布前版本或当前版本时原样返回，不再增加版本或通知（BACKEND 核心事务）。
     */
    @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public TeacherFeedbackDTO publishFeedback(UserDTO user,String submissionId,Map<String,Object> body,String requestId) {
        Submission probe=submissionOr404(submissionId);
        access.requireTeacher(user,probe.offeringId(),true);
        Submission submission=mapper.findSubmissionForUpdate(probe.id());
        if(submission==null) throw CourseAccess.notFound();
        Assignment assignment=assignmentOr404(submission.assignmentId());
        if("archived".equals(assignment.status())) throw assignmentArchived();
        int baseVersion=AssignmentInput.parsePublishBody(body);
        if(!submission.isCurrent()) throw submissionSuperseded();
        Feedback feedback=mapper.findFeedbackBySubmissionForUpdate(submission.id());
        if(feedback==null) throw CourseAccess.notFound();
        if("published".equals(feedback.status())) {
            if(baseVersion==feedback.baseVersion()||baseVersion==feedback.baseVersion()-1) {
                return teacherFeedbackView(feedback,submission);
            }
            throw feedbackVersionConflict(feedback.baseVersion());
        }
        if(baseVersion!=feedback.baseVersion()) throw feedbackVersionConflict(feedback.baseVersion());
        if(feedback.finalScore()==null) throw AssignmentInput.invalidField("score","发布前必须填写总分。");
        List<RubricResultDTO> results=rubricResults(feedback);
        if(results.isEmpty()) throw AssignmentInput.invalidField("rubricResults","发布前必须填写量规评分。");
        AssignmentInput.checkFeedbackAgainstSnapshot(feedback.finalScore(),results,
                mapper.getSubmissionRubric(submission.id()),submission.maxScoreSnapshot());
        Instant now=now();
        int updated=mapper.publishFeedback(feedback.id(),baseVersion,user.id(),now);
        if(updated==0) throw feedbackVersionConflict(latestVersion(submission.id()));
        // 通知按评价去重：持有 feedback 行锁，已有本评价的 feedback_published 通知则不再插入。
        String messageId=mapper.findFeedbackMessageId(feedback.studentId(),feedback.id());
        if(messageId==null) {
            messageId=UUID.randomUUID().toString();
            mapper.insertNotification(messageId,feedback.studentId(),"feedback_published",
                    "作业《"+submission.assignmentTitleSnapshot()+"》已获批阅","教师已发布对您提交的评价，请查看反馈详情。",
                    feedback.offeringId(),feedback.assignmentId(),feedback.id(),now);
        }
        audit.record(user.id(),"FEEDBACK_PUBLISHED","feedback",feedback.id(),Map.of("messageId",messageId),requestId);
        return teacherFeedbackView(mapper.findFeedback(feedback.id()),submission);
    }
    /** 学生读取本人已发布评价；草稿、他人评价、不存在统一 404，教师角色 403。 */
    public StudentFeedbackViewDTO getFeedback(UserDTO user,String feedbackId) {
        CourseAccess.role(user,"student");
        Feedback feedback=feedbackOr404(feedbackId);
        if(!feedback.studentId().equals(user.id())||!"published".equals(feedback.status())) throw CourseAccess.notFound();
        access.requireStudent(user,feedback.offeringId(),false);
        Submission submission=submissionOr404(feedback.submissionId());
        return studentFeedbackView(feedback,submission);
    }
    private int latestVersion(String submissionId) {
        Feedback latest=mapper.findFeedbackBySubmission(submissionId);
        return latest==null?0:latest.baseVersion();
    }
    private BusinessException submissionSuperseded() {
        return new BusinessException(HttpStatus.CONFLICT,"SUBMISSION_SUPERSEDED","该提交已被新提交替代，不能再批阅。");
    }
    /** 契约 type 枚举 → 数据库类型；help_reply 在 P1 没有对应的个人消息类型，返回 null 表示恒为空。 */
    static String dbMessageType(String contractType) {
        return switch(contractType) {
            case "feedback"->"feedback_published";
            case "assignment_published"->"assignment_published";
            case "system"->"offering_archived";
            case "course_notice"->"notice_published";
            default->null;
        };
    }
    private static String contractMessageType(String dbType) {
        return switch(dbType) {
            case "feedback_published"->"feedback";
            case "offering_archived"->"system";
            case "notice_published"->"course_notice";
            default->dbType;
        };
    }
    /** 消息行 → 契约 NotificationDTO；关联对象被删除（外键置空）时 target 为 null。 */
    static NotificationDTO notification(AssignmentRows.MessageRow r) {
        CourseDTOs.TeacherBrief sender=r.senderId()==null?null
                :new CourseDTOs.TeacherBrief(r.senderId(),r.senderDisplayName()==null||r.senderDisplayName().isEmpty()?"教师":r.senderDisplayName());
        TargetDTO target=null;
        if(r.offeringId()!=null) {
            switch(r.type()) {
                case "feedback_published"->{ if(r.feedbackId()!=null) target=new TargetDTO("feedback",r.feedbackId(),r.offeringId()); }
                case "assignment_published"->{ if(r.assignmentId()!=null) target=new TargetDTO("assignment",r.assignmentId(),r.offeringId()); }
                case "offering_archived"->target=new TargetDTO("offering",r.offeringId(),r.offeringId());
                default->{}
            }
        }
        return new NotificationDTO(r.id(),r.offeringId(),contractMessageType(r.type()),r.title(),r.content(),
                sender,r.createdAt(),r.readAt(),target);
    }
    private static void requireMessageUser(UserDTO user) {
        if(!user.roles().contains("student")&&!user.roles().contains("teacher")) throw CourseAccess.forbidden();
    }
    /** 本人消息列表。summary.unreadCount 受 offeringId/type 过滤影响，不受 read 与分页影响。 */
    public NotificationListResponse listMessages(UserDTO user,String offeringId,String type,String read,int page,int pageSize) {
        requireMessageUser(user);
        AssignmentInput.page(page,pageSize);
        String offering=offeringId==null?null:AssignmentInput.uuid(offeringId);
        String readFilter=read==null?"all":read;
        if(!List.of("all","unread","read").contains(readFilter)) throw AssignmentInput.invalidField("read","必须是 all、unread 或 read。");
        String dbType=null;
        if(type!=null) {
            if(!List.of("course_notice","assignment_published","feedback","system","help_reply").contains(type)) {
                throw AssignmentInput.invalidField("type","不是受支持的消息类型。");
            }
            dbType=dbMessageType(type);
            if(dbType==null) return new NotificationListResponse(List.of(),page,pageSize,0,0);
        }
        List<NotificationDTO> items=mapper.listMessages(user.id(),offering,dbType,readFilter,offset(page,pageSize),pageSize)
                .stream().map(AssignmentService::notification).toList();
        int total=mapper.countMessages(user.id(),offering,dbType,readFilter);
        int unread=mapper.countUnreadInScope(user.id(),offering,dbType);
        return new NotificationListResponse(items,page,pageSize,total,unread);
    }
    /** 仅收件人本人；条件更新只在未读时写入，重复调用返回首次 readAt。别人的消息按不存在处理。 */
    @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public MessageReadDTO readMessage(UserDTO user,String messageId,String requestId) {
        requireMessageUser(user);
        Notification notification=notificationOr404(messageId);
        if(!notification.recipientId().equals(user.id())) throw CourseAccess.notFound();
        int updated=mapper.markNotificationRead(notification.id(),user.id(),now());
        if(updated==1) audit.record(user.id(),"NOTIFICATION_READ","notification",notification.id(),Map.of(),requestId);
        Notification current=mapper.findNotification(notification.id());
        if(current==null||current.readAt()==null) throw CourseAccess.notFound();
        return new MessageReadDTO(current.id(),current.readAt());
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
    private List<RubricResultDTO> rubricResults(Feedback f) {
        return mapper.getFeedbackRubricScores(f.id()).stream()
                .map(s->new RubricResultDTO(s.criterionId(),s.score(),s.comment())).toList();
    }
    private CourseDTOs.TeacherBrief teacherBrief(Feedback f) {
        String name=mapper.findUserDisplayName(f.teacherId());
        return new CourseDTOs.TeacherBrief(f.teacherId(),name==null||name.isEmpty()?"教师":name);
    }
    /** 教师视图：草稿或已发布；messageId 恒为 null（个人通知属于学生收件人）。 */
    private TeacherFeedbackDTO teacherFeedbackView(Feedback f,Submission s) {
        return new TeacherFeedbackDTO(f.id(),f.submissionId(),f.offeringId(),f.assignmentId(),s.assignmentTitleSnapshot(),
                f.baseVersion(),f.status(),f.finalScore(),s.maxScoreSnapshot(),rubricResults(f),f.overallComment(),
                List.of(),List.of(),null,teacherBrief(f),f.publishedAt(),null);
    }
    /** 学生视图：只用于已发布评价；messageId 取本人 feedback_published 消息。 */
    private StudentFeedbackViewDTO studentFeedbackView(Feedback f,Submission s) {
        return new StudentFeedbackViewDTO(f.id(),f.submissionId(),f.offeringId(),f.assignmentId(),s.assignmentTitleSnapshot(),
                f.baseVersion(),f.status(),f.finalScore(),s.maxScoreSnapshot(),rubricResults(f),f.overallComment(),
                List.of(),List.of(),null,teacherBrief(f),f.publishedAt(),
                mapper.findFeedbackMessageId(f.studentId(),f.id()));
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
    /** 学生口径摘要：feedbackStatus 只有 none/published，草稿不外露（提交接口只返回学生本人）。 */
    private SubmissionSummaryDTO submissionSummary(Submission s) {
        Feedback f=mapper.findFeedbackBySubmission(s.id());
        return new SubmissionSummaryDTO(s.id(),s.assignmentId(),s.offeringId(),s.attemptNo(),s.workspaceRevision(),
                s.submittedAt(),s.isLate(),!s.isCurrent(),f!=null&&"published".equals(f.status())?"published":"none");
    }
    /** 提交冻结的标准快照；知识点没有提交时快照表，按作业当前关联读取；P1 无 AI 政策版本，aiPolicyVersion 恒 null。 */
    private AssignmentSnapshot assignmentSnapshot(Submission s) {
        List<SubmissionRequirementSnapshot> requirements=mapper.getSubmissionRequirements(s.id());
        List<SubmissionRubricSnapshot> rubric=mapper.getSubmissionRubric(s.id());
        return new AssignmentSnapshot(s.assignmentTitleSnapshot(),
                requirements.stream().map(SubmissionRequirementSnapshot::requirementText).toList(),
                rubric.stream().map(r->new AssignmentDTOs.RubricCriterion(r.criterionId(),r.title(),r.description(),r.maxScore())).toList(),
                s.maxScoreSnapshot(),mapper.listKnowledgeSnapshots(s.assignmentId()),s.contentVersion(),s.dueAtSnapshot(),null);
    }
    private List<FileDTO> submissionFiles(Submission s) {
        return mapper.getSubmissionFiles(s.id()).stream().map(f->new FileDTO(f.filePath(),f.content())).toList();
    }
    /** 学生视图：只含已发布评价，草稿状态不可见。 */
    private SubmissionDetailDTO studentSubmissionDetail(Submission s) {
        Feedback f=mapper.findFeedbackBySubmission(s.id());
        boolean published=f!=null&&"published".equals(f.status());
        return new SubmissionDetailDTO(s.id(),s.assignmentId(),s.offeringId(),s.attemptNo(),s.workspaceRevision(),
                s.submittedAt(),s.isLate(),!s.isCurrent(),published?"published":"none",
                submissionFiles(s),s.reflection(),assignmentSnapshot(s),published?studentFeedbackView(f,s):null);
    }
    /** 教师视图：附学生信息；评价为草稿时填 draftFeedback，已发布时填 publishedFeedback。 */
    private TeacherSubmissionDetailDTO teacherSubmissionDetail(Submission s) {
        Feedback f=mapper.findFeedbackBySubmission(s.id());
        StudentBrief student=mapper.findStudentBrief(s.studentId());
        TeacherFeedbackDTO published=f!=null&&"published".equals(f.status())?teacherFeedbackView(f,s):null;
        TeacherFeedbackDTO draft=f!=null&&"draft".equals(f.status())?teacherFeedbackView(f,s):null;
        return new TeacherSubmissionDetailDTO(s.id(),s.assignmentId(),s.offeringId(),s.attemptNo(),s.workspaceRevision(),
                s.submittedAt(),s.isLate(),!s.isCurrent(),f==null?"none":f.status(),student,
                submissionFiles(s),s.reflection(),assignmentSnapshot(s),published,draft);
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
