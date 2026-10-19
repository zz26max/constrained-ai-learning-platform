<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { coursesApi, type MyCoursesQuery } from '../../api'
import { useAuthStore } from '../../stores/auth'
import ApiState from '../../components/ApiState.vue'
import ActionNotice from '../../components/ActionNotice.vue'
import CourseProgress from '../../components/CourseProgress.vue'
import { usePageQuery } from './use-page-query'
import { useCourseActions } from './use-course-actions'
import { statusLabel } from './format'
import { allPages } from '../../api/pagination'
import { byRecentStudy } from '../assignments/task-presentation'

const auth = useAuthStore(), api = coursesApi()
const termId = ref(''), courseStatus = ref<NonNullable<MyCoursesQuery['status']>>('active'), page = ref(1)
const query = usePageQuery(async signal => {
  const items=await allPages((page,pageSize,signal)=>api.listMyCourses({...(termId.value?{termId:termId.value}:{}),status:courseStatus.value,page,pageSize},{signal}).then(r=>r.data),signal)
  return {items:items.sort(byRecentStudy),total:items.length}
})
const visibleCourses=computed(()=>query.data.value?.items.slice((page.value-1)*20,page.value*20)??[])
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
</script>
<template>
  <div class="workspace-page student-course-catalog">
    <header class="workspace-heading"><div><h1 tabindex="-1">我的课程</h1><p>选择本学期的课程，查看章节并继续阅读。</p></div><button ref="joinTrigger" type="button" class="button secondary" @click="openJoin">加入课程</button></header>
    <div class="toolbar"><label>学期<select v-model="termId"><option value="">当前学期</option><option v-for="term in auth.config?.terms" :key="term.id" :value="term.id">{{ term.label }}</option></select></label><label>课程状态<select v-model="courseStatus"><option value="active">进行中</option><option value="archived">已归档</option><option value="all">全部</option></select></label><span v-if="query.data.value">按最近学习排序 · 共 {{ query.data.value.total }} 门课程</span></div>
    <ActionNotice :error="actions.error.value" :message="actions.message.value" />
    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />
    <template v-if="query.status.value === 'success' && query.data.value">
      <section v-if="query.data.value.items.length === 0" class="surface state-block"><h2>暂无符合条件的课程</h2><p>可以调整筛选条件，或使用教师提供的邀请码加入课程。</p></section>
      <ul v-else class="surface course-list" aria-label="我的课程"><li v-for="course in visibleCourses" :key="course.offeringId" class="course-row">
        <div class="course-identity"><span class="small-label"><span class="course-mark">{{ course.mark }}</span>{{ statusLabel(course.status) }}</span><h2><RouterLink :to="{ name: 'course', params: { offeringId: course.offeringId } }" :title="course.title">{{ course.title }}</RouterLink></h2><p>{{ course.groupName }} · {{ course.teachers.map(t => t.displayName).join('、') }}</p></div>
        <div class="course-learning"><p v-if="course.currentChapter">最近学习 · 第 {{ course.currentChapter.number }} 章 · {{ course.currentChapter.title }}</p><p v-else>暂无可阅读章节</p><CourseProgress :progress="course.progress" :title="course.title" /></div>
        <RouterLink class="button secondary" :to="{ name: 'course', params: { offeringId: course.offeringId } }" :aria-label="'进入课程：' + course.title">{{ course.status==='archived' || !course.currentChapter ? '查看课程' : course.progress.total>0 && course.progress.completed===course.progress.total ? '复习章节' : course.progress.completed===0 ? '开始学习' : '继续学习' }} →</RouterLink>
        <div class="course-summary"><span>{{ course.termLabel }}</span><span>{{ course.pendingAssignmentCount }} 项待办 · {{ course.unreadFeedbackCount }} 条未读反馈</span><RouterLink v-if="course.currentChapter" :to="{ name: 'chapter', params: { offeringId: course.offeringId, chapterId: course.currentChapter.id } }">{{ course.status === 'archived' || course.progress.percent===100 ? '复习章节' : '继续阅读' }} →</RouterLink></div>
      </li></ul>
      <nav class="pagination" aria-label="课程分页"><button class="button secondary" :disabled="page <= 1" @click="page -= 1">上一页</button><span>第 {{ page }} 页</span><button class="button secondary" :disabled="page * 20 >= query.data.value.total" @click="page += 1">下一页</button></nav>
    </template>
    <dialog ref="joinDialog" class="workspace-dialog" aria-labelledby="join-title" @cancel="inviteCode = ''" @close="joinTrigger?.focus()"><form @submit.prevent="join"><h2 id="join-title">加入课程</h2><label>课程邀请码<input v-model="inviteCode" autocomplete="off" required :disabled="actions.pending.value" /></label><p class="muted">请输入教师提供的邀请码。无效、过期或撤销的邀请码都会显示为不可用。</p><ActionNotice :error="actions.error.value" :message="null" /><div class="form-actions"><button class="button" :disabled="actions.pending.value || !inviteCode.trim()">{{ actions.pending.value ? '正在加入…' : '确认加入' }}</button><button type="button" class="button secondary" @click="closeJoin">取消</button></div></form></dialog>
  </div>
</template>
