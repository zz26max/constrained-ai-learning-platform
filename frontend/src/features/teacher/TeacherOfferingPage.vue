<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { coursesApi, statsApi } from '../../api'
import type { components } from '../../api/generated/schema'
import ApiState from '../../components/ApiState.vue'
import { usePageQuery } from '../courses/use-page-query'
import { useCourseActions } from '../courses/use-course-actions'
import TeacherChaptersPanel from './TeacherChaptersPanel.vue'
import TeacherKnowledgePanel from './TeacherKnowledgePanel.vue'
import TeacherMembersPanel from './TeacherMembersPanel.vue'
import TeacherInvitesPanel from './TeacherInvitesPanel.vue'
import TeacherNoticesPanel from './TeacherNoticesPanel.vue'

const route = useRoute()
const api = coursesApi()
const id = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
const tab = ref<'chapters' | 'knowledge' | 'members' | 'invites' | 'notices'>('chapters')
const archiveDialog = ref<HTMLDialogElement | null>(null)
const confirmArchive = ref(false)
const { pending, error: actionError, message, clearNotice, run } = useCourseActions()
const { data, status, error, load } = usePageQuery<components['schemas']['OfferingDTO']>(async signal => (await api.getOffering(id.value, { signal })).data)
const readOnly = computed(() => data.value?.status !== 'active' || pending.value || status.value !== 'success')

// 统计卡片独立请求：失败只影响卡片区，不影响工作台其余部分。
const stats = usePageQuery(async signal => (await statsApi().getOfferingStats(id.value, { signal })).data)

watch(id, () => { tab.value = 'chapters'; closeArchive(); void load(); void stats.load() }, { immediate: true })

async function openArchive(): Promise<void> {
  if (readOnly.value) return
  clearNotice()
  confirmArchive.value = false
  await nextTick()
  archiveDialog.value?.showModal()
}
function closeArchive(): void { archiveDialog.value?.close(); confirmArchive.value = false }
function cancelArchive(event: Event): void { if (pending.value) event.preventDefault() }
async function archive(): Promise<void> {
  if (readOnly.value || !confirmArchive.value) return
  const owner = id.value
  const result = await run(token => api.archiveOffering(owner, { csrfToken: token }), '教学班已归档，历史内容仍可读取。')
  if (result === null || id.value !== owner) return
  closeArchive()
  await load()
}
onBeforeUnmount(closeArchive)
</script>

<template>
  <div class="workspace-page teacher-page">
    <RouterLink class="teacher-back" to="/teacher">返回授课教学班</RouterLink>
    <header class="workspace-heading">
      <div><h1 tabindex="-1">{{ data?.title ?? '教学班工作台' }}</h1><p v-if="data">{{ data.groupName }} · {{ data.termLabel }} · {{ data.teachers.map(teacher => teacher.displayName).join('、') }}</p><p v-else>管理当前教学班的课程内容与成员。</p></div>
      <button type="button" class="button secondary" :disabled="readOnly" @click="openArchive">归档教学班</button>
    </header>
    <section class="stat-cards" aria-label="班级统计">
      <RouterLink class="button" :to="{ name: 'teacher-assignments', params: { offeringId: id } }">作业管理与批阅</RouterLink>
      <ApiState :status="stats.status.value" :error="stats.error.value" @retry="stats.load" />
      <ul v-if="stats.data.value && stats.status.value !== 'error'" class="stat-card-list">
        <li class="stat-card"><span class="muted">学生</span><strong>{{ stats.data.value.studentCount }}</strong></li>
        <li class="stat-card"><span class="muted">进行中作业</span><strong>{{ stats.data.value.activeAssignmentCount }}</strong></li>
        <li class="stat-card">
          <span class="muted">待批阅</span><strong>{{ stats.data.value.pendingReviewCount }}</strong>
          <RouterLink v-if="stats.data.value.pendingReviewCount > 0" :to="{ name: 'teacher-assignments', params: { offeringId: id } }">去批阅</RouterLink>
        </li>
      </ul>
    </section>
    <ApiState :status="status" :error="error" @retry="load" />
    <p v-if="data?.status === 'archived'" class="notice notice-info" role="status">教学班已归档。章节、资料、知识点与邀请均为只读，历史成员和内容仍可查看。</p>
    <p v-if="message" class="notice notice-info" role="status">{{ message }}</p>
    <ApiState v-if="actionError" status="error" :error="actionError" />
    <template v-if="data">
      <nav class="teacher-tabs" aria-label="教学班管理区域">
        <button type="button" :aria-current="tab === 'chapters' ? 'page' : undefined" @click="tab = 'chapters'">章节与资料</button>
        <button type="button" :aria-current="tab === 'knowledge' ? 'page' : undefined" @click="tab = 'knowledge'">知识点</button>
        <button type="button" :aria-current="tab === 'members' ? 'page' : undefined" @click="tab = 'members'">班级成员</button>
        <button type="button" :aria-current="tab === 'invites' ? 'page' : undefined" @click="tab = 'invites'">邀请码</button>
        <button type="button" :aria-current="tab === 'notices' ? 'page' : undefined" @click="tab = 'notices'">公告</button>
      </nav>
      <TeacherChaptersPanel v-if="tab === 'chapters'" :offering-id="data.id" :read-only="readOnly" />
      <TeacherKnowledgePanel v-else-if="tab === 'knowledge'" :offering-id="data.id" :read-only="readOnly" />
      <TeacherMembersPanel v-else-if="tab === 'members'" :offering-id="data.id" />
      <TeacherNoticesPanel v-else-if="tab === 'notices'" :offering-id="data.id" :read-only="readOnly" />
      <TeacherInvitesPanel v-else :offering-id="data.id" :read-only="readOnly" />
    </template>
    <dialog ref="archiveDialog" class="teacher-dialog teacher-confirm" aria-labelledby="offering-archive-title" @cancel="cancelArchive" @close="confirmArchive = false">
      <h2 id="offering-archive-title">归档教学班</h2>
      <p>归档“{{ data?.title }}”后，将停止本班全部教学写入和学生新提交。该操作没有恢复入口，历史内容仍可查看。</p>
      <p class="teacher-muted">存在待批阅的当前提交时，服务端会拒绝归档。</p>
      <label class="teacher-checkbox"><input v-model="confirmArchive" type="checkbox" :disabled="pending" />我确认归档这个教学班</label>
      <ApiState v-if="actionError" status="error" :error="actionError" />
      <div class="teacher-dialog-actions"><button type="button" class="button secondary" :disabled="pending" @click="closeArchive">取消</button><button type="button" class="button primary" :disabled="pending || readOnly || !confirmArchive" @click="archive">{{ pending ? '正在归档…' : '确认归档' }}</button></div>
    </dialog>
  </div>
</template>
