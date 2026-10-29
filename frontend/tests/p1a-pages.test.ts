import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, type Router } from 'vue-router'
import App from '../src/app/App.vue'
import { createAppRouter } from '../src/app/router'
import { registerAuthApi, registerCoursesApi, CoursesApi } from '../src/api'
import { AuthApi } from '../src/api/auth'
import { ApiClient } from '../src/api/client'
import type { ChapterSummaryDTO, CoursePage, LearningPositionDTO } from '../src/api/courses'
import { useAuthStore } from '../src/stores/auth'
import { P1A_FIXTURES, P1A_IDS, P1A_INVITE_CODES } from '../src/mocks/courses'
import { createScriptedTransport, DEMO_CONFIG, DEMO_USER, failEnvelope, okEnvelope, operationIds, type ScriptedTransport, type ScriptedResponse } from './helpers'

let scripted: ScriptedTransport
let wrapper: VueWrapper | undefined
let router: Router | undefined

function summary(): ChapterSummaryDTO {
  const { resources, knowledgePoints, assignments, ...chapter } = P1A_FIXTURES.chapter
  void resources; void knowledgePoints; void assignments
  return chapter
}

const coursePage: CoursePage = { items: [P1A_FIXTURES.courseSummary], page: 1, pageSize: 20, total: 1 }

function normalResponse(operationId: string): ScriptedResponse {
  switch (operationId) {
    case 'getCsrfToken': return okEnvelope({ csrfToken: 'csrf-p1a' })
    case 'getMe': return okEnvelope({ ...DEMO_USER, roles: [...DEMO_USER.roles] })
    case 'getConfig': return okEnvelope({ ...DEMO_CONFIG, terms: [...DEMO_CONFIG.terms] })
    case 'listMyCourses': return okEnvelope(coursePage)
    case 'getOffering': return okEnvelope(P1A_FIXTURES.offering)
    case 'listChapters': return okEnvelope({ offeringId: P1A_IDS.offeringWeb, items: [summary()] })
    case 'getChapter': return okEnvelope(P1A_FIXTURES.chapter)
    case 'getResource': return okEnvelope(P1A_FIXTURES.resource)
    case 'recordLearningPosition': return okEnvelope({ offeringId: P1A_IDS.offeringWeb, lastChapterId: P1A_IDS.chapterWeb, lastStudiedAt: '2026-10-14T02:00:00Z' } satisfies LearningPositionDTO)
    case 'listTeacherChapters': return okEnvelope({ offeringId: P1A_IDS.offeringWeb, items: [{ ...summary(), studentProgress: null }] })
    case 'listKnowledgePoints': return okEnvelope({ offeringId: P1A_IDS.offeringWeb, items: [P1A_FIXTURES.knowledgePoint] })
    case 'listInvites': return okEnvelope({ items: [], page: 1, pageSize: 20, total: 0 })
    default: throw new Error(`未脚本化操作：${operationId}`)
  }
}

beforeEach(() => {
  scripted = createScriptedTransport()
  scripted.setHandler(request => normalResponse(request.operationId))
  const client = new ApiClient(scripted.transport)
  registerAuthApi(new AuthApi(client))
  registerCoursesApi(new CoursesApi(client))
})
afterEach(() => { wrapper?.unmount(); router?.options.history.destroy(); wrapper = undefined; router = undefined; document.body.innerHTML = '' })

async function open(path: string, role: 'student' | 'teacher' = 'student', restore = false) {
  const pinia = createPinia()
  setActivePinia(pinia)
  if (!restore) useAuthStore().$patch({
    phase: 'authenticated', bootStatus: 'success', csrfToken: 'csrf-p1a',
    identity: { ...DEMO_USER, roles: [role] }, config: { ...DEMO_CONFIG, terms: [...DEMO_CONFIG.terms] },
  })
  router = createAppRouter(createMemoryHistory())
  await router.push(path)
  await router.isReady()
  wrapper = mount(App, { attachTo: document.body, global: { plugins: [pinia, router] } })
  await flushPromises()
  return { rendered: wrapper, navigation: router }
}

function buttonNamed(rendered: VueWrapper, name: string) {
  const button = rendered.findAll('button').find(item => item.text() === name)
  if (!button) throw new Error(`没有找到按钮：${name}`)
  return button
}

describe('P1-A 课程页面验收', () => {
  it('课程目录按服务端位置标记继续章节，并保留章节、作业、记录与公告入口', async () => {
    const { rendered } = await open(`/course/${P1A_IDS.offeringWeb}`)
    expect(operationIds(scripted.requests)).toContain('listMyCourses')
    const rows = rendered.findAll('.toc-row')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.attributes('data-current')).toBe('true')
    expect(rows[0]!.text()).toContain(P1A_FIXTURES.chapter.title)
    expect(rows[0]!.find('a[href*="/chapter/"]').attributes('href')).toBe(`/course/${P1A_IDS.offeringWeb}/chapter/${P1A_IDS.chapterWeb}`)
    expect(rendered.find('.page-actions .button:not(.secondary)').attributes('href')).toBe(`/course/${P1A_IDS.offeringWeb}/chapter/${P1A_IDS.chapterWeb}`)
    const subnav = rendered.find('.subnav')
    expect(subnav.text()).toContain('作业')
    expect(subnav.text()).toContain('学习记录')
    expect(subnav.text()).toContain('公告')
  })
  it('从完整章节URL刷新恢复身份与正确章节，不依赖先加载课程列表', async () => {
    const path = `/course/${P1A_IDS.offeringWeb}/chapter/${P1A_IDS.chapterWeb}`
    const { rendered, navigation } = await open(path, 'student', true)
    expect(navigation.currentRoute.value.name).toBe('chapter')
    expect(navigation.currentRoute.value.params).toEqual({ offeringId: P1A_IDS.offeringWeb, chapterId: P1A_IDS.chapterWeb })
    expect(rendered.find('main h1').text()).toContain(P1A_FIXTURES.chapter.title)
    expect(operationIds(scripted.requests)).not.toContain('listMyCourses')
    expect(operationIds(scripted.requests).slice(0, 3)).toEqual(['getCsrfToken', 'getMe', 'getConfig'])
    expect(scripted.requests.find(request => request.operationId === 'getChapter')?.path).toBe(`/api/v1/chapters/${P1A_IDS.chapterWeb}`)
  })

  it('资料直达URL恢复课程与章节上下文，返回入口包含两个完整UUID', async () => {
    const { rendered, navigation } = await open(`/resource/${P1A_IDS.resourceWeb}`)
    expect(navigation.currentRoute.value.name).toBe('resource')
    expect(rendered.find('main h1').text()).toBe(P1A_FIXTURES.resource.title)
    expect(rendered.find('main').text()).toContain(P1A_FIXTURES.offering.title)
    expect(rendered.find('main').text()).toContain(P1A_FIXTURES.chapter.title)
    expect(rendered.find('main a[href*="/chapter/"]').attributes('href')).toBe(`/course/${P1A_IDS.offeringWeb}/chapter/${P1A_IDS.chapterWeb}`)
    expect(operationIds(scripted.requests)).toEqual(['getResource', 'getOffering', 'getChapter'])
  })

  it.each([{ status: 201, created: true, message: '已加入课程，可以开始阅读。' }, { status: 200, created: false, message: '你已加入这门课程。' }])('邀请码加入HTTP$status时使用created区别结果，不把200当错误', async ({ status, created, message }) => {
    scripted.setHandler(request => request.operationId === 'enroll'
      ? { status, body: { data: { ...P1A_FIXTURES.enrollment, created }, requestId: 'req-enroll-result' } }
      : normalResponse(request.operationId))
    const { rendered } = await open('/course')
    await buttonNamed(rendered, '加入课程').trigger('click')
    await rendered.find('dialog input').setValue(P1A_INVITE_CODES.database)
    await rendered.find('dialog form').trigger('submit')
    await flushPromises()
    expect(rendered.find('main').text()).toContain(message)
    expect(rendered.findAll('[role="alert"]')).toHaveLength(0)
    const enroll = scripted.requests.filter(request => request.operationId === 'enroll')
    expect(enroll).toHaveLength(1)
    expect(enroll[0]?.headers['X-CSRF-Token']).toBe('csrf-p1a')
    expect(JSON.parse(enroll[0]?.body ?? '{}')).toEqual({ inviteCode: P1A_INVITE_CODES.database })
    expect(scripted.requests.filter(request => request.operationId === 'listMyCourses')).toHaveLength(2)
  })

  it.each([
    { invite: 'DOES-NOT-EXIST', detail: '邀请码无效。' },
    { invite: P1A_INVITE_CODES.expired, detail: '邀请码已过期。' },
    { invite: P1A_INVITE_CODES.revoked, detail: '邀请码已撤销。' },
  ])('邀请码$invite统一显示不可用并保留requestId，失败不刷新或报成功', async ({ invite, detail }) => {
    const detailByCode: Record<string, string> = {
      'DOES-NOT-EXIST': '邀请码无效。',
      [P1A_INVITE_CODES.expired]: '邀请码已过期。',
      [P1A_INVITE_CODES.revoked]: '邀请码已撤销。',
    }
    scripted.setHandler(request => {
      if (request.operationId !== 'enroll') return normalResponse(request.operationId)
      const body = JSON.parse(request.body ?? '{}') as { inviteCode?: string }
      const branchDetail = body.inviteCode === undefined ? '邀请码缺失。' : detailByCode[body.inviteCode] ?? '邀请码无效。'
      return {
        status: 400,
        body: { error: { code: 'INVALID_INVITE_CODE', message: branchDetail, details: {} }, requestId: `req-invite-${body.inviteCode}` },
      }
    })
    const { rendered } = await open('/course')
    await buttonNamed(rendered, '加入课程').trigger('click')
    await rendered.find('dialog input').setValue(invite)
    await rendered.find('dialog form').trigger('submit')
    await flushPromises()
    const alerts = rendered.findAll('[role="alert"]').map(item => item.text()).join(' ')
    expect(alerts).toContain('邀请码不可用，请向教师确认。')
    expect(alerts).toContain(`req-invite-${invite}`)
    expect(alerts).not.toContain(detail)
    expect(rendered.find('main').text()).not.toContain('已加入课程，可以开始阅读。')
    expect(scripted.requests.filter(request => request.operationId === 'listMyCourses')).toHaveLength(1)
    expect(JSON.parse(scripted.requests.find(request => request.operationId === 'enroll')?.body ?? '{}')).toEqual({ inviteCode: invite })
  })

  it('学生直达draft章节收到404时展示不可访问，不把错误当空章节', async () => {
    scripted.setHandler(request => request.operationId === 'getChapter' ? failEnvelope(404, 'NOT_FOUND', {}, 'req-draft-hidden') : normalResponse(request.operationId))
    const { rendered } = await open(`/course/${P1A_IDS.offeringWeb}/chapter/${P1A_IDS.chapterDraft}`)
    expect(rendered.find('[role="alert"]').text()).toContain('内容不存在或无权访问')
    expect(rendered.find('[role="alert"]').text()).toContain('req-draft-hidden')
    expect(rendered.find('.reading-content').exists()).toBe(false)
    expect(operationIds(scripted.requests)).not.toContain('recordLearningPosition')
    expect(operationIds(scripted.requests)).not.toContain('updateChapterProgress')
  })

  it('归档课程保留章节读取，确认阅读按钮禁用且不记录位置', async () => {
    scripted.setHandler(request => request.operationId === 'getOffering' ? okEnvelope({ ...P1A_FIXTURES.offering, status: 'archived' }) : normalResponse(request.operationId))
    const { rendered } = await open(`/course/${P1A_IDS.offeringWeb}/chapter/${P1A_IDS.chapterWeb}`)
    expect(rendered.find('main h1').text()).toContain(P1A_FIXTURES.chapter.title)
    expect(rendered.find('main').text()).toContain('本章节为只读')
    const confirm = buttonNamed(rendered, '确认已阅读')
    expect(confirm.attributes('disabled')).toBeDefined()
    expect(operationIds(scripted.requests)).not.toContain('recordLearningPosition')
    expect(operationIds(scripted.requests)).not.toContain('updateChapterProgress')
  })

  it('归档教师工作台及各内容面板写入口禁用，查看与切换仍可用', async () => {
    scripted.setHandler(request => request.operationId === 'getOffering' ? okEnvelope({ ...P1A_FIXTURES.offering, status: 'archived' }) : normalResponse(request.operationId))
    const { rendered } = await open(`/teacher/offerings/${P1A_IDS.offeringWeb}`, 'teacher')
    expect(buttonNamed(rendered, '归档教学班').attributes('disabled')).toBeDefined()
    expect(buttonNamed(rendered, '创建章节草稿').attributes('disabled')).toBeDefined()
    await buttonNamed(rendered, '知识点').trigger('click')
    await flushPromises()
    expect(buttonNamed(rendered, '创建知识点').attributes('disabled')).toBeDefined()
    await buttonNamed(rendered, '邀请码').trigger('click')
    await flushPromises()
    expect(buttonNamed(rendered, '创建邀请码').attributes('disabled')).toBeDefined()
    expect(buttonNamed(rendered, '创建邀请码').element.hasAttribute('disabled')).toBe(true)
    expect(scripted.requests.filter(request => request.method !== 'GET')).toHaveLength(0)
  })
})
