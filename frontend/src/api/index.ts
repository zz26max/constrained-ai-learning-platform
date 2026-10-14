import { AuthApi } from './auth'
import { CoursesApi } from './courses'
import { ApiClient } from './client'
import { realTransport } from './real-transport'
import type { ApiMode } from '../app/api-mode'

let registered: AuthApi | null = null
let registeredCourses: CoursesApi | null = null

export function registerCoursesApi(api: CoursesApi): void {
  registeredCourses = api
}

export function coursesApi(): CoursesApi {
  if (registeredCourses === null) {
    throw new Error('CoursesApi 尚未注册：请先在应用启动时调用 registerCoursesApi()。')
  }
  return registeredCourses
}

export async function createDefaultCoursesApi(): Promise<CoursesApi> {
  if (import.meta.env.VITE_API_MODE === 'mock') {
    const { mockTransport } = await import('../mocks/index')
    return new CoursesApi(new ApiClient(mockTransport))
  }
  return new CoursesApi(new ApiClient(realTransport))
}

export { CoursesApi } from './courses'
export type * from './courses'

/** 应用启动时注册默认 AuthApi（main.ts）；测试中可注册脚本化实例。 */
export function registerAuthApi(api: AuthApi): void {
  registered = api
}

/** 取当前 AuthApi；未注册时立即失败，避免静默使用未初始化的请求层。 */
export function authApi(): AuthApi {
  if (registered === null) {
    throw new Error('AuthApi 尚未注册：请先在应用启动时调用 registerAuthApi()。')
  }
  return registered
}

/**
 * 构建默认 AuthApi。mock 分支使用动态导入，且条件在源头直接比较
 * import.meta.env.VITE_API_MODE：真实模式构建时该表达式被 define 替换为字面量，
 * Rollup 据此消除 mock 动态导入（生产包不含 mock 层）；
 * scripts/check-no-mock.mjs 对构建产物兜底扫描。
 */
export async function createDefaultAuthApi(): Promise<AuthApi> {
  if (import.meta.env.VITE_API_MODE === 'mock') {
    const { mockTransport } = await import('../mocks/index')
    return new AuthApi(new ApiClient(mockTransport))
  }
  return new AuthApi(new ApiClient(realTransport))
}

export type { ApiMode }
