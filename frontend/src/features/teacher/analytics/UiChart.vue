<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { EChartsCoreOption, EChartsType } from 'echarts/core'
import { prefersReducedMotion } from './presentation'

const props = withDefaults(defineProps<{
  option: EChartsCoreOption
  label: string
  height?: number
}>(), { height: 260 })

const el = ref<HTMLDivElement | null>(null)
let chart: EChartsType | null = null
let observer: ResizeObserver | null = null
let disposed = false

function apply(): void {
  if (chart === null) return
  chart.setOption({ ...props.option, animation: props.option.animation ?? !prefersReducedMotion() }, { notMerge: true })
}

async function mount(): Promise<void> {
  const { echarts } = await import('./echarts')
  if (disposed || el.value === null) return
  chart = echarts.init(el.value, undefined, { renderer: 'svg' })
  apply()
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => chart?.resize())
    observer.observe(el.value)
  }
}

onMounted(() => { void mount() })
watch(() => props.option, apply, { deep: true })
onBeforeUnmount(() => {
  disposed = true
  observer?.disconnect()
  observer = null
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div ref="el" class="ui-chart" role="img" :aria-label="label" :style="{ height: `${height}px` }" />
</template>

<style scoped>
.ui-chart {
  width: 100%;
  min-width: 0;
}
</style>
