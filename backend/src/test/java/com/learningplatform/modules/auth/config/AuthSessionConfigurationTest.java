package com.learningplatform.modules.auth.config;

import java.time.Duration;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class AuthSessionConfigurationTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(AuthSessionConfiguration.class)
            .withPropertyValues("auth.session.idle-timeout=PT12H", "auth.session.absolute-timeout=P7D");

    @Test
    void bindsConfiguredTimeouts() {
        contextRunner.run(context -> {
            assertThat(context).hasNotFailed();
            AuthSessionProperties properties = context.getBean(AuthSessionProperties.class);
            assertThat(properties.idleTimeout()).isEqualTo(Duration.ofHours(12));
            assertThat(properties.absoluteTimeout()).isEqualTo(Duration.ofDays(7));
        });
    }

    @ParameterizedTest
    @MethodSource("invalidOverrides")
    void rejectsInvalidTimeoutConfigurationBeforeApplicationStarts(String override) {
        contextRunner.withPropertyValues(override).run(context -> assertThat(context).hasFailed());
    }

    static Stream<String> invalidOverrides() {
        return Stream.of("auth.session.idle-timeout=PT0S", "auth.session.idle-timeout=PT-1H",
                "auth.session.absolute-timeout=PT1H", "auth.session.absolute-timeout=PT0S",
                "auth.session.idle-timeout=PT0.000000001S");
    }
}
