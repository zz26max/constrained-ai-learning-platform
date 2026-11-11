<script setup lang="ts">
import { ref, watch } from 'vue'
import { assignmentsApi } from '../../api'
import type { CheckPolicyConfig, CheckPolicyWrite } from '../../api/assignments'
import ApiState from '../../components/ApiState.vue'
import ActionNotice from '../../components/ActionNotice.vue'
import { usePageQuery } from '../courses/use-page-query'
import { useAssignmentActions } from './use-assignment-actions'

type WebRule = Extract<CheckPolicyConfig, { kind: 'web_lab' }>['rules'][number]
const props = defineProps<{
  assignmentId: string
  kind: CheckPolicyConfig['kind']
  readOnly: boolean
}>()
const api = assignmentsApi()
const actions = useAssignmentActions()
const expanded = ref(false)
const enabled = ref(false)
const rules = ref<WebRule[]>([])
const mode = ref<'query' | 'mutation'>('query')
const seedSql = ref('')
const verificationSql = ref('')
const expectedRows = ref('[]')
const ordered = ref(false)
const validation = ref('')

const query = usePageQuery(async signal => (await api.getCheckPolicy(props.assignmentId, { signal })).data)

function addRule() {
  rules.value.push({
    id: crypto.randomUUID(), title: '', selector: '', check: 'exists',
    expected: null, property: null, width: 1280,
  })
}

function populate(config: CheckPolicyConfig | null) {
  enabled.value = config !== null && config.kind === props.kind
  rules.value = config?.kind === 'web_lab' ? config.rules.map(rule => ({ ...rule })) : []
  if (rules.value.length === 0) addRule()
  mode.value = config?.kind === 'sql_text' ? config.mode : 'query'
  seedSql.value = config?.kind === 'sql_text' ? config.seedSql : ''
  verificationSql.value = config?.kind === 'sql_text' ? config.verificationSql ?? '' : ''
  expectedRows.value = config?.kind === 'sql_text' ? JSON.stringify(config.expectedRows, null, 2) : '[]'
  ordered.value = config?.kind === 'sql_text' && config.ordered
  validation.value = ''
}

async function load() {
  await query.load()
  if (query.status.value === 'success' && query.data.value) populate(query.data.value.config)
}

watch(expanded, open => { if (open && query.status.value === 'idle') void load() })

function parseExpectedRows(input: string): (string | null)[][] | null {
  try {
    const value: unknown = JSON.parse(input)
    if (!Array.isArray(value) || value.length > 100) return null
    const rows: (string | null)[][] = []
    for (const row of value) {
      if (!Array.isArray(row) || row.length === 0 || row.length > 30) return null
      const cells: (string | null)[] = []
      for (const cell of row as unknown[]) {
        if (cell !== null && (typeof cell !== 'string' || [...cell].length > 2000)) return null
        cells.push(cell)
      }
      if (rows.length && cells.length !== rows[0]?.length) return null
      rows.push(cells)
    }
    return rows
  } catch {
    return null
  }
}

function buildConfig(): CheckPolicyConfig | null | undefined {
  if (!enabled.value) return null
  if (props.kind === 'web_lab') {
    const normalized = rules.value.map(rule => ({
      ...rule,
      // 空白标题不上送：后端只接受非空标题，学生端会把空标题当成「没有可读名称」。
      title: rule.title?.trim() || undefined,
      selector: rule.selector.trim(),
      expected: rule.check === 'exists' ? null : rule.expected ?? '',
      property: rule.check === 'css' ? rule.property?.trim() ?? '' : null,
    }))
    if (normalized.some(rule => !rule.selector || !Number.isInteger(rule.width)
      || rule.width < 320 || rule.width > 1920
      || (rule.check === 'css' && !rule.property))) {
      validation.value = '请填写每项规则的选择器与有效视口宽度。样式检查还需要填写 CSS 属性。'
      return
    }
    return { kind: 'web_lab', rules: normalized }
  }
  const rows = parseExpectedRows(expectedRows.value)
  if (rows === null) {
    validation.value = '请填写最多 100 行的二维 JSON 数组，每行列数一致，单元格为字符串或 null。'
    return
  }
  if (!seedSql.value.trim() || (mode.value === 'mutation' && !verificationSql.value.trim())) {
    validation.value = '请填写练习库初始化 SQL。数据修改题还需要验证查询。'
    return
  }
  return {
    kind: 'sql_text', mode: mode.value, seedSql: seedSql.value,
    verificationSql: mode.value === 'mutation' ? verificationSql.value : null,
    expectedRows: rows, ordered: ordered.value,
  }
}

async function save() {
  if (props.readOnly || actions.pending.value || query.status.value !== 'success' || query.data.value === null) return
  validation.value = ''
  const config = buildConfig()
  if (config === undefined) return
  const body: CheckPolicyWrite = { baseVersion: query.data.value.version, config }
  const saved = await actions.run(token => api.updateCheckPolicy(props.assignmentId, body, { csrfToken: token }), '自动检查规则已保存')
  if (saved) {
    query.data.value = saved
    populate(saved.config)
  }
}
</script>

<template>
  <details class="surface teacher-check-policy" @toggle="expanded = ($event.target as HTMLDetailsElement).open">
    <summary>自动检查规则</summary>
    <ApiState :status="query.status.value" :error="query.error.value" @retry="load" />
    <template v-if="query.status.value === 'success' && query.data.value">
      <p v-if="readOnly">当前规则仅供查看。</p>
      <p v-else>规则单独保存。发布作业后规则冻结，正式成绩由教师评定。</p>
      <p v-if="kind === 'web_lab'">检查 HTML/CSS 静态结构与样式，不执行 JavaScript。</p>
      <ActionNotice :error="actions.error.value" :message="actions.message.value" />
      <p v-if="validation" class="notice notice-error" role="alert">{{ validation }}</p>
      <button v-if="actions.error.value" type="button" class="button secondary" @click="load">
        读取最新规则并放弃本页修改
      </button>
      <fieldset :disabled="readOnly || actions.pending.value">
        <label><input v-model="enabled" type="checkbox" />配置自动检查</label>
        <template v-if="enabled && kind === 'web_lab'">
          <fieldset v-for="(rule, index) in rules" :key="rule.id">
            <legend>检查项 {{ index + 1 }}</legend>
            <label>检查项名称（可选，学生能看到）
              <input v-model="rule.title" maxlength="60" placeholder="例如 移动端适配" />
            </label>
            <label>CSS 选择器 <input v-model="rule.selector" maxlength="200" placeholder="例如 main h1" /></label>
            <label>检查类型
              <select v-model="rule.check">
                <option value="exists">元素存在</option>
                <option value="text">元素文本</option>
                <option value="css">计算样式</option>
              </select>
            </label>
            <label v-if="rule.check === 'css'">CSS 属性 <input v-model="rule.property" maxlength="100" placeholder="例如 display" /></label>
            <label v-if="rule.check !== 'exists'">预期值 <input v-model="rule.expected" maxlength="1000" /></label>
            <label>视口宽度（像素） <input v-model.number="rule.width" type="number" min="320" max="1920" /></label>
            <button v-if="!readOnly && rules.length > 1" type="button" class="button secondary small" @click="rules.splice(index, 1)">删除检查项</button>
          </fieldset>
          <button v-if="!readOnly && rules.length < 20" type="button" class="button secondary" @click="addRule">添加检查项</button>
        </template>
        <template v-if="enabled && kind === 'sql_text'">
          <label>SQL 题型
            <select v-model="mode">
              <option value="query">查询结果（SELECT）</option>
              <option value="mutation">修改数据（INSERT / UPDATE / DELETE）</option>
            </select>
          </label>
          <label>练习库初始化 SQL <textarea v-model="seedSql" rows="5" maxlength="32000" spellcheck="false" /></label>
          <label v-if="mode === 'mutation'">修改后的验证查询 <textarea v-model="verificationSql" rows="3" maxlength="8000" spellcheck="false" /></label>
          <label>预期结果行（JSON）
            <textarea v-model="expectedRows" rows="4" spellcheck="false" placeholder='[["1", "示例"], ["2", null]]' />
          </label>
          <p>按列填写字符串或 null，空结果填 []。</p>
          <label><input v-model="ordered" type="checkbox" />按行顺序比对</label>
        </template>
        <button v-if="!readOnly" type="button" class="button" @click="save">
          {{ actions.pending.value ? '保存规则中…' : '保存检查规则' }}
        </button>
      </fieldset>
    </template>
  </details>
</template>

<style scoped>
.teacher-check-policy {
  margin-block: 1.25rem;
  padding: 1rem;
}
.teacher-check-policy > summary {
  cursor: pointer;
  font-weight: 600;
}
.teacher-check-policy label {
  display: block;
  margin-block: .6rem;
}
.teacher-check-policy textarea {
  display: block;
  width: 100%;
}
</style>
