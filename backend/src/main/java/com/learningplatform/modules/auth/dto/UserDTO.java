package com.learningplatform.modules.auth.dto;

import java.util.List;

/** 可以交给接口层的用户身份资料；不包含密码哈希和数据库内部状态字段。 */
public record UserDTO(String id, String username, String displayName, List<String> roles) {

    public UserDTO {
        roles = List.copyOf(roles);
    }
}
