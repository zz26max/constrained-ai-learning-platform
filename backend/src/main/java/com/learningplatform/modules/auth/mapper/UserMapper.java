package com.learningplatform.modules.auth.mapper;

import java.util.Optional;

import com.learningplatform.modules.auth.model.User;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** 用户数据访问入口；MyBatis 创建接口的代理实现，并执行对应 XML 中的 SQL。 */
@Mapper
public interface UserMapper {

    /**
     * 按数据库保存的规范用户名精确查询；没有账户时返回 Optional.empty()。
     *
     * <p>规范化由后续业务入口负责，Mapper 不悄悄修改输入；此查询也返回 disabled 账户，
     * 是否允许登录由登录服务判断。@Param 的名称对应 SQL 中的 #{username} 绑定参数。</p>
     */
    Optional<User> findByUsername(@Param("username") String username);

    /** 保存已经完成业务校验和密码哈希的账户，返回受影响的行数；不覆盖已有账户。 */
    int insert(@Param("user") User user);

    /** 事务内共享锁查询：会话操作期间，阻止该账户的禁用、密码变更或删除。 */
    Optional<User> findByIdForShare(@Param("id") String id);
}
