import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, expect, it, vi } from 'vitest'
import KnowledgePracticeStudents from '../src/features/teacher/analytics/KnowledgePracticeStudents.vue'

const { listMembers, getStudentLearningRecords } = vi.hoisted(() => ({
  listMembers: vi.fn(),
  getStudentLearningRecords: vi.fn(),
}))
vi.mock('../src/api', () => ({
  authApi: () => ({}),
  coursesApi: () => ({ listMembers }),
  statsApi: () => ({ getStudentLearningRecords }),
}))

const member = (userId: string, displayName: string, role = 'student') => ({ userId, displayName, role })
const evidence = (knowledgePointId: string, assessmentState = 'needs_practice') => ({ knowledgePointId, assessmentState })

beforeEach(() => {
  listMembers.mockReset().mockImplementation(async (_offering, { page, pageSize }) => ({
    data: {
      page, pageSize, total: 21,
      items: page === 1
        ? [member('matching', '小宁'), member('other', '小林'), member('teacher', '张老师', 'teacher')]
        : [member('later', '小汪')],
    },
  }))
  getStudentLearningRecords.mockReset().mockImplementation(async (offeringId, id) => ({
    data: {
      offeringId, student: { id },
      knowledgeEvidence: id === 'matching' ? [evidence('point')] : [evidence('other-point'), evidence('point', 'learning')],
    },
  }))
})

async function render() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { name: 'teacher-student-progress', path: '/teacher/offerings/:offeringId/students/:studentId/progress', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  return mount(KnowledgePracticeStudents, {
    props: { offeringId: 'class', knowledgePointId: 'point', title: '主内容结构' },
    global: { plugins: [createPinia(), router] },
  })
}

it('按知识点筛选当前成员页并提供分页，旧结果不掩盖空页', async () => {
  const view = await render()
  await flushPromises()
  expect(listMembers).toHaveBeenCalledWith('class', { page: 1, pageSize: 20 }, expect.anything())
  expect(getStudentLearningRecords).toHaveBeenCalledTimes(2)
  expect(getStudentLearningRecords).toHaveBeenCalledWith('class', 'matching', { page: 1, pageSize: 1 }, expect.anything())
  expect(view.get('a').attributes('href')).toBe('/teacher/offerings/class/students/matching/progress')
  expect(view.text()).toContain('小宁')
  expect(view.text()).not.toContain('小林')
  await view.findAll('button').find(button => button.text() === '下一页')!.trigger('click')
  await flushPromises()
  expect(listMembers).toHaveBeenLastCalledWith('class', { page: 2, pageSize: 20 }, expect.anything())
  expect(view.text()).toContain('当前成员页没有学生需要练习此知识点')
  expect(view.text()).not.toContain('小宁')
  view.unmount()
})

it('成员学习记录读取失败时显示可重试错误，离开后中止在途请求', async () => {
  getStudentLearningRecords.mockRejectedValueOnce(new Error('读取失败'))
  const view = await render()
  await flushPromises()
  expect(view.get('[role=alert]').text()).toContain('读取失败')
  expect(view.find('a').exists()).toBe(false)
  getStudentLearningRecords.mockImplementation(() => new Promise(() => {}))
  await view.get('[role=alert] button').trigger('click')
  await flushPromises()
  const signal = getStudentLearningRecords.mock.calls.at(-1)?.[3]?.signal as AbortSignal
  expect(signal.aborted).toBe(false)
  view.unmount()
  expect(signal.aborted).toBe(true)
})
