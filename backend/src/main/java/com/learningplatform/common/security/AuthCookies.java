package com.learningplatform.common.security;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseCookie;

/** 认证 Cookie 的名称与构造；名称/属性以契约 x-cookie-policy 为准，不散落各处重复定义。 */
public final class AuthCookies {

    public static final String SESSION = "lp_session";
    public static final String PRE_AUTH = "lp_pre_auth";

    private AuthCookies() {
    }

    /** 按名称读取 Cookie；不存在时返回 null。 */
    public static String read(HttpServletRequest request, String name) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (name.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }

    /** 会话 Cookie；maxAge 由调用方按绝对期限换算，HttpOnly + SameSite=Lax 固定。 */
    public static String session(String token, long maxAgeSeconds, boolean secure) {
        return cookie(SESSION, token, maxAgeSeconds, secure);
    }

    /** 预登录签名 Cookie；maxAge 使用契约的 600 秒默认。 */
    public static String preAuth(String value, long maxAgeSeconds, boolean secure) {
        return cookie(PRE_AUTH, value, maxAgeSeconds, secure);
    }

    /** 清除指定 Cookie（Max-Age=0）。 */
    public static String clear(String name, boolean secure) {
        return cookie(name, "", 0, secure);
    }

    private static String cookie(String name, String value, long maxAgeSeconds, boolean secure) {
        return ResponseCookie.from(name, value)
                .httpOnly(true)
                .sameSite("Lax")
                .path("/")
                .maxAge(maxAgeSeconds)
                .secure(secure)
                .build()
                .toString();
    }
}
