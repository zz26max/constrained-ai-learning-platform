package com.learningplatform.common.health;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 运维健康接口，路径按契约放在 /health 下，独立于 /api/v1 业务接口。
 *
 * <p>存活检查只验证 HTTP 请求可以到达后端并得到响应，不查询数据库或外部 AI。
 * 数据库故障也不应该把这个检查变成失败；依赖可用性由后续的 ready 接口负责。</p>
 */
@RestController
@RequestMapping("/health")
public class HealthController {

    private final DatabaseReadinessService databaseReadinessService;

    /**
     * 构造器注入：Spring 将已创建的 Service 传进来，无需在 Controller 中手动 new。
     * 类只有一个构造器时，Spring 不要求额外写 @Autowired。
     */
    public HealthController(DatabaseReadinessService databaseReadinessService) {
        this.databaseReadinessService = databaseReadinessService;
    }

    /**
     * 处理 GET /health/live，无需登录或 CSRF 令牌。
     *
     * <p>类上的 /health 与方法上的 /live 组合成完整路径。
     * ResponseEntity 明确 HTTP 状态、响应头及响应体；no-store 避免旧探测结果被缓存。
     * 此处没有业务计算，因此无需为了分层而增加空的 Service 或 Mapper。</p>
     */
    @GetMapping(value = "/live", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<LivenessResponse> live() {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(new LivenessResponse("ok"));
    }

    /**
     * GET /health/ready，检查应用启动后数据库是否仍可使用。
     *
     * <p>Controller 只把检查结果转成 HTTP 响应，连接获取与释放交给 Service。
     * 启动时的表结构正确性由 Flyway 保证；运行期间失联返回 503。
     * 响应只有约定的状态字段，不携带地址、账号或内部异常信息。</p>
     */
    @GetMapping(value = "/ready", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ReadinessResponse> ready() {
        boolean databaseAvailable = databaseReadinessService.isAvailable();
        return ResponseEntity.status(databaseAvailable ? 200 : 503)
                .cacheControl(CacheControl.noStore())
                .body(new ReadinessResponse(databaseAvailable ? "ready" : "unavailable"));
    }
}
