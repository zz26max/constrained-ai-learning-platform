import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { registerAuthApi } from '../src/api'
import { AuthApi } from '../src/api/auth'
import { ApiClient, TransportError } from '../src/api/client'
import { useAuthStore } from '../src/stores/auth'
import {
  createScriptedTransport,
  DEMO_CONFIG,
  failEnvelope,
  okEnvelope,
  operationIds,
  type ScriptHandler,
  type ScriptedTransport,
} from './helpers'

let scripted: ScriptedTransport
let store: ReturnType<typeof useAuthStore>

function happyRegisterScript(username: string, mode: 'personal' | 'school', role?: 'student' | 'teacher'): ScriptHandler {
  return (request) => {
    switch (request.operationId) {
      case 'getCsrfToken':
        return okEnvelope({ csrfToken: 'csrf-t1' })
      case 'register':
        return {
          status: 201,
          body: okEnvelope({
            user: {
              id: '00000000-0000-4000-8000-999999999999',
              username,
              displayName: '新用户',
              roles: mode === 'personal' ? ['student'] : [role ?? 'student'],
            },
            csrfToken: 'csrf-t2',
          }).body,
        }
      case 'getMe':
        return okEnvelope({
          id: '00000000-0000-4000-8000-999999999999',
          username,
          displayName: '新用户',
          roles: mode === 'personal' ? ['student'] : [role ?? 'student'],
        })
      case 'getConfig':
        return okEnvelope({ ...DEMO_CONFIG, terms: [...DEMO_CONFIG.terms] })
      default:
        throw new TransportError(`未脚本化操作：${request.operationId}`)
    }
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  scripted = createScriptedTransport()
  registerAuthApi(new AuthApi(new ApiClient(scripted.transport)))
  store = useAuthStore()
})

describe('注册流程（auth.register）', () => {
  describe('个人模式注册', () => {
    it('成功注册并自动登录', async () => {
      scripted.setHandler(happyRegisterScript('newuser', 'personal'))
      const result = await store.register({
        username: 'newuser',
        password: 'Password123',
        displayName: '新用户',
        mode: 'personal',
      })
      expect(result).toBe(true)
      expect(store.phase).toBe('authenticated')
      expect(store.identity?.username).toBe('newuser')
      expect(store.identity?.roles).toEqual(['student'])
      expect(operationIds(scripted.requests)).toEqual(['getCsrfToken', 'register', 'getMe', 'getConfig'])
    })
  })

  describe('学校模式 - 学生注册', () => {
    it('使用邀请码成功注册', async () => {
      scripted.setHandler(happyRegisterScript('student1', 'school', 'student'))
      const result = await store.register({
        username: 'student1',
        password: 'Student123',
        displayName: '学生一',
        mode: 'school',
        role: 'student',
        inviteCode: 'P1A-DB-DEMO-2026',
      })
      expect(result).toBe(true)
      expect(store.phase).toBe('authenticated')
      expect(store.identity?.roles).toEqual(['student'])
    })
  })

  describe('学校模式 - 教师注册', () => {
    it('成功注册为教师', async () => {
      scripted.setHandler(happyRegisterScript('teacher1', 'school', 'teacher'))
      const result = await store.register({
        username: 'teacher1',
        password: 'Teacher123',
        displayName: '教师一',
        mode: 'school',
        role: 'teacher',
        createClass: true,
      })
      expect(result).toBe(true)
      expect(store.phase).toBe('authenticated')
      expect(store.identity?.roles).toEqual(['teacher'])
    })
  })

  describe('错误处理', () => {
    it('用户名冲突：registerFailure.kind 为 username-taken', async () => {
      scripted.setHandler((request) => {
        if (request.operationId === 'register') {
          return failEnvelope(400, 'USERNAME_TAKEN')
        }
        if (request.operationId === 'getMe') {
          return failEnvelope(401, 'UNAUTHENTICATED')
        }
        return okEnvelope({ csrfToken: 'csrf-t1' })
      })
      const result = await store.register({
        username: 'duplicate',
        password: 'Password123',
        displayName: '重复用户',
        mode: 'personal',
      })
      expect(result).toBe(false)
      expect(store.phase).not.toBe('authenticated')
      expect(store.registerFailure?.kind).toBe('username-taken')
    })

    it('邀请码无效：registerFailure.kind 为 invalid-invite', async () => {
      scripted.setHandler((request) => {
        if (request.operationId === 'register') {
          return failEnvelope(400, 'INVALID_INVITE_CODE')
        }
        return okEnvelope({ csrfToken: 'csrf-t1' })
      })
      const result = await store.register({
        username: 'student2',
        password: 'Student123',
        displayName: '学生二',
        mode: 'school',
        role: 'student',
        inviteCode: 'INVALID-CODE',
      })
      expect(result).toBe(false)
      expect(store.registerFailure?.kind).toBe('invalid-invite')
    })

    it('CSRF 失败：registerFailure.kind 为 csrf', async () => {
      scripted.setHandler((request) => {
        if (request.operationId === 'register') {
          return failEnvelope(403, 'CSRF_INVALID')
        }
        return okEnvelope({ csrfToken: 'csrf-t1' })
      })
      const result = await store.register({
        username: 'newuser',
        password: 'Password123',
        displayName: '新用户',
        mode: 'personal',
      })
      expect(result).toBe(false)
      expect(store.registerFailure?.kind).toBe('csrf')
    })

    it('字段校验失败：registerFailure.kind 为 validation', async () => {
      scripted.setHandler((request) => {
        if (request.operationId === 'register') {
          return failEnvelope(422, 'VALIDATION_ERROR', {
            fields: [{ field: 'username', message: '用户名格式错误。' }],
          })
        }
        return okEnvelope({ csrfToken: 'csrf-t1' })
      })
      const result = await store.register({
        username: 'ab',
        password: 'Password123',
        displayName: '用户',
        mode: 'personal',
      })
      expect(result).toBe(false)
      expect(store.registerFailure?.kind).toBe('validation')
    })

    it('服务不可用：registerFailure.kind 为 unavailable', async () => {
      scripted.setHandler(() => {
        throw new TransportError('后端不可用')
      })
      const result = await store.register({
        username: 'newuser',
        password: 'Password123',
        displayName: '新用户',
        mode: 'personal',
      })
      expect(result).toBe(false)
      expect(store.registerFailure?.kind).toBe('unavailable')
    })
  })

  describe('请求序列', () => {
    it('按顺序调用 getCsrfToken → register → getMe → getConfig', async () => {
      scripted.setHandler(happyRegisterScript('newuser', 'personal'))
      await store.register({
        username: 'newuser',
        password: 'Password123',
        displayName: '新用户',
        mode: 'personal',
      })
      expect(operationIds(scripted.requests)).toEqual(['getCsrfToken', 'register', 'getMe', 'getConfig'])
    })
  })
})
