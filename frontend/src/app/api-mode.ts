export type ApiMode = 'real' | 'mock'

/**
 * 唯一模式开关（FRONTEND.md 1.1）：省略为 real；real/mock 之外的值在启动时失败。
 * 开发启动与构建时的早期校验同时写在 vite.config.ts；这里兜住运行时取值。
 */
export function validateApiModeValue(raw: string | undefined): void {
  if (raw === undefined || raw === '' || raw === 'real' || raw === 'mock') return
  throw new Error(
    `VITE_API_MODE 只允许 real 或 mock，当前为 "${raw}"；请修正环境配置后重启开发服务。`,
  )
}

validateApiModeValue(import.meta.env.VITE_API_MODE as string | undefined)

/**
 * 编译期常量：Vite 构建会把 import.meta.env.VITE_API_MODE 替换为字面量，
 * 真实模式构建可静态折叠并剔除 mock 动态导入（生产包不含 mock 层）。
 */
export const API_MODE: ApiMode = import.meta.env.VITE_API_MODE === 'mock' ? 'mock' : 'real'
