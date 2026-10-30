<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { coursesApi, type MyCoursesQuery } from '../../../api'
import { useAuthStore } from '../../../stores/auth'
import ApiState from '../../../components/ApiState.vue'
import ActionNotice from '../../../components/ActionNotice.vue'
import UiButton from '../../../components/ui/UiButton.vue'
import UiPager from '../../../components/ui/UiPager.vue'
import { usePageQuery } from '../../../features/courses/use-page-query'
import { useCourseActions } from '../../../features/courses/use-course-actions'
import type { CourseSummaryDTO } from '../../../api/courses'
import { formatShortTime } from '../../../features/courses/format'
import { allPages } from '../../../api/pagination'
import { byRecentStudy } from '../../../features/assignments/task-presentation'
import { chapterEntry } from './refinement'

const auth = useAuthStore(), api = coursesApi()
const props = withDefaults(defineProps<{ integrated?: boolean }>(), { integrated: true })
const termId = ref(''), courseStatus = ref<NonNullable<MyCoursesQuery['status']>>('active'), page = ref(1)
const query = usePageQuery(async signal => {
  const items = await allPages((page, pageSize, signal) => api.listMyCourses({ ...(termId.value ? { termId: termId.value } : {}), status: courseStatus.value, page, pageSize }, { signal }).then(r => r.data), signal)
  return { items: items.sort(byRecentStudy), total: items.length }
})
const visibleCourses = computed(() => query.data.value?.items.slice((page.value - 1) * 20, page.value * 20) ?? [])
const totalPages = computed(() => Math.max(1, Math.ceil((query.data.value?.total ?? 0) / 20)))
function goToPage(next: number) { page.value = next }
watch([termId, courseStatus], () => { page.value = 1 })
watch([termId, courseStatus], () => { void query.load() }, { immediate: true })
const actions = useCourseActions(), inviteCode = ref(''), joinDialog = ref<HTMLDialogElement | null>(null), joinTrigger = ref<HTMLButtonElement | null>(null)
function openJoin() { inviteCode.value = ''; actions.clearNotice(); joinDialog.value?.showModal() }
function closeJoin() { joinDialog.value?.close(); inviteCode.value = ''; joinTrigger.value?.focus() }
async function join() {
  if (!inviteCode.value.trim()) return
  const result = await actions.run(token => api.enroll({ inviteCode: inviteCode.value.trim() }, { csrfToken: token }), '')
  if (result) {
    actions.message.value = result.created ? '已加入课程，可以开始阅读。' : '你已加入这门课程。'
    closeJoin(); await query.load()
  }
}
function actionFor(course: CourseSummaryDTO) {
  if (course.status === 'archived' || !course.currentChapter) return '查看课程'
  return props.integrated ? integratedAction(course) : progressAction(course)
}
function learningEntry(course: CourseSummaryDTO) {
  return actionFor(course) !== '查看课程' && course.currentChapter
    ? { name: 'chapter', params: { offeringId: course.offeringId, chapterId: course.currentChapter.id } }
    : { name: 'course', params: { offeringId: course.offeringId } }
}
const chapterActions = usePageQuery(async signal => {
  const result: Record<string, string> = {}; const list = visibleCourses.value; let cursor = 0
  await Promise.all(Array.from({ length: Math.min(6, list.length) }, async () => {
    while (cursor < list.length) {
      signal.throwIfAborted(); const course = list[cursor++]!
      if (course.status === 'archived' || !course.currentChapter) continue
      const data = (await api.listChapters(course.offeringId, { signal })).data
      if (data.offeringId !== course.offeringId) throw new Error('章节与当前课程不一致')
      const chapter = data.items.find(c => c.id === course.currentChapter?.id)
      result[course.offeringId] = chapter && chapterEntry(chapter).allowed ? chapterEntry(chapter).label : '查看课程'
    }
  }))
  return result
})
watch(visibleCourses, () => { if (props.integrated && query.status.value === 'success') void chapterActions.load() })
function integratedAction(course: CourseSummaryDTO) {
  return course.status === 'archived' || !course.currentChapter ? '查看课程' : chapterActions.status.value === 'success' ? chapterActions.data.value?.[course.offeringId] ?? '查看章节' : '查看章节'
}
function progressAction(course: CourseSummaryDTO) {
  if (course.progress.total > 0 && course.progress.completed === course.progress.total) return '复习章节'
  return course.progress.completed === 0 ? '开始学习' : '继续学习'
}
function hasProgress(course: CourseSummaryDTO) { return course.progress.total > 0 && !course.progress.notConfigured }
</script>
<template>
  <div class="workspace-page sr-courses">
    <header class="page-head">
      <div>
        <h1 class="page-title" tabindex="-1">我的课程</h1>
        <p class="page-summary">按最近学习排序，从上次停下的地方继续。</p>
      </div>
      <div class="page-actions"><button ref="joinTrigger" class="button secondary" @click="openJoin">加入课程</button></div>
    </header>
    <div class="course-filters"><label>学期<select v-model="termId"><option value="">当前学期</option><option v-for="term in auth.config?.terms" :key="term.id" :value="term.id">{{ term.label }}</option></select></label><label>课程状态<select v-model="courseStatus"><option value="active">进行中</option><option value="archived">已归档</option><option value="all">全部</option></select></label><p v-if="query.data.value" class="course-count">共 {{ query.data.value.total }} 门课程</p></div>
    <p v-if="integrated && chapterActions.status.value === 'error'" role="alert">章节状态未能读取，可查看章节或重试。<button class="button secondary" @click="chapterActions.load">重新读取章节状态</button></p><ActionNotice :error="actions.error.value" :message="actions.message.value" /><ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />
    <template v-if="query.status.value === 'success' && query.data.value">
      <section v-if="!query.data.value.total" class="course-empty"><h2>暂无符合条件的课程</h2><p>调整学期或状态，或用教师提供的邀请码加入课程。</p></section>
      <ul v-else class="course-list" aria-label="我的课程">
        <li v-for="course in visibleCourses" :key="course.offeringId" class="course" :data-status="course.status">
          <div class="course-main"><span class="mark" aria-hidden="true">{{ course.mark }}</span><div class="course-copy vx-course-copy"><h2><RouterLink :to="{ name: 'course', params: { offeringId: course.offeringId } }">{{ course.title }}</RouterLink></h2><span class="meta">{{ course.groupName }} · {{ course.teachers.map(t => t.displayName).join('、') }} · {{ course.termLabel }}<span v-if="course.status === 'archived'" class="tag">已归档</span></span></div></div>
          <div class="course-prog"><template v-if="hasProgress(course)"><div class="bar" role="progressbar" :aria-label="course.title + '已完成章节'" :aria-valuenow="course.progress.percent" aria-valuemin="0" aria-valuemax="100"><i :style="{ width: course.progress.percent + '%' }" /></div><span class="meta">已完成 {{ course.progress.completed }}/{{ course.progress.total }} 章</span></template><span v-else class="meta">{{ course.progress.notConfigured ? '进度未配置' : '尚未开放章节' }}</span></div>
          <div class="course-now"><span class="course-chapter">{{ course.currentChapter ? (course.status === 'archived' ? '最后学习：' : '当前：') + '第 ' + course.currentChapter.number + ' 章 · ' + course.currentChapter.title : '尚未开始' }}</span><span class="meta course-state"><template v-if="course.pendingAssignmentCount"><RouterLink :to="{ path: '/student/assignments', query: { offering: course.offeringId } }">{{ course.pendingAssignmentCount }} 项待办</RouterLink></template><template v-else>无待办</template><template v-if="course.unreadFeedbackCount"> · <RouterLink :to="{ name: 'student-progress', params: { offeringId: course.offeringId } }">{{ course.unreadFeedbackCount }} 条未读反馈</RouterLink></template><template v-if="course.lastStudiedAt"> · 最近学习 {{ formatShortTime(course.lastStudiedAt) }}</template></span></div>
          <RouterLink class="course-go vx-course-primary" :to="learningEntry(course)" :aria-label="'学习课程：' + course.title">{{ actionFor(course) }} →</RouterLink>
        </li>
      </ul>
      <UiPager :page="page" :total="totalPages" label="课程分页" :meta="`第 ${page} / ${totalPages} 页`" @update:page="goToPage" />
    </template>
    <dialog ref="joinDialog" class="workspace-dialog" aria-labelledby="join-title" @cancel="inviteCode = ''" @close="joinTrigger?.focus()"><form @submit.prevent="join"><h2 id="join-title">加入课程</h2><label>课程邀请码<input v-model="inviteCode" autocomplete="off" required :disabled="actions.pending.value" /></label><p class="muted">请输入教师提供的邀请码。无效、过期或撤销的邀请码都会显示为不可用。</p><ActionNotice :error="actions.error.value" :message="null" /><div class="form-actions"><UiButton type="submit" :disabled="actions.pending.value || !inviteCode.trim()">{{ actions.pending.value ? '正在加入…' : '确认加入' }}</UiButton><UiButton variant="secondary" @click="closeJoin">取消</UiButton></div></form></dialog>
  </div>
</template>
