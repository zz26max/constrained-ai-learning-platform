package com.learningplatform.common.audit;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** 审计只提供追加写入；读取与清理走受控运维流程，不提供普通更新/删除入口。 */
@Mapper
public interface AuditLogMapper {

    int insert(@Param("entry") AuditLog entry);
}
