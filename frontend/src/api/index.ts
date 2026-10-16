import { AuthApi } from './auth'
import { CoursesApi } from './courses'
import { AssignmentsApi } from './assignments'
import { DashboardApi } from './dashboard'
import { NoticesApi } from './notices'
import { StatsApi } from './stats'
import { ApiClient } from './client'
import { realTransport } from './real-transport'
import type { ApiMode } from '../app/api-mode'

let registered: AuthApi | null = null
let registeredCourses: CoursesApi | null = null
let registeredAssignments: AssignmentsApi | null = null
let registeredDashboard: DashboardApi | null = null
let registeredNotices: NoticesApi | null = null
let registeredStats: StatsApi | null = null

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

export function registerAssignmentsApi(api: AssignmentsApi): void {
  registeredAssignments = api
}

export function assignmentsApi(): AssignmentsApi {
  if (registeredAssignments === null) {
    throw new Error('AssignmentsApi 尚未注册：请先在应用启动时调用 registerAssignmentsApi()。')
  }
  return registeredAssignments
}

export async function createDefaultAssignmentsApi(): Promise<AssignmentsApi> {
  if (import.meta.env.VITE_API_MODE === 'mock') {
    const { mockTransport } = await import('../mocks/index')
    return new AssignmentsApi(new ApiClient(mockTransport))
  }
  return new AssignmentsApi(new ApiClient(realTransport))
}

export function registerDashboardApi(api: DashboardApi): void {
  registeredDashboard = api
}

export function dashboardApi(): DashboardApi {
  if (registeredDashboard === null) {
    throw new Error('DashboardApi 尚未注册：请先在应用启动时调用 registerDashboardApi()。')
  }
  return registeredDashboard
}

export async function createDefaultDashboardApi(): Promise<DashboardApi> {
  if (import.meta.env.VITE_API_MODE === 'mock') {
    const { mockTransport } = await import('../mocks/index')
    return new DashboardApi(new ApiClient(mockTransport))
  }
  return new DashboardApi(new ApiClient(realTransport))
}

export function registerNoticesApi(api: NoticesApi): void {
  registeredNotices = api
}

export function noticesApi(): NoticesApi {
  if (registeredNotices === null) {
    throw new Error('NoticesApi 尚未注册：请先在应用启动时调用 registerNoticesApi()。')
  }
  return registeredNotices
}

export async function createDefaultNoticesApi(): Promise<NoticesApi> {
  if (import.meta.env.VITE_API_MODE === 'mock') {
    const { mockTransport } = await import('../mocks/index')
    return new NoticesApi(new ApiClient(mockTransport))
  }
  return new NoticesApi(new ApiClient(realTransport))
}

export function registerStatsApi(api: StatsApi): void {
  registeredStats = api
}

export function statsApi(): StatsApi {
  if (registeredStats === null) {
    throw new Error('StatsApi 尚未注册：请先在应用启动时调用 registerStatsApi()。')
  }
  return registeredStats
}

export async function createDefaultStatsApi(): Promise<StatsApi> {
  if (import.meta.env.VITE_API_MODE === 'mock') {
    const { mockTransport } = await import('../mocks/index')
    return new StatsApi(new ApiClient(mockTransport))
  }
  return new StatsApi(new ApiClient(realTransport))
}

export { CoursesApi } from './courses'
export { AssignmentsApi } from './assignments'
export { DashboardApi } from './dashboard'
export { NoticesApi } from './notices'
export { StatsApi } from './stats'
export type * from './courses'
export type * from './assignments'
export type * from './dashboard'
export type * from './notices'
export type * from './stats'

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
