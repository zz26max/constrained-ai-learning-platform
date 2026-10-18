<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { coursesApi, type ProgressDTO } from '../../api'
import ApiState from '../../components/ApiState.vue'
import ActionNotice from '../../components/ActionNotice.vue'
import CourseProgress from '../../components/CourseProgress.vue'
import SafeMarkdown from '../../components/SafeMarkdown.vue'
import { usePageQuery } from './use-page-query'
import { useCourseActions } from './use-course-actions'
import { isUuid, statusLabel } from './format'
const route = useRoute(), api = coursesApi(), actions = useCourseActions()
const confirmedProgress = shallowRef<ProgressDTO | null>(null)
const query = usePageQuery(async signal => {
  const offeringId = route.params['offeringId'], chapterId = route.params['chapterId']
  if (!isUuid(offeringId) || !isUuid(chapterId)) throw new Error('章节链接无效，请从课程目录重新选择。')
  const [offering, chapter] = await Promise.all([api.getOffering(offeringId, { signal }), api.getChapter(chapterId, { signal })])
  if (chapter.data.offeringId !== offeringId) throw new Error('章节不属于当前课程，请返回课程目录。')
  return { offering: offering.data, chapter: chapter.data }
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
</script>
<template>
  <div class="workspace-page reading-page"><header class="workspace-heading"><div><h1 tabindex="-1">{{ query.data.value ? '第 ' + query.data.value.chapter.number + ' 章 · ' + query.data.value.chapter.title : '章节阅读' }}</h1><p v-if="query.data.value">{{ query.data.value.offering.title }} · {{ query.data.value.offering.groupName }}</p></div><RouterLink class="button secondary" :to="{ name: 'course', params: { offeringId: route.params.offeringId } }">← 课程目录</RouterLink></header>
    <ApiState :status="query.status.value" :error="query.error.value" @retry="loadChapter" />
    <template v-if="query.status.value === 'success' && query.data.value"><p v-if="readonly" class="notice notice-info">本章节为只读，阅读进度和学习位置不再写入。</p><ActionNotice :error="actions.error.value" :message="actions.message.value" />
      <section class="surface reading-content"><header class="section-heading"><h2>本章导读</h2><span class="tag">{{ query.data.value.chapter.studentProgress ? statusLabel(query.data.value.chapter.studentProgress.status) : '未提供学生进度' }}</span></header><SafeMarkdown :content="query.data.value.chapter.summary" />
        <section class="reading-section"><h2>学习资料</h2><p v-if="query.data.value.chapter.resources.length === 0" class="muted">暂无学习资料。</p><ul class="resource-list"><li v-for="resource in query.data.value.chapter.resources" :key="resource.id"><RouterLink :to="{ name: 'resource', params: { resourceId: resource.id } }"><span>{{ resource.title }}</span><span>阅读资料 →</span></RouterLink></li></ul></section>
        <section v-if="query.data.value.chapter.knowledgePoints.length" class="reading-section"><h2>相关知识点</h2><ul><li v-for="point in query.data.value.chapter.knowledgePoints" :key="point.id"><strong>{{ point.title }}</strong><p class="muted">{{ point.description }}</p></li></ul></section>
        <section class="reading-section"><h2>阅读进度</h2><p class="muted">完成确认表示你已阅读本章，不代表知识掌握评价。</p><CourseProgress v-if="confirmedProgress" :progress="confirmedProgress" :title="query.data.value.offering.title" /><button type="button" class="button" :disabled="readonly || actions.pending.value || query.data.value.chapter.studentProgress?.status === 'completed'" @click="confirmCompleted">{{ query.data.value.chapter.studentProgress?.status === 'completed' ? '已确认阅读' : '确认已阅读' }}</button></section>
        <section v-if="query.data.value.chapter.assignments.length" class="reading-section"><h2>本章作业</h2><ul class="resource-list"><li v-for="assignment in query.data.value.chapter.assignments" :key="assignment.id"><RouterLink :to="{name:'student-assignment',params:{id:assignment.id}}"><span>{{ assignment.title }}</span><span>查看作业 →</span></RouterLink></li></ul></section>
      </section>
    </template>
  </div>
</template>
