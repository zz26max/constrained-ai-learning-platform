// Separate HTML entry. No production entry imports this module.
if (!import.meta.env.DEV || import.meta.env.MODE!=='campus' || import.meta.env.VITE_API_MODE!=='mock') throw new Error('隔离演示不可在真实或生产模式启动')
await import('./start')
export {}
