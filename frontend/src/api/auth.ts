import type { components, operations, paths } from './generated/schema'
import type { ApiClient, ApiResult, RequestOptions } from './client'

type Schemas = components['schemas']

/**
 * 首批五个认证操作（DEVELOPMENT 11.2）。路径、方法与 CSRF 要求逐项对照契约切片核对：
 * getCsrfToken / login / logout / getMe / getConfig。
 */
export interface AuthOperationSpecs {
  getCsrfToken: { id: 'getCsrfToken'; method: 'GET'; path: '/api/v1/auth/csrf-token'; csrf: false }
  login: { id: 'login'; method: 'POST'; path: '/api/v1/auth/login'; csrf: true }
  logout: { id: 'logout'; method: 'POST'; path: '/api/v1/auth/logout'; csrf: true }
  getMe: { id: 'getMe'; method: 'GET'; path: '/api/v1/me'; csrf: false }
  getConfig: { id: 'getConfig'; method: 'GET'; path: '/api/v1/me/config'; csrf: false }
}

export const AUTH_SPECS: AuthOperationSpecs = {
  getCsrfToken: { id: 'getCsrfToken', method: 'GET', path: '/api/v1/auth/csrf-token', csrf: false },
  login: { id: 'login', method: 'POST', path: '/api/v1/auth/login', csrf: true },
  logout: { id: 'logout', method: 'POST', path: '/api/v1/auth/logout', csrf: true },
  getMe: { id: 'getMe', method: 'GET', path: '/api/v1/me', csrf: false },
  getConfig: { id: 'getConfig', method: 'GET', path: '/api/v1/me/config', csrf: false },
}

// 契约静态核对：openapi.yaml 中这些路径、方法或 operationId 变化时，vue-tsc 在此编译失败，
// 防止请求层与契约漂移（字段结构另由生成类型约束）。
type AssertGetCsrfToken = paths['/api/v1/auth/csrf-token']['get']
type AssertLogin = paths['/api/v1/auth/login']['post']
type AssertLogout = paths['/api/v1/auth/logout']['post']
type AssertGetMe = paths['/api/v1/me']['get']
type AssertGetConfig = paths['/api/v1/me/config']['get']
type AssertOperationIds = Pick<operations, 'getCsrfToken' | 'login' | 'logout' | 'getMe' | 'getConfig'>

export type CsrfPayload = Schemas['Response_getCsrfToken']['data']
export type LoginPayload = Schemas['Response_login']['data']
export type LogoutPayload = Schemas['Response_logout']['data']
export type MePayload = Schemas['Response_getMe']['data']
export type ConfigPayload = Schemas['Response_getConfig']['data']
export type LoginWrite = Schemas['LoginWrite']

/** 认证接口：P0-A 首批交接的五个 operationId。 */
export class AuthApi {
  constructor(private readonly client: ApiClient) {}

  getCsrfToken(options: Pick<RequestOptions, 'signal'> = {}): Promise<ApiResult<CsrfPayload>> {
    return this.client.request<CsrfPayload>(AUTH_SPECS.getCsrfToken, options)
  }

  login(
    body: LoginWrite,
    csrfToken: string,
    options: Pick<RequestOptions, 'signal'> = {},
  ): Promise<ApiResult<LoginPayload>> {
    return this.client.request<LoginPayload>(AUTH_SPECS.login, { ...options, body, csrfToken })
  }

  logout(
    csrfToken: string,
    options: Pick<RequestOptions, 'signal'> = {},
  ): Promise<ApiResult<LogoutPayload>> {
    return this.client.request<LogoutPayload>(AUTH_SPECS.logout, { ...options, body: {}, csrfToken })
  }

  getMe(options: Pick<RequestOptions, 'signal'> = {}): Promise<ApiResult<MePayload>> {
    return this.client.request<MePayload>(AUTH_SPECS.getMe, options)
  }

  getConfig(options: Pick<RequestOptions, 'signal'> = {}): Promise<ApiResult<ConfigPayload>> {
    return this.client.request<ConfigPayload>(AUTH_SPECS.getConfig, options)
  }
}
