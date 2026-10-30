<script setup lang="ts">
import { ref } from 'vue'
import { statsApi } from '../../api'
import type { AssignmentStatsDTO } from '../../api/stats'
import ApiState from '../../components/ApiState.vue'
import { usePageQuery } from '../courses/use-page-query'
import { formatShortTime } from '../courses/format'

type CommonIssue = AssignmentStatsDTO['commonIssues'][number]
type IssueSource = CommonIssue['sources'][number]

const props = defineProps<{ assignmentId: string }>()
const requested = ref(false)

const { data, status, error, load } = usePageQuery(async signal =>
  (await statsApi().getAssignmentStats(props.assignmentId, { signal })).data)

const SOURCE_LABELS: Record<IssueSource, string> = {
  student_help: '学生求助',
  teacher_feedback: '教师确认',
  checker: '自动检查',
}

function sourceText(sources: IssueSource[]): string {
  return sources.map(source => SOURCE_LABELS[source]).join(' · ')
}

function onToggle(event: Event): void {
  const details = event.target as HTMLDetailsElement
  if (!details.open || requested.value) return
  requested.value = true
  void load()
}
</script>

<template>
  <details class="assignment-issues" @toggle="onToggle">
    <summary>常见问题</summary>
    <div class="assignment-issues-body">
      <ApiState :status="status" :error="error" @retry="load" />
      <template v-if="status === 'success' && data">
        <p v-if="data.commonIssues.length === 0" class="assignment-issues-empty">
          暂未汇总常见问题。发布包含问题标签的评价后，这里会按当前词表汇总。
        </p>
        <ul v-else class="assignment-issues-list">
          <li v-for="issue in data.commonIssues" :key="issue.issueTag">
            <div class="assignment-issue-head">
              <strong>{{ issue.title }}</strong>
              <span class="tag">{{ sourceText(issue.sources) }}</span>
            </div>
            <p>{{ issue.description }}</p>
            <p class="assignment-issue-meta">
              学生自报 {{ issue.reportedStudentCount }} · 教师确认 {{ issue.confirmedStudentCount }} · 涉及 {{ issue.distinctStudentCount }} 名学生
              · {{ formatShortTime(issue.timeRange.from) }} 至 {{ formatShortTime(issue.timeRange.to) }}
            </p>
          </li>
        </ul>
      </template>
    </div>
  </details>
</template>

<style scoped>
.assignment-issues {
  padding: 0 0 10px;
}
.assignment-issues summary {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  color: var(--blue-text);
  font-size: 13px;
  cursor: pointer;
}
.assignment-issues-body {
  max-width: 80ch;
  padding: 2px 0 8px;
}
.assignment-issues-empty {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--muted);
}
.assignment-issues-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}
.assignment-issues-list li {
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
}
.assignment-issue-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.assignment-issue-head strong {
  font-size: 14px;
  overflow-wrap: anywhere;
}
.assignment-issues-list p {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.65;
  color: var(--muted);
}
.assignment-issues-list .assignment-issue-meta {
  font-size: 12px;
}
</style>
