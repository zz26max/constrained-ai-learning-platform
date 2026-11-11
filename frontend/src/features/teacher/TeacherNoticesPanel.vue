<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { assignmentsApi, coursesApi, noticesApi } from '../../api'
import type { NoticeDTO, NoticePage } from '../../api/notices'
import { allPages } from '../../api/pagination'
import ApiState from '../../components/ApiState.vue'
import ActionNotice from '../../components/ActionNotice.vue'
import { usePageQuery } from '../courses/use-page-query'
import { useCourseActions } from '../courses/use-course-actions'
import { formatTime } from '../courses/format'
import TeacherPagination from './TeacherPagination.vue'

type TargetType = 'offering' | 'chapter' | 'resource' | 'assignment'
type TargetChoice = { type: TargetType; id: string; label: string }

const props = defineProps<{ offeringId: string; readOnly: boolean }>()
const notices = noticesApi()
const courses = coursesApi()
const assignments = assignmentsApi()
const showComposer = ref(false)
const page = ref(1)
const pageSize = 20
const form = reactive({ title: '', content: '', targetType: 'none' as 'none' | TargetType, targetId: '' })
const { pending, error: actionError, message, clearNotice, run } = useCourseActions()

const query = usePageQuery<NoticePage>(async signal =>
  (await notices.listNotices(props.offeringId, { page: page.value, pageSize }, { signal })).data)

const targets = usePageQuery(async signal => {
  const offeringId = props.offeringId
  const [chapterResult, assignmentItems] = await Promise.all([
    courses.listTeacherChapters(offeringId, { signal }),
    allPages((page, pageSize, signal) =>
      assignments.listTeacherAssignments(offeringId, { page, pageSize }, { signal }).then(result => result.data), signal),
  ])
  const chapters = chapterResult.data.items.filter(chapter => chapter.publicationState === 'published')
  const resources = (await Promise.all(chapters.map(chapter =>
    courses.getTeacherChapter(chapter.id, { signal }).then(result => result.data.resources)))).flat()
  const choices: TargetChoice[] = [
    ...chapters.map(chapter => ({ type: 'chapter' as const, id: chapter.id, label: `第 ${chapter.number} 章 · ${chapter.title}` })),
    ...resources.filter(resource => !resource.archived)
      .map(resource => ({ type: 'resource' as const, id: resource.id, label: `资料 · ${resource.title}` })),
    ...assignmentItems.filter(assignment => assignment.publicationState === 'published' || assignment.publicationState === 'archived')
      .map(assignment => ({ type: 'assignment' as const, id: assignment.id, label: `作业 · ${assignment.title}${assignment.publicationState === 'archived' ? '（已归档）' : ''}` })),
  ]
  return { offeringId, choices }
})

const targetChoices = computed<TargetChoice[]>(() => {
  const catalog = targets.data.value
  return [
    { type: 'offering', id: props.offeringId, label: '本课程' },
    ...(catalog?.offeringId === props.offeringId ? catalog.choices : []),
  ]
})
const choicesForType = computed(() => targetChoices.value.filter(choice => choice.type === form.targetType))
const valid = computed(() => form.title.trim().length >= 1 && form.title.trim().length <= 200 && form.content.length <= 8000 && (form.targetType === 'none' || choicesForType.value.some(choice => choice.id === form.targetId)))

watch(() => props.offeringId, () => {
  showComposer.value = false
  form.targetType = 'none'
  form.targetId = ''
  page.value = 1
  clearNotice()
  void query.load()
  void targets.load()
}, { immediate: true })
watch(choicesForType, choices => {
  if (!choices.some(choice => choice.id === form.targetId)) form.targetId = choices[0]?.id ?? ''
})

function changePage(next: number): void {
  page.value = next
  void query.load()
}

function beginCompose(): void {
  if (props.readOnly || pending.value) return
  clearNotice()
  form.title = ''
  form.content = ''
  form.targetType = 'none'
  form.targetId = ''
  showComposer.value = true
}
function cancelCompose(): void {
  if (pending.value) return
  showComposer.value = false
}
function targetLabel(notice: NoticeDTO): string {
  if (notice.target === null) return '全班公告'
  return targetChoices.value.find(choice => choice.type === notice.target?.type && choice.id === notice.target.id)?.label ?? '关联内容'
}
async function publish(): Promise<void> {
  if (props.readOnly || !valid.value || pending.value) return
  const offeringId = props.offeringId
  const target = form.targetType === 'none' ? null : {
    type: form.targetType,
    id: form.targetId,
    offeringId,
  }
  const result = await run(token => notices.createNotice(offeringId, {
    title: form.title.trim(), content: form.content, target,
  }, { csrfToken: token }), '公告已发布，已向当前班学生发送通知。')
  if (result === null || props.offeringId !== offeringId) return
  showComposer.value = false
  changePage(1)
}
</script>

<template>
  <section class="teacher-notices-panel">
    <div class="teacher-section-heading">
      <div><h2>课程公告</h2><p class="teacher-section-note teacher-muted">发布后会向当前班学生发送课程公告通知。</p></div>
      <button type="button" class="button" :disabled="props.readOnly || pending" @click="beginCompose">发布公告</button>
    </div>
    <ActionNotice :error="actionError" :message="message" />
    <section v-if="showComposer" class="surface teacher-notice-composer" aria-label="发布公告">
      <form @submit.prevent="publish">
        <label>标题<input v-model="form.title" maxlength="200" required :disabled="pending" /></label>
        <label>正文<textarea v-model="form.content" maxlength="8000" rows="6" :disabled="pending" /></label>
        <label>关联内容
          <select v-model="form.targetType" :disabled="pending">
            <option value="none">不关联</option><option value="offering">本课程</option><option value="chapter">章节</option><option value="resource">资料</option><option value="assignment">作业</option>
          </select>
        </label>
        <label v-if="form.targetType !== 'none'">具体内容
          <select v-model="form.targetId" :disabled="pending || choicesForType.length === 0">
            <option v-for="choice in choicesForType" :key="choice.id" :value="choice.id">{{ choice.label }}</option>
          </select>
        </label>
        <ApiState v-if="form.targetType !== 'none' && form.targetType !== 'offering'"
          :status="targets.status.value" :error="targets.error.value" @retry="targets.load" />
        <p v-if="form.targetType !== 'none' && targets.status.value === 'success' && choicesForType.length === 0" class="teacher-muted">
          暂无本班学生可查看的关联内容。
        </p>
        <p v-if="form.content.length > 8000" class="notice notice-error" role="alert">正文不能超过 8000 个字符。</p>
        <div class="teacher-dialog-actions"><button type="button" class="button secondary" :disabled="pending" @click="cancelCompose">取消</button><button type="submit" class="button primary" :disabled="pending || !valid">{{ pending ? '正在发布…' : '发布公告' }}</button></div>
      </form>
    </section>
    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />
    <section v-if="query.status.value === 'success' && query.data.value" class="surface">
      <p v-if="query.data.value.items.length === 0" class="teacher-empty muted">本课程暂无公告。</p>
      <ul v-else class="teacher-notice-list">
        <li v-for="notice in query.data.value.items" :key="notice.id">
          <div><h3>{{ notice.title }}</h3><p class="teacher-muted"><time :datetime="notice.createdAt">{{ formatTime(notice.createdAt) }}</time> · {{ targetLabel(notice) }} · 已通知 {{ notice.recipientCount }} 人</p></div>
          <p class="teacher-text">{{ notice.content }}</p>
        </li>
      </ul>
      <TeacherPagination v-if="query.data.value.total > pageSize" label="课程公告"
        :page="page" :page-size="pageSize" :total="query.data.value.total" @change="changePage" />
    </section>
  </section>
</template>
