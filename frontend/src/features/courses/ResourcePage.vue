<script setup lang="ts">
import { watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { coursesApi } from '../../api'
import ApiState from '../../components/ApiState.vue'
import SafeMarkdown from '../../components/SafeMarkdown.vue'
import { usePageQuery } from './use-page-query'
import { isUuid } from './format'
const route = useRoute(), api = coursesApi()
const query = usePageQuery(async signal => {
  const id = route.params['resourceId']
  if (!isUuid(id)) throw new Error('资料链接无效，请从课程目录重新选择。')
  const resource = await api.getResource(id, { signal })
  const [offering, chapter] = await Promise.all([api.getOffering(resource.data.offeringId, { signal }), api.getChapter(resource.data.chapterId, { signal })])
  if (chapter.data.offeringId !== resource.data.offeringId) throw new Error('资料上下文不一致，请返回课程目录。')
  return { resource: resource.data, offering: offering.data, chapter: chapter.data }
})
watch(() => route.fullPath, () => { void query.load() }, { immediate: true })
</script>
<template>
  <div class="workspace-page reading-page"><header class="workspace-heading"><div><h1 tabindex="-1">{{ query.data.value?.resource.title ?? '学习资料' }}</h1><p v-if="query.data.value">{{ query.data.value.offering.title }} · 第 {{ query.data.value.chapter.number }} 章 · {{ query.data.value.chapter.title }}</p></div><RouterLink v-if="query.data.value" class="button secondary" :to="{ name: 'chapter', params: { offeringId: query.data.value.resource.offeringId, chapterId: query.data.value.resource.chapterId } }">← 返回章节</RouterLink><RouterLink v-else class="button secondary" to="/course">← 我的课程</RouterLink></header><ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" /><template v-if="query.status.value === 'success' && query.data.value"><p v-if="query.data.value.offering.status !== 'active'" class="notice notice-info">教学班已归档，正在阅读历史资料。</p><article class="surface reading-content"><SafeMarkdown :content="query.data.value.resource.content" /></article></template></div>
</template>
