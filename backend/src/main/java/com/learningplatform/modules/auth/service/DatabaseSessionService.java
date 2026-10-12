package com.learningplatform.modules.auth.service;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.Map;
import java.util.TreeSet;
import java.util.UUID;

import com.learningplatform.common.audit.AuditService;
import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.auth.config.AuthSessionProperties;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.auth.mapper.AuthSessionMapper;
import com.learningplatform.modules.auth.mapper.UserMapper;
import com.learningplatform.modules.auth.model.AuthSession;
import com.learningplatform.modules.auth.model.SessionGrant;
import com.learningplatform.modules.auth.model.SessionIdentity;
import com.learningplatform.modules.auth.model.User;
import com.learningplatform.modules.auth.security.SessionTokenCodec;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/** 数据库会话业务；当前由测试调用，Cookie/CSRF/HTTP 过滤链随后接入。 */
@Service
public class DatabaseSessionService {

    private final LoginCredentialService credentials;
    private final UserMapper userMapper;
    private final AuthSessionMapper sessionMapper;
    private final SessionTokenCodec tokens;
    private final AuthSessionProperties properties;
    private final AuditService auditService;
    private final Clock clock;

    public DatabaseSessionService(LoginCredentialService credentials, UserMapper userMapper,
                                  AuthSessionMapper sessionMapper, SessionTokenCodec tokens,
                                  AuthSessionProperties properties, AuditService auditService, Clock clock) {
        this.credentials = credentials;
        this.userMapper = userMapper;
        this.sessionMapper = sessionMapper;
        this.tokens = tokens;
        this.properties = properties;
        this.auditService = auditService;
        this.clock = clock;
    }

    /**
     * 验证密码后建立新会话；只有成功登录才撤销当前浏览器持有的旧会话。
     * previousToken 来自 HTTP 层读取的 Cookie，不能由前端指定任意数据库会话 ID。
     * requestId 用于把成功登录与业务请求关联进审计，由 HTTP 层传入，不为空。
     */
    @Transactional(isolation = Isolation.READ_COMMITTED, rollbackFor = Exception.class)
    public SessionGrant login(String username, String password, String previousToken, String requestId) {
        User verified = credentials.verifyUserForSession(username, password);
        AuthSession previousHint = findSession(previousToken);
        Map<String, User> lockedUsers = lockAccounts(verified.id(), previousHint);
        User user = lockedUsers.get(verified.id());
        // 密码计算后账户可能发生变化；加锁后再次核对快照，不能盲目信任先前的 DTO。
        if (user == null || !"active".equals(user.status()) || !user.passwordHash().equals(verified.passwordHash())) {
            throw new BusinessException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "用户名或密码错误");
        }
        AuthSession previous = previousHint == null ? null :
                sessionMapper.findByTokenHashForUpdate(previousHint.tokenHash()).orElse(null);
        if (previous != null && !previous.userId().equals(previousHint.userId())) {
            throw new IllegalStateException("会话归属发生异常变化");
        }

        // 锁等待结束后再采样时间，避免把等待前的时刻当作真正创建时刻。
        Instant now = now();
        String token = tokens.generate();
        Instant expiresAt = now.plus(properties.absoluteTimeout());
        AuthSession session = new AuthSession(UUID.randomUUID().toString(), user.id(), tokens.digest(token),
                credentialFingerprint(user), tokens.generate(), expiresAt, idleDeadline(now, expiresAt),
                null, now, now, now);
        revokeStored(previous, now);
        if (sessionMapper.insert(session) != 1) {
            throw new IllegalStateException("会话创建失败");
        }
        // 审计与会话创建同事务；审计写入失败时整个登录回滚，不留下无审计的成功登录。
        auditService.record(user.id(), AuditService.ACTION_LOGIN_SUCCESS, "user", user.id(),
                Map.of("username", user.username()), requestId);
        // 旧会话撤销与新会话插入处于同一事务，插入失败时旧会话也保持有效。
        return new SessionGrant(session.id(), token, session.csrfSecret(), identity(user), expiresAt);
    }

    /** 有效访问续期；已失效的会话需要持久撤销，即使对调用者返回业务拒绝。 */
    @Transactional(isolation = Isolation.READ_COMMITTED, noRollbackFor = BusinessException.class)
    public SessionIdentity resolve(String token) {
        AuthSession hint = findSession(token);
        if (hint == null) { throw unauthenticated(); }
        User user = userMapper.findByIdForShare(hint.userId()).orElse(null);
        AuthSession session = sessionMapper.findByTokenHashForUpdate(hint.tokenHash()).orElse(null);
        if (session == null || user == null || !session.userId().equals(user.id())) {
            throw unauthenticated();
        }
        // 时间回拨时不让 last_seen_at 倒退，也不让空闲期限被缩短后违反数据库约束。
        Instant now = later(now(), session.lastSeenAt());
        if (session.revokedAt() != null || !now.isBefore(session.expiresAt())
                || !now.isBefore(session.idleExpiresAt()) || !"active".equals(user.status())
                || !credentialFingerprint(user).equals(session.credentialHash())) {
            revokeStored(session, now);
            throw unauthenticated();
        }
        Instant idleExpiresAt = idleDeadline(now, session.expiresAt());
        if (sessionMapper.touch(session.id(), now, idleExpiresAt) != 1) {
            throw new IllegalStateException("会话续期失败");
        }
        return new SessionIdentity(session.id(), identity(user), session.csrfSecret(), session.expiresAt(), idleExpiresAt);
    }

    /** 服务端撤销是幂等的，重复撤销及未知令牌不产生新会话。 */
    @Transactional(isolation = Isolation.READ_COMMITTED, rollbackFor = Exception.class)
    public void revoke(String token) {
        AuthSession hint = findSession(token);
        if (hint == null) { return; }
        userMapper.findByIdForShare(hint.userId());
        AuthSession session = sessionMapper.findByTokenHashForUpdate(hint.tokenHash()).orElse(null);
        if (session != null && !session.userId().equals(hint.userId())) {
            throw new IllegalStateException("会话归属发生异常变化");
        }
        revokeStored(session, now());
    }

    private AuthSession findSession(String token) {
        if (!tokens.isValid(token)) { return null; }
        return sessionMapper.findByTokenHash(tokens.digest(token)).orElse(null);
    }

    private Map<String, User> lockAccounts(String userId, AuthSession previous) {
        // 切换账户时可能涉及两个用户；统一按 ID 排序取账户锁，再取会话锁，避免交叉锁顺序。
        TreeSet<String> ids = new TreeSet<>();
        ids.add(userId);
        if (previous != null) { ids.add(previous.userId()); }
        Map<String, User> users = new HashMap<>();
        for (String id : ids) {
            userMapper.findByIdForShare(id).ifPresent(user -> users.put(id, user));
        }
        return users;
    }

    private void revokeStored(AuthSession session, Instant now) {
        if (session != null && session.revokedAt() == null
                && sessionMapper.revoke(session.id(), later(now, session.updatedAt())) != 1) {
            throw new IllegalStateException("会话撤销失败");
        }
    }

    private Instant idleDeadline(Instant now, Instant absoluteDeadline) {
        Instant proposed = now.plus(properties.idleTimeout());
        return proposed.isBefore(absoluteDeadline) ? proposed : absoluteDeadline;
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MICROS);
    }

    private Instant later(Instant first, Instant second) {
        return first.isAfter(second) ? first : second;
    }

    private UserDTO identity(User user) {
        return new UserDTO(user.id(), user.username(), user.displayName(), user.roles());
    }

    private String credentialFingerprint(User user) {
        // 密码或平台角色变更后要求重新登录；角色是集合，排序变化不代表权限变化。
        String roles = String.join(",", new TreeSet<>(user.roles()));
        return tokens.digest(user.passwordHash() + "\n" + roles);
    }

    private BusinessException unauthenticated() {
        return new BusinessException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "登录状态已失效，请重新登录");
    }
}
