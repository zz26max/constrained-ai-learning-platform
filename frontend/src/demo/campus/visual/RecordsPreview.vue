<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { coursesApi, dashboardApi } from '../../../api'
import ApiState from '../../../components/ApiState.vue'
import { usePageQuery } from '../../../features/courses/use-page-query'
import { formatTime } from '../../../features/courses/format'
import { isUuid } from '../../../features/assignments/format'
import { chapterOverview } from '../../../features/dashboard/bplus-presentation'
import { allPages } from '../../../api/pagination'
import { byRecentStudy } from '../../../features/assignments/task-presentation'

const route = useRoute()
const router = useRouter()
const dashApi = dashboardApi()
const courses = coursesApi()
const PAGE_SIZE = 10

const rawId = computed(() => route.params['offeringId'])
const selecting = computed(() => rawId.value === undefined)
const invalidLink = computed(() => !selecting.value && !isUuid(rawId.value))
const page = computed(() => {
  const value = Number(route.query['page'])
  return Number.isInteger(value) && value >= 1 && value <= 2147483647 ? value : 1
})

const offeringsQuery = usePageQuery(async signal => ({items:(await allPages((page,pageSize,signal)=>courses.listMyCourses({status:'all',page,pageSize},{signal}).then(r=>r.data),signal)).sort(byRecentStudy)}))
void offeringsQuery.load()
const currentCourse=computed(()=>offeringsQuery.data.value?.items.find(c=>c.offeringId===rawId.value))
const chaptersQuery=usePageQuery(async signal=>{
  if(!isUuid(rawId.value))throw new Error('课程链接无效')
  return (await courses.listChapters(rawId.value,{signal})).data
})
watch(rawId,()=>{if(isUuid(rawId.value))void chaptersQuery.load()},{immediate:true})
watch(()=>offeringsQuery.data.value,async value=>{
  if(selecting.value&&value?.items[0])await router.replace({name:'student-progress',params:{offeringId:value.items[0].offeringId}})
})
const chapterPath=computed(()=>chapterOverview(chaptersQuery.data.value?.items??[]))
const completedChapters=computed(()=>chapterPath.value.completed)

const recordsQuery = usePageQuery(async signal => {
  const id = rawId.value
  if (!isUuid(id)) throw new Error('链接无效')
  return (await dashApi.getMyLearningRecords(id, { page: page.value, pageSize: PAGE_SIZE }, { signal })).data
})

watch(() => route.fullPath, async () => {
  if (selecting.value) {
    const items = offeringsQuery.data.value?.items ?? []
    if (offeringsQuery.status.value === 'success' && items[0]) {
      await router.replace({ name: 'student-progress', params: { offeringId: items[0].offeringId } })
    }
  } else if (!invalidLink.value) {
    await recordsQuery.load()
  }
}, { immediate: true })

const restricted = computed(() => {
  const kind = recordsQuery.error.value?.kind
  return recordsQuery.status.value === 'error' && (kind === 'forbidden' || kind === 'not-found')
})

// Deduplicate only the exact feedback ID already shown in the highlight, never its title.
const pagedItems = computed(() => (recordsQuery.data.value?.feedbackPage.items ?? []).filter(item=>item.id!==recordsQuery.data.value?.recentFeedback?.id))
const totalPages = computed(() => Math.max(1, Math.ceil((recordsQuery.data.value?.feedbackPage.total ?? 0) / PAGE_SIZE)))

function goToPage(next: number): void {
  if (next < 1 || next > totalPages.value) return
  void router.push({ query: { ...route.query, page: String(next) } })
}
import SubjectGlyph from './SubjectGlyph.vue'
import CountProgress from './CountProgress.vue'
import { subject,chapterState } from './presentation'
import {chapterEntry} from './refinement'
defineProps<{refined?:boolean}>()
</script>
<template>
 <div class="workspace-page vx-page vx-records" :class="{'vx-refined':refined}" :data-family="subject(currentCourse?.mark).family">
  <header class="vx-page-heading"><div><p class="vx-eyebrow">学习足迹 / CHAPTERS & EVIDENCE</p><h1 tabindex="-1">学习记录</h1></div><label>选择课程<select :value="rawId??''" :disabled="offeringsQuery.status.value!=='success'" @change="router.push({name:'student-progress',params:{offeringId:($event.target as HTMLSelectElement).value}})"><option v-if="!currentCourse" value="">选择课程</option><option v-for="course in offeringsQuery.data.value?.items" :key="course.offeringId" :value="course.offeringId">{{course.title}} · {{course.groupName}}</option></select></label></header>
  <ApiState v-if="offeringsQuery.status.value==='error'" :status="offeringsQuery.status.value" :error="offeringsQuery.error.value" @retry="offeringsQuery.load" />
  <section v-if="offeringsQuery.status.value==='success'&&!offeringsQuery.data.value?.items.length" class="vx-empty"><h2>学习足迹，从第一门课程开始。</h2><p>尚未加入教学班，请前往课程页了解课程。</p><RouterLink class="button secondary" to="/course">查看我的课程 →</RouterLink></section>
  <section v-if="invalidLink||restricted" class="vx-empty" role="alert"><h2>无法查看该教学班的学习记录</h2><RouterLink class="button secondary" to="/student/progress">返回学习记录</RouterLink></section>
  <ApiState v-else :status="recordsQuery.status.value" :error="recordsQuery.error.value" @retry="recordsQuery.load" />
  <template v-if="!invalidLink&&recordsQuery.status.value==='success'&&recordsQuery.data.value">
   <div class="vx-course-masthead"><SubjectGlyph :mark="currentCourse?.mark"/><div><p class="vx-eyebrow">{{subject(currentCourse?.mark).label}}</p><h2>{{currentCourse?.title}}</h2><p class="vx-muted">{{currentCourse?.groupName}} · {{currentCourse?.teachers.map(t=>t.displayName).join('、')}}</p></div><div class="vx-reading-total" v-if="chaptersQuery.status.value==='success'"><template v-if="chapterPath.total"><strong>{{completedChapters}}</strong><span>/ {{chapterPath.total}}<small>个已开放章节已阅读</small></span></template><span v-else class="vx-muted">暂无已开放章节</span></div></div>
   <ApiState :status="chaptersQuery.status.value" :error="chaptersQuery.error.value" @retry="chaptersQuery.load" />
   <div class="vx-record-grid" :class="{'is-short':chapterPath.total<=1,'is-many':chapterPath.total>8}">
    <section class="vx-path-section" aria-labelledby="vx-path-title"><div class="vx-section-heading"><div><p class="vx-eyebrow">阅读路径</p><h2 id="vx-path-title">{{refined?'章节学习路径':'把每一章，连成自己的理解。'}}</h2></div><span v-if="chapterPath.allRead" class="vx-state">已读完开放章节</span></div>
     <p v-if="currentCourse?.lastStudiedAt" class="vx-last-position">最近阅读 · {{currentCourse.currentChapter?.title}} <time :datetime="currentCourse.lastStudiedAt">{{formatTime(currentCourse.lastStudiedAt)}}</time></p>
     <template v-if="chaptersQuery.status.value==='success'">
      <ol v-if="chapterPath.total" class="vx-path" aria-label="章节学习路径"><li v-for="chapter in chapterPath.chapters" :key="chapter.id" :data-state="chapter.studentProgress?.status??'unknown'"><span class="vx-path-node" aria-hidden="true">{{String(chapter.number).padStart(2,'0')}}</span><div class="vx-path-body"><div class="vx-node-caption"><span>第 {{chapter.number}} 章</span><span>{{chapter.studentProgress?.status==='completed'?'✓ ':''}}{{chapterState(chapter.studentProgress?.status)}}</span></div><h3><RouterLink :to="{name:'chapter',params:{offeringId:rawId,chapterId:chapter.id}}">{{chapter.title}}</RouterLink></h3><RouterLink v-if="!refined||chapterEntry(chapter).allowed" class="vx-text-action" :to="{name:'chapter',params:{offeringId:rawId,chapterId:chapter.id}}">{{refined?chapterEntry(chapter).label:chapter.studentProgress?.status==='completed'?'复习章节':'继续阅读'}} <span aria-hidden="true">↗</span></RouterLink><span v-else class="vx-muted">{{chapterEntry(chapter).label}} · {{chapterEntry(chapter).hint}}</span></div></li></ol>
      <div v-else class="vx-empty"><SubjectGlyph :mark="currentCourse?.mark"/><h3>学习路径，等待开启。</h3><p>暂无已发布章节，教师发布后即可开始学习。</p><RouterLink class="button secondary" :to="{name:'course',params:{offeringId:rawId}}">查看课程目录 →</RouterLink></div>
     </template>
    </section>
    <aside class="vx-evidence" aria-label="课程学习成果">
     <section class="vx-overview"><p class="vx-eyebrow">{{refined?'阅读累积，成果可见。':'课程学习概览'}}</p><h2>{{refined?'课程学习概览':'阅读累积，成果可见。'}}</h2><CountProgress :refined="refined" v-if="chaptersQuery.status.value==='success'" :completed="completedChapters" :total="chapterPath.total" :title="currentCourse?.title??'课程'"/><p class="vx-muted">阅读进度不代表知识掌握程度。</p><dl class="vx-results"><div><dt>已完成实验</dt><dd>{{recordsQuery.data.value.summary.completedLabCount}}<small>个</small></dd></div><div><dt>已发布评价</dt><dd>{{recordsQuery.data.value.summary.publishedFeedbackCount}}<small>份</small></dd></div><div v-if="recordsQuery.data.value.summary.needsPracticeCount!==null"><dt>待加强知识点</dt><dd>{{recordsQuery.data.value.summary.needsPracticeCount}}</dd></div></dl></section>
     <section class="vx-feedback"><p class="vx-eyebrow">{{refined?'教师反馈':'教师的回应 / FEEDBACK'}}</p><template v-if="recordsQuery.data.value.recentFeedback"><div class="vx-feedback-score"><strong>{{recordsQuery.data.value.recentFeedback.score}}</strong><span>/ {{recordsQuery.data.value.recentFeedback.maxScore}}<small>本次作业评价</small></span></div><h3><RouterLink :to="{name:'student-assignment',params:{id:recordsQuery.data.value.recentFeedback.assignmentId},query:{feedbackId:recordsQuery.data.value.recentFeedback.id}}">{{recordsQuery.data.value.recentFeedback.assignmentTitle}} ↗</RouterLink></h3><p>{{recordsQuery.data.value.recentFeedback.comment}}</p><time class="vx-muted" :datetime="recordsQuery.data.value.recentFeedback.publishedAt">{{formatTime(recordsQuery.data.value.recentFeedback.publishedAt)}}</time></template><template v-else><h3>暂时还没有教师评价</h3><p class="vx-muted">完成作业并等待教师发布后，可在这里回顾具体反馈。</p><RouterLink class="vx-text-action" :to="{path:'/student/assignments',query:{offering:rawId}}">查看课程作业 →</RouterLink></template></section>
    </aside>
   </div>
   <section v-if="pagedItems.length||totalPages>1" class="vx-feedback-history"><h2>更多评价历史</h2><ul><li v-for="item in pagedItems" :key="item.id"><RouterLink :to="{name:'student-assignment',params:{id:item.assignmentId},query:{feedbackId:item.id}}">{{item.assignmentTitle}}</RouterLink><span>{{item.score}}/{{item.maxScore}}</span><time>{{formatTime(item.publishedAt)}}</time></li></ul><nav v-if="totalPages>1" class="pagination" aria-label="评价历史分页"><button class="button secondary" :disabled="page<=1" @click="goToPage(page-1)">上一页</button><span>第 {{page}} / {{totalPages}} 页</span><button class="button secondary" :disabled="page>=totalPages" @click="goToPage(page+1)">下一页</button></nav></section>
  </template>
 </div>
</template>
