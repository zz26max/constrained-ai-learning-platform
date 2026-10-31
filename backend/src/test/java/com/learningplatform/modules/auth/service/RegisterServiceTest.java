package com.learningplatform.modules.auth.service;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import com.learningplatform.common.audit.AuditService;
import com.learningplatform.common.config.PasswordConfiguration;
import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.auth.config.AuthSessionProperties;
import com.learningplatform.modules.auth.dto.RegisterWrite;
import com.learningplatform.modules.auth.mapper.AuthSessionMapper;
import com.learningplatform.modules.auth.mapper.UserMapper;
import com.learningplatform.modules.auth.model.User;
import com.learningplatform.modules.auth.security.CsrfTokenService;
import com.learningplatform.modules.auth.security.SessionTokenCodec;
import com.learningplatform.modules.courses.mapper.CourseMapper;
import com.learningplatform.modules.courses.model.CourseRows.Invite;
import com.learningplatform.modules.courses.security.InviteCodeCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 注册服务单元测试：覆盖双模式正常流程与错误分支。 */
class RegisterServiceTest {

    private UserMapper userMapper;
    private CourseMapper courseMapper;
    private InviteCodeCodec inviteCodes;
    private PasswordEncoder passwordEncoder;
    private AuthSessionMapper sessionMapper;
    private SessionTokenCodec sessionTokens;
    private CsrfTokenService csrfTokens;
    private AuthSessionProperties sessionProperties;
    private AuditService auditService;
    private Clock clock;
    private RegisterService service;

    @BeforeEach
    void setUp() {
        userMapper = mock(UserMapper.class);
        courseMapper = mock(CourseMapper.class);
        // 摘要算法用真实实现的替身：返回传入的明文，便于用 anyString() 匹配邀请码查询
        inviteCodes = mock(InviteCodeCodec.class);
        when(inviteCodes.digest(anyString())).thenAnswer(invocation -> invocation.getArgument(0));
        passwordEncoder = new PasswordConfiguration().passwordEncoder();
        sessionMapper = mock(AuthSessionMapper.class);
        sessionTokens = new SessionTokenCodec();
        csrfTokens = mock(CsrfTokenService.class);
        sessionProperties = mock(AuthSessionProperties.class);
        auditService = mock(AuditService.class);
        clock = Clock.fixed(Instant.parse("2026-10-31T12:00:00Z"), ZoneId.of("UTC"));

        when(sessionProperties.absoluteTimeout()).thenReturn(java.time.Duration.ofHours(8));
        when(sessionProperties.idleTimeout()).thenReturn(java.time.Duration.ofMinutes(30));
        // 学校模式在写入用户后才校验邀请码；默认让用户写入成功，错误分支由各用例断言
        when(userMapper.insert(any(User.class))).thenReturn(1);

        service = new RegisterService(userMapper, courseMapper, inviteCodes, passwordEncoder, sessionMapper,
                sessionTokens, csrfTokens, sessionProperties, auditService, clock);
    }

    @Test
    @DisplayName("个人模式注册成功：创建用户、关联个人课程、建立会话")
    void personalModeRegisterSuccess() {
        RegisterWrite body = new RegisterWrite("newuser", "Password123", "新用户", "personal", null, null, null);
        when(userMapper.findByUsername("newuser")).thenReturn(Optional.empty());
        when(userMapper.insert(any(User.class))).thenReturn(1);
        when(courseMapper.findMember(anyString(), anyString())).thenReturn(null);
        when(courseMapper.insertMember(anyString(), anyString(), anyString(), anyString(), any(Instant.class))).thenReturn(1);
        when(sessionMapper.insert(any())).thenReturn(1);
        when(csrfTokens.sessionToken(anyString(), anyString())).thenReturn("csrf-token-123");

        RegisterService.RegisterResult result = service.register(body, "request-id-1");

        assertThat(result.user().username()).isEqualTo("newuser");
        assertThat(result.user().displayName()).isEqualTo("新用户");
        assertThat(result.user().roles()).containsExactly("student");
        assertThat(result.csrfToken()).isEqualTo("csrf-token-123");
        assertThat(result.sessionToken()).isNotNull();

        verify(userMapper).insert(any(User.class));
        verify(courseMapper).insertMember(anyString(), eq("00000000-0000-4000-8000-000000000210"), anyString(), eq("student"), any(Instant.class));
        verify(sessionMapper).insert(any());
        verify(auditService).record(anyString(), eq("USER_REGISTERED"), anyString(), anyString(), any(Map.class), eq("request-id-1"));
    }

    @Test
    @DisplayName("学校+学生模式：有效邀请码成功注册并加入班级")
    void schoolStudentModeWithValidInvite() {
        RegisterWrite body = new RegisterWrite("student1", "Student123", "学生一", "school", "student", "P1A-DB-DEMO-2026", null);
        when(userMapper.findByUsername("student1")).thenReturn(Optional.empty());
        when(userMapper.insert(any(User.class))).thenReturn(1);

        // Mock 邀请码验证
        Invite invite = new Invite("invite-1", "offering-1", "digest", Instant.parse("2027-12-31T23:59:59Z"), 10, 0, null, Instant.now(), "teacher-1");
        when(courseMapper.inviteByDigest(anyString())).thenReturn(invite);
        var offering = new com.learningplatform.modules.courses.model.CourseRows.Offering("offering-1", "course-1", "term-1", "班级", "mark", "组名", "term-label", "chapter", "active", "teacher-1", Instant.now());
        when(courseMapper.findOffering("offering-1")).thenReturn(offering);
        when(courseMapper.findMember(eq("offering-1"), anyString())).thenReturn(null);
        when(courseMapper.insertMember(anyString(), anyString(), anyString(), anyString(), any(Instant.class))).thenReturn(1);
        when(courseMapper.consumeInvite(anyString(), any(Instant.class))).thenReturn(1);
        when(sessionMapper.insert(any())).thenReturn(1);
        when(csrfTokens.sessionToken(anyString(), anyString())).thenReturn("csrf-token-456");

        RegisterService.RegisterResult result = service.register(body, "request-id-2");

        assertThat(result.user().roles()).containsExactly("student");
        // 摘要必须走与教师端 createInvite 相同的 InviteCodeCodec，不能自带一套算法
        verify(inviteCodes).digest("P1A-DB-DEMO-2026");
        verify(courseMapper).consumeInvite(eq("invite-1"), any(Instant.class));
    }

    @Test
    @DisplayName("学校+教师模式：创建班级并关联教师")
    void schoolTeacherModeWithCreateClass() {
        RegisterWrite body = new RegisterWrite("teacher1", "Teacher123", "教师一", "school", "teacher", null, true);
        when(userMapper.findByUsername("teacher1")).thenReturn(Optional.empty());
        when(userMapper.insert(any(User.class))).thenReturn(1);
        when(courseMapper.currentTermId()).thenReturn("term-1");
        when(courseMapper.insertOffering(anyString(), anyString(), anyString(), anyString(), anyString(), anyString(), anyString(), any(Instant.class))).thenReturn(1);
        when(courseMapper.insertMember(anyString(), anyString(), anyString(), anyString(), any(Instant.class))).thenReturn(1);
        when(sessionMapper.insert(any())).thenReturn(1);
        when(csrfTokens.sessionToken(anyString(), anyString())).thenReturn("csrf-token-789");

        RegisterService.RegisterResult result = service.register(body, "request-id-3");

        assertThat(result.user().roles()).containsExactly("teacher");
        verify(courseMapper).insertOffering(anyString(), eq("00000000-0000-4000-8000-000000000110"), eq("term-1"), anyString(), anyString(), anyString(), anyString(), any(Instant.class));
    }

    @Test
    @DisplayName("用户名重复返回 400 USERNAME_TAKEN")
    void duplicateUsernameReturns400() {
        RegisterWrite body = new RegisterWrite("existing", "Password123", "用户", "personal", null, null, null);
        when(userMapper.findByUsername("existing")).thenReturn(Optional.of(mock(User.class)));

        assertThatThrownBy(() -> service.register(body, "request-id-4"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assertThat(be.getCode()).isEqualTo("USERNAME_TAKEN");
                    assertThat(be.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                });
    }

    @Test
    @DisplayName("用户名格式错误返回 422 VALIDATION_ERROR")
    void invalidUsernameFormatReturns422() {
        RegisterWrite body = new RegisterWrite("ab", "Password123", "用户", "personal", null, null, null);

        assertThatThrownBy(() -> service.register(body, "request-id-5"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assertThat(be.getCode()).isEqualTo("VALIDATION_ERROR");
                    assertThat(be.getStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
                });
    }

    @Test
    @DisplayName("密码强度不足返回 422 VALIDATION_ERROR")
    void weakPasswordReturns422() {
        RegisterWrite body = new RegisterWrite("newuser", "password", "用户", "personal", null, null, null);

        assertThatThrownBy(() -> service.register(body, "request-id-6"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assertThat(be.getCode()).isEqualTo("VALIDATION_ERROR");
                });
    }

    @Test
    @DisplayName("学校模式缺少角色返回 422 VALIDATION_ERROR")
    void schoolModeWithoutRoleReturns422() {
        RegisterWrite body = new RegisterWrite("newuser", "Password123", "用户", "school", null, null, null);
        when(userMapper.findByUsername("newuser")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.register(body, "request-id-7"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assertThat(be.getCode()).isEqualTo("VALIDATION_ERROR");
                });
    }

    @Test
    @DisplayName("学校+学生模式缺少邀请码返回 422 VALIDATION_ERROR")
    void schoolStudentWithoutInviteCodeReturns422() {
        RegisterWrite body = new RegisterWrite("student1", "Student123", "学生", "school", "student", null, null);
        when(userMapper.findByUsername("student1")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.register(body, "request-id-8"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assertThat(be.getCode()).isEqualTo("VALIDATION_ERROR");
                });
    }

    @Test
    @DisplayName("无效邀请码返回 400 INVALID_INVITE_CODE")
    void invalidInviteCodeReturns400() {
        RegisterWrite body = new RegisterWrite("student1", "Student123", "学生", "school", "student", "INVALID-CODE", null);
        when(userMapper.findByUsername("student1")).thenReturn(Optional.empty());
        when(courseMapper.inviteByDigest(anyString())).thenReturn(null);

        assertThatThrownBy(() -> service.register(body, "request-id-9"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assertThat(be.getCode()).isEqualTo("INVALID_INVITE_CODE");
                    assertThat(be.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                });
    }

    @Test
    @DisplayName("无效模式返回 422 VALIDATION_ERROR")
    void invalidModeReturns422() {
        RegisterWrite body = new RegisterWrite("newuser", "Password123", "用户", "invalid", null, null, null);
        when(userMapper.findByUsername("newuser")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.register(body, "request-id-10"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assertThat(be.getCode()).isEqualTo("VALIDATION_ERROR");
                });
    }
}
