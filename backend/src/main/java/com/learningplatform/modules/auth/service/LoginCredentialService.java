package com.learningplatform.modules.auth.service;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.auth.mapper.UserMapper;
import com.learningplatform.modules.auth.model.User;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/** 登录凭据校验：确认用户身份；会话、Cookie、CSRF 与登录限流由后续入口负责。 */
@Service
public class LoginCredentialService {

    private static final Pattern USERNAME_PATTERN = Pattern.compile("[a-z0-9][a-z0-9._-]{2,63}");

    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;
    private final String dummyPasswordHash;

    public LoginCredentialService(UserMapper userMapper, PasswordEncoder passwordEncoder) {
        this.userMapper = userMapper;
        this.passwordEncoder = passwordEncoder;
        // 每个 Service 实例只生成一次占位哈希，不保存到数据库，也不是任何账户的密码。
        // 用户不存在时也进行一次密码计算，减少与“账户存在但密码错误”的明显耗时差异。
        this.dummyPasswordHash = passwordEncoder.encode(UUID.randomUUID().toString());
    }

    /**
     * 成功返回不含密码的身份 DTO；凭据不正确或账户不可用时抛出同一种业务异常。
     * 本方法只有一次只读查询，不开启写事务；返回成功还不代表浏览器已经建立登录会话。
     */
    public UserDTO verifyCredentials(String rawUsername, String rawPassword) {
        User user = verifyUserForSession(rawUsername, rawPassword);
        return new UserDTO(user.id(), user.username(), user.displayName(), user.roles());
    }

    /** 包内使用：保留已验证的账户快照，供会话创建在加锁后复核密码是否发生变化。 */
    User verifyUserForSession(String rawUsername, String rawPassword) {
        String username = normalizeUsername(rawUsername);
        validatePasswordInput(rawPassword);

        // 保留查询结果为局部变量，调试时可在下一行直接观察 user 是否为空。
        User user = userMapper.findByUsername(username).orElse(null);
        String passwordHash = user == null ? dummyPasswordHash : user.passwordHash();
        boolean passwordCorrect = matchesPassword(rawPassword, passwordHash);

        // 即使账户被禁用，也先执行密码计算；对外不区分三种失败原因。
        if (user == null || !passwordCorrect || !"active".equals(user.status())) {
            throw invalidCredentials();
        }

        return user;
    }

    private String normalizeUsername(String rawUsername) {
        // 限制原始输入规模；规范化后的用户名仍必须符合数据库的 3～64 位规范。
        if (rawUsername == null || rawUsername.codePointCount(0, rawUsername.length()) > 256) {
            throw invalidInput("username", "用户名格式不正确");
        }
        String username = rawUsername.strip().toLowerCase(Locale.ROOT);
        if (!USERNAME_PATTERN.matcher(username).matches()) {
            throw invalidInput("username", "用户名格式不正确");
        }
        return username;
    }

    private void validatePasswordInput(String rawPassword) {
        // 登录不重复执行“新建密码至少 15 字符”的政策；错误的短密码也属于凭据失败。
        // 不 strip、不转大小写；允许 Unicode 和空格，且按码点限制最大长度。
        if (rawPassword == null || rawPassword.isEmpty()
                || rawPassword.codePointCount(0, rawPassword.length()) > 128) {
            throw invalidInput("password", "密码须为 1～128 个字符");
        }
    }

    private boolean matchesPassword(String rawPassword, String passwordHash) {
        try {
            return passwordEncoder.matches(rawPassword, passwordHash);
        } catch (IllegalArgumentException exception) {
            // 数据中若有未知算法或损坏格式，拒绝认证，不回显原哈希或库的异常消息。
            // 再做一次有效哈希校验，避免这种失败路径仅因解析错误而迅速返回。
            passwordEncoder.matches(rawPassword, dummyPasswordHash);
            return false;
        }
    }

    private BusinessException invalidCredentials() {
        return new BusinessException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "用户名或密码错误");
    }

    private BusinessException invalidInput(String field, String message) {
        return new BusinessException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", "请求参数校验失败",
                Map.of("fields", List.of(Map.of("field", field, "message", message))));
    }
}
