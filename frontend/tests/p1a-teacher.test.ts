import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, type Router } from 'vue-router'
import App from '../src/app/App.vue'
import { createAppRouter } from '../src/app/router'
import { registerAuthApi, registerCoursesApi, registerStatsApi } from '../src/api'
import { StatsApi } from '../src/api/stats'
import { AuthApi } from '../src/api/auth'
import { ApiClient } from '../src/api/client'
import { CoursesApi } from '../src/api/courses'
import type { components } from '../src/api/generated/schema'
import type { ChapterSummaryDTO } from '../src/api/courses'
import { P1A_FIXTURES, P1A_IDS } from '../src/mocks/courses'
import { useAuthStore } from '../src/stores/auth'
import { createScriptedTransport, DEMO_CONFIG, DEMO_USER, failEnvelope, okEnvelope, type ScriptedResponse, type ScriptedTransport, type ScriptHandler } from './helpers'

const createdChapterId = '00000000-0000-4000-8000-000000000306'
const createdInviteId = '00000000-0000-4000-8000-000000000606'
const createdInviteCode = 'P1A-ONLY-IN-CREATE-RESPONSE'

type TeacherChapterSummaryDTO = components['schemas']['TeacherChapterSummaryDTO']
type TeacherChapterDetailDTO = components['schemas']['TeacherChapterDetailDTO']
type InviteDTO = components['schemas']['InviteDTO']
type OfferingDTO = components['schemas']['OfferingDTO']

let scripted: ScriptedTransport
let wrapper: VueWrapper | undefined
let router: Router | undefined
let createdChapter: TeacherChapterDetailDTO | null
let invite: InviteDTO | null
let archivedOfferingIds: Set<string>
let publishedChapterIds: Set<string>

function summary(): ChapterSummaryDTO {
  const { resources, knowledgePoints, assignments, ...chapter } = P1A_FIXTURES.chapter
  void resources; void knowledgePoints; void assignments
  return chapter
}

function chapterSummary(id: string, state: TeacherChapterSummaryDTO['publicationState']): TeacherChapterSummaryDTO {
  if (id === P1A_IDS.chapterWeb) return { ...summary(), studentProgress: null, publicationState: state }
  if (id === P1A_IDS.chapterDraft) return { ...summary(), id, number: 3, title: 'CSS 布局与响应式设计', summary: 'Flex 与媒体查询', publicationState: state, resourceCount: 0, studentProgress: null }
  if (id === P1A_IDS.chapterArchived) return { ...summary(), id, number: 4, title: '归档章节', summary: '历史内容', publicationState: state, resourceCount: 0, studentProgress: null }
  return { ...summary(), id, number: 5, title: '新建章节', summary: '新建章节摘要', publicationState: state, resourceCount: 0, studentProgress: null }
}

function detailFor(summaryValue: TeacherChapterSummaryDTO): TeacherChapterDetailDTO {
  return {
    ...summaryValue,
    studentProgress: null,
    contentVersion: 1,
    resources: summaryValue.id === P1A_IDS.chapterWeb ? [P1A_FIXTURES.resource] : [],
    knowledgePoints: summaryValue.id === P1A_IDS.chapterWeb ? [P1A_FIXTURES.knowledgePoint] : [],
    assignments: [],
  }
}

function offeringFor(id: string): OfferingDTO {
  if (id === P1A_IDS.offeringDatabase) return { ...P1A_FIXTURES.offering, id, courseId: P1A_IDS.baseDatabase, title: '数据库原理', mark: 'DB' }
  if (id === P1A_IDS.offeringPendingArchive) return { ...P1A_FIXTURES.offering, id, title: '待批阅归档示例', groupName: '计算机 2303 班' }
  return { ...P1A_FIXTURES.offering, id, status: archivedOfferingIds.has(id) ? 'archived' : 'active' }
}

function invitePage(): components['schemas']['InvitePage'] {
  return { items: invite === null ? [] : [invite], page: 1, pageSize: 20, total: invite === null ? 0 : 1 }
}

function normalResponse(request: Parameters<ScriptHandler>[0]): ScriptedResponse {
  const id = request.path.split('/').filter(Boolean).at(-1) ?? ''
  switch (request.operationId) {
    case 'getOffering': return okEnvelope(offeringFor(id))
    case 'listTeacherChapters': {
      const items = [
        chapterSummary(P1A_IDS.chapterWeb, 'published'),
        chapterSummary(P1A_IDS.chapterDraft, publishedChapterIds.has(P1A_IDS.chapterDraft) ? 'published' : 'draft'),
        chapterSummary(P1A_IDS.chapterArchived, 'archived'),
        ...(createdChapter === null ? [] : [chapterSummary(createdChapter.id, publishedChapterIds.has(createdChapter.id) ? 'published' : 'draft')]),
      ]
      return okEnvelope({ offeringId: P1A_IDS.offeringWeb, items })
    }
    case 'getTeacherChapter': {
      const chapterId = request.path.split('/').filter(Boolean).at(-1) ?? ''
      if (createdChapter !== null && chapterId === createdChapter.id) return okEnvelope(createdChapter)
      const state = chapterId === P1A_IDS.chapterArchived ? 'archived' : chapterId === P1A_IDS.chapterDraft && !publishedChapterIds.has(chapterId) ? 'draft' : 'published'
      return okEnvelope(detailFor(chapterSummary(chapterId, state)))
    }
    case 'listKnowledgePoints': return okEnvelope({ offeringId: P1A_IDS.offeringWeb, items: [P1A_FIXTURES.knowledgePoint] })
    case 'listInvites': return okEnvelope(invitePage())
    case 'listMembers': return okEnvelope({ items: [], page: 1, pageSize: 20, total: 0 })
    case 'getOfferingStats': return okEnvelope({ studentCount: 1, activeAssignmentCount: 0, pendingReviewCount: 0, pendingHelpCount: 0 })
    case 'createChapter': {
      const body = JSON.parse(request.body ?? '{}') as { number: number; title: string; summary: string; isRequired: boolean }
      createdChapter = detailFor({ ...chapterSummary(createdChapterId, 'draft'), number: body.number, title: body.title, summary: body.summary, isRequired: body.isRequired })
      return okEnvelope(createdChapter, 'req-create-chapter')
    }
    case 'publishChapter': {
      const chapterId = request.path.split('/').filter(Boolean).at(-2) ?? ''
      publishedChapterIds.add(chapterId)
      const current = createdChapter !== null && createdChapter.id === chapterId ? createdChapter : detailFor(chapterSummary(chapterId, 'published'))
      return okEnvelope({ ...current, publicationState: 'published' }, 'req-publish-chapter')
    }
    case 'createInvite': {
      invite = { id: createdInviteId, expiresAt: '2099-01-01T04:00:00Z', maxUses: 2, usedCount: 0, revokedAt: null, createdAt: '2026-10-14T02:00:00Z' }
      return okEnvelope({ ...invite, inviteCode: createdInviteCode }, 'req-create-invite')
    }
    case 'revokeInvite':
      if (invite !== null) invite = { ...invite, revokedAt: '2026-10-14T03:00:00Z' }
      return okEnvelope({ id: createdInviteId, revokedAt: invite?.revokedAt ?? '2026-10-14T03:00:00Z' }, 'req-revoke-invite')
    case 'archiveOffering': {
      const offeringId = request.path.split('/').filter(Boolean).at(-2) ?? ''
      archivedOfferingIds.add(offeringId)
      return okEnvelope(offeringFor(offeringId), 'req-archive-offering')
    }
    default: throw new Error(`未脚本化操作：${request.operationId}`)
  }
}

function setHandler(handler: ScriptHandler = normalResponse): void {
  scripted.setHandler(handler)
}

beforeEach(() => {
  scripted = createScriptedTransport()
  createdChapter = null
  invite = null
  archivedOfferingIds = new Set()
  publishedChapterIds = new Set()
  setHandler()
  const client = new ApiClient(scripted.transport)
  registerAuthApi(new AuthApi(client))
  registerCoursesApi(new CoursesApi(client))
  registerStatsApi(new StatsApi(client))
})

afterEach(() => {
  wrapper?.unmount()
  router?.options.history.destroy()
  wrapper = undefined
  router = undefined
  document.body.innerHTML = ''
})

async function openOffering(offeringId = P1A_IDS.offeringWeb): Promise<VueWrapper> {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().$patch({
    phase: 'authenticated', bootStatus: 'success', csrfToken: 'csrf-teacher',
    identity: { ...DEMO_USER, roles: ['teacher'] }, config: { ...DEMO_CONFIG, terms: [...DEMO_CONFIG.terms] },
  })
  router = createAppRouter(createMemoryHistory())
  await router.push(`/teacher/offerings/${offeringId}`)
  await router.isReady()
  wrapper = mount(App, { attachTo: document.body, global: { plugins: [pinia, router] } })
  await flushPromises()
  if (wrapper === undefined) throw new Error('页面未挂载')
  return wrapper
}

function buttonNamed(rendered: VueWrapper, text: string) {
  const button = rendered.findAll('button').find(item => item.text() === text)
  if (!button) throw new Error(`没有找到按钮：${text}`)
  return button
}

function postRequests(operationId: string) {
  return scripted.requests.filter(request => request.operationId === operationId)
}

describe('P1-A 教师写路径', () => {
  it('创建章节草稿并发布章节', async () => {
    const rendered = await openOffering()
    await buttonNamed(rendered, '创建章节草稿').trigger('click')
    await rendered.find('#chapter-title').setValue('新建章节')
    await rendered.find('#chapter-summary').setValue('新建章节摘要')
    await rendered.find('dialog[aria-labelledby="chapter-editor-title"] form').trigger('submit')
    await flushPromises()

    expect(postRequests('createChapter')).toHaveLength(1)
    expect(rendered.text()).toContain('新建章节')
    await buttonNamed(rendered, '发布章节').trigger('click')
    await buttonNamed(rendered, '确认').trigger('click')
    await flushPromises()

    expect(postRequests('publishChapter')).toHaveLength(1)
    expect(rendered.text()).toContain('已发布')
  })

  it('创建邀请码只在创建响应弹窗显示，Esc 与切班不会泄露或丢弃明文', async () => {
    const rendered = await openOffering()
    await buttonNamed(rendered, '邀请码').trigger('click')
    await flushPromises()
    await buttonNamed(rendered, '创建邀请码').trigger('click')
    await rendered.find('#invite-expiry').setValue('2099-01-01T12:00')
    await rendered.find('dialog[aria-labelledby="invite-create-title"] form').trigger('submit')
    await flushPromises()

    expect(rendered.findAll('.teacher-secret code').map(item => item.text())).toEqual([createdInviteCode])
    const secretDialog = rendered.find('dialog[aria-labelledby="invite-secret-title"]')
    await secretDialog.trigger('cancel')
    expect(rendered.find('.teacher-secret').text()).toContain(createdInviteCode)
    expect(rendered.findAll('li').map(item => item.text()).join(' ')).not.toContain(createdInviteCode)

    await buttonNamed(rendered, '已保存，关闭').trigger('click')
    expect(rendered.text()).not.toContain(createdInviteCode)
    await router?.push(`/teacher/offerings/${P1A_IDS.offeringDatabase}`)
    await flushPromises()
    expect(rendered.text()).not.toContain(createdInviteCode)
    expect(postRequests('createInvite')).toHaveLength(1)
  })

  it('过期邀请码显示已过期且撤销按钮不可用', async () => {
    invite = { id: createdInviteId, expiresAt: '2020-01-01T00:00:00Z', maxUses: 2, usedCount: 0, revokedAt: null, createdAt: '2026-10-14T02:00:00Z' }
    const rendered = await openOffering()
    await buttonNamed(rendered, '邀请码').trigger('click')
    await flushPromises()
    expect(rendered.text()).toContain('已过期')
    expect(buttonNamed(rendered, '撤销').attributes('disabled')).toBeDefined()
    expect(postRequests('revokeInvite')).toHaveLength(0)
  })

  it('邀请码可以撤销', async () => {
    invite = { id: createdInviteId, expiresAt: '2099-01-01T00:00:00Z', maxUses: 2, usedCount: 0, revokedAt: null, createdAt: '2026-10-14T02:00:00Z' }
    const rendered = await openOffering()
    await buttonNamed(rendered, '邀请码').trigger('click')
    await flushPromises()
    await buttonNamed(rendered, '撤销').trigger('click')
    await buttonNamed(rendered, '确认撤销').trigger('click')
    await flushPromises()
    expect(postRequests('revokeInvite')).toHaveLength(1)
    expect(rendered.text()).toContain('已撤销')
  })

  it('归档教学班后保留读取并禁用后续写入', async () => {
    const rendered = await openOffering()
    await buttonNamed(rendered, '归档教学班').trigger('click')
    await rendered.find('dialog[aria-labelledby="offering-archive-title"] input[type="checkbox"]').setValue(true)
    await buttonNamed(rendered, '确认归档').trigger('click')
    await flushPromises()

    expect(postRequests('archiveOffering')).toHaveLength(1)
    expect(rendered.text()).toContain('教学班已归档')
    expect(buttonNamed(rendered, '归档教学班').attributes('disabled')).toBeDefined()
    expect(buttonNamed(rendered, '创建章节草稿').attributes('disabled')).toBeDefined()
  })

  it('写操作 pending 时连点只发一次请求', async () => {
    let release!: (response: ScriptedResponse) => void
    const pending = new Promise<ScriptedResponse>(resolve => { release = resolve })
    setHandler(request => request.operationId === 'createChapter' ? pending : normalResponse(request))
    const rendered = await openOffering()
    await buttonNamed(rendered, '创建章节草稿').trigger('click')
    await rendered.find('#chapter-title').setValue('等待中的章节')
    const form = rendered.find('dialog[aria-labelledby="chapter-editor-title"] form')
    void form.trigger('submit')
    void form.trigger('submit')
    await vi.waitFor(() => expect(postRequests('createChapter')).toHaveLength(1))
    release(okEnvelope(detailFor(chapterSummary(createdChapterId, 'draft'))))
    await flushPromises()
  })

  it('跨班详情 404、写操作 403 和 OFFERING_ARCHIVED 409 都进入错误态', async () => {
    setHandler(request => {
      if (request.operationId === 'getOffering') return failEnvelope(404, 'NOT_FOUND', {}, 'req-cross-offering')
      return normalResponse(request)
    })
    const missing = await openOffering(P1A_IDS.offeringDatabase)
    expect(missing.find('[role="alert"]').text()).toContain('内容不存在或无权访问')
    expect(missing.find('[role="alert"]').text()).toContain('req-cross-offering')

    missing.unmount()
    const pinia = createPinia()
    setActivePinia(pinia)
    useAuthStore().$patch({ phase: 'authenticated', bootStatus: 'success', csrfToken: 'csrf-teacher', identity: { ...DEMO_USER, roles: ['teacher'] }, config: { ...DEMO_CONFIG, terms: [...DEMO_CONFIG.terms] } })
    let writeAttempts = 0
    setHandler(request => {
      if (request.operationId === 'createChapter') {
        writeAttempts += 1
        return writeAttempts === 1
          ? failEnvelope(403, 'FORBIDDEN', {}, 'req-write-forbidden')
          : failEnvelope(409, 'OFFERING_ARCHIVED', {}, 'req-offering-archived')
      }
      return normalResponse(request)
    })
    router = createAppRouter(createMemoryHistory())
    await router.push(`/teacher/offerings/${P1A_IDS.offeringWeb}`)
    await router.isReady()
    wrapper = mount(App, { attachTo: document.body, global: { plugins: [pinia, router] } })
    await flushPromises()
    await buttonNamed(wrapper, '创建章节草稿').trigger('click')
    await wrapper.find('#chapter-title').setValue('无权限章节')
    await wrapper.find('dialog[aria-labelledby="chapter-editor-title"] form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('req-write-forbidden')
    expect(postRequests('createChapter')).toHaveLength(1)
    await wrapper.find('dialog[aria-labelledby="chapter-editor-title"] form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('req-offering-archived')
    expect(postRequests('createChapter')).toHaveLength(2)
  })

  it('分页最后一页与 total=0 正确禁用翻页', async () => {
    invite = { id: createdInviteId, expiresAt: '2099-01-01T00:00:00Z', maxUses: 2, usedCount: 0, revokedAt: null, createdAt: '2026-10-14T02:00:00Z' }
    setHandler(request => request.operationId === 'listInvites'
      ? okEnvelope({ items: request.path.includes('page=2') ? [] : [invite], page: request.path.includes('page=2') ? 2 : 1, pageSize: 1, total: request.path.includes('page=2') ? 1 : 1 })
      : normalResponse(request))
    const rendered = await openOffering()
    await buttonNamed(rendered, '邀请码').trigger('click')
    await flushPromises()
    const next = buttonNamed(rendered, '下一页')
    await next.trigger('click')
    await flushPromises()
    expect(next.attributes('disabled')).toBeDefined()

    setHandler(request => request.operationId === 'listInvites'
      ? okEnvelope({ items: [], page: 1, pageSize: 20, total: 0 })
      : normalResponse(request))
    await router?.push(`/teacher/offerings/${P1A_IDS.offeringDatabase}`)
    await flushPromises()
    await buttonNamed(rendered, '邀请码').trigger('click')
    await flushPromises()
    expect(buttonNamed(rendered, '上一页').attributes('disabled')).toBeDefined()
    expect(buttonNamed(rendered, '下一页').attributes('disabled')).toBeDefined()
  })
})
