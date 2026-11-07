import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { assignmentsApi } from '../../api'
import type { CheckDTO } from '../../api/assignments'
import { useAuthStore } from '../../stores/auth'
import { pageError, type PageError } from '../courses/page-error'

type Status = CheckDTO['status']

export function useWorkspaceCheck(
  assignmentId: () => string,
  revision: () => number | null,
  enabled: () => boolean,
) {
  const auth = useAuthStore()
  const api = assignmentsApi()
  const configured = ref<boolean | null>(null)
  const preparing = ref(false)
  const status = ref<Status | null>(null)
  const checkedRevision = ref<number | null>(null)
  const result = shallowRef<CheckDTO | null>(null)
  const error = shallowRef<PageError | null>(null)
  let current: AbortController | null = null
  let checkId: string | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  const running = computed(() => status.value === 'queued' || status.value === 'running')

  function cancel() {
    clearTimeout(timer)
    current?.abort()
    current = null
  }

  function begin() {
    cancel()
    error.value = null
    current = new AbortController()
    return current
  }

  function valid(request: AbortController) {
    return request === current && !request.signal.aborted
  }

  async function fail(request: AbortController, cause: unknown) {
    if (!valid(request)) return
    const failure = await pageError(cause)
    if (valid(request)) error.value = failure
  }

  function display(check: CheckDTO) {
    result.value = check
    status.value = check.status
    checkedRevision.value = check.workspaceRevision
    checkId = check.id
  }

  async function poll(request: AbortController, id: string) {
    try {
      const response = await api.getCheck(id, { signal: request.signal })
      if (!valid(request)) return
      display(response.data)
      if (running.value) timer = setTimeout(() => { void poll(request, id) }, 1500)
    } catch (cause) {
      await fail(request, cause)
    }
  }

  async function load(version = revision()) {
    if (!enabled() || !assignmentId() || version === null) return
    const request = begin()
    try {
      const response = await api.getAssignmentCheck(assignmentId(), version, { signal: request.signal })
      if (!valid(request)) return
      configured.value = response.data.configured
      if (response.data.check !== null) {
        display(response.data.check)
        if (running.value) await poll(request, response.data.check.id)
      } else {
        checkedRevision.value = null
      }
    } catch (cause) {
      await fail(request, cause)
    }
  }

  async function retry() {
    if (!enabled()) return
    if (checkId !== null) await poll(begin(), checkId)
    else await load(checkedRevision.value ?? revision())
  }

  async function start(prepareRevision: () => Promise<number>) {
    if (!enabled() || !configured.value || preparing.value || running.value) return
    const request = begin()
    const id = assignmentId()
    preparing.value = true
    try {
      const version = await prepareRevision()
      if (!valid(request)) return
      checkId = null
      status.value = null
      checkedRevision.value = version
      result.value = null
      const csrfToken = await auth.ensureCsrfToken()
      if (!valid(request)) return
      const response = await api.createCheck(id, version, { csrfToken, signal: request.signal })
      if (!valid(request)) return
      auth.markActionSucceeded()
      checkId = response.data.checkId
      status.value = response.data.status
      void poll(request, response.data.checkId)
    } catch (cause) {
      await fail(request, cause)
    } finally {
      if (valid(request)) preparing.value = false
    }
  }

  watch([assignmentId, enabled, () => revision() !== null, () => auth.identity?.id], () => {
    cancel()
    configured.value = null
    preparing.value = false
    status.value = null
    checkedRevision.value = null
    result.value = null
    checkId = null
    error.value = null
    void load()
  }, { immediate: true, flush: 'sync' })
  onScopeDispose(cancel)

  return { configured, preparing, status, checkedRevision, result, error, running, retry, start }
}
