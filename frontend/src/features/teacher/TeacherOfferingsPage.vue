<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { coursesApi } from '../../api'
import type { components } from '../../api/generated/schema'
import ApiState from '../../components/ApiState.vue'
import { useAuthStore } from '../../stores/auth'
import { usePageQuery } from '../courses/use-page-query'
import { useCourseActions } from '../courses/use-course-actions'
import TeacherPagination from './TeacherPagination.vue'

type OfferingPage = components['schemas']['OfferingPage']
type BaseCoursePage = components['schemas']['BaseCoursePage']
type BaseCourseDTO = components['schemas']['BaseCourseDTO']
type OfferingWrite = components['schemas']['OfferingWrite']

const api = coursesApi()
const auth = useAuthStore()
const router = useRouter()
const termId = ref('')
const page = ref(1)
const basePage = ref(1)
const dialog = ref<HTMLDialogElement | null>(null)
const showCreate = ref(false)
const selectedCourse = ref<BaseCourseDTO | null>(null)
const form = reactive<Pick<OfferingWrite, 'title' | 'groupName' | 'termId' | 'progressUnit'>>({ title: '', groupName: '', termId: '', progressUnit: 'chapter' })
const { pending, error: actionError, message, run } = useCourseActions()
const { data, status, error, load } = usePageQuery<OfferingPage>(async signal => (await api.listTeacherOfferings({ page: page.value, pageSize: 20, ...(termId.value ? { termId: termId.value } : {}) }, { signal })).data)
const bases = usePageQuery<BaseCoursePage>(async signal => (await api.listBaseCourses({ page: basePage.value, pageSize: 20 }, { signal })).data)
const basesData = bases.data
const basesStatus = bases.status
const basesError = bases.error
const terms = computed(() => auth.config?.terms ?? [])
const currentTerm = computed(() => terms.value.find(term => term.id === auth.config?.currentTermId)?.label)
const canCreate = computed(() => auth.config !== null && terms.value.length > 0)
const formValid = computed(() => selectedCourse.value !== null && form.title.trim().length > 0 && form.groupName.trim().length > 0 && terms.value.some(term => term.id === form.termId))

watch([termId, page], () => void load(), { immediate: true })
watch(basePage, () => { if (showCreate.value) void bases.load() })
watch(termId, () => { page.value = 1 })

async function openCreate(): Promise<void> {
  if (!canCreate.value || pending.value) return
  selectedCourse.value = null
  form.title = ''
  form.groupName = ''
  form.termId = auth.config?.currentTermId ?? ''
  form.progressUnit = 'chapter'
  basePage.value = 1
  showCreate.value = true
  await nextTick()
  dialog.value?.showModal()
  void bases.load()
}

function chooseCourse(course: BaseCourseDTO): void {
  selectedCourse.value = course
  if (!form.title.trim()) form.title = course.title
}

function closeCreate(): void {
  if (pending.value) return
  dialog.value?.close()
  showCreate.value = false
  selectedCourse.value = null
}

function cancelCreate(event: Event): void {
  if (pending.value) event.preventDefault()
}

async function create(): Promise<void> {
  if (pending.value || !formValid.value || !canCreate.value || selectedCourse.value === null) return
  const body: OfferingWrite = { courseId: selectedCourse.value.id, title: form.title.trim(), groupName: form.groupName.trim(), termId: form.termId, progressUnit: form.progressUnit }
  const result = await run(token => api.createOffering(body, { csrfToken: token }), '教学班已创建。')
  if (result === null) return
  closeCreate()
  await router.push(`/teacher/offerings/${result.id}`)
}

onBeforeUnmount(() => { selectedCourse.value = null; dialog.value?.close() })
</script>

<template>
  <div class="workspace-page teacher-page">
    <header class="workspace-heading">
      <div><h1 tabindex="-1">授课教学班</h1><p>选择教学班，管理章节、资料、成员与邀请码。</p></div>
      <button class="button primary" type="button" :disabled="!canCreate || pending" @click="openCreate">创建教学班</button>
    </header>
    <p v-if="auth.config === null" class="notice notice-warn">学期配置暂不可用，当前不能创建教学班。</p>
    <p v-else-if="!terms.length" class="notice notice-info">尚未配置学期，不能创建教学班。请联系管理员配置学期。</p>
    <form class="toolbar teacher-filters" @submit.prevent>
      <label for="teacher-term">学期</label>
      <select id="teacher-term" v-model="termId"><option value="">{{ currentTerm ? `当前学期 · ${currentTerm}` : '当前学期（未设置）' }}</option><option v-for="term in terms" :key="term.id" :value="term.id">{{ term.label }}</option></select>
    </form>
    <ApiState :status="status" :error="error" @retry="load" />
    <template v-if="status === 'success' && data">
      <div v-if="!data.items.length" class="surface teacher-empty"><h2>该学期暂无授课教学班</h2><p>切换已有学期，或创建一个教学班开始准备课程内容。</p></div>
      <ul v-else class="surface teacher-offering-list">
        <li v-for="offering in data.items" :key="offering.id" class="teacher-offering-row">
          <div><span class="teacher-mark">{{ offering.mark }}</span><h2><RouterLink :to="`/teacher/offerings/${offering.id}`">{{ offering.title }}</RouterLink></h2><p>{{ offering.groupName }} · {{ offering.teachers.map(teacher => teacher.displayName).join('、') }}</p></div>
          <div class="teacher-offering-context"><span>{{ offering.termLabel }}</span><span class="tag" :class="offering.status === 'archived' ? 'tag-off' : 'tag-on'">{{ offering.status === 'active' ? '开课中' : offering.status === 'archived' ? '已归档' : '状态不兼容' }}</span></div>
          <RouterLink class="button secondary" :to="`/teacher/offerings/${offering.id}`" :aria-label="`管理教学班：${offering.title}`">管理教学班</RouterLink>
        </li>
      </ul>
      <TeacherPagination :page="data.page" :page-size="data.pageSize" :total="data.total" label="教学班" @change="page = $event" />
    </template>
    <p v-if="message && !showCreate" class="notice notice-info" role="status">{{ message }}</p>
    <dialog v-if="showCreate" ref="dialog" class="teacher-dialog" aria-labelledby="offering-create-title" @cancel="cancelCreate" @close="showCreate = false; selectedCourse = null">
      <div class="teacher-dialog-heading"><h2 id="offering-create-title">创建教学班</h2><button type="button" class="button secondary" :disabled="pending" @click="closeCreate">关闭</button></div>
      <form class="teacher-form" @submit.prevent="create">
        <fieldset :disabled="pending">
          <legend>课程与教学班信息</legend>
          <ApiState :status="basesStatus" :error="basesError" @retry="bases.load" />
          <div v-if="basesStatus === 'success' && basesData" class="teacher-base-select">
            <p v-if="!basesData.items.length" class="teacher-muted">当前没有允许开班的基础课程。</p>
            <label v-for="course in basesData.items" :key="course.id" class="teacher-radio"><input type="radio" name="base-course" :checked="selectedCourse?.id === course.id" @change="chooseCourse(course)" /><span>{{ course.title }} <small>{{ course.mark }}</small></span></label>
            <TeacherPagination :page="basesData.page" :page-size="basesData.pageSize" :total="basesData.total" label="基础课程" @change="basePage = $event" />
          </div>
          <p v-if="selectedCourse" class="teacher-muted">已选择：{{ selectedCourse.title }}</p>
          <label for="offering-title">教学班标题</label><input id="offering-title" v-model="form.title" required maxlength="200" />
          <label for="offering-group">班级名称</label><input id="offering-group" v-model="form.groupName" required maxlength="200" />
          <label for="offering-term">学期</label><select id="offering-term" v-model="form.termId" required><option disabled value="">请选择已配置的学期</option><option v-for="term in terms" :key="term.id" :value="term.id">{{ term.label }}</option></select>
          <label for="offering-progress">进度口径</label><select id="offering-progress" v-model="form.progressUnit"><option value="chapter">必修章节</option><option value="assignment">必修作业</option></select>
          <button class="button primary" type="submit" :disabled="pending || !formValid || !canCreate">{{ pending ? '正在创建…' : '创建教学班' }}</button>
        </fieldset>
        <ApiState v-if="actionError" status="error" :error="actionError" />
      </form>
    </dialog>
  </div>
</template>
