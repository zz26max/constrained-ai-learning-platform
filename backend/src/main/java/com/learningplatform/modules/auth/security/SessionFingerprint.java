package com.learningplatform.modules.auth.security;

import java.util.TreeSet;

import com.learningplatform.modules.auth.model.User;

/**
 * 会话绑定指纹：密码哈希与会话建立时的角色集合一起摘要。
 *
 * <p>登录、注册与会话续期必须使用同一算法；否则会话在建好后第一次访问就被判定失效
 * （密码或角色变更要求重新登录，正是本指纹的作用）。</p>
 */
public final class SessionFingerprint {

    private SessionFingerprint() {
    }

    /** 指纹算法：密码哈希 + 排序后的角色集合，经会话令牌编码器摘要。 */
    public static String of(SessionTokenCodec tokens, User user) {
        // 角色是集合，排序变化不代表权限变化。
        String roles = String.join(",", new TreeSet<>(user.roles()));
        return tokens.digest(user.passwordHash() + "\n" + roles);
    }
}
