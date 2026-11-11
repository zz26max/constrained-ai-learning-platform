import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { registerAssignmentsApi, registerAuthApi } from '../src/api'
import { AssignmentsApi } from '../src/api/assignments'
import { AuthApi } from '../src/api/auth'
import { ApiClient } from '../src/api/client'
import TeacherCheckPolicyPanel from '../src/features/assignments/TeacherCheckPolicyPanel.vue'
import { useAuthStore } from '../src/stores/auth'
import { createScriptedTransport, DEMO_USER, failEnvelope, okEnvelope } from './helpers'

const ASSIGNMENT = '00000000-0000-4000-8000-000000000701'
const initialConfig = {
  kind: 'sql_text',
  mode: 'mutation',
  seedSql: 'CREATE TABLE task (id INT);',
  verificationSql: 'SELECT id FROM task',
  expectedRows: [['1']],
  ordered: true,
}
let scripted: ReturnType<typeof createScriptedTransport>
let wrapper: VueWrapper | undefined
let conflict = false
let config: Record<string, unknown> = initialConfig

beforeEach(() => {
  conflict = false
  config = initialConfig
  scripted = createScriptedTransport()
  scripted.setHandler(request => {
    if (request.operationId === 'getCheckPolicy') return okEnvelope({ version: 3, config })
    if (request.operationId === 'updateCheckPolicy' && conflict) {
      return failEnvelope(409, 'CHECK_POLICY_CONFLICT', { currentVersion: 4 })
    }
    return okEnvelope({ version: 4, config })
  })
  const client = new ApiClient(scripted.transport)
  registerAuthApi(new AuthApi(client))
  registerAssignmentsApi(new AssignmentsApi(client))
})

afterEach(() => wrapper?.unmount())

async function openPanel(readOnly = false, kind: 'sql_text' | 'web_lab' = 'sql_text') {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().$patch({
    phase: 'authenticated', csrfToken: 'teacher-csrf',
    identity: { ...DEMO_USER, roles: ['teacher'] },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: TeacherCheckPolicyPanel }],
  })
  await router.push('/')
  wrapper = mount(TeacherCheckPolicyPanel, {
    props: { assignmentId: ASSIGNMENT, kind, readOnly },
    global: { plugins: [pinia, router] },
  })
  wrapper.get('details').element.setAttribute('open', '')
  await wrapper.get('details').trigger('toggle')
  await flushPromises()
  return wrapper
}

describe('教师自动检查配置', () => {
  it('以已读取的版本保存 SQL 修改题规则，并保留空值单元格', async () => {
    const page = await openPanel()
    await page.get('textarea[placeholder]').setValue('[["2", null]]')
    await page.get('button').trigger('click')
    await flushPromises()

    const write = scripted.requests.find(request => request.operationId === 'updateCheckPolicy')
    expect(write).toBeDefined()
    expect(JSON.parse(write?.body ?? '')).toEqual({
      baseVersion: 3,
      config: { ...initialConfig, expectedRows: [['2', null]] },
    })
    expect(page.text()).toContain('自动检查规则已保存')
  })

  it('版本冲突后保留教师草稿，允许明确重新读取', async () => {
    conflict = true
    const page = await openPanel()
    await page.get('textarea[placeholder]').setValue('[["2"]]')
    await page.get('button').trigger('click')
    await flushPromises()
    expect(page.get('[role="alert"]').text()).toContain('错误')
    expect((page.get('textarea[placeholder]').element as HTMLTextAreaElement).value).toBe('[["2"]]')
    await page.findAll('button').find(button => button.text().includes('读取最新规则'))!.trigger('click')
    await flushPromises()
    expect(scripted.requests.filter(request => request.operationId === 'getCheckPolicy')).toHaveLength(2)
    expect((page.get('textarea[placeholder]').element as HTMLTextAreaElement).value).toContain('"1"')
  })

  it('发布后仍可读规则，编辑字段被禁用', async () => {
    const page = await openPanel(true)
    expect(page.text()).toContain('当前规则仅供查看')
    expect(page.get('fieldset').attributes('disabled')).toBeDefined()
    expect(page.find('button').exists()).toBe(false)
  })
})

const WEB_CONFIG = {
  kind: 'web_lab',
  rules: [{ id: 'r1', selector: 'h1', check: 'text', expected: '标题', property: null, width: 1440 }],
}

describe('检查项名称（学生可见）', () => {
  it('填写名称后随规则一起保存', async () => {
    config = WEB_CONFIG
    const page = await openPanel(false, 'web_lab')
    await page.get('input[placeholder="例如 移动端适配"]').setValue('页面标题')
    await page.findAll('button').find(button => button.text().includes('保存检查规则'))!.trigger('click')
    await flushPromises()

    const raw = scripted.requests.find(request => request.operationId === 'updateCheckPolicy')?.body ?? '{}'
    const body = JSON.parse(raw) as { config: { rules: Record<string, unknown>[] } }
    expect(body.config.rules[0]!.title).toBe('页面标题')
  })

  it('名称留空时不上送，由后端按无标题处理', async () => {
    config = WEB_CONFIG
    const page = await openPanel(false, 'web_lab')
    await page.findAll('button').find(button => button.text().includes('保存检查规则'))!.trigger('click')
    await flushPromises()

    const raw = scripted.requests.find(request => request.operationId === 'updateCheckPolicy')?.body ?? '{}'
    const body = JSON.parse(raw) as { config: { rules: Record<string, unknown>[] } }
    expect(body.config.rules[0]).not.toHaveProperty('title')
  })
})
