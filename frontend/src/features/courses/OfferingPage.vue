<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { coursesApi } from '../../api'
import { allPages } from '../../api/pagination'
import ApiState from '../../components/ApiState.vue'
import { usePageQuery } from './use-page-query'
import { isUuid, statusLabel } from './format'
const route = useRoute(), api = coursesApi(), expanded = ref<string[]>([])
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
  const courses = await allPages(async (page,pageSize,signal) => (await api.listMyCourses({page,pageSize,termId:offering.termId,status:'all'}, {signal})).data,signal)
  return courses.find(c=>c.offeringId===offering.id)?.currentChapter?.id ?? null
})
watch(() => route.params.offeringId, async () => {
  await query.load()
  const chapters = query.data.value?.chapters.items
  if (query.status.value !== 'success' || !chapters) return
  expanded.value = [chapters.find(c=>c.studentProgress?.status !== 'completed')?.id ?? chapters[0]?.id ?? '']
  await resume.load()
  if (resume.data.value && chapters.some(c=>c.id===resume.data.value)) expanded.value = [resume.data.value]
}, { immediate: true })
function toggle(id:string, event:Event) {
  const open=(event.target as HTMLDetailsElement).open
  expanded.value = open ? [...new Set([...expanded.value,id])] : expanded.value.filter(x=>x!==id)
}
</script>
<template>
  <div class="workspace-page">
    <header class="workspace-heading"><div><span class="small-label">{{ query.data.value?.offering.mark }} · {{ query.data.value?.offering.termLabel }}</span><h1 tabindex="-1">{{ query.data.value?.offering.title ?? '课程详情' }}</h1><p v-if="query.data.value">{{ query.data.value.offering.groupName }} · {{ query.data.value.offering.teachers.map(t => t.displayName).join('、') }}</p></div><div class="heading-links"><RouterLink v-if="query.data.value" class="button secondary" :to="{ name: 'student-notices', params: { offeringId: query.data.value.offering.id } }">课程公告</RouterLink><RouterLink class="button secondary" to="/course">← 我的课程</RouterLink></div></header>
    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />
    <template v-if="query.status.value === 'success' && query.data.value">
      <p v-if="query.data.value.offering.status !== 'active'" class="notice notice-info">{{ statusLabel(query.data.value.offering.status) }} · 历史内容可阅读，阅读进度和学习位置不再写入。</p>
      <ApiState v-if="resume.status.value === 'error'" :status="resume.status.value" :error="resume.error.value" @retry="resume.load" />
      <section class="surface chapter-directory">
        <header class="section-heading"><div><h2>课程目录</h2><p class="muted">按自己的节奏，完成每一次阅读与实践。</p></div><span>{{ query.data.value.chapters.items.length }} 个已发布章节</span></header>
        <div v-if="query.data.value.chapters.items.length" class="chapter-tools"><button class="button secondary" @click="expanded=query.data.value.chapters.items.map(c=>c.id)">全部展开</button><button class="button secondary" @click="expanded=[]">全部收起</button></div>
        <p v-if="query.data.value.chapters.items.length === 0" class="state-block">教师尚未发布章节。</p>
        <details v-for="chapter in query.data.value.chapters.items" :key="chapter.id" class="chapter-fold" :open="expanded.includes(chapter.id)" @toggle="toggle(chapter.id,$event)">
          <summary><span class="chapter-number">{{ String(chapter.number).padStart(2,'0') }}</span><div><h3>{{ chapter.title }}</h3><small class="muted">{{ chapter.resourceCount }} 份资料 · {{ chapter.assignmentCount }} 项作业 · {{ chapter.isRequired ? '必读' : '选读' }}</small></div><span class="tag">{{ chapter.studentProgress ? statusLabel(chapter.studentProgress.status) : '未提供阅读状态' }}</span></summary>
          <div class="chapter-fold-body"><p>{{ chapter.summary || '从本章资料开始学习。' }}</p><RouterLink class="button secondary" :to="{ name: 'chapter', params: { offeringId: query.data.value.offering.id, chapterId: chapter.id } }" :aria-label="'阅读章节：' + chapter.title">阅读章节 →</RouterLink></div>
        </details>
      </section>
    </template>
  </div>
</template>
