/**
 * mock 模拟的 HttpOnly Cookie 状态：真实模式下 Cookie 由浏览器管理，
 * mock 传输层以进程内 Cookie 存量模拟 lp_pre_auth / lp_session 流转。
 */
const jar = new Map<string, string>()

export function currentCookies(): Record<string, string> {
  return Object.fromEntries(jar)
}

/** 应用 mock 的 Set-Cookie：空值视为清除（登录成功清除预登录 Cookie，退出清除会话 Cookie）。 */
export function applySetCookies(setCookies: string[] | undefined): void {
  if (setCookies === undefined) return
  for (const raw of setCookies) {
    const pair = (raw.split(';')[0] ?? '').trim()
    const eq = pair.indexOf('=')
    if (eq <= 0) continue
    const name = pair.slice(0, eq)
    const value = pair.slice(eq + 1)
    if (value === '') {
      jar.delete(name)
    } else {
      jar.set(name, value)
    }
  }
}

export function resetMockCookies(): void {
  jar.clear()
}
