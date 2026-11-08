package com.learningplatform.modules.checks;

import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.courses.mapper.AssignmentMapper;
import com.learningplatform.modules.courses.model.AssignmentRows.Assignment;
import com.learningplatform.modules.courses.service.AssignmentInput;
import com.learningplatform.modules.courses.service.CourseAccess;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CheckService {
    private final CheckStore store;
    private final AssignmentMapper assignments;
    private final CourseAccess access;
    private final Clock clock;
    private final boolean enabled;

    public CheckService(CheckStore store, AssignmentMapper assignments, CourseAccess access, Clock clock,
                        @Value("${checks.enabled:false}") boolean enabled) {
        this.store = store;
        this.assignments = assignments;
        this.access = access;
        this.clock = clock;
        this.enabled = enabled;
    }

    public CheckStore.Policy policy(UserDTO user, String assignmentId) {
        Assignment assignment = assignment(assignmentId);
        access.requireTeacher(user, assignment.offeringId(), false);
        return store.policy(assignmentId);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED, rollbackFor = Exception.class)
    public CheckStore.Policy savePolicy(UserDTO user, String assignmentId, Map<String, Object> body) {
        Assignment assignment = assignment(assignmentId);
        access.requireTeacher(user, assignment.offeringId(), true);
        access.lockOfferingShared(assignment.offeringId());
        assignments.lockAssignmentExclusive(assignmentId);
        assignment = assignment(assignmentId);
        access.requireTeacher(user, assignment.offeringId(), true);
        if (!"draft".equals(assignment.status())) throw conflict("CHECK_POLICY_FROZEN", "发布后不能修改判题规则。");
        if (!body.keySet().equals(Set.of("baseVersion", "config")) ||
                !(body.get("baseVersion") instanceof Integer baseVersion) || baseVersion < 0)
            throw AssignmentInput.invalid();
        CheckStore.Policy old = store.policy(assignmentId);
        if (baseVersion != old.version())
            throw new BusinessException(HttpStatus.CONFLICT, "CHECK_POLICY_CONFLICT",
                    "判题配置版本已变化，请刷新后重试。", Map.of("currentVersion", old.version()));
        if (body.get("config") != null && !(body.get("config") instanceof Map<?, ?>))
            throw AssignmentInput.invalid();
        Map<?, ?> config = (Map<?, ?>) body.get("config");
        if (config != null) CheckPolicy.validate(config, assignment.type());
        store.savePolicy(assignmentId, baseVersion + 1, config);
        return store.policy(assignmentId);
    }

    public Availability availability(UserDTO user, String assignmentId, int revision) {
        Assignment assignment = studentAssignment(user, assignmentId, false);
        if (revision < 0) throw AssignmentInput.invalid();
        return new Availability(configured(assignment, store.policy(assignmentId)),
                revision == 0 ? null : store.byRevision(assignmentId, user.id(), revision));
    }

    public CheckStore.CheckView get(UserDTO user, String checkId) {
        CourseAccess.role(user, "student");
        AssignmentInput.uuid(checkId);
        CheckStore.CheckView view = store.forStudent(checkId, user.id());
        if (view == null) throw CourseAccess.notFound();
        studentAssignment(user, view.assignmentId(), false);
        return view;
    }

    @Transactional(isolation = Isolation.READ_COMMITTED, rollbackFor = Exception.class)
    public Accepted create(UserDTO user, String assignmentId, Map<String, Object> body) {
        if (!body.keySet().equals(Set.of("workspaceRevision")) ||
                !(body.get("workspaceRevision") instanceof Integer revision) || revision < 1)
            throw AssignmentInput.invalid();
        Assignment assignment = studentAssignment(user, assignmentId, false);
        CheckStore.CheckView prior = store.byRevision(assignmentId, user.id(), revision);
        if (prior != null) return new Accepted(prior.id(), prior.status());

        access.lockOfferingShared(assignment.offeringId());
        assignments.lockAssignmentShared(assignmentId);
        assignment = studentAssignment(user, assignmentId, false);
        var workspace = assignments.findWorkspaceForUpdate(assignmentId, user.id());
        prior = store.byRevision(assignmentId, user.id(), revision);
        if (prior != null) return new Accepted(prior.id(), prior.status());

        access.requireStudent(user, assignment.offeringId(), true);
        if ("archived".equals(assignment.status()))
            throw conflict("ASSIGNMENT_ARCHIVED", "作业已归档。");
        int currentRevision = workspace == null ? 0 : workspace.revision();
        if (revision != currentRevision)
            throw new BusinessException(HttpStatus.CONFLICT, "WORKSPACE_CONFLICT", "工作区版本冲突，请刷新后重试。",
                    Map.of("currentRevision", currentRevision));
        CheckStore.Policy policy = store.policy(assignmentId);
        if (!configured(assignment, policy)) throw conflict("CHECK_NOT_CONFIGURED", "该作业尚未配置自动判题。");
        if (!enabled) throw new BusinessException(HttpStatus.SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "自动判题服务暂不可用。");
        store.lockQueue();
        if (store.inFlight(user.id()) >= 1 || store.inFlight(null) >= 20)
            throw new BusinessException(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED",
                    "检查队列暂满，请稍后再试。", Map.of(), 5);
        var files = new LinkedHashMap<String, String>();
        for (var file : assignments.getWorkspaceFiles(workspace.id())) files.put(file.filePath(), file.content());
        String id = UUID.randomUUID().toString();
        store.enqueue(id, assignmentId, user.id(), revision, policy.config(), files, clock.instant());
        return new Accepted(id, "queued");
    }

    private static boolean configured(Assignment assignment, CheckStore.Policy policy) {
        return policy.config() != null && assignment.type().equals(policy.config().get("kind"));
    }

    private Assignment studentAssignment(UserDTO user, String id, boolean write) {
        Assignment assignment = assignment(id);
        access.requireStudent(user, assignment.offeringId(), write);
        if ("draft".equals(assignment.status())) throw CourseAccess.notFound();
        return assignment;
    }

    private Assignment assignment(String id) {
        Assignment assignment = assignments.findAssignment(AssignmentInput.uuid(id));
        if (assignment == null) throw CourseAccess.notFound();
        return assignment;
    }

    private static BusinessException conflict(String code, String message) {
        return new BusinessException(HttpStatus.CONFLICT, code, message);
    }

    public record Availability(boolean configured, CheckStore.CheckView check) {}
    public record Accepted(String checkId, String status) {}
}
