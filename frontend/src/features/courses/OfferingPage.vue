<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { coursesApi, type CourseSummaryDTO } from '../../api'
import { allPages } from '../../api/pagination'
import ApiState from '../../components/ApiState.vue'
import UiNotice from '../../components/ui/UiNotice.vue'
import { usePageQuery } from './use-page-query'
import type { ChapterSummaryDTO } from '../../api/courses'
import { formatShortTime, isUuid } from './format'
const route = useRoute(), api = coursesApi()
const query = usePageQuery(async signal => {
  const id = route.params['offeringId']
  if (!isUuid(id)) throw new Error('课程链接无效，请返回我的课程。')
  const [offering, chapters] = await Promise.all([api.getOffering(id, { signal }), api.listChapters(id, { signal })])
  if (chapters.data.offeringId !== id) throw new Error('章节目录与课程不一致，请重新加载。')
  return { offering: offering.data, chapters: chapters.data }
})
const resume = usePageQuery(async signal => {
  const offering = query.data.value?.offering
  if (!offering) return null
  const courses = await allPages(async (page, pageSize, signal) => (await api.listMyCourses({ page, pageSize, termId: offering.termId, status: 'all' }, { signal })).data, signal)
  return courses.find(c => c.offeringId === offering.id) ?? null
})
const continueChapter = computed(() => {
  const id = resume.data.value?.currentChapter?.id
  return query.data.value?.chapters.items.find(c => c.id === id) ?? null
})
watch(() => route.params.offeringId, async () => {
  await query.load()
  if (query.status.value === 'success') await resume.load()
}, { immediate: true })
function chapterStatus(chapter: ChapterSummaryDTO): string {
  const progress = chapter.studentProgress
  if (progress?.status === 'completed') return progress.completedAt ? `已完成 · ${formatShortTime(progress.completedAt)}` : '已完成'
  if (progress?.status === 'in_progress') return '学习中'
  if (progress?.status === 'not_started') return '未开始'
  return '阅读状态未提供'
}
function progressText(course: CourseSummaryDTO): string {
  if (course.progress.notConfigured) return '进度未配置'
  if (!course.progress.total) return '尚未开放章节'
  return `已完成 ${course.progress.completed}/${course.progress.total} 章`
}
</script>
<template>
  <div class="workspace-page sr-course-home">
    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />
    <template v-if="query.status.value === 'success' && query.data.value">
      <header class="page-head">
        <div>
          <p class="page-eyebrow">{{ query.data.value.offering.groupName }} · {{ query.data.value.offering.teachers.map(t => t.displayName).join('、') }}</p>
          <h1 class="page-title" tabindex="-1">{{ query.data.value.offering.title }}</h1>
          <p class="page-summary">{{ query.data.value.chapters.items.length }} 个已发布章节<template v-if="resume.data.value"> · {{ progressText(resume.data.value) }}<template v-if="resume.data.value.lastStudiedAt"> · 最近学习 {{ formatShortTime(resume.data.value.lastStudiedAt) }}</template></template></p>
        </div>
        <div class="page-actions">
          <RouterLink v-if="continueChapter" class="button" :to="{ name: 'chapter', params: { offeringId: query.data.value.offering.id, chapterId: continueChapter.id } }">{{ query.data.value.offering.status === 'archived' ? '查看' : '继续' }}第 {{ continueChapter.number }} 章</RouterLink>
          <RouterLink class="button secondary" to="/course">← 我的课程</RouterLink>
        </div>
      </header>
      <UiNotice v-if="query.data.value.offering.status !== 'active'" tone="info">已归档 · 历史内容可阅读，阅读进度和学习位置不再写入。</UiNotice>
      <ApiState v-if="resume.status.value === 'error'" :status="resume.status.value" :error="resume.error.value" @retry="resume.load" />
      <nav class="subnav" aria-label="课程"><RouterLink class="on" aria-current="page" :to="{ name: 'course', params: { offeringId: query.data.value.offering.id } }">章节</RouterLink><RouterLink :to="{ name: 'student-assignments', query: { offering: query.data.value.offering.id } }">作业</RouterLink><RouterLink :to="{ name: 'student-progress', params: { offeringId: query.data.value.offering.id } }">学习记录</RouterLink><RouterLink :to="{ name: 'student-notices', params: { offeringId: query.data.value.offering.id } }">公告</RouterLink></nav>
      <ol v-if="query.data.value.chapters.items.length" class="toc" aria-label="课程目录">
        <li v-for="chapter in query.data.value.chapters.items" :key="chapter.id" class="toc-row" :data-state="chapter.studentProgress?.status ?? 'unknown'" :data-current="continueChapter?.id === chapter.id ? 'true' : undefined">
          <span class="toc-n" aria-hidden="true"><template v-if="chapter.studentProgress?.status === 'completed'">✓</template><template v-else>{{ chapter.number }}</template></span>
          <div class="toc-main"><RouterLink :to="{ name: 'chapter', params: { offeringId: query.data.value.offering.id, chapterId: chapter.id } }"><b>第 {{ chapter.number }} 章 · {{ chapter.title }}</b></RouterLink><span class="meta">{{ chapter.summary }}</span><span v-if="chapter.assignmentCount" class="toc-asg"><RouterLink :to="{ name: 'student-assignments', query: { offering: query.data.value.offering.id } }">{{ chapter.assignmentCount }} 项作业 →</RouterLink></span></div>
          <span class="meta toc-st">{{ chapterStatus(chapter) }}</span>
        </li>
      </ol>
      <section v-else class="toc-empty"><h2>还没有已发布的章节</h2><p>教师发布章节后会出现在这里。</p></section>
    </template>
  </div>
</template>
