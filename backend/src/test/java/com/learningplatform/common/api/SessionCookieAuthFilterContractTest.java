package com.learningplatform.common.api;

import javax.sql.DataSource;

import com.learningplatform.LearningPlatformApplication;
import com.learningplatform.modules.auth.service.DatabaseSessionService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 使用正式 HTTP 认证链，验证会话查询故障不会逃出过滤器或泄漏查询内容。 */
@SpringBootTest(classes = LearningPlatformApplication.class, properties = {
        "spring.flyway.enabled=false", "spring.sql.init.mode=never",
        "DB_URL=jdbc:mysql://127.0.0.1:1/unused", "DB_USERNAME=unused", "DB_PASSWORD=unused",
        "auth.http.pre-login-signing-key=test-signing-key",
        "auth.http.allowed-origins=http://127.0.0.1:4173"
})
@AutoConfigureMockMvc
class SessionCookieAuthFilterContractTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private DataSource dataSource;
    @MockitoBean
    private DatabaseSessionService sessions;

    @Test
    @DisplayName("会话查询数据库故障返回统一 500，保留请求标识且不回显 SQL 或异常")
    void sessionDatabaseFailureReturnsUnifiedEnvelope() throws Exception {
        String token = "a".repeat(64);
        when(sessions.resolve(token)).thenThrow(new DataAccessResourceFailureException(
                "SELECT token_hash FROM auth_sessions WHERE token_hash = private-query-value"));

        MvcResult result = mockMvc.perform(get("/api/v1/me")
                        .cookie(new Cookie("lp_session", token))
                        .header("X-Request-ID", "req-auth-db-failure"))
                .andExpect(status().isInternalServerError())
                .andExpect(header().string("X-Request-ID", "req-auth-db-failure"))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("Content-Type", org.hamcrest.Matchers.containsString("application/json")))
                .andExpect(jsonPath("$.error.code").value("INTERNAL_ERROR"))
                .andExpect(jsonPath("$.error.message").value("服务暂时出现问题，请稍后重试。"))
                .andExpect(jsonPath("$.error.details").isEmpty())
                .andExpect(jsonPath("$.requestId").value("req-auth-db-failure"))
                .andReturn();

        assertThat(result.getResponse().getContentAsString())
                .doesNotContain("SELECT", "token_hash", "private-query-value", token,
                        "DataAccessResourceFailureException");
        verify(sessions).resolve(token);
    }
}
