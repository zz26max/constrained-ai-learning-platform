<script setup lang="ts">
import { ref, watch } from 'vue'
import { assignmentsApi } from '../../api'
import ApiState from '../../components/ApiState.vue'
import { usePageQuery } from '../courses/use-page-query'
const props = defineProps<{ assignmentId: string }>()
const api = assignmentsApi()
const page = ref(1), latestOnly = ref(true)
const feedbackStatus = ref<'' | 'none' | 'draft' | 'published'>('')
const labels = { none: '未批阅', draft: '评价草稿', published: '已发布评价' }
const query = usePageQuery(async signal => (await api.listTeacherSubmissions(props.assignmentId,
  { page: page.value, pageSize: 20, latestOnly: latestOnly.value, ...(feedbackStatus.value ? { feedbackStatus: feedbackStatus.value } : {}) }, { signal })).data)
watch([() => props.assignmentId, latestOnly, feedbackStatus], () => { page.value = 1; void query.load() }, { immediate: true })
watch(page, () => { void query.load() })
</script>
<template>
  <section class="surface" aria-label="学生提交列表">
    <h2>学生提交</h2>
    <label>评价状态<select v-model="feedbackStatus"><option value="">全部</option><option value="none">未批阅</option><option value="draft">评价草稿</option><option value="published">已发布评价</option></select></label>
    <label><input v-model="latestOnly" type="checkbox" />每名学生只显示最新提交</label>
    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />
    <template v-if="query.status.value === 'success' && query.data.value">
      <p v-if="!query.data.value.items.length">暂无符合条件的提交。</p>
      <ul><li v-for="submission in query.data.value.items" :key="submission.id">
        <RouterLink :to="{ name: 'teacher-feedback', params: { submissionId: submission.id } }">{{ submission.student.displayName }} · 第 {{ submission.attemptNumber }} 次提交 · {{ labels[submission.feedbackStatus] }} · 查看与批阅</RouterLink>
        <p>版本 {{ submission.workspaceRevision }} · {{ new Date(submission.submittedAt).toLocaleString('zh-CN') }} <span v-if="submission.superseded">已被新提交替代</span><span v-if="submission.late">延期提交</span></p>
      </li></ul>
      <nav aria-label="学生提交分页"><button class="button secondary" :disabled="page <= 1" @click="page--">上一页</button><span>第 {{ page }} 页 · 共 {{ query.data.value.total }} 条</span><button class="button secondary" :disabled="page * 20 >= query.data.value.total" @click="page++">下一页</button></nav>
    </template>
  </section>
</template>
