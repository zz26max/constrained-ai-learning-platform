package com.learningplatform.common.health;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * 验证对外 HTTP 契约，而不是直接调用 Controller 方法。
 *
 * <p>WebMvcTest 只加载 Web 层，MockMvc 将请求交给 Spring MVC 的处理链。
 * 数据库检查结果在这里模拟，以验证 200/503、JSON 和缓存头的契约；
 * 真正的 MySQL、Flyway 与连接失效另由 DatabaseIntegrationIT 验证。</p>
 */
@WebMvcTest(HealthController.class)
class HealthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private DatabaseReadinessService databaseReadinessService;

    @Test
    @DisplayName("匿名 GET 存活检查返回 200 和约定的 JSON，不携带额外内部信息")
    void anonymousGetReturnsLivenessContract() throws Exception {
        mockMvc.perform(get("/health/live").accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                // 严格比较 JSON 字段，防止以后意外加入版本、连接信息或业务信封。
                .andExpect(content().json("{\"status\":\"ok\"}", JsonCompareMode.STRICT))
                .andExpect(header().string("Cache-Control", "no-store"));
        // 存活接口不能偷偷查询数据库，否则数据库故障可能触发无意义的进程重启。
        verifyNoInteractions(databaseReadinessService);
    }

    @ParameterizedTest
    @ValueSource(strings = {"/health/live", "/health/ready"})
    @DisplayName("POST 不能调用健康检查，返回 405")
    void postIsNotAllowed(String path) throws Exception {
        mockMvc.perform(post(path))
                .andExpect(status().isMethodNotAllowed());
    }

    @Test
    @DisplayName("数据库可用时就绪检查返回 200 和 ready")
    void availableDatabaseReturnsReady() throws Exception {
        when(databaseReadinessService.isAvailable()).thenReturn(true);
        mockMvc.perform(get("/health/ready").accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(content().json("{\"status\":\"ready\"}", JsonCompareMode.STRICT))
                .andExpect(header().string("Cache-Control", "no-store"));
    }

    @Test
    @DisplayName("数据库不可用时返回 503，仅包含 unavailable 状态")
    void unavailableDatabaseReturnsServiceUnavailable() throws Exception {
        when(databaseReadinessService.isAvailable()).thenReturn(false);
        mockMvc.perform(get("/health/ready").accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isServiceUnavailable())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(content().json("{\"status\":\"unavailable\"}", JsonCompareMode.STRICT))
                .andExpect(header().string("Cache-Control", "no-store"));
    }
}
