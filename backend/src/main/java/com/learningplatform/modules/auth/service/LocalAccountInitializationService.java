package com.learningplatform.modules.auth.service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import com.learningplatform.modules.auth.mapper.UserMapper;
import com.learningplatform.modules.auth.model.User;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/** 本地开发专用的账户初始化业务；由显式开启的 local-accounts 命令调用。 */
@Service
public class LocalAccountInitializationService {

    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;

    public LocalAccountInitializationService(UserMapper userMapper, PasswordEncoder passwordEncoder) {
        this.userMapper = userMapper;
        this.passwordEncoder = passwordEncoder;
    }

    /**
     * 三个账户作为一个整体初始化；任何校验或数据库写入失败，均回滚本次新增。
     * 已有账户保持原样，此命令不承担重置密码、恢复禁用账户或修改权限的职责。
     */
    @Transactional(isolation = Isolation.READ_COMMITTED, rollbackFor = Exception.class)
    public Result initialize(String studentPassword, String teacherPassword, String adminPassword) {
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        int created = 0;
        created += createIfMissing("student.demo", "演示学生", "student", studentPassword, now);
        created += createIfMissing("teacher.demo", "演示教师", "teacher", teacherPassword, now);
        created += createIfMissing("admin.demo", "演示管理员", "admin", adminPassword, now);
        return new Result(created, 3 - created);
    }

    private int createIfMissing(String username, String displayName, String role,
                                String rawPassword, Instant now) {
        if (userMapper.findByUsername(username).isPresent()) {
            return 0;
        }

        // 按 Unicode 码点计算长度；不 trim、不改变大小写，空格也是密码的一部分。
        int length = rawPassword == null ? 0 : rawPassword.codePointCount(0, rawPassword.length());
        if (length < 15 || length > 128 || rawPassword.isBlank()) {
            // 错误消息不包含被拒绝的密码，避免启动日志泄露配置值。
            throw new IllegalArgumentException("新建本地账户的密码须为 15～128 个字符，且不能全为空白");
        }

        String passwordHash = passwordEncoder.encode(rawPassword);
        User user = new User(UUID.randomUUID().toString(), username, displayName, passwordHash,
                List.of(role), "active", now, now);
        if (userMapper.insert(user) != 1) {
            throw new IllegalStateException("本地账户写入失败");
        }
        // 数据库唯一约束是并发时的最后防线；若两个初始化同时写入，失败方回滚后可重试。
        return 1;
    }

    /** 只返回统计数据，避免返回值、日志或默认 toString 携带口令。 */
    public record Result(int created, int skipped) {
    }
}
