package com.learningplatform.modules.auth.mapper;

import java.time.Instant;
import java.util.Optional;

import com.learningplatform.modules.auth.model.AuthSession;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AuthSessionMapper {

    int insert(@Param("session") AuthSession session);

    /** 普通读取只用于发现所属账户，后续仍需在事务内重新锁定和校验。 */
    Optional<AuthSession> findByTokenHash(@Param("tokenHash") String tokenHash);

    Optional<AuthSession> findByTokenHashForUpdate(@Param("tokenHash") String tokenHash);

    int touch(@Param("id") String id, @Param("now") Instant now, @Param("idleExpiresAt") Instant idleExpiresAt);

    int revoke(@Param("id") String id, @Param("now") Instant now);
}
