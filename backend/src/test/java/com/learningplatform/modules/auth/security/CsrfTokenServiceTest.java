package com.learningplatform.modules.auth.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import com.learningplatform.modules.auth.config.AuthHttpProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class CsrfTokenServiceTest {

    private static final Instant START = Instant.parse("2026-10-11T00:00:00Z");
    private static final AuthHttpProperties PROPERTIES = new AuthHttpProperties(
            Duration.ofMinutes(10), "test-signing-key", List.of("http://127.0.0.1:4173"), false);

    private CsrfTokenService service;

    @BeforeEach
    void setUp() {
        service = new CsrfTokenService(PROPERTIES, Clock.fixed(START, ZoneOffset.UTC));
    }

    @Test
    void sessionTokenIsStableAndBoundToSecretAndSession() {
        String first = service.sessionToken("session-1", "secret-a");
        String same = service.sessionToken("session-1", "secret-a");
        String otherSecret = service.sessionToken("session-1", "secret-b");
        String otherSession = service.sessionToken("session-2", "secret-a");

        assertThat(first).matches("[0-9a-f]{64}").isEqualTo(same)
                .isNotEqualTo(otherSecret).isNotEqualTo(otherSession);
        assertThat(service.verifySessionToken("session-1", "secret-a", first)).isTrue();
        assertThat(service.verifySessionToken("session-1", "secret-a", otherSecret)).isFalse();
        assertThat(service.verifySessionToken("session-1", "secret-a", null)).isFalse();
    }

    @Test
    void preAuthRoundTripSucceedsAndRejectsTampering() {
        CsrfTokenService.PreAuthTicket ticket = service.issuePreAuth();
        assertThat(ticket.token()).matches("[0-9a-f]{64}");
        assertThat(ticket.expiresAt()).isEqualTo(START.plus(Duration.ofMinutes(10)));

        assertThat(service.verifyPreAuth(ticket.cookieValue(), ticket.token())).isTrue();
        assertThat(service.verifyPreAuth(ticket.cookieValue(), "a".repeat(64))).isFalse();
        assertThat(service.verifyPreAuth(ticket.cookieValue() + "x", ticket.token())).isFalse();
        assertThat(service.verifyPreAuth(ticket.cookieValue(), "not-hex")).isFalse();
        assertThat(service.verifyPreAuth(null, ticket.token())).isFalse();
        assertThat(service.verifyPreAuth(ticket.cookieValue(), null)).isFalse();
    }

    @Test
    void preAuthExpiresAfterConfiguredWindow() {
        CsrfTokenService.PreAuthTicket ticket = service.issuePreAuth();
        CsrfTokenService later = new CsrfTokenService(PROPERTIES,
                Clock.fixed(START.plus(Duration.ofMinutes(11)), ZoneOffset.UTC));
        assertThat(later.verifyPreAuth(ticket.cookieValue(), ticket.token())).isFalse();
    }

    @Test
    void preAuthRejectsWhenSigningKeyDiffers() {
        CsrfTokenService.PreAuthTicket ticket = service.issuePreAuth();
        AuthHttpProperties otherProperties = new AuthHttpProperties(
                Duration.ofMinutes(10), "other-signing-key", List.of("http://127.0.0.1:4173"), false);
        CsrfTokenService other = new CsrfTokenService(otherProperties, Clock.fixed(START, ZoneOffset.UTC));
        assertThat(other.verifyPreAuth(ticket.cookieValue(), ticket.token())).isFalse();
    }
}
