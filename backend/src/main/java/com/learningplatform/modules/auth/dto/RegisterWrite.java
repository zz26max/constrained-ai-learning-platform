package com.learningplatform.modules.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 注册请求；按 openapi.yaml RegisterWrite schema 定义。
 * mode: personal（个人自学）或 school（学校课程）
 * role: school 模式必填，student 或 teacher
 * inviteCode: school+student 模式必填
 * createClass: school+teacher 模式可选，是否创建班级
 * className: school+teacher+createClass 模式可选，班级名称；省略时用「我的班级」
 */
public record RegisterWrite(
        @NotBlank @Size(min = 3, max = 32) @Pattern(regexp = "[a-z0-9._-]+", message = "用户名只能包含小写字母、数字、点、下划线或连字符")
        String username,

        @NotBlank @Size(min = 8, max = 64) String password,

        @NotBlank @Size(min = 1, max = 50) String displayName,

        @NotBlank String mode,

        String role,

        String inviteCode,

        Boolean createClass,

        String className
) {
    /** 兼容旧调用：className 省略时按默认班名处理。 */
    public RegisterWrite(String username, String password, String displayName, String mode,
                         String role, String inviteCode, Boolean createClass) {
        this(username, password, displayName, mode, role, inviteCode, createClass, null);
    }
}
