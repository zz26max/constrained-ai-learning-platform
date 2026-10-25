<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { coursesApi } from '../../api'
import type { components } from '../../api/generated/schema'
import ApiState from '../../components/ApiState.vue'
import { usePageQuery } from '../courses/use-page-query'
import { formatTime } from '../courses/format'
import TeacherPagination from './TeacherPagination.vue'

const props = defineProps<{ offeringId: string }>()
const api = coursesApi()
const page = ref(1)
const { data, status, error, load } = usePageQuery<components['schemas']['MemberPage']>(async signal => (await api.listMembers(props.offeringId, { page: page.value, pageSize: 20 }, { signal })).data)
let skipPageReload = false
watch(() => props.offeringId, () => {
  skipPageReload = page.value !== 1
  page.value = 1
  void load()
}, { immediate: true })
watch(page, () => {
  if (skipPageReload) { skipPageReload = false; return }
  void load()
})
</script>

<template>
  <section aria-labelledby="teacher-members-title">
    <div class="teacher-section-heading"><h2 id="teacher-members-title">班级成员</h2><span class="teacher-muted">仅显示当前教学班成员</span></div>
    <ApiState :status="status" :error="error" @retry="load" />
    <template v-if="data">
      <div v-if="!data.items.length" class="surface teacher-empty"><h3>当前页暂无成员</h3><p>学生可以使用有效邀请码加入教学班。</p></div>
      <ul v-else class="surface teacher-member-list">
        <li v-for="member in data.items" :key="member.userId" class="teacher-member-row"><div><h3>{{ member.displayName }}</h3><p>{{ member.username }}</p></div><span class="tag tag-off">{{ member.role === 'teacher' ? '授课教师' : member.role === 'student' ? '学生' : '角色不兼容' }}</span><span class="teacher-muted">加入于 {{ formatTime(member.joinedAt) }}</span><RouterLink v-if="member.role === 'student'" class="button secondary" :to="{ name: 'teacher-student-progress', params: { offeringId: props.offeringId, studentId: member.userId } }" :aria-label="`查看学习记录：${member.displayName}`">学习记录</RouterLink></li>
      </ul>
      <TeacherPagination :page="data.page" :page-size="data.pageSize" :total="data.total" label="班级成员" @change="page = $event" />
    </template>
  </section>
</template>
