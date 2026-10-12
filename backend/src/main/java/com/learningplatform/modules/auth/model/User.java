package com.learningplatform.modules.auth.model;

import java.time.Instant;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnore;

/**
 * users 表的一行，用于账户模块内部的数据库读写。
 *
 * <p>后续登录服务需要 passwordHash 校验口令，但 Controller 应返回专门的 UserDTO，
 * 不直接返回这个持久化对象。角色集合不可修改，避免查询结果被意外改变。</p>
 */
public record User(
        String id,
        String username,
        String displayName,
        @JsonIgnore String passwordHash,
        List<String> roles,
        String status,
        Instant createdAt,
        Instant updatedAt) {

    public User {
        roles = List.copyOf(roles);
    }

    // record 默认 toString 会输出所有字段；这里显式排除密码哈希及其他账户资料。
    @Override
    public String toString() {
        return "User[id=" + id + ", username=" + username + ", status=" + status + "]";
    }
}
