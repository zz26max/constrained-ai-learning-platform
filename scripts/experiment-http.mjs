/**
 * 实验脚本共用的最小 HTTP 会话：cookie + CSRF，只依赖 fetch。
 *
 * 与 demo-seed.mjs 同构，但抽出来给 experiment-import / experiment-e1 共用。
 * 口令只从环境变量或 backend/.env 读取，从不打印。
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

export function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0) return fallback
  const value = process.argv[index + 1]
  return value && !value.startsWith('--') ? value : true
}

export function has(name) {
  return process.argv.includes(`--${name}`)
}

/** 读取 backend/.env 到 process.env（已存在的不覆盖）；不打印任何值。 */
export function loadLocalEnv() {
  const path = join(ROOT, 'backend/.env')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line)
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2]
  }
}

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

export class ApiError extends Error {
  constructor(method, path, status, payload) {
    const code = payload?.error?.code ?? ''
    const message = payload?.error?.message ?? ''
    super(`${method} ${path} -> ${status} ${code} ${message}`.trim())
    this.status = status
    this.code = code
    this.details = payload?.error?.details ?? null
  }
}

export class Session {
  constructor({ baseUrl, origin, label = '' } = {}) {
    this.baseUrl = baseUrl
    this.origin = origin
    this.label = label
    this.cookies = new Map()
    this.token = null
  }

  cookieHeader() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ')
  }

  absorb(response) {
    const list = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : [])
    for (const raw of list) {
      const pair = raw.split(';')[0]
      const index = pair.indexOf('=')
      if (index <= 0) continue
      const name = pair.slice(0, index)
      const value = pair.slice(index + 1)
      if (/max-age=0/i.test(raw) || value === '') this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
  }

  async request(method, path, body, { csrf = true, allowStatus = [] } = {}) {
    const headers = { Origin: this.origin }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (csrf) {
      if (this.token === null) await this.refreshCsrf()
      headers['X-CSRF-Token'] = this.token
    }
    const cookie = this.cookieHeader()
    if (cookie) headers.Cookie = cookie
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    this.absorb(response)
    const text = await response.text()
    let payload = null
    try { payload = text ? JSON.parse(text) : null } catch { payload = null }
    if (!response.ok && !allowStatus.includes(response.status)) {
      throw new ApiError(method, path, response.status, payload)
    }
    return { status: response.status, data: payload?.data ?? null, error: payload?.error ?? null }
  }

  async refreshCsrf() {
    this.token = null
    const { data } = await this.request('GET', '/api/v1/auth/csrf-token', undefined, { csrf: false })
    this.token = data.csrfToken
    return this.token
  }

  async login(username, password) {
    await this.refreshCsrf()
    const { data } = await this.request('POST', '/api/v1/auth/login', { username, password })
    this.token = data.csrfToken
    return data.user
  }

  async register(payload) {
    await this.refreshCsrf()
    const { data, status } = await this.request('POST', '/api/v1/auth/register', payload, { allowStatus: [400] })
    if (status === 400) return { existing: true, data: null }
    this.token = data.csrfToken
    return { existing: false, data: data.user }
  }
}

/** 轮询直到谓词为真；超时抛错。 */
export async function poll(fn, predicate, { timeoutMs = 120000, intervalMs = 1200 } = {}) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    last = await fn()
    if (predicate(last)) return last
    await sleep(intervalMs)
  }
  throw new Error(`轮询超时（${timeoutMs}ms），最后一次结果：${JSON.stringify(last)?.slice(0, 300)}`)
}
