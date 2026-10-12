package com.learningplatform.modules.auth.security;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SessionTokenCodecTest {

    private final SessionTokenCodec tokens = new SessionTokenCodec();

    @Test
    void generatesIndependentRandomTokensInOneCanonicalFormat() {
        String first = tokens.generate();
        String second = tokens.generate();
        assertThat(first).matches("[0-9a-f]{64}").isNotEqualTo(second);
        assertThat(tokens.isValid(first)).isTrue();
        assertThat(tokens.isValid("A".repeat(64))).isFalse();
        assertThat(tokens.isValid(" " + first)).isFalse();
        assertThat(tokens.isValid(first + "\n")).isFalse();
        assertThat(tokens.isValid(null)).isFalse();
    }

    @Test
    void usesStandardSha256AndDoesNotTreatTheDigestAsTheOriginalToken() {
        assertThat(tokens.digest("abc"))
                .isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        String token = tokens.generate();
        assertThat(tokens.digest(token)).matches("[0-9a-f]{64}").isNotEqualTo(token);
    }
}
