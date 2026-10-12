package com.learningplatform.modules.auth.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.regex.Pattern;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import com.learningplatform.modules.auth.config.AuthHttpProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * CSRF 令牌的签发与校验：
 * - 登录后使用会话绑定的 HMAC(csrfSecret, sessionId) 派生客户端令牌，库里存的秘密不等于对外令牌；
 * - 匿名阶段使用服务端签名、带过期时间的预登录 Cookie（双提交），不创建匿名数据库会话。
 */
@Service
public class CsrfTokenService {

    private static final String HMAC = "HmacSHA256";
    private static final Pattern HEX64 = Pattern.compile("[0-9a-f]{64}");
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Logger LOGGER = LoggerFactory.getLogger(CsrfTokenService.class);

    private final AuthHttpProperties properties;
    private final Clock clock;
    private final byte[] signingKey;

    public CsrfTokenService(AuthHttpProperties properties, Clock clock) {
        this.properties = properties;
        this.clock = clock;
        this.signingKey = resolveSigningKey(properties.preLoginSigningKey());
    }

    /** 会话绑定令牌；同一会话稳定返回相同值，跨会话或改秘密后不同。 */
    public String sessionToken(String sessionId, String csrfSecret) {
        return hmacHex(csrfSecret.getBytes(StandardCharsets.UTF_8), "csrf|" + sessionId);
    }

    public boolean verifySessionToken(String sessionId, String csrfSecret, String presented) {
        if (sessionId == null || csrfSecret == null || presented == null) {
            return false;
        }
        return constantTimeEquals(sessionToken(sessionId, csrfSecret), presented);
    }

    /** 匿名阶段签发的预登录凭证；token 返回给客户端，cookieValue 写入 lp_pre_auth。 */
    public record PreAuthTicket(String token, String cookieValue, Instant expiresAt) {
    }

    public PreAuthTicket issuePreAuth() {
        String token = randomHex();
        Instant expiresAt = clock.instant().plus(properties.preLoginMaxAge());
        String payload = expiresAt.getEpochSecond() + "|" + token;
        String cookieValue = base64Url(payload) + "." + hmacHex(signingKey, payload);
        return new PreAuthTicket(token, cookieValue, expiresAt);
    }

    /** 校验预登录 Cookie 与请求头令牌：签名、有效期与令牌三者都成立才通过。 */
    public boolean verifyPreAuth(String cookieValue, String presentedToken) {
        if (cookieValue == null || presentedToken == null || !HEX64.matcher(presentedToken).matches()) {
            return false;
        }
        int dot = cookieValue.lastIndexOf('.');
        if (dot <= 0 || dot == cookieValue.length() - 1) {
            return false;
        }
        String payloadB64 = cookieValue.substring(0, dot);
        String signature = cookieValue.substring(dot + 1);
        String payload;
        try {
            payload = new String(Base64.getUrlDecoder().decode(payloadB64), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException exception) {
            return false;
        }
        if (!constantTimeEquals(hmacHex(signingKey, payload), signature)) {
            return false;
        }
        String[] parts = payload.split("\\|", 2);
        if (parts.length != 2) {
            return false;
        }
        long epoch;
        try {
            epoch = Long.parseLong(parts[0]);
        } catch (NumberFormatException exception) {
            return false;
        }
        return clock.instant().isBefore(Instant.ofEpochSecond(epoch))
                && constantTimeEquals(parts[1], presentedToken);
    }

    private String randomHex() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    private byte[] resolveSigningKey(String configured) {
        if (configured == null || configured.isBlank()) {
            // 预登录 Cookie 有效期只有 10 分钟，进程随机密钥在单机开发下可接受；生产必须显式配置。
            LOGGER.warn("未配置预登录签名密钥（AUTH_PRE_LOGIN_SIGNING_KEY），本次进程使用随机密钥；"
                    + "重启后旧的预登录 Cookie 会失效，生产环境必须显式配置。");
            byte[] bytes = new byte[32];
            RANDOM.nextBytes(bytes);
            return bytes;
        }
        return sha256(configured.getBytes(StandardCharsets.UTF_8));
    }

    private String hmacHex(byte[] key, String data) {
        try {
            Mac mac = Mac.getInstance(HMAC);
            mac.init(new SecretKeySpec(key, HMAC));
            return HexFormat.of().formatHex(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("运行环境缺少 HMAC-SHA256 支持", exception);
        }
    }

    private byte[] sha256(byte[] value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("运行环境缺少 SHA-256 支持", exception);
        }
    }

    private boolean constantTimeEquals(String first, String second) {
        return MessageDigest.isEqual(first.getBytes(StandardCharsets.UTF_8),
                second.getBytes(StandardCharsets.UTF_8));
    }

    private String base64Url(String value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }
}
