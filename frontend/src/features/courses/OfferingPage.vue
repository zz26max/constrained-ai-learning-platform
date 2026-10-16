<script setup lang="ts">
import { watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { coursesApi } from '../../api'
import ApiState from '../../components/ApiState.vue'
import { usePageQuery } from './use-page-query'
import { isUuid, statusLabel } from './format'
const route = useRoute(), api = coursesApi()
const query = usePageQuery(async signal => {
  const id = route.params['offeringId']
  if (!isUuid(id)) throw new Error('课程链接无效，请返回我的课程。')
  const [offering, chapters] = await Promise.all([api.getOffering(id, { signal }), api.listChapters(id, { signal })])
  if (chapters.data.offeringId !== id) throw new Error('章节目录与课程不一致，请重新加载。')
  return { offering: offering.data, chapters: chapters.data }
})
watch(() => route.fullPath, () => { void query.load() }, { immediate: true })
</script>
<template>
  <div class="workspace-page"><header class="workspace-heading"><div><h1 tabindex="-1">{{ query.data.value?.offering.title ?? '课程详情' }}</h1><p v-if="query.data.value">{{ query.data.value.offering.groupName }} · {{ query.data.value.offering.termLabel }} · {{ query.data.value.offering.teachers.map(t => t.displayName).join('、') }}</p></div><div class="heading-links"><RouterLink v-if="query.data.value" class="button secondary" :to="{ name: 'student-notices', params: { offeringId: query.data.value.offering.id } }">课程公告</RouterLink><RouterLink class="button secondary" to="/course">← 我的课程</RouterLink></div></header>
    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />
    <template v-if="query.status.value === 'success' && query.data.value"><p v-if="query.data.value.offering.status !== 'active'" class="notice notice-info">{{ statusLabel(query.data.value.offering.status) }} · 历史内容可阅读，阅读进度和学习位置不再写入。</p><section class="surface chapter-directory"><header class="section-heading"><h2>课程章节</h2><span>{{ query.data.value.chapters.items.length }} 个已发布章节</span></header><p v-if="query.data.value.chapters.items.length === 0" class="state-block">教师尚未发布章节。</p><ol v-else class="chapter-list"><li v-for="chapter in query.data.value.chapters.items" :key="chapter.id"><span class="chapter-number">{{ chapter.number }}</span><div><h3><RouterLink :to="{ name: 'chapter', params: { offeringId: query.data.value.offering.id, chapterId: chapter.id } }">{{ chapter.title }}</RouterLink></h3><p>{{ chapter.summary }}</p><small>{{ chapter.resourceCount }} 份资料 · {{ chapter.isRequired ? '必读' : '选读' }}</small></div><span class="tag">{{ chapter.studentProgress ? statusLabel(chapter.studentProgress.status) : '未提供阅读状态' }}</span><RouterLink class="button secondary" :to="{ name: 'chapter', params: { offeringId: query.data.value.offering.id, chapterId: chapter.id } }" :aria-label="'阅读章节：' + chapter.title">阅读章节 →</RouterLink></li></ol></section></template>
  </div>
</template>
