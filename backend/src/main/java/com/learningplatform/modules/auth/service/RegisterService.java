package com.learningplatform.modules.auth.service;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

import com.learningplatform.common.audit.AuditService;
import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.auth.config.AuthSessionProperties;
import com.learningplatform.modules.auth.dto.RegisterDTO;
import com.learningplatform.modules.auth.dto.RegisterWrite;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.auth.mapper.AuthSessionMapper;
import com.learningplatform.modules.auth.mapper.UserMapper;
import com.learningplatform.modules.auth.model.AuthSession;
import com.learningplatform.modules.auth.model.User;
import com.learningplatform.modules.auth.security.CsrfTokenService;
import com.learningplatform.modules.auth.security.SessionFingerprint;
import com.learningplatform.modules.auth.security.SessionTokenCodec;
import com.learningplatform.modules.courses.mapper.CourseMapper;
import com.learningplatform.modules.courses.model.CourseRows.Invite;
import com.learningplatform.modules.courses.security.InviteCodeCodec;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 双模式注册业务：个人自学自动关联默认课程，学校模式按角色处理邀请码或创建班级。
 * 注册成功后自动建立会话（相当于立即登录），返回用户身份与会话 CSRF 令牌。
 */
@Service
public class RegisterService {

    private static final Pattern USERNAME_PATTERN = Pattern.compile("^[a-z0-9._-]{3,32}$");
    private static final Pattern PASSWORD_PATTERN = Pattern.compile("^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,64}$");

    private final UserMapper userMapper;
    private final CourseMapper courseMapper;
    private final InviteCodeCodec inviteCodes;
    private final PasswordEncoder passwordEncoder;
    private final AuthSessionMapper sessionMapper;
    private final SessionTokenCodec sessionTokens;
    private final CsrfTokenService csrfTokens;
    private final AuthSessionProperties sessionProperties;
    private final AuditService auditService;
    private final Clock clock;

    public RegisterService(UserMapper userMapper, CourseMapper courseMapper, InviteCodeCodec inviteCodes,
                           PasswordEncoder passwordEncoder, AuthSessionMapper sessionMapper,
                           SessionTokenCodec sessionTokens, CsrfTokenService csrfTokens,
                           AuthSessionProperties sessionProperties, AuditService auditService, Clock clock) {
        this.userMapper = userMapper;
        this.courseMapper = courseMapper;
        this.inviteCodes = inviteCodes;
        this.passwordEncoder = passwordEncoder;
        this.sessionMapper = sessionMapper;
        this.sessionTokens = sessionTokens;
        this.csrfTokens = csrfTokens;
        this.sessionProperties = sessionProperties;
        this.auditService = auditService;
        this.clock = clock;
    }

    /**
     * 双模式注册：personal（个人自学）或 school（学校课程）。
     * previousToken 为预登录 CSRF 令牌，由 HTTP 层从 Cookie 读取。
     * requestId 用于审计追踪。
     */
    @Transactional(isolation = Isolation.READ_COMMITTED, rollbackFor = Exception.class)
    public RegisterResult register(RegisterWrite body, String requestId) {
        // 1. 输入校验
        validateInput(body);
        validateClassName(body);

        // 2. 用户名规范化与唯一性检查
        String normalizedUsername = normalizeUsername(body.username());
        if (userMapper.findByUsername(normalizedUsername).isPresent()) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "USERNAME_TAKEN", "该用户名已被占用。");
        }

        // 3. 密码加密
        String passwordHash = passwordEncoder.encode(body.password());
        Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
        String userId = UUID.randomUUID().toString();

        // 4. 根据模式确定角色和关联逻辑
        List<String> roles;
        switch (body.mode()) {
            case "personal" -> {
                roles = List.of("student");
            }
            case "school" -> {
                if (body.role() == null || (!"student".equals(body.role()) && !"teacher".equals(body.role()))) {
                    throw new BusinessException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR",
                            "学校模式须选择角色（student 或 teacher）。",
                            Map.of("fields", List.of(Map.of("field", "role",
                                    "message", "学校模式须选择角色（student 或 teacher）。"))));
                }
                roles = List.of(body.role());
            }
            default -> throw new BusinessException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR",
                    "模式须为 personal 或 school。",
                    Map.of("fields", List.of(Map.of("field", "mode",
                            "message", "模式须为 personal 或 school。"))));
        }

        // 5. 创建用户
        User user = new User(userId, normalizedUsername, body.displayName(), passwordHash, roles, "active", now, now);
        if (userMapper.insert(user) != 1) {
            throw new IllegalStateException("用户创建失败");
        }

        // 6. 个人模式：自动关联 offeringPersonal
        if ("personal".equals(body.mode())) {
            enrollPersonalOffering(userId, now);
        }

        // 7. 学校+学生：校验邀请码并入班。成员行引用 users(id)，必须在用户写入之后；
        // 任何失败都与用户创建同事务回滚，不留半个账号。
        if ("school".equals(body.mode()) && "student".equals(body.role())) {
            validateAndEnrollInvite(body.inviteCode(), userId, now);
        }

        // 8. 学校+教师+创建班级
        if ("school".equals(body.mode()) && "teacher".equals(body.role())
                && Boolean.TRUE.equals(body.createClass())) {
            createTeacherOffering(userId, now, body.className());
        }

        // 9. 自动登录：创建会话
        String token = sessionTokens.generate();
        String csrfSecret = sessionTokens.generate();
        Instant expiresAt = now.plus(sessionProperties.absoluteTimeout());
        AuthSession session = new AuthSession(UUID.randomUUID().toString(), userId,
                sessionTokens.digest(token), SessionFingerprint.of(sessionTokens, user),
                csrfSecret, expiresAt, idleDeadline(now, expiresAt),
                null, now, now, now);
        if (sessionMapper.insert(session) != 1) {
            throw new IllegalStateException("会话创建失败");
        }

        // 9. 审计
        auditService.record(userId, "USER_REGISTERED", "user", userId,
                Map.of("username", normalizedUsername, "mode", body.mode()), requestId);

        // 10. 构造响应
        UserDTO userDTO = new UserDTO(userId, normalizedUsername, body.displayName(), roles);
        String csrfToken = csrfTokens.sessionToken(session.id(), session.csrfSecret());

        return new RegisterResult(userDTO, csrfToken, token, expiresAt);
    }

    private void validateInput(RegisterWrite body) {
        if (!USERNAME_PATTERN.matcher(body.username()).matches()) {
            throw new BusinessException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR",
                    "用户名须为 3-32 位小写字母、数字、点、下划线或连字符。",
                    Map.of("fields", List.of(Map.of("field", "username",
                            "message", "用户名须为 3-32 位小写字母、数字、点、下划线或连字符。"))));
        }
        if (!PASSWORD_PATTERN.matcher(body.password()).matches()) {
            throw new BusinessException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR",
                    "密码须为 8-64 位，至少含大写、小写字母与数字各一个。",
                    Map.of("fields", List.of(Map.of("field", "password",
                            "message", "密码须为 8-64 位，至少含大写、小写字母与数字各一个。"))));
        }
        if (body.displayName() == null || body.displayName().isBlank() || body.displayName().length() > 50) {
            throw new BusinessException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR",
                    "显示名称须为 1-50 字符。",
                    Map.of("fields", List.of(Map.of("field", "displayName",
                            "message", "显示名称须为 1-50 字符。"))));
        }
    }

    private String normalizeUsername(String username) {
        return username.strip().toLowerCase(Locale.ROOT);
    }

    /** 班级名称只在「学校模式 + 教师 + 创建班级」时可填；留空按默认「我的班级」处理。 */
    private void validateClassName(RegisterWrite body) {
        if (body.className() == null) return;
        String name = body.className().strip();
        if (name.codePointCount(0, name.length()) > 60) {
            throw new BusinessException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR",
                    "班级名称须为 1-60 字。",
                    Map.of("fields", List.of(Map.of("field", "className", "message", "班级名称须为 1-60 字。"))));
        }
        boolean createsClass = "school".equals(body.mode()) && "teacher".equals(body.role())
                && Boolean.TRUE.equals(body.createClass());
        if (!name.isEmpty() && !createsClass) {
            throw new BusinessException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR",
                    "只有「学校模式 + 教师 + 创建班级」时才能填写班级名称。",
                    Map.of("fields", List.of(Map.of("field", "className",
                            "message", "只有创建班级时才能填写班级名称。"))));
        }
    }

    /** 个人模式：关联默认个人课程 offering（固定 UUID）。 */
    private void enrollPersonalOffering(String userId, Instant now) {
        String offeringPersonalId = "00000000-0000-4000-8000-000000000210";
        // 幂等：已存在则跳过
        if (courseMapper.findMember(offeringPersonalId, userId) != null) {
            return;
        }
        courseMapper.insertMember(UUID.randomUUID().toString(), offeringPersonalId, userId, "student", now);
    }

    /** 学校+学生模式：验证邀请码并加入对应班级。 */
    private void validateAndEnrollInvite(String inviteCode, String userId, Instant now) {
        if (inviteCode == null || inviteCode.isBlank()) {
            throw new BusinessException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR",
                    "学生模式须填写邀请码。",
                    Map.of("fields", List.of(Map.of("field", "inviteCode",
                            "message", "学生模式须填写邀请码。"))));
        }
        // 邀请码摘要必须与教师端 createInvite 的算法一致：服务端密钥的 HMAC-SHA256
        String digest = inviteCodes.digest(inviteCode);
        Invite invite = courseMapper.inviteByDigest(digest);
        if (invite == null || invite.revokedAt() != null || !invite.expiresAt().isAfter(now)) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "INVALID_INVITE_CODE", "邀请码无效，请向教师确认。");
        }
        // 检查班级是否有效
        var offering = courseMapper.findOffering(invite.offeringId());
        if (offering == null || !"active".equals(offering.status())) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "INVALID_INVITE_CODE", "邀请码对应的班级已归档或不存在。");
        }
        // 加入班级
        if (courseMapper.findMember(offering.id(), userId) != null) {
            return; // 已加入
        }
        courseMapper.insertMember(UUID.randomUUID().toString(), offering.id(), userId, "student", now);
        // 名额消费与成员写入同事务：条件更新失败（用完/过期/撤销）时整个注册回滚
        if (courseMapper.consumeInvite(invite.id(), now) != 1) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "INVALID_INVITE_CODE", "邀请码已被用完或已失效。");
        }
    }

    /** 学校+教师模式：创建新班级并关联教师；班级名可选，省略时用「我的班级」。 */
    private void createTeacherOffering(String userId, Instant now, String className) {
        String title = className == null || className.isBlank() ? "我的班级" : className.strip();
        String currentTermId = courseMapper.currentTermId();
        if (currentTermId == null) {
            throw new BusinessException(HttpStatus.INTERNAL_SERVER_ERROR, "NO_CURRENT_TERM", "当前学期未配置，无法创建班级。");
        }
        // 使用个人课程作为基础课程
        String personalCourseId = "00000000-0000-4000-8000-000000000110";
        String offeringId = UUID.randomUUID().toString();
        courseMapper.insertOffering(offeringId, personalCourseId, currentTermId,
                title, "默认班级", "chapter", userId, now);
        courseMapper.insertMember(UUID.randomUUID().toString(), offeringId, userId, "teacher", now);
    }

    private Instant idleDeadline(Instant now, Instant expiresAt) {
        long idleSeconds = Math.min(sessionProperties.idleTimeout().getSeconds(),
                sessionProperties.absoluteTimeout().getSeconds());
        return now.plusSeconds(idleSeconds).isBefore(expiresAt)
                ? now.plusSeconds(idleSeconds)
                : expiresAt;
    }

    public record RegisterResult(UserDTO user, String csrfToken, String sessionToken, Instant expiresAt) {
    }
}
