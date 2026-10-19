<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { coursesApi, dashboardApi } from '../../api'
import ApiState from '../../components/ApiState.vue'
import { usePageQuery } from '../courses/use-page-query'
import { formatTime } from '../courses/format'
import { isUuid } from '../assignments/format'
import { chapterOverview } from './bplus-presentation'
import { allPages } from '../../api/pagination'
import { byRecentStudy } from '../assignments/task-presentation'

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
</script>

<template>
  <div class="workspace-page dashboard-page student-records">
    <header class="workspace-heading">
      <div>
        <h1 tabindex="-1">学习记录</h1>
        <p v-if="selecting">选择一个教学班查看学习记录。</p>
      </div>
    </header>
    <div class="task-toolbar"><label>课程<select :value="rawId??''" :disabled="offeringsQuery.status.value!=='success'" @change="router.push({name:'student-progress',params:{offeringId:($event.target as HTMLSelectElement).value}})"><option v-if="!currentCourse" :value="rawId??''">{{rawId?'当前课程':'选择课程'}}</option><option v-for="course in offeringsQuery.data.value?.items" :key="course.offeringId" :value="course.offeringId">{{course.title}} · {{course.groupName}}</option></select></label></div>
    <ApiState v-if="offeringsQuery.status.value==='error'" :status="offeringsQuery.status.value" :error="offeringsQuery.error.value" @retry="offeringsQuery.load" />

    <template v-if="selecting">
      <ApiState :status="offeringsQuery.status.value" :error="offeringsQuery.error.value" @retry="offeringsQuery.load" />
      <section v-if="offeringsQuery.status.value === 'success' && offeringsQuery.data.value" class="record-section dash-section">
        <p v-if="offeringsQuery.data.value.items.length === 0" class="muted">
          尚未加入教学班。<RouterLink to="/course">前往我的课程</RouterLink>
        </p>
        <ul v-else class="dash-list">
          <li v-for="course in offeringsQuery.data.value.items" :key="course.offeringId">
            <RouterLink :to="{ name: 'student-progress', params: { offeringId: course.offeringId } }">{{ course.title }}</RouterLink>
            <span class="muted">{{ course.groupName }}</span>
          </li>
        </ul>
      </section>
    </template>

    <section v-else-if="invalidLink" class="surface state-block notice-error" role="alert">
      <h2>链接无效</h2>
      <RouterLink class="button secondary" to="/student/progress">返回学习记录</RouterLink>
    </section>

    <template v-else>
      <section v-if="restricted" class="surface state-block notice-error" role="alert">
        <h2>无法查看该教学班的学习记录</h2>
        <p v-if="recordsQuery.error.value?.requestId" class="request-id">requestId: {{ recordsQuery.error.value.requestId }}</p>
        <RouterLink class="button secondary" to="/student/progress">返回学习记录</RouterLink>
      </section>
      <ApiState v-else :status="recordsQuery.status.value" :error="recordsQuery.error.value" @retry="recordsQuery.load" />

      <template v-if="recordsQuery.status.value === 'success' && recordsQuery.data.value">
        <section class="record-section dash-section" aria-labelledby="chapter-summary"><h2 id="chapter-summary">章节学习进度</h2><ApiState :status="chaptersQuery.status.value" :error="chaptersQuery.error.value" @retry="chaptersQuery.load" /><template v-if="chaptersQuery.status.value==='success'"><p><strong>{{completedChapters}}</strong> / {{chapterPath.total}} 个已开放章节已阅读</p><p v-if="currentCourse?.currentChapter" class="muted">最近阅读：{{currentCourse.currentChapter.title}} <span v-if="currentCourse.lastStudiedAt"> · {{formatTime(currentCourse.lastStudiedAt)}}</span></p><ul class="record-chapters" :class="{'is-single':chapterPath.total===1}"><li v-for="chapter in chapterPath.chapters" :key="chapter.id" :class="{'is-read':chapter.studentProgress?.status==='completed'}"><RouterLink :to="{name:'chapter',params:{offeringId:rawId,chapterId:chapter.id}}">第 {{chapter.number}} 章 · {{chapter.title}}</RouterLink><span class="tag">{{chapter.studentProgress?.status==='completed'?'✓ 已阅读':chapter.studentProgress?.status==='in_progress'?'阅读中':chapter.studentProgress?.status==='not_started'?'尚未阅读':'阅读状态未知'}}</span><RouterLink class="chapter-action" :to="{name:'chapter',params:{offeringId:rawId,chapterId:chapter.id}}">{{chapter.studentProgress?.status==='completed'?'复习章节':'继续阅读'}} →</RouterLink></li></ul><p v-if="!chapterPath.total" class="muted">暂无已发布章节，教师发布后即可开始学习。</p></template></section>
        <section class="record-section dash-section" aria-labelledby="lr-summary">
          <h2 id="lr-summary">学习汇总</h2>
          <ul class="dash-summary">
            <li><strong>{{ recordsQuery.data.value.summary.completedLabCount }}</strong> 个实验已完成</li>
            <li><strong>{{ recordsQuery.data.value.summary.publishedFeedbackCount }}</strong> 份评价已发布</li>
            <li v-if="recordsQuery.data.value.summary.needsPracticeCount !== null"><strong>{{ recordsQuery.data.value.summary.needsPracticeCount }}</strong> 个待加强知识点</li>
          </ul>
        </section>

        <section class="record-section dash-section" aria-labelledby="lr-history">
          <h2 id="lr-history">评价历史</h2>
          <div v-if="recordsQuery.data.value.recentFeedback" class="recent-feedback-summary" id="lr-recent"><h3>最近反馈</h3>
            <p class="record-feedback-heading">
              <RouterLink :to="{ name: 'student-assignment', params: { id: recordsQuery.data.value.recentFeedback.assignmentId }, query: { feedbackId: recordsQuery.data.value.recentFeedback.id } }">{{ recordsQuery.data.value.recentFeedback.assignmentTitle }}</RouterLink>
              <span class="record-feedback-meta"><time :datetime="recordsQuery.data.value.recentFeedback.publishedAt">{{ formatTime(recordsQuery.data.value.recentFeedback.publishedAt) }}</time><span class="record-score">{{ recordsQuery.data.value.recentFeedback.score }}/{{ recordsQuery.data.value.recentFeedback.maxScore }}</span></span>
            </p>
            <p class="dash-text">{{ recordsQuery.data.value.recentFeedback.comment }}</p>
          </div>

          <p v-if="recordsQuery.data.value.feedbackPage.total === 0" class="muted">暂无评价</p>
          <template v-else>
            <ul class="dash-list">
              <li v-for="item in pagedItems" :key="item.id">
                <RouterLink :to="{ name: 'student-assignment', params: { id: item.assignmentId }, query: { feedbackId: item.id } }">{{ item.assignmentTitle }}</RouterLink>
                <span class="record-feedback-meta"><time :datetime="item.publishedAt">{{ formatTime(item.publishedAt) }}</time><span class="record-score">{{ item.score }}/{{ item.maxScore }}</span></span>
              </li>
            </ul>
            <nav v-if="totalPages > 1" class="pagination" aria-label="评价历史分页">
              <button type="button" class="button secondary" :disabled="page <= 1" @click="goToPage(page - 1)">上一页</button>
              <span>第 {{ page }} / {{ totalPages }} 页</span>
              <button type="button" class="button secondary" :disabled="page >= totalPages" @click="goToPage(page + 1)">下一页</button>
            </nav>
          </template>
        </section>

        <section v-if="recordsQuery.data.value.knowledgeEvidence.length>0 || recordsQuery.data.value.nextRecommendation!==null" class="record-section dash-section" aria-labelledby="lr-knowledge">
          <h2 id="lr-knowledge">知识点与下一步</h2>
          <p v-if="recordsQuery.data.value.knowledgeEvidence.length === 0 && recordsQuery.data.value.nextRecommendation === null" class="muted">知识点掌握分析将在 P2 开放</p>
        </section>
      </template>
    </template>
  </div>
</template>
