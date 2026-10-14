<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { coursesApi } from '../../api'
import type { components } from '../../api/generated/schema'
import ApiState from '../../components/ApiState.vue'
import { usePageQuery } from '../courses/use-page-query'
import { useCourseActions } from '../courses/use-course-actions'
import { formatTime, localBeijingToUtc } from '../courses/format'
import TeacherPagination from './TeacherPagination.vue'

type InviteDTO = components['schemas']['InviteDTO']
type InviteWrite = components['schemas']['InviteWrite']
const props = defineProps<{ offeringId: string; readOnly: boolean }>()
const api = coursesApi()
const page = ref(1)
const createDialog = ref<HTMLDialogElement | null>(null)
const secretDialog = ref<HTMLDialogElement | null>(null)
const revokeDialog = ref<HTMLDialogElement | null>(null)
const revokeTarget = ref<InviteDTO | null>(null)
const secret = ref<string | null>(null)
const copyMessage = ref('')
const form = reactive({ expiresAt: '', maxUses: '' })
let active = true
let generation = 0
const { pending, error: actionError, message, clearNotice, run } = useCourseActions()
const { data, status, error, load } = usePageQuery<components['schemas']['InvitePage']>(async signal => (await api.listInvites(props.offeringId, { page: page.value, pageSize: 20 }, { signal })).data)
const expiryUtc = computed(() => { try { return localBeijingToUtc(form.expiresAt) } catch { return null } })
const maxUses = computed(() => form.maxUses === '' ? null : Number(form.maxUses))
const valid = computed(() => expiryUtc.value !== null && Date.parse(expiryUtc.value) > Date.now() && (maxUses.value === null || (/^\d+$/.test(form.maxUses) && Number.isInteger(maxUses.value) && maxUses.value >= 1 && maxUses.value <= 2147483647)))
const canWrite = computed(() => !props.readOnly && !pending.value && status.value === 'success')

let skipPageReload = false
watch(() => props.offeringId, () => {
  generation += 1
  skipPageReload = page.value !== 1
  page.value = 1
  clearDialogs()
  void load()
}, { immediate: true })
watch(page, () => {
  if (skipPageReload) { skipPageReload = false; return }
  void load()
})

function clearSecret(): void { secret.value = null; copyMessage.value = ''; secretDialog.value?.close() }
function cancelSecret(event: Event): void { event.preventDefault() }
function clearDialogs(): void { clearSecret(); createDialog.value?.close(); revokeDialog.value?.close(); revokeTarget.value = null; form.expiresAt = ''; form.maxUses = '' }
function cancelWrite(event: Event): void { if (pending.value) event.preventDefault() }
async function openCreate(): Promise<void> {
  if (!canWrite.value) return
  clearNotice()
  clearSecret()
  form.expiresAt = ''
  form.maxUses = ''
  await nextTick()
  createDialog.value?.showModal()
}
async function create(): Promise<void> {
  const expiresAt = expiryUtc.value
  if (!canWrite.value || !valid.value || !expiresAt) return
  const owner = props.offeringId
  const currentGeneration = generation
  const body: InviteWrite = { expiresAt, maxUses: maxUses.value }
  const result = await run(token => api.createInvite(owner, body, { csrfToken: token }), '邀请码已创建。')
  if (result === null || !active || generation !== currentGeneration || owner !== props.offeringId) return
  createDialog.value?.close()
  form.expiresAt = ''
  form.maxUses = ''
  secret.value = result.inviteCode
  copyMessage.value = ''
  await nextTick()
  secretDialog.value?.showModal()
  await load()
}
async function copySecret(): Promise<void> {
  if (secret.value === null) return
  try {
    await navigator.clipboard.writeText(secret.value)
    if (active && secret.value !== null) copyMessage.value = '已复制，请保存到你自己的安全位置。'
  } catch {
    if (active && secret.value !== null) copyMessage.value = '自动复制不可用，请选中邀请码手动复制并保存。'
  }
}
async function openRevoke(invite: InviteDTO): Promise<void> {
  if (!canWrite.value || invite.revokedAt !== null || isExpired(invite)) return
  clearNotice()
  revokeTarget.value = invite
  await nextTick()
  revokeDialog.value?.showModal()
}
async function revoke(): Promise<void> {
  if (!canWrite.value || revokeTarget.value === null) return
  const owner = props.offeringId
  const currentGeneration = generation
  const target = revokeTarget.value
  const result = await run(token => api.revokeInvite(target.id, { csrfToken: token }), '邀请码已撤销，已加入的成员不受影响。')
  if (result === null || !active || currentGeneration !== generation || owner !== props.offeringId) return
  revokeDialog.value?.close()
  revokeTarget.value = null
  await load()
}
// 过期邀请码已不能加入课程，撤销不会改变有效状态，因此保留记录但禁用撤销。
function isExpired(invite: InviteDTO): boolean {
  return Date.parse(invite.expiresAt) <= Date.now()
}
function inviteStatus(invite: InviteDTO): string {
  if (invite.revokedAt !== null) return '已撤销'
  if (isExpired(invite)) return '已过期'
  if (invite.maxUses !== null && invite.usedCount >= invite.maxUses) return '名额已用尽'
  return '未撤销'
}
onBeforeUnmount(() => { active = false; generation += 1; clearDialogs() })
</script>

<template>
  <section aria-labelledby="teacher-invites-title">
    <div class="teacher-section-heading"><h2 id="teacher-invites-title">邀请码</h2><button type="button" class="button primary" :disabled="!canWrite" @click="openCreate">创建邀请码</button></div>
    <p class="teacher-muted teacher-section-note">列表仅显示使用摘要。邀请码明文只在创建成功时展示一次，关闭或切换页面后不再保留。</p>
    <ApiState :status="status" :error="error" @retry="load" />
    <p v-if="message" class="notice notice-info" role="status">{{ message }}</p>
    <ApiState v-if="actionError" status="error" :error="actionError" />
    <template v-if="data">
      <div v-if="!data.items.length" class="surface teacher-empty"><h3>当前页暂无邀请码</h3><p>创建有明确有效期的邀请码，再分享给需要加入的学生。</p></div>
      <ul v-else class="surface teacher-invite-list"><li v-for="invite in data.items" :key="invite.id"><div><h3>创建于 {{ formatTime(invite.createdAt) }}</h3><p>有效期至 {{ formatTime(invite.expiresAt) }}（北京时间）</p><small v-if="invite.revokedAt">撤销于 {{ formatTime(invite.revokedAt) }}</small></div><div class="teacher-invite-usage"><span>已使用 {{ invite.usedCount }}{{ invite.maxUses === null ? ' 次 · 不限名额' : ` / ${invite.maxUses} 次` }}</span><span class="tag tag-off">{{ inviteStatus(invite) }}</span></div><button type="button" class="button secondary" :disabled="!canWrite || invite.revokedAt !== null || isExpired(invite)" :aria-label="`撤销创建于${formatTime(invite.createdAt)}的邀请码`" @click="openRevoke(invite)">撤销</button></li></ul>
      <TeacherPagination :page="data.page" :page-size="data.pageSize" :total="data.total" label="邀请码" @change="page = $event" />
    </template>
    <dialog ref="createDialog" class="teacher-dialog" aria-labelledby="invite-create-title" @cancel="cancelWrite">
      <div class="teacher-dialog-heading"><h2 id="invite-create-title">创建邀请码</h2><button type="button" class="button secondary" :disabled="pending" @click="createDialog?.close()">关闭</button></div>
      <form class="teacher-form" @submit.prevent="create"><fieldset :disabled="readOnly || pending"><legend>有效期与人数</legend><label for="invite-expiry">有效期至（北京时间）</label><input id="invite-expiry" v-model="form.expiresAt" type="datetime-local" required /><p class="teacher-field-hint">按北京时间输入，提交时转换为 UTC。服务端会检查有效期。</p><label for="invite-max-uses">最多使用人数（留空不限）</label><input id="invite-max-uses" v-model="form.maxUses" type="number" min="1" max="2147483647" step="1" /><button type="submit" class="button primary" :disabled="!canWrite || !valid">{{ pending ? '正在创建…' : '创建邀请码' }}</button></fieldset><ApiState v-if="actionError" status="error" :error="actionError" /></form>
    </dialog>
    <dialog ref="secretDialog" class="teacher-dialog teacher-confirm" aria-labelledby="invite-secret-title" @close="secret = null; copyMessage = ''" @cancel="cancelSecret">
      <h2 id="invite-secret-title">保存邀请码</h2><p>此明文只展示这一次。请复制并保存；关闭或切换管理区域后，无法从列表找回。</p><p v-if="secret" class="teacher-secret"><code>{{ secret }}</code></p><p class="teacher-muted">创建响应丢失或未保存明文时，请撤销该记录并重新创建。</p><p v-if="copyMessage" class="notice notice-info" role="status">{{ copyMessage }}</p><div class="teacher-dialog-actions"><button type="button" class="button secondary" @click="copySecret">复制邀请码</button><button type="button" class="button primary" @click="clearSecret">已保存，关闭</button></div>
    </dialog>
    <dialog ref="revokeDialog" class="teacher-dialog teacher-confirm" aria-labelledby="invite-revoke-title" @cancel="cancelWrite" @close="revokeTarget = null"><h2 id="invite-revoke-title">撤销邀请码</h2><p>撤销创建于 {{ revokeTarget ? formatTime(revokeTarget.createdAt) : '' }} 的邀请码后，不能再用它加入。已经加入的成员不会被移除。</p><ApiState v-if="actionError" status="error" :error="actionError" /><div class="teacher-dialog-actions"><button type="button" class="button secondary" :disabled="pending" @click="revokeDialog?.close()">取消</button><button type="button" class="button primary" :disabled="!canWrite" @click="revoke">{{ pending ? '正在撤销…' : '确认撤销' }}</button></div></dialog>
  </section>
</template>
