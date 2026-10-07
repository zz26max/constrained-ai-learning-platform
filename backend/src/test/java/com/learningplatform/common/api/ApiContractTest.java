package com.learningplatform.common.api;

import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.common.exception.GlobalExceptionHandler;
import com.learningplatform.common.web.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 从 HTTP 入口验证公共响应约定，而不是只验证几个 Java 对象的构造结果。
 *
 * <p>这些端点只存在于测试代码中，用来触发成功、业务异常和 MVC 校验异常。
 * WebMvcTest 只启动 Web 层，不连接 MySQL，也不会给正式应用增加示例接口。</p>
 */
@WebMvcTest(ApiContractTest.TestController.class)
@Import({ApiContractTest.TestController.class, GlobalExceptionHandler.class, RequestIdFilter.class})
class ApiContractTest {

    private static final String HEADER_NAME = RequestIdFilter.HEADER_NAME;
    private static final String CLIENT_REQUEST_ID = "req-intern-debug_1";
    private static final String SENSITIVE_PASSWORD = "plaintext-password-do-not-return";
    private static final String INTERNAL_EXCEPTION = "jdbc:mysql://internal-db/secret password=do-not-return";

    @Autowired
    private MockMvc mockMvc;

    @ParameterizedTest
    @ValueSource(strings = {"/api/v1", "/api/v1/", "/api/v1/test/success"})
    @DisplayName("业务成功响应沿用合法请求标识，响应头与正文一致")
    void successUsesTheAcceptedRequestId(String path) throws Exception {
        mockMvc.perform(get(path).header(HEADER_NAME, CLIENT_REQUEST_ID))
                .andExpect(status().isOk())
                .andExpect(header().string(HEADER_NAME, CLIENT_REQUEST_ID))
                .andExpect(content().json("""
                        {"data":{"ok":true},"requestId":"req-intern-debug_1"}
                        """, JsonCompareMode.STRICT));
    }

    @Test
    @DisplayName("未提供请求标识时生成标识，响应头与成功正文一致")
    void missingRequestIdIsGenerated() throws Exception {
        expectGeneratedRequestId(mockMvc.perform(get("/api/v1/test/success")));
    }

    static Stream<String> invalidRequestIds() {
        return Stream.of("", "req contains spaces", "req/path", "-invalid-first-character", "请求标识", "a".repeat(65));
    }

    @ParameterizedTest
    @MethodSource("invalidRequestIds")
    @DisplayName("空、非法字符或超过 64 字符的请求标识被替换")
    void invalidRequestIdIsReplaced(String suppliedId) throws Exception {
        MvcResult result = expectGeneratedRequestId(mockMvc.perform(get("/api/v1/test/success")
                .header(HEADER_NAME, suppliedId)));
        assertNotEquals(suppliedId, result.getResponse().getHeader(HEADER_NAME));
    }

    @Test
    @DisplayName("64 字符请求标识仍然有效，边界不会误判为超长")
    void requestIdOfExactly64CharactersIsAccepted() throws Exception {
        String suppliedId = "a".repeat(64);
        mockMvc.perform(get("/api/v1/test/success").header(HEADER_NAME, suppliedId))
                .andExpect(status().isOk())
                .andExpect(header().string(HEADER_NAME, suppliedId))
                .andExpect(jsonPath("$.requestId").value(suppliedId));
    }

    @Test
    @DisplayName("重复的请求标识头不选择其中任意一个，而是生成新的标识")
    void repeatedRequestIdHeadersAreReplaced() throws Exception {
        MvcResult result = expectGeneratedRequestId(mockMvc.perform(get("/api/v1/test/success")
                .header(HEADER_NAME, "req-first", "req-second")));
        String actualId = result.getResponse().getHeader(HEADER_NAME);
        assertNotEquals("req-first", actualId);
        assertNotEquals("req-second", actualId);
    }

    @Test
    @DisplayName("部署在非空 contextPath 下时仍能识别业务接口")
    void contextPathDoesNotPreventBusinessRequestRecognition() throws Exception {
        mockMvc.perform(get("/platform/api/v1/test/success")
                        .contextPath("/platform")
                        .header(HEADER_NAME, CLIENT_REQUEST_ID))
                .andExpect(status().isOk())
                .andExpect(header().string(HEADER_NAME, CLIENT_REQUEST_ID))
                .andExpect(jsonPath("$.requestId").value(CLIENT_REQUEST_ID));
    }

    @Test
    @DisplayName("可预期的业务冲突保留 409、业务错误码、说明和详情")
    void businessConflictPreservesItsPublicDetails() throws Exception {
        expectError(mockMvc.perform(get("/api/v1/test/conflict")
                        .header(HEADER_NAME, CLIENT_REQUEST_ID)), 409, "WORKSPACE_CONFLICT")
                .andExpect(content().json("""
                        {
                          "error": {
                            "code":"WORKSPACE_CONFLICT",
                            "message":"工作区已更新，请重新加载。",
                            "details":{"currentRevision":8}
                          },
                          "requestId":"req-intern-debug_1"
                        }
                        """, JsonCompareMode.STRICT));
    }

    @Test
    @DisplayName("业务异常没有详情时仍返回空对象，避免客户端处理 null")
    void businessExceptionWithoutDetailsUsesAnEmptyObject() throws Exception {
        expectError(mockMvc.perform(get("/api/v1/test/missing")), 404, "NOT_FOUND")
                .andExpect(jsonPath("$.error.details").isEmpty());
    }

    @Test
    @DisplayName("未知异常返回 500 通用说明，不暴露连接信息、密码或异常类型")
    void unexpectedFailureDoesNotExposeInternalInformation() throws Exception {
        ResultActions actions = expectError(mockMvc.perform(get("/api/v1/test/failure")), 500, "INTERNAL_ERROR")
                .andExpect(jsonPath("$.error.details").isEmpty());
        String body = actions.andReturn().getResponse().getContentAsString();
        assertFalse(body.contains(INTERNAL_EXCEPTION));
        assertFalse(body.contains("internal-db"));
        assertFalse(body.contains("password="));
        assertFalse(body.contains("IllegalStateException"));
    }

    static Stream<String> unreadableJsonBodies() {
        return Stream.of(
                "{\"password\":",                         // JSON 语法不完整，无法解码。
                "",                                       // 必填正文缺失，无法构造 DTO。
                "{\"password\":{\"value\":\"abcd\"}}", // 对象无法反序列化为 String 字段。
                "{\"password\":\"abcd\",\"unexpected\":true}" // 已知字段合法，未知字段仍必须被拒绝。
        );
    }

    @ParameterizedTest
    @MethodSource("unreadableJsonBodies")
    @DisplayName("JSON 解码、必填正文或未知字段错误属于 400 INVALID_REQUEST")
    void unreadableJsonUsesTheInvalidRequestContract(String body) throws Exception {
        // 正文还没有成功转换为 DTO 时属于 400；转换后的字段约束校验另测 422。
        expectError(mockMvc.perform(post("/api/v1/test/input")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)), 400, "INVALID_REQUEST");
    }

    @Test
    @DisplayName("DTO 校验失败返回 422 与字段名，不回传敏感输入或自定义校验消息")
    void invalidInputDoesNotLeakRejectedValuesOrValidationMessages() throws Exception {
        ResultActions actions = expectError(mockMvc.perform(post("/api/v1/test/input")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"password\":\"" + SENSITIVE_PASSWORD + "\"}")), 422, "VALIDATION_ERROR")
                .andExpect(jsonPath("$.error.details.fields").exists());
        String body = actions.andReturn().getResponse().getContentAsString();
        assertTrue(body.contains("password"), "校验详情应让前端知道是哪一个字段有问题");
        assertFalse(body.contains(SENSITIVE_PASSWORD), "详情不能包含被拒绝的敏感值");
        assertFalse(body.contains("Internal validation message"), "自定义校验消息可能含内部信息，应使用安全的通用说明");
        assertFalse(body.contains("validatedValue"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/v1/test/page?size=abc", "/api/v1/test/page", "/api/v1/test/page?size=0"})
    @DisplayName("请求参数类型错误、缺少必填参数和范围校验都返回 422")
    void invalidRequestParametersUseTheValidationContract(String path) throws Exception {
        expectError(mockMvc.perform(get(path)), 422, "VALIDATION_ERROR");
    }

    @Test
    @DisplayName("返回值违反约束属于服务端错误，不能归咎于用户输入")
    void invalidControllerReturnValueUsesInternalError() throws Exception {
        expectError(mockMvc.perform(get("/api/v1/test/invalid-return")), 500, "INTERNAL_ERROR");
    }

    @Test
    @DisplayName("不存在的业务路径返回 404 与统一错误信封")
    void unknownBusinessPathUsesTheNotFoundContract() throws Exception {
        expectError(mockMvc.perform(get("/api/v1/does-not-exist")), 404, "NOT_FOUND");
    }

    @Test
    @DisplayName("方法不支持时返回 405，保留 HTTP Allow 响应头")
    void methodNotAllowedPreservesAllowHeader() throws Exception {
        expectError(mockMvc.perform(post("/api/v1/test/success")), 405, "METHOD_NOT_ALLOWED")
                .andExpect(header().string("Allow", containsString("GET")));
    }

    @Test
    @DisplayName("无法提供客户端要求的响应类型时返回 406")
    void unacceptableResponseTypeUsesTheNotAcceptableContract() throws Exception {
        expectError(mockMvc.perform(get("/api/v1/test/success").accept(MediaType.APPLICATION_XML)),
                406, "NOT_ACCEPTABLE");
    }

    @Test
    @DisplayName("不支持的请求正文类型返回 415")
    void unsupportedRequestBodyTypeUsesTheMediaTypeContract() throws Exception {
        expectError(mockMvc.perform(post("/api/v1/test/input")
                        .contentType(MediaType.TEXT_PLAIN).content("password=test")),
                415, "UNSUPPORTED_MEDIA_TYPE");
    }

    @ParameterizedTest
    @ValueSource(strings = {"/health/test-status", "/api/v10/test/status", "/api/v1other/test/status"})
    @DisplayName("健康检查和看起来相似的路径不进入业务请求处理")
    void nonBusinessResponsesKeepTheirOriginalFormat(String path) throws Exception {
        mockMvc.perform(get(path).header(HEADER_NAME, CLIENT_REQUEST_ID))
                .andExpect(status().isOk())
                .andExpect(header().doesNotExist(HEADER_NAME))
                .andExpect(content().json("{\"status\":\"ok\"}", JsonCompareMode.STRICT));
    }

    @ParameterizedTest
    @CsvSource({"/api/v1/test/mdc,200", "/api/v1/test/failure,500"})
    @DisplayName("请求处理结束后清理 MDC，异常请求也不会污染后续日志")
    void mdcIsClearedAfterSuccessfulAndFailedRequests(String path, int expectedStatus) throws Exception {
        String previous = MDC.get("requestId");
        MDC.remove("requestId");
        try {
            ResultActions actions = mockMvc.perform(get(path).header(HEADER_NAME, CLIENT_REQUEST_ID))
                    .andExpect(status().is(expectedStatus));
            if (expectedStatus == 200) {
                actions.andExpect(jsonPath("$.data.requestIdSeenInMdc").value(CLIENT_REQUEST_ID));
            }
            assertNull(MDC.get("requestId"), "同一个工作线程处理下一个请求时不能残留旧标识");
        } finally {
            restoreMdc(previous);
        }
    }

    @Test
    @DisplayName("线程进入过滤器前已有 MDC 标识时，处理结束后恢复原值")
    void priorMdcRequestIdIsRestored() throws Exception {
        String previous = MDC.get("requestId");
        MDC.put("requestId", "req-outer-operation");
        try {
            mockMvc.perform(get("/api/v1/test/mdc").header(HEADER_NAME, CLIENT_REQUEST_ID))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.requestIdSeenInMdc").value(CLIENT_REQUEST_ID));
            assertEquals("req-outer-operation", MDC.get("requestId"));
        } finally {
            restoreMdc(previous);
        }
    }

    private static void restoreMdc(String previous) {
        if (previous == null) {
            MDC.remove("requestId");
        } else {
            MDC.put("requestId", previous);
        }
    }

    /** 所有错误都检查头和正文标识一致、JSON、no-store 和稳定的信封形状。 */
    private static ResultActions expectError(ResultActions actions, int expectedStatus, String expectedCode) throws Exception {
        MvcResult result = actions.andExpect(status().is(expectedStatus))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.error.code").value(expectedCode))
                .andExpect(jsonPath("$.error.message").isString())
                .andExpect(jsonPath("$.error.details").isMap())
                .andExpect(jsonPath("$.data").doesNotExist())
                .andReturn();
        String requestId = result.getResponse().getHeader(HEADER_NAME);
        assertNotNull(requestId, "失败响应也必须带请求标识，才能关联服务端日志");
        assertFalse(requestId.isBlank());
        return actions.andExpect(jsonPath("$.requestId").value(requestId));
    }

    private static MvcResult expectGeneratedRequestId(ResultActions actions) throws Exception {
        MvcResult result = actions.andExpect(status().isOk()).andReturn();
        String requestId = result.getResponse().getHeader(HEADER_NAME);
        assertNotNull(requestId);
        assertTrue(requestId.startsWith("req-"));
        // 实际解析 UUID，避免只检查前缀就接受一个无法追踪的空占位符。
        UUID.fromString(requestId.substring(4));
        actions.andExpect(jsonPath("$.requestId").value(requestId));
        return result;
    }

    /** 只由本测试显式导入，不会作为正式业务接口发布。 */
    @RestController
    public static class TestController {

        @GetMapping(value = {"/api/v1", "/api/v1/", "/api/v1/test/success"}, produces = MediaType.APPLICATION_JSON_VALUE)
        public ApiResponse<Map<String, Boolean>> success(HttpServletRequest request) {
            return new ApiResponse<>(Map.of("ok", true), RequestIdFilter.getRequestId(request));
        }

        @GetMapping("/api/v1/test/conflict")
        public ApiResponse<Void> conflict() {
            throw new BusinessException(HttpStatus.CONFLICT, "WORKSPACE_CONFLICT", "工作区已更新，请重新加载。",
                    Map.of("currentRevision", 8));
        }

        @GetMapping("/api/v1/test/missing")
        public ApiResponse<Void> missing() {
            throw new BusinessException(HttpStatus.NOT_FOUND, "NOT_FOUND", "资源不存在。");
        }

        @GetMapping("/api/v1/test/failure")
        public ApiResponse<Void> failure() {
            throw new IllegalStateException(INTERNAL_EXCEPTION);
        }

        @PostMapping(value = "/api/v1/test/input", consumes = MediaType.APPLICATION_JSON_VALUE)
        public ApiResponse<Map<String, Boolean>> input(@Valid @RequestBody InputBody body, HttpServletRequest request) {
            return new ApiResponse<>(Map.of("ok", true), RequestIdFilter.getRequestId(request));
        }

        @GetMapping("/api/v1/test/page")
        public ApiResponse<Map<String, Integer>> page(@RequestParam("size") @Min(1) int size, HttpServletRequest request) {
            return new ApiResponse<>(Map.of("size", size), RequestIdFilter.getRequestId(request));
        }

        @Min(1)
        @GetMapping("/api/v1/test/invalid-return")
        public int invalidReturn() {
            return 0;
        }

        @GetMapping("/api/v1/test/mdc")
        public ApiResponse<Map<String, String>> mdc(HttpServletRequest request) {
            return new ApiResponse<>(Map.of("requestIdSeenInMdc", MDC.get("requestId")),
                    RequestIdFilter.getRequestId(request));
        }

        @GetMapping({"/health/test-status", "/api/v10/test/status", "/api/v1other/test/status"})
        public Map<String, String> nonBusinessStatus() {
            return Map.of("status", "ok");
        }
    }

    /** 故意用一个可能包含拒绝值的消息，证明对外错误不直接复用校验器消息。 */
    public record InputBody(@Size(min = 1, max = 4, message = "Internal validation message: ${validatedValue}") String password) {
    }
}
