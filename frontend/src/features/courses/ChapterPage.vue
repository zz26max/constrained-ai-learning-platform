<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { coursesApi, type ProgressDTO } from '../../api'
import ApiState from '../../components/ApiState.vue'
import ActionNotice from '../../components/ActionNotice.vue'
import SafeMarkdown from '../../components/SafeMarkdown.vue'
import { usePageQuery } from './use-page-query'
import { useCourseActions } from './use-course-actions'
import { formatShortTime, isUuid, statusLabel } from './format'
import { trackLearningEvent } from '../analytics/reporter'
const route = useRoute(), api = coursesApi(), actions = useCourseActions()
const confirmedProgress = shallowRef<ProgressDTO | null>(null)
const query = usePageQuery(async signal => {
  const offeringId = route.params['offeringId'], chapterId = route.params['chapterId']
  if (!isUuid(offeringId) || !isUuid(chapterId)) throw new Error('章节链接无效，请从课程目录重新选择。')
  const [offering, chapter] = await Promise.all([api.getOffering(offeringId, { signal }), api.getChapter(chapterId, { signal })])
  if (chapter.data.offeringId !== offeringId) throw new Error('章节不属于当前课程，请返回课程目录。')
  return { offering: offering.data, chapter: chapter.data }
})
// 学习事件：章节打开（DEVELOPMENT §8.1 客户端来源）；上报失败静默，不影响阅读。
watch(() => query.data.value, data => {
  if (data) trackLearningEvent({ type: 'chapter_opened', offeringId: data.offering.id, chapterId: data.chapter.id })
})
const readonly = computed(() => query.data.value?.offering.status !== 'active' || !query.data.value.chapter.studentProgress)
async function loadChapter() {
  const path = route.fullPath
  confirmedProgress.value = null
  await query.load()
  if (route.fullPath !== path) return
  const data = query.data.value
  if (data && !readonly.value) {
    await actions.run(token => api.recordLearningPosition({ offeringId: data.offering.id, chapterId: data.chapter.id }, { csrfToken: token }), '')
  }
}
watch(() => route.fullPath, () => { void loadChapter() }, { immediate: true })
async function confirmCompleted() {
  const data = query.data.value
  if (!data || readonly.value) return
  const result = await actions.run(token => api.updateChapterProgress(data.chapter.id, { status: 'completed' }, { csrfToken: token }), '已确认阅读完成，进度已由服务器更新。')
  if (result) {
    confirmedProgress.value = result.courseProgress
    data.chapter.studentProgress = result.studentProgress
  }
}
// 资料正文常以同名 H1 开头；标题已由页面渲染，避免同一句出现两次。
function resourceBody(resource: { title: string; content: string }) {
  const heading = resource.content.match(/^#\s+(.+)\r?\n+/)
  return heading && heading[1]!.trim() === resource.title.trim() ? resource.content.slice(heading[0].length) : resource.content
}
</script>
<template>
  <div class="workspace-page sr-chapter">
    <ApiState :status="query.status.value" :error="query.error.value" @retry="loadChapter" />
    <template v-if="query.status.value === 'success' && query.data.value">
      <header class="page-head">
        <div>
          <p class="page-eyebrow">{{ query.data.value.offering.title }} · 第 {{ query.data.value.chapter.number }} 章</p>
          <h1 class="page-title" tabindex="-1">{{ query.data.value.chapter.title }}</h1>
          <p v-if="query.data.value.chapter.summary" class="page-summary">{{ query.data.value.chapter.summary }}</p>
        </div>
        <div class="page-actions">
          <button type="button" class="button" :disabled="readonly || actions.pending.value || query.data.value.chapter.studentProgress?.status === 'completed'" @click="confirmCompleted">{{ query.data.value.chapter.studentProgress?.status === 'completed' ? '已确认阅读' : '确认已阅读' }}</button>
          <RouterLink class="button secondary" :to="{ name: 'course', params: { offeringId: route.params.offeringId } }">← 课程目录</RouterLink>
        </div>
      </header>
      <p v-if="readonly" class="notice notice-info">本章节为只读，阅读进度和学习位置不再写入。</p><ActionNotice :error="actions.error.value" :message="actions.message.value" />
      <section class="reading-content read-grid">
        <article class="reader">
          <section v-for="resource in query.data.value.chapter.resources" :id="'resource-' + resource.id" :key="resource.id" class="res"><header class="res-head"><h2>{{ resource.title }}</h2><RouterLink :to="{ name: 'resource', params: { resourceId: resource.id } }">单独打开 →</RouterLink></header><SafeMarkdown :content="resourceBody(resource)" /></section>
          <p v-if="query.data.value.chapter.resources.length === 0" class="chapter-empty">本章还没有资料，可以先完成章内作业。</p>
          <section v-if="confirmedProgress" class="read-progress"><header class="res-head"><h2>阅读进度</h2><span class="meta">已完成 {{ confirmedProgress.completed }}/{{ confirmedProgress.total }} 章</span></header><div class="bar" role="progressbar" :aria-label="query.data.value.offering.title + '已完成章节'" :aria-valuenow="confirmedProgress.percent" aria-valuemin="0" aria-valuemax="100"><i :style="{ width: confirmedProgress.percent + '%' }" /></div><p class="meta">完成确认表示你已阅读本章，不代表知识掌握评价。</p></section>
        </article>
        <aside class="side">
          <section v-if="query.data.value.chapter.resources.length" class="sec"><h2>本章资料</h2><ol class="mini-toc"><li v-for="resource in query.data.value.chapter.resources" :key="resource.id"><a :href="'#resource-' + resource.id">{{ resource.title }}</a></li></ol></section>
          <section class="sec"><h2>章内作业</h2><p v-if="query.data.value.chapter.assignments.length === 0" class="meta">本章没有作业。</p><div v-else class="rows"><RouterLink v-for="assignment in query.data.value.chapter.assignments" :key="assignment.id" class="row" :to="{ name: 'student-assignment', params: { id: assignment.id } }"><span class="grow"><b>{{ assignment.title }}</b><span class="meta">{{ formatShortTime(assignment.dueAt) }} 截止</span></span></RouterLink></div></section>
          <section v-if="query.data.value.chapter.knowledgePoints.length" class="sec"><h2>知识点</h2><p class="kp-line"><span v-for="point in query.data.value.chapter.knowledgePoints" :key="point.id" class="tag">{{ point.title }}</span></p></section>
          <p class="meta read-state">阅读状态：{{ query.data.value.chapter.studentProgress ? statusLabel(query.data.value.chapter.studentProgress.status) : '未提供' }}</p>
        </aside>
      </section>
    </template>
  </div>
</template>
