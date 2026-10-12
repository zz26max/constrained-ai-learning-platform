package com.learningplatform.modules.auth.mapper.typehandler;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/** 将 users.roles 的 JSON 数组转换为 Java List；合法角色及集合约束由数据库保障。 */
public final class UserRolesTypeHandler extends BaseTypeHandler<List<String>> {

    // 只处理数据库角色数组，不沿用 HTTP 请求的 JSON 配置；构建后复用，不逐行创建解析器。
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final TypeReference<List<String>> ROLE_LIST = new TypeReference<>() { };

    @Override
    public void setNonNullParameter(PreparedStatement statement, int index,
                                    List<String> roles, JdbcType jdbcType) throws SQLException {
        statement.setString(index, JSON.writeValueAsString(roles));
    }

    @Override
    public List<String> getNullableResult(ResultSet result, String column) throws SQLException {
        return readRoles(result.getString(column));
    }

    @Override
    public List<String> getNullableResult(ResultSet result, int column) throws SQLException {
        return readRoles(result.getString(column));
    }

    @Override
    public List<String> getNullableResult(CallableStatement statement, int column) throws SQLException {
        return readRoles(statement.getString(column));
    }

    private List<String> readRoles(String json) throws SQLException {
        if (json == null) {
            return null;
        }
        try {
            return List.copyOf(JSON.readValue(json, ROLE_LIST));
        } catch (RuntimeException exception) {
            // 不将原始数据库内容放入异常消息。正常写入应由 CHECK 约束拒绝非法数组。
            throw new SQLException("Cannot map users.roles to a role list");
        }
    }
}
