package com.learningplatform.modules.tutoring.service;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.learningplatform.modules.analytics.service.LearningEventService;
import com.learningplatform.modules.courses.mapper.AssignmentMapper;
import com.learningplatform.modules.courses.model.AssignmentRows.Assignment;
import com.learningplatform.modules.tutoring.mapper.TutoringMapper;
import com.learningplatform.modules.tutoring.provider.TutoringProvider;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.PlatformTransactionManager;

import static com.learningplatform.modules.tutoring.mapper.TutoringSql.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class TutoringWorkerTest {
    private static final String ID="00000000-0000-4000-8000-000000000001";
    private static final Instant NOW=Instant.parse("2026-10-26T00:00:00Z");
    private final TutoringService service=mock(TutoringService.class);
    private final TutoringMapper db=mock(TutoringMapper.class);
    private final TutoringProvider provider=mock(TutoringProvider.class);
    private final AssignmentMapper assignments=mock(AssignmentMapper.class);
    private final Logger logger=(Logger)LoggerFactory.getLogger(TutoringWorker.class);
    private final ListAppender<ILoggingEvent> appender=new ListAppender<>();
    private TutoringWorker worker;

    @BeforeEach void setup() {
        appender.start();
        logger.addAppender(appender);
        worker=new TutoringWorker(service,db,new TutoringJson(tools.jackson.databind.json.JsonMapper.builder().findAndAddModules().build()),Clock.fixed(NOW,ZoneOffset.UTC),assignments,
                provider,mock(PlatformTransactionManager.class),mock(LearningEventService.class),false);
        when(db.update(eq(CLAIM_REQUEST),any(),any(),eq(ID))).thenReturn(1);
        var assignment=mock(Assignment.class);
        when(service.assignment("assignment")).thenReturn(assignment);
        when(assignment.id()).thenReturn("assignment");
        when(assignment.offeringId()).thenReturn("offering");
        when(assignment.status()).thenReturn("published");
        when(assignment.currentAiPolicyId()).thenReturn("policy");
        when(assignment.description()).thenReturn("Public material");
        var policy=TutoringService.defaults("assignment");
        policy.put("enabled",true);
        when(service.currentPolicy(assignment)).thenReturn(policy);
        when(db.one(FIND_REQUEST,ID)).thenReturn(Map.of("assignment_id","assignment","student_id","student",
                "hint_level",1,"action","ask","content","PRIVATE_QUESTION"));
        when(db.one(FIND_DELIVERY_MEMBERSHIP,"student","offering"))
                .thenReturn(Map.of("member_status","active","offering_status","active"));
        when(provider.available()).thenReturn(true);
        when(db.update(eq(RESERVE_PROVIDER_CALL),eq("policy"),any(),eq(ID))).thenReturn(1);
    }

    @AfterEach void teardown() {
        worker.close();
        logger.detachAppender(appender);
        appender.stop();
    }

    @Test void providerFailureLogsOnlySafeMetadataAndDoesNotRetry() throws Exception {
        when(provider.generate(any())).thenThrow(new IllegalArgumentException("SECRET_TOKEN UPSTREAM_PRIVATE_BODY"));
        worker.execute(ID);
        assertFailure("provider_generate","PROVIDER_UNAVAILABLE",IllegalArgumentException.class);
        verify(provider,times(1)).generate(any());
    }

    @Test void timeoutLogsSafeMetadataAndPreservesUnknownResult() throws Exception {
        when(provider.generate(any())).thenThrow(new java.net.http.HttpTimeoutException("SECRET_TOKEN"));
        worker.execute(ID);
        assertFailure("provider_generate","PROVIDER_RESULT_UNKNOWN",java.net.http.HttpTimeoutException.class);
        verify(provider,times(1)).generate(any());
    }

    @Test void internalFailureIsDiagnosableWithoutRawException() {
        when(service.assignment("assignment")).thenThrow(new IllegalStateException("SECRET_TOKEN"));
        worker.execute(ID);
        assertFailure("execute","INTERNAL_ERROR",IllegalStateException.class);
        verifyNoInteractions(provider);
    }

    private void assertFailure(String stage,String code,Class<?> exceptionType) {
        verify(db).update(eq(FAIL_REQUEST),eq(code),any(),any(),eq(ID));
        assertThat(appender.list).hasSize(1);
        ILoggingEvent entry=appender.list.getFirst();
        assertThat(entry.getFormattedMessage()).contains("requestId="+ID,"stage="+stage,"code="+code,
                "exceptionType="+exceptionType.getName()).doesNotContain("SECRET_TOKEN","UPSTREAM_PRIVATE_BODY","PRIVATE_QUESTION");
        assertThat(entry.getThrowableProxy()).isNull();
    }
}

