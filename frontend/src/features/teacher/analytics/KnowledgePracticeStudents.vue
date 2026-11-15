<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { coursesApi, statsApi } from '../../../api'
import ApiState from '../../../components/ApiState.vue'
import { usePageQuery } from '../../courses/use-page-query'
import { runBounded } from '../../courses/worker-pool'
import TeacherPagination from '../TeacherPagination.vue'

const props = defineProps<{ offeringId: string; knowledgePointId: string; title: string }>()
const page = ref(1)
const pageSize = 20
const { data, status, error, load } = usePageQuery(async signal => {
  const { offeringId, knowledgePointId } = props
  const { data: members } = await coursesApi().listMembers(offeringId, { page: page.value, pageSize }, { signal })
  const students = members.items.filter(member => member.role === 'student')
  const matching = await runBounded(students.map(member => async () => {
    const { data: records } = await statsApi().getStudentLearningRecords(
      offeringId, member.userId, { page: 1, pageSize: 1 }, { signal },
    )
    if (records.offeringId !== offeringId || records.student.id !== member.userId) {
      throw new Error('学习记录与当前学生不一致')
    }
    return records.knowledgeEvidence.some(point => point.knowledgePointId === knowledgePointId
      && point.assessmentState === 'needs_practice') ? member : null
  }), 4, signal)
  return {
    members,
    students: matching.filter(member => member !== null),
  }
})

watch(page, () => { void load() }, { immediate: true, flush: 'sync' })
</script>

<template>
  <section class="practice-students" :aria-label="`${title}：需要练习的学生`">
    <p>仅显示当前成员页的匹配学生，可翻页查看更多。</p>
    <ApiState :status="status" :error="error" @retry="load" />
    <template v-if="status === 'success' && data">
      <p v-if="data.students.length === 0">当前成员页没有学生需要练习此知识点。</p>
      <ul v-else>
        <li v-for="student in data.students" :key="student.userId">
          <RouterLink :to="{ name: 'teacher-student-progress', params: { offeringId, studentId: student.userId } }">
            {{ student.displayName }}的学习记录
          </RouterLink>
        </li>
      </ul>
      <TeacherPagination :page="data.members.page" :page-size="data.members.pageSize" :total="data.members.total"
        label="班级成员" @change="page = $event" />
    </template>
  </section>
</template>

<style scoped>
.practice-students { flex-basis: 100%; padding: 4px 0 8px; }
.practice-students p { margin: 6px 0; }
.practice-students ul { list-style: none; margin: 0 0 8px; padding: 0; }
.practice-students a { display: inline-block; padding: 5px 0; }
</style>
