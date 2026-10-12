package com.learningplatform.common.mybatis;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;

import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;

/** DATETIME(6) 不携带时区；按数据模型约定，显式将数据库 UTC 时间映射为 Instant。 */
public final class UtcInstantTypeHandler extends BaseTypeHandler<Instant> {

    @Override
    public void setNonNullParameter(PreparedStatement statement, int index,
                                    Instant instant, JdbcType jdbcType) throws SQLException {
        // 不使用系统默认时区；以后 INSERT/UPDATE 引用此处理器时也采用相同 UTC 语义。
        statement.setObject(index, LocalDateTime.ofInstant(instant, ZoneOffset.UTC));
    }

    @Override
    public Instant getNullableResult(ResultSet result, String column) throws SQLException {
        return toInstant(result.getObject(column, LocalDateTime.class));
    }

    @Override
    public Instant getNullableResult(ResultSet result, int column) throws SQLException {
        return toInstant(result.getObject(column, LocalDateTime.class));
    }

    @Override
    public Instant getNullableResult(CallableStatement statement, int column) throws SQLException {
        return toInstant(statement.getObject(column, LocalDateTime.class));
    }

    private Instant toInstant(LocalDateTime utcTime) {
        return utcTime == null ? null : utcTime.toInstant(ZoneOffset.UTC);
    }
}
