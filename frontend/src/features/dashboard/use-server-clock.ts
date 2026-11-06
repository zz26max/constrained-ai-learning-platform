import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue'

/** Server-aligned display clock; submission permission always comes from the API. */
export function useServerClock(serverTime: Readonly<Ref<string | undefined>>) {
  const now = ref(Date.now())
  let offset = 0
  let timer: ReturnType<typeof setInterval> | undefined
  const tick = () => { now.value = Date.now() + offset }
  watch(serverTime, value => {
    const parsed = value ? Date.parse(value) : NaN
    if (Number.isFinite(parsed)) offset = parsed - Date.now()
    tick()
  }, { immediate: true })
  onMounted(() => { timer = setInterval(tick, 1000) })
  onUnmounted(() => { if (timer !== undefined) clearInterval(timer) })
  return now
}
