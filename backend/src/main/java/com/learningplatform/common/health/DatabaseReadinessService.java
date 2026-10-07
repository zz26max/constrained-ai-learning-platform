package com.learningplatform.common.health;

import java.sql.Connection;
import java.sql.SQLException;
import javax.sql.DataSource;

import org.springframework.stereotype.Service;

/**
 * 数据库就绪检查，不查询教学数据，也不调用外部 AI。
 *
 * <p>DataSource 是 JDBC 的标准接口，Spring 根据配置提供 Hikari 连接池实现。
 * 这里检测真实连接，不用常量或“Service 对象存在”代替数据库可用性。</p>
 */
@Service
public class DatabaseReadinessService {

    private final DataSource dataSource;

    public DatabaseReadinessService(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    public boolean isAvailable() {
        // try-with-resources 无论成功还是异常都归还连接，防止每次探测消耗一个连接。
        // 获取连接的等待时间由 Hikari 配置约束；isValid 的单位为秒。
        try (Connection connection = dataSource.getConnection()) {
            return connection.isValid(1);
        } catch (SQLException exception) {
            // 对外只报告不可用；不把驱动异常中的连接信息拼进健康响应。
            return false;
        }
    }
}
