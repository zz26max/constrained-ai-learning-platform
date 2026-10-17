<script setup lang="ts">
import { watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { dashboardApi } from '../../api'
import ApiState from '../../components/ApiState.vue'
import ActionNotice from '../../components/ActionNotice.vue'
import { usePageQuery } from '../courses/use-page-query'
import { formatTime } from '../courses/format'
import { assignmentStateLabel, dueText } from '../assignments/format'
import { useOpenTarget } from '../notifications/use-open-target'

const route = useRoute()
const api = dashboardApi()
const target = useOpenTarget()
const query = usePageQuery(async signal => (await api.getDashboard({}, { signal })).data)
watch(() => route.fullPath, () => { void query.load() }, { immediate: true })

const TYPE_LABELS = { web_lab: '网页实验', sql_text: 'SQL 作业', text: '文本作业' } as const

function excerpt(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}
</script>

<template>
  <div class="workspace-page dashboard-page">
    <header class="workspace-heading">
      <div>
        <h1 tabindex="-1">首页</h1>
        <p v-if="query.status.value === 'success' && query.data.value">
          {{ query.data.value.termId === null ? '当前没有进行中的学期' : query.data.value.termLabel }}
        </p>
      </div>
    </header>

    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />

    <template v-if="query.status.value === 'success' && query.data.value">
      <ul class="dash-summary" aria-label="学习概览">
        <li><strong>{{ query.data.value.courseCount }}</strong> 门课程</li>
        <li><strong>{{ query.data.value.pendingAssignmentCount }}</strong> 项待完成</li>
        <li><RouterLink to="/student/messages"><strong>{{ query.data.value.unreadMessageCount }}</strong> 条未读</RouterLink></li>
      </ul>

      <section class="surface dash-section" aria-labelledby="dash-current">
        <h2 id="dash-current">当前学习</h2>
        <template v-if="query.data.value.currentLearning?.type === 'assignment'">
          <h3>{{ query.data.value.currentLearning.title }}</h3>
          <p class="muted">
            {{ TYPE_LABELS[query.data.value.currentLearning.assignmentType] }}
            · {{ dueText(query.data.value.currentLearning.dueAt, query.data.value.currentLearning.overdue) }}
            · {{ assignmentStateLabel(query.data.value.currentLearning.assignmentState) }}
            <span v-if="query.data.value.currentLearning.overdue" class="tag tag-overdue">已逾期</span>
          </p>
          <RouterLink class="button primary" :to="{ name: 'student-assignment', params: { id: query.data.value.currentLearning.assignmentId } }">
            {{ query.data.value.currentLearning.resume === null ? '继续作业' : '继续上次的工作' }}
          </RouterLink>
        </template>
        <template v-else-if="query.data.value.currentLearning?.type === 'chapter'">
          <h3>{{ query.data.value.currentLearning.title }}</h3>
          <p class="muted">{{ query.data.value.currentLearning.description }}</p>
          <RouterLink class="button primary" :to="{ name: 'chapter', params: { offeringId: query.data.value.currentLearning.offeringId, chapterId: query.data.value.currentLearning.chapterId } }">继续学习</RouterLink>
        </template>
        <template v-else>
          <p class="muted">暂无待完成任务</p>
          <RouterLink class="button secondary" to="/course">查看我的课程</RouterLink>
        </template>
      </section>

      <section class="surface dash-section" aria-labelledby="dash-others">
        <header class="section-heading">
          <h2 id="dash-others">其他待办</h2>
          <RouterLink to="/student/assignments">全部作业</RouterLink>
        </header>
        <ul v-if="query.data.value.otherPendingAssignments.length > 0" class="dash-list">
          <li v-for="item in query.data.value.otherPendingAssignments" :key="item.id">
            <RouterLink :to="{ name: 'student-assignment', params: { id: item.id } }">{{ item.title }}</RouterLink>
            <span class="muted">{{ dueText(item.dueAt, item.overdue) }}</span>
            <span v-if="item.overdue" class="tag tag-overdue">已逾期</span>
            <span v-if="item.publicationState === 'archived'" class="tag">已归档</span>
          </li>
        </ul>
      </section>

      <section class="surface dash-section" aria-labelledby="dash-feedback">
        <h2 id="dash-feedback">最近反馈</h2>
        <template v-if="query.data.value.recentFeedback">
          <p>
            <RouterLink :to="{ name: 'student-assignment', params: { id: query.data.value.recentFeedback.assignmentId }, query: { feedbackId: query.data.value.recentFeedback.id } }">{{ query.data.value.recentFeedback.assignmentTitle }}</RouterLink>
            <span class="muted"> · {{ formatTime(query.data.value.recentFeedback.publishedAt) }} · {{ query.data.value.recentFeedback.score }}/{{ query.data.value.recentFeedback.maxScore }}</span>
          </p>
          <p class="dash-text">{{ excerpt(query.data.value.recentFeedback.comment) }}</p>
        </template>
        <p v-else class="muted">暂无已发布的评价</p>
      </section>

      <section class="surface dash-section" aria-labelledby="dash-courses">
        <header class="section-heading">
          <h2 id="dash-courses">课程总览</h2>
          <RouterLink v-if="query.data.value.courseCount > 6" to="/course">查看全部课程</RouterLink>
        </header>
        <p v-if="query.data.value.courses.length === 0" class="muted">本学期暂无课程</p>
        <ul v-else class="dash-courses">
          <li v-for="course in query.data.value.courses" :key="course.offeringId" class="dash-course">
            <h3><RouterLink :to="{ name: 'course', params: { offeringId: course.offeringId } }">{{ course.title }}</RouterLink></h3>
            <p class="muted">{{ course.groupName }} · {{ course.teachers.map(t => t.displayName).join('、') }}</p>
            <p v-if="course.progress.notConfigured" class="muted">未配置学习内容</p>
            <div v-else class="course-progress">
              <div class="progress-track" role="progressbar" :aria-label="course.title + '进度'" :aria-valuenow="course.progress.percent" aria-valuemin="0" aria-valuemax="100"><span :style="{ width: course.progress.percent + '%' }" /></div>
              <span>{{ course.progress.completed }}/{{ course.progress.total }} <strong>{{ course.progress.percent }}%</strong></span>
            </div>
            <p v-if="course.pendingAssignmentCount > 0 || course.unreadFeedbackCount > 0" class="dash-badges">
              <span v-if="course.pendingAssignmentCount > 0" class="tag">{{ course.pendingAssignmentCount }} 项待办</span>
              <span v-if="course.unreadFeedbackCount > 0" class="tag">{{ course.unreadFeedbackCount }} 条未读反馈</span>
            </p>
            <p class="dash-links">
              <RouterLink :to="{ name: 'student-progress', params: { offeringId: course.offeringId } }">学习记录</RouterLink>
              <RouterLink :to="{ name: 'student-notices', params: { offeringId: course.offeringId } }">公告</RouterLink>
            </p>
          </li>
        </ul>
      </section>

      <section class="surface dash-section" aria-labelledby="dash-notice">
        <h2 id="dash-notice">最新公告</h2>
        <ActionNotice :error="target.error.value" :message="null" />
        <template v-if="query.data.value.recentNotice">
          <p>
            <button v-if="target.canOpen(query.data.value.recentNotice.target)" type="button" class="button secondary" @click="target.open(query.data.value.recentNotice.target)">{{ query.data.value.recentNotice.title }}</button>
            <RouterLink v-else to="/student/messages">{{ query.data.value.recentNotice.title }}</RouterLink>
            <span v-if="query.data.value.recentNotice.readAt === null" class="tag">未读</span>
          </p>
          <p class="muted">
            {{ query.data.value.recentNotice.sender?.displayName ?? '系统' }} · {{ formatTime(query.data.value.recentNotice.createdAt) }}
          </p>
        </template>
        <p v-else class="muted">暂无公告</p>
      </section>
    </template>
  </div>
</template>
