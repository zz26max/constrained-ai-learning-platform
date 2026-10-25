package com.learningplatform.modules.auth.controller;

import java.time.Clock;
import java.time.Duration;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import com.learningplatform.common.api.ApiResponse;
import com.learningplatform.common.audit.AuditService;
import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.common.security.AuthCookies;
import com.learningplatform.common.security.SessionCookieAuthFilter;
import com.learningplatform.common.web.RequestIdFilter;
import com.learningplatform.modules.auth.config.AuthHttpProperties;
import com.learningplatform.modules.auth.dto.ConfigDTO;
import com.learningplatform.modules.auth.dto.CsrfDTO;
import com.learningplatform.modules.auth.dto.FeaturesDTO;
import com.learningplatform.modules.auth.dto.LoginDTO;
import com.learningplatform.modules.auth.dto.LoginWrite;
import com.learningplatform.modules.auth.dto.LogoutDTO;
import com.learningplatform.modules.auth.dto.TermDTO;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.auth.model.SessionGrant;
import com.learningplatform.modules.auth.model.SessionIdentity;
import com.learningplatform.modules.auth.security.CsrfTokenService;
import com.learningplatform.modules.auth.security.LoginRateLimiter;
import com.learningplatform.modules.auth.service.DatabaseSessionService;
import com.learningplatform.modules.courses.model.Term;
import com.learningplatform.modules.courses.service.TermQueryService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * P0-A 认证端点：CSRF、登录、退出与当前身份/配置。
 * 只做协议适配与 Cookie 写入，凭据校验、会话与审计仍在各自 Service 中完成。
 */
@RestController
@RequestMapping("/api/v1")
public class AuthController {

    private static final Logger LOGGER = LoggerFactory.getLogger(AuthController.class);

    private final DatabaseSessionService sessions;
    private final CsrfTokenService csrfTokens;
    private final LoginRateLimiter loginRateLimiter;
    private final AuditService auditService;
    private final TermQueryService termQueryService;
    private final AuthHttpProperties properties;
    private final Clock clock;
    private final com.learningplatform.modules.tutoring.provider.TutoringProvider tutoringProvider;

    public AuthController(DatabaseSessionService sessions, CsrfTokenService csrfTokens,
                          LoginRateLimiter loginRateLimiter, AuditService auditService,
                          TermQueryService termQueryService, AuthHttpProperties properties, Clock clock,
                          com.learningplatform.modules.tutoring.provider.TutoringProvider tutoringProvider) {
        this.tutoringProvider=tutoringProvider;
        this.sessions = sessions;
        this.csrfTokens = csrfTokens;
        this.loginRateLimiter = loginRateLimiter;
        this.auditService = auditService;
        this.termQueryService = termQueryService;
        this.properties = properties;
        this.clock = clock;
    }

    /** 匿名时签发预登录签名 Cookie；已登录时返回会话绑定令牌，不改变 Cookie。 */
    @GetMapping("/auth/csrf-token")
    public ApiResponse<CsrfDTO> csrfToken(HttpServletRequest request, HttpServletResponse response) {
        String requestId = RequestIdFilter.getRequestId(request);
        SessionIdentity identity = (SessionIdentity) request.getAttribute(SessionCookieAuthFilter.ATTR_IDENTITY);
        if (identity != null) {
            return new ApiResponse<>(new CsrfDTO(csrfTokens.sessionToken(identity.id(), identity.csrfSecret())),
                    requestId);
        }
        CsrfTokenService.PreAuthTicket ticket = csrfTokens.issuePreAuth();
        response.addHeader("Set-Cookie",
                AuthCookies.preAuth(ticket.cookieValue(), properties.preLoginMaxAge().getSeconds(),
                        properties.cookieSecure()));
        return new ApiResponse<>(new CsrfDTO(ticket.token()), requestId);
    }

    /** 登录成功轮换会话并返回新 CSRF；失败记入限流与审计，不撤销既有会话。 */
    @PostMapping("/auth/login")
    public ApiResponse<LoginDTO> login(@Valid @RequestBody LoginWrite body,
                                       HttpServletRequest request, HttpServletResponse response) {
        String requestId = RequestIdFilter.getRequestId(request);
        String rateKey = loginRateLimiter.key(body.username(), request.getRemoteAddr());
        LoginRateLimiter.Admission admission = loginRateLimiter.acquire(rateKey);
        if (admission.limited()) {
            int retryAfter = (int) Math.min(admission.retryAfterSeconds(), Integer.MAX_VALUE);
            throw new BusinessException(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED",
                    "尝试次数过多，请稍后再试", Map.of(), retryAfter);
        }
        try {
            String previousToken = AuthCookies.read(request, AuthCookies.SESSION);
            SessionGrant grant = sessions.login(body.username(), body.password(), previousToken, requestId);
            admission.onSuccess();
            long maxAge = Math.max(Duration.between(clock.instant(), grant.expiresAt()).getSeconds(), 0);
            response.addHeader("Set-Cookie", AuthCookies.session(grant.token(), maxAge, properties.cookieSecure()));
            response.addHeader("Set-Cookie", AuthCookies.clear(AuthCookies.PRE_AUTH, properties.cookieSecure()));
            return new ApiResponse<>(new LoginDTO(grant.user(),
                    csrfTokens.sessionToken(grant.id(), grant.csrfSecret())), requestId);
        } catch (BusinessException exception) {
            if ("INVALID_CREDENTIALS".equals(exception.getCode())) {
                admission.onFailure();
                auditLoginFailure(body.username(), requestId);
            }
            throw exception;
        } finally {
            // 成功和凭据错误已结算；数据库故障等其他路径只释放预占，不记为错误密码。
            admission.close();
        }
    }

    /** 退出撤销会话并清除 Cookie；重复退出或未知令牌安全结束。 */
    @PostMapping("/auth/logout")
    public ApiResponse<LogoutDTO> logout(HttpServletRequest request, HttpServletResponse response) {
        String requestId = RequestIdFilter.getRequestId(request);
        String token = (String) request.getAttribute(SessionCookieAuthFilter.ATTR_TOKEN);
        if (token != null) {
            sessions.revoke(token);
        }
        response.addHeader("Set-Cookie", AuthCookies.clear(AuthCookies.SESSION, properties.cookieSecure()));
        return new ApiResponse<>(new LogoutDTO(true), requestId);
    }

    /** 当前身份；由认证过滤链放入 SecurityContext，不重新查库。 */
    @GetMapping("/me")
    public ApiResponse<UserDTO> me(Authentication authentication, HttpServletRequest request) {
        String requestId = RequestIdFilter.getRequestId(request);
        SessionIdentity identity = (SessionIdentity) authentication.getPrincipal();
        return new ApiResponse<>(identity.user(), requestId);
    }

    /** 版本、服务器时间、时区、当前学期与能力开关。 */
    @GetMapping("/me/config")
    public ApiResponse<ConfigDTO> config(HttpServletRequest request) {
        String requestId = RequestIdFilter.getRequestId(request);
        List<Term> terms = termQueryService.listAll();
        String currentTermId = terms.stream().filter(Term::current).map(Term::id).findFirst().orElse(null);
        List<TermDTO> termDtos = terms.stream()
                .map(term -> new TermDTO(term.id(), term.label(), term.startsAt(), term.endsAt()))
                .toList();
        return new ApiResponse<>(new ConfigDTO("v1", clock.instant().truncatedTo(ChronoUnit.MICROS),
                "Asia/Shanghai", currentTermId, termDtos, new FeaturesDTO(tutoringProvider.available(), true, false)), requestId);
    }

    private void auditLoginFailure(String rawUsername, String requestId) {
        try {
            String username = rawUsername == null ? "" : rawUsername.strip().toLowerCase(Locale.ROOT);
            auditService.record(null, AuditService.ACTION_LOGIN_FAILURE, null, null,
                    Map.of("username", username, "reason", "INVALID_CREDENTIALS"), requestId);
        } catch (RuntimeException exception) {
            // 审计失败不得改变登录失败本身的结果；记录日志便于定位，避免吞掉业务异常。
            LOGGER.warn("登录失败审计写入失败，requestId={}", requestId, exception);
        }
    }
}
