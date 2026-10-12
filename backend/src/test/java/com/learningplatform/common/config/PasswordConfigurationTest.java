package com.learningplatform.common.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PasswordConfigurationTest {

    private final PasswordEncoder encoder = new PasswordConfiguration().passwordEncoder();

    @Test
    @DisplayName("正确口令匹配，错误口令拒绝；保存的是带算法与参数的 Argon2id 哈希")
    void verifiesPasswordWithoutStoringPlaintext() {
        String raw = "Test-only-password-2026";
        String hash = encoder.encode(raw);

        assertThat(hash).startsWith("{argon2}$argon2id$v=19$m=19456,t=2,p=1$")
                .hasSizeLessThanOrEqualTo(255).doesNotContain(raw);
        assertThat(encoder.matches(raw, hash)).isTrue();
        assertThat(encoder.matches("Wrong-test-password-2026", hash)).isFalse();
    }

    @Test
    @DisplayName("相同口令使用不同随机盐，因此两次生成的哈希不同")
    void usesFreshSaltForEachPassword() {
        String raw = "Same-test-password-2026";
        String first = encoder.encode(raw);
        String second = encoder.encode(raw);

        assertThat(first).isNotEqualTo(second);
        assertThat(encoder.matches(raw, first)).isTrue();
        assertThat(encoder.matches(raw, second)).isTrue();
    }

    @Test
    @DisplayName("口令的空格、大小写和 Unicode 字符不被悄悄转换")
    void preservesPasswordExactly() {
        String raw = "  测试口令AbC-2026-🔐  ";
        String hash = encoder.encode(raw);

        assertThat(encoder.matches(raw, hash)).isTrue();
        assertThat(encoder.matches(raw.strip(), hash)).isFalse();
        assertThat(encoder.matches("  测试口令abc-2026-🔐  ", hash)).isFalse();
    }

    @Test
    @DisplayName("不接受明文或未知算法作为已保存口令")
    void hasNoPlaintextFallback() {
        assertThatThrownBy(() -> encoder.matches("Test-only-password-2026", "plain-text"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> encoder.matches("Test-only-password-2026", "{noop}Test-only-password-2026"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
