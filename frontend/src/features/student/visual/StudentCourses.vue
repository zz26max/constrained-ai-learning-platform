<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { coursesApi, type MyCoursesQuery } from '../../../api'
import { useAuthStore } from '../../../stores/auth'
import ApiState from '../../../components/ApiState.vue'
import ActionNotice from '../../../components/ActionNotice.vue'
import CourseProgress from '../../../components/CourseProgress.vue'
import { usePageQuery } from '../../../features/courses/use-page-query'
import { useCourseActions } from '../../../features/courses/use-course-actions'
import type { CourseSummaryDTO } from '../../../api/courses'
import { statusLabel } from '../../../features/courses/format'
import { allPages } from '../../../api/pagination'
import { byRecentStudy } from '../../../features/assignments/task-presentation'

const auth = useAuthStore(), api = coursesApi()
const termId=ref(''), courseStatus=ref<NonNullable<MyCoursesQuery['status']>>('active'), page=ref(1)
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
function learningEntry(course:CourseSummaryDTO) {
  return course.status!=='archived' && course.currentChapter && (!props.integrated||integratedAction(course)!=='查看课程')
    ? {name:'chapter',params:{offeringId:course.offeringId,chapterId:course.currentChapter.id}}
    : {name:'course',params:{offeringId:course.offeringId}}
}
import SubjectGlyph from './SubjectGlyph.vue'
import CountProgress from './CountProgress.vue'
import {subject} from './presentation'
import {chapterEntry} from './refinement'
const props=withDefaults(defineProps<{refined?:boolean;integrated?:boolean}>(),{refined:true,integrated:true})
const chapterActions=usePageQuery(async signal=>{
 const result:Record<string,string>={};const list=visibleCourses.value;let cursor=0
 await Promise.all(Array.from({length:Math.min(6,list.length)},async()=>{while(cursor<list.length){
  signal.throwIfAborted();const course=list[cursor++]!
  if(course.status==='archived'||!course.currentChapter)continue
  const data=(await api.listChapters(course.offeringId,{signal})).data
  if(data.offeringId!==course.offeringId)throw new Error('章节与当前课程不一致')
  const chapter=data.items.find(c=>c.id===course.currentChapter?.id)
  result[course.offeringId]=chapter&&chapterEntry(chapter).allowed?chapterEntry(chapter).label:'查看课程'
 } }))
 return result
})
watch(visibleCourses,()=>{if(props.integrated&&query.status.value==='success')void chapterActions.load()})
function integratedAction(course:CourseSummaryDTO){return course.status==='archived'||!course.currentChapter?'查看课程':chapterActions.status.value==='success'?chapterActions.data.value?.[course.offeringId]??'查看章节':'查看章节'}
</script>
<template><div class="workspace-page vx-page vx-courses" :class="{'vx-refined':refined,'v35-page':integrated}">
 <header class="vx-page-heading"><div><p class="vx-eyebrow">{{integrated?'本学期的学习版图':'本学期的学习版图 / COURSE ATLAS'}}</p><h1 tabindex="-1">我的课程</h1><p class="vx-muted">从学科线索出发，继续每一门课。</p></div><button ref="joinTrigger" class="button secondary" @click="openJoin">加入课程</button></header>
 <div class="vx-course-toolbar"><label>学期<select v-model="termId"><option value="">当前学期</option><option v-for="term in auth.config?.terms" :key="term.id" :value="term.id">{{term.label}}</option></select></label><label>课程状态<select v-model="courseStatus"><option value="active">进行中</option><option value="archived">已归档</option><option value="all">全部</option></select></label><p v-if="query.data.value" class="vx-muted">按最近学习排序 · {{query.data.value.total}} 门课程</p></div>
 <p v-if="integrated&&chapterActions.status.value==='error'" role="alert">章节状态未能读取，可查看章节或重试。<button class="button secondary" @click="chapterActions.load">重新读取章节状态</button></p><ActionNotice :error="actions.error.value" :message="actions.message.value"/><ApiState :status="query.status.value" :error="query.error.value" @retry="query.load"/>
 <template v-if="query.status.value==='success'&&query.data.value"><section v-if="!query.data.value.total" class="vx-empty"><h2>这里，等待新的学习方向。</h2><p>暂无符合条件的课程，请调整筛选条件。</p></section>
 <ul v-else class="vx-course-grid" aria-label="我的课程"><li v-for="course in visibleCourses" :key="course.offeringId" class="vx-course-sheet" :data-family="subject(course.mark).family">
  <div class="vx-subject-rail"><SubjectGlyph :mark="course.mark"/><span class="vx-subject-family">{{subject(course.mark).label}}</span></div>
  <div class="vx-course-copy"><div class="vx-course-topline"><span>{{refined?subject(course.mark).label:course.mark}}</span><span>{{statusLabel(course.status)}}</span></div><h2><RouterLink :to="{name:'course',params:{offeringId:course.offeringId}}">{{course.title}}</RouterLink></h2><p class="vx-muted vx-course-meta">{{course.groupName}} · {{course.teachers.map(t=>t.displayName).join('、')}}</p>
   <CountProgress :refined="refined" :show-percent="refined" :percent="course.progress.percent" :completed="course.progress.completed" :total="course.progress.total" :title="course.title"/>
   <p class="vx-position" v-if="course.currentChapter"><span>{{course.lastStudiedAt?'最近学习':'可开始章节'}}</span>第 {{course.currentChapter.number}} 章 · {{course.currentChapter.title}}</p><p class="vx-position" v-else>教师发布章节后，即可开启学习。</p>
   <div class="vx-course-actions"><RouterLink class="vx-text-action vx-course-primary" :to="learningEntry(course)" :aria-label="'学习课程：'+course.title">{{integrated?integratedAction(course):course.status==='archived'||!course.currentChapter?'查看课程':course.progress.total>0&&course.progress.completed===course.progress.total?'复习章节':course.progress.completed===0?'开始学习':'继续学习'}} <span aria-hidden="true">↗</span></RouterLink><span v-if="course.progress.total&&!refined" class="vx-percent">{{course.progress.percent}}%<small> 已阅读</small></span></div>
   <div v-if="course.pendingAssignmentCount||course.unreadFeedbackCount||course.termId!==auth.config?.currentTermId" class="vx-course-links"><span v-if="course.termId!==auth.config?.currentTermId">{{course.termLabel}}</span><RouterLink v-if="course.pendingAssignmentCount" :to="{path:'/student/assignments',query:{offering:course.offeringId}}">{{course.pendingAssignmentCount}} 项待办 →</RouterLink><RouterLink v-if="course.unreadFeedbackCount" :to="{name:'student-progress',params:{offeringId:course.offeringId}}">{{course.unreadFeedbackCount}} 条未读反馈 →</RouterLink></div>
  </div>
 </li></ul><nav class="pagination" aria-label="课程分页"><button class="button secondary" :disabled="page<=1" @click="page-=1">上一页</button><span>第 {{page}} 页</span><button class="button secondary" :disabled="page*20>=query.data.value.total" @click="page+=1">下一页</button></nav></template>
    <dialog ref="joinDialog" class="workspace-dialog" aria-labelledby="join-title" @cancel="inviteCode = ''" @close="joinTrigger?.focus()"><form @submit.prevent="join"><h2 id="join-title">加入课程</h2><label>课程邀请码<input v-model="inviteCode" autocomplete="off" required :disabled="actions.pending.value" /></label><p class="muted">请输入教师提供的邀请码。无效、过期或撤销的邀请码都会显示为不可用。</p><p v-if="integrated&&chapterActions.status.value==='error'" role="alert">章节状态未能读取，可查看章节或重试。<button class="button secondary" @click="chapterActions.load">重新读取章节状态</button></p><ActionNotice :error="actions.error.value" :message="null" /><div class="form-actions"><button class="button" :disabled="actions.pending.value || !inviteCode.trim()">{{ actions.pending.value ? '正在加入…' : '确认加入' }}</button><button type="button" class="button secondary" @click="closeJoin">取消</button></div></form></dialog>
</div></template>
