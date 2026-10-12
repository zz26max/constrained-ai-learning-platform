package com.learningplatform.modules.auth.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

/** 随机会话凭证的生成与摘要；高熵随机令牌使用 SHA-256，不套用用户密码的 Argon2。 */
@Component
public class SessionTokenCodec {

    private static final Pattern TOKEN_PATTERN = Pattern.compile("[0-9a-f]{64}");
    private final SecureRandom random = new SecureRandom();

    public String generate() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    /** 输入必须与生成格式完全一致；不 trim、不转大小写，不接受其他替代表示。 */
    public boolean isValid(String token) {
        return token != null && TOKEN_PATTERN.matcher(token).matches();
    }

    public String digest(String value) {
        try {
            // MessageDigest 实例不跨线程共享；UTF-8 表示在生成与验证时保持一致。
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(bytes);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("运行环境缺少 SHA-256 支持");
        }
    }
}
