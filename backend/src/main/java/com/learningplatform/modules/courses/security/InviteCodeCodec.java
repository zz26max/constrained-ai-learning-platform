package com.learningplatform.modules.courses.security;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
/** 明文邀请码只在创建响应出现一次，持久化查找使用服务端密钥的 HMAC-SHA256。 */
@Component
public class InviteCodeCodec {
    private final byte[] key;
    private final SecureRandom random=new SecureRandom();
    public InviteCodeCodec(@Value("${auth.invite.signing-key:}") String secret) {
        key=secret.getBytes(StandardCharsets.UTF_8);
        if(key.length<32) throw new IllegalArgumentException("请配置至少32字节的 AUTH_INVITE_SIGNING_KEY");
    }
    public String generate() { byte[] bytes=new byte[32];random.nextBytes(bytes);return HexFormat.of().formatHex(bytes); }
    public String digest(String code) {
        try { Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(key,"HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(code.getBytes(StandardCharsets.UTF_8)));
        } catch(java.security.GeneralSecurityException exception) { throw new IllegalStateException("邀请码摘要计算失败"); }
    }
}

