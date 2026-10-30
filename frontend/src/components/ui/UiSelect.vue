<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'

interface UiSelectOption {
  value: string
  label: string
  hint?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  modelValue: string
  options: UiSelectOption[]
  label?: string
  ariaLabel?: string
  disabled?: boolean
  placeholder?: string
}>(), { disabled: false })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const uid = useId()
const labelId = `${uid}-label`
const valueId = `${uid}-value`
const listboxId = `${uid}-listbox`
const optionId = (index: number) => `${uid}-option-${index}`

const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const open = ref(false)
const activeIndex = ref(-1)
let outsideListening = false
let typeahead = ''
let typeaheadTimer: ReturnType<typeof setTimeout> | undefined

const selectedIndex = computed(() => props.options.findIndex(option => option.value === props.modelValue))
const selectedOption = computed(() => selectedIndex.value >= 0 ? props.options[selectedIndex.value] : undefined)
const selectedText = computed(() => {
  const option = selectedOption.value
  if (!option) return props.placeholder ?? ''
  return `${option.label}${option.hint ? ` · ${option.hint}` : ''}`
})
const enabledIndexes = computed(() => props.options.flatMap((option, index) => option.disabled ? [] : [index]))

function firstEnabled(): number {
  return enabledIndexes.value[0] ?? -1
}
function lastEnabled(): number {
  return enabledIndexes.value.at(-1) ?? -1
}
function move(step: 1 | -1): void {
  const indexes = enabledIndexes.value
  if (indexes.length === 0) return
  const current = indexes.indexOf(activeIndex.value)
  const next = current === -1
    ? (step === 1 ? indexes[0] : indexes[indexes.length - 1])
    : indexes[(current + step + indexes.length) % indexes.length]
  activeIndex.value = next!
  void nextTick(scrollActive)
}
function scrollActive(): void {
  if (activeIndex.value < 0) return
  const node = document.getElementById(optionId(activeIndex.value))
  node?.scrollIntoView?.({ block: 'nearest' })
}
function openMenu(index = selectedIndex.value >= 0 ? selectedIndex.value : firstEnabled()): void {
  if (props.disabled || props.options.length === 0) return
  open.value = true
  activeIndex.value = enabledIndexes.value.includes(index) ? index : firstEnabled()
  if (!outsideListening) {
    document.addEventListener('pointerdown', onOutsidePointer, true)
    outsideListening = true
  }
  void nextTick(scrollActive)
}
function closeMenu(restoreFocus = false): void {
  if (!open.value) return
  open.value = false
  activeIndex.value = -1
  if (outsideListening) {
    document.removeEventListener('pointerdown', onOutsidePointer, true)
    outsideListening = false
  }
  if (restoreFocus) trigger.value?.focus()
}
function toggle(): void {
  open.value ? closeMenu() : openMenu()
}
function select(option: UiSelectOption): void {
  if (option.disabled) return
  emit('update:modelValue', option.value)
  closeMenu(true)
}
function onOutsidePointer(event: PointerEvent): void {
  if (root.value && !root.value.contains(event.target as Node)) closeMenu()
}
function onNativeChange(event: Event): void {
  emit('update:modelValue', (event.target as HTMLSelectElement).value)
}
function onTypeahead(key: string): void {
  typeahead += key.toLowerCase()
  if (typeaheadTimer) clearTimeout(typeaheadTimer)
  typeaheadTimer = setTimeout(() => { typeahead = '' }, 500)
  if (!open.value) openMenu()
  const start = activeIndex.value >= 0 ? activeIndex.value + 1 : 0
  for (let offset = 0; offset < props.options.length; offset++) {
    const index = (start + offset) % props.options.length
    const option = props.options[index]!
    const text = `${option.label} ${option.hint ?? ''}`.toLowerCase()
    if (!option.disabled && text.startsWith(typeahead)) {
      activeIndex.value = index
      void nextTick(scrollActive)
      return
    }
  }
}
function onTriggerKeydown(event: KeyboardEvent): void {
  if (props.disabled) return
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      open.value ? move(1) : openMenu()
      break
    case 'ArrowUp':
      event.preventDefault()
      open.value ? move(-1) : openMenu(lastEnabled())
      break
    case 'Home':
      if (!open.value) return
      event.preventDefault()
      activeIndex.value = firstEnabled()
      void nextTick(scrollActive)
      break
    case 'End':
      if (!open.value) return
      event.preventDefault()
      activeIndex.value = lastEnabled()
      void nextTick(scrollActive)
      break
    case 'Enter':
    case ' ':
      event.preventDefault()
      if (!open.value) openMenu()
      else if (activeIndex.value >= 0) select(props.options[activeIndex.value]!)
      break
    case 'Escape':
      if (!open.value) return
      event.preventDefault()
      closeMenu(true)
      break
    case 'Tab':
      closeMenu()
      break
    default:
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault()
        onTypeahead(event.key)
      }
  }
}

watch(() => props.disabled, disabled => { if (disabled) closeMenu() })
watch(() => props.modelValue, () => {
  if (open.value) activeIndex.value = selectedIndex.value >= 0 ? selectedIndex.value : firstEnabled()
})

onBeforeUnmount(() => {
  if (outsideListening) document.removeEventListener('pointerdown', onOutsidePointer, true)
  if (typeaheadTimer) clearTimeout(typeaheadTimer)
})
</script>

<template>
  <div ref="root" class="ui-select" :class="{ 'is-open': open, 'is-disabled': disabled }">
    <span v-if="label" :id="labelId" class="ui-select-label">{{ label }}</span>
    <div class="ui-select-control">
      <button
        ref="trigger"
        type="button"
        class="ui-select-trigger"
        role="combobox"
        aria-haspopup="listbox"
        :aria-expanded="open"
        :aria-controls="listboxId"
        :aria-labelledby="label ? `${labelId} ${valueId}` : undefined"
        :aria-label="label ? undefined : (ariaLabel ?? placeholder ?? '选择')"
        :aria-activedescendant="open && activeIndex >= 0 ? optionId(activeIndex) : undefined"
        :disabled="disabled"
        @click="toggle"
        @keydown="onTriggerKeydown"
      >
        <span :id="valueId" class="ui-select-value" :class="{ 'is-placeholder': !selectedOption }">{{ selectedText }}</span>
        <svg class="ui-select-chevron" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      <select
        class="ui-select-native"
        tabindex="-1"
        aria-hidden="true"
        :value="modelValue"
        :disabled="disabled"
        @change="onNativeChange"
      >
        <option v-for="option in options" :key="option.value" :value="option.value" :disabled="option.disabled">{{ option.label }}{{ option.hint ? ` · ${option.hint}` : '' }}</option>
      </select>
      <ul
        v-if="open"
        :id="listboxId"
        class="ui-select-popup"
        role="listbox"
        :aria-labelledby="label ? labelId : undefined"
        :aria-label="label ? undefined : (ariaLabel ?? '选项')"
      >
        <li
          v-for="(option, index) in options"
          :id="optionId(index)"
          :key="option.value"
          role="option"
          class="ui-select-option"
          :aria-selected="option.value === modelValue"
          :aria-disabled="option.disabled || undefined"
          :data-active="index === activeIndex ? 'true' : undefined"
          :title="option.hint ? `${option.label} · ${option.hint}` : option.label"
          @mousedown.prevent
          @click="select(option)"
          @mousemove="activeIndex = option.disabled ? activeIndex : index"
        >
          <span class="ui-select-option-copy">
            <span class="ui-select-option-label">{{ option.label }}</span>
            <span v-if="option.hint" class="ui-select-option-hint">{{ option.hint }}</span>
          </span>
          <svg v-if="option.value === modelValue" class="ui-select-check" viewBox="0 0 12 10" aria-hidden="true"><path d="M1 5l3.2 3L11 1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.ui-select {
  display: grid;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  font-size: 13px;
  color: var(--sr-muted, #52627a);
}
.ui-select-label {
  line-height: 1.4;
  color: var(--sr-muted, #52627a);
}
.ui-select-control {
  position: relative;
  min-width: 0;
}
.ui-select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--sr-line-strong, #c5cfdd);
  border-radius: var(--sr-r-s, 8px);
  background: var(--sr-surface, #fff);
  color: var(--sr-ink, #1c2d49);
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: border-color 150ms ease, background-color 150ms ease, box-shadow 150ms ease;
}
.ui-select-trigger:hover:not(:disabled) {
  border-color: var(--sr-brand, #2853bc);
}
.ui-select-trigger[aria-expanded='true'] {
  border-color: var(--sr-brand, #2853bc);
  box-shadow: 0 0 0 3px var(--sr-brand-soft, #eef2fb);
}
.ui-select-trigger:focus-visible {
  outline: 3px solid var(--sr-brand, #2853bc);
  outline-offset: 3px;
}
.ui-select-trigger:disabled {
  background: var(--sr-sunken, #f7f9fc);
  color: var(--sr-muted, #52627a);
  cursor: not-allowed;
}
.ui-select-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ui-select-value.is-placeholder {
  color: var(--sr-muted, #52627a);
}
.ui-select-chevron {
  flex: none;
  width: 12px;
  height: 8px;
  color: var(--sr-muted, #52627a);
  transition: transform 160ms ease, color 150ms ease;
}
.ui-select.is-open .ui-select-chevron {
  color: var(--sr-brand, #2853bc);
  transform: rotate(180deg);
}
.ui-select-native {
  position: absolute;
  width: 1px;
  height: 1px;
  min-height: 0;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  border: 0;
  opacity: 0;
  pointer-events: none;
  clip-path: inset(50%);
  white-space: nowrap;
}
.ui-select-popup {
  position: absolute;
  z-index: 40;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  max-height: min(280px, 50vh);
  margin: 0;
  padding: 6px;
  overflow-y: auto;
  list-style: none;
  border: 1px solid var(--sr-line, #dde3ec);
  border-radius: 10px;
  background: var(--sr-surface, #fff);
  box-shadow: 0 12px 32px rgba(28, 45, 73, 0.14), 0 2px 6px rgba(28, 45, 73, 0.06);
  scrollbar-width: thin;
  scrollbar-color: var(--sr-line-strong, #c5cfdd) transparent;
}
.ui-select-option {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 40px;
  padding: 7px 10px;
  border-radius: 6px;
  color: var(--sr-ink, #1c2d49);
  font-size: 14px;
  cursor: pointer;
}
.ui-select-option[data-active='true'] {
  background: var(--sr-brand-soft, #eef2fb);
}
.ui-select-option[aria-selected='true'] {
  color: var(--sr-brand, #2853bc);
  font-weight: 600;
}
.ui-select-option[aria-disabled='true'] {
  opacity: 0.5;
  cursor: not-allowed;
}
.ui-select-option-copy {
  display: grid;
  flex: 1;
  gap: 1px;
  min-width: 0;
}
.ui-select-option-label,
.ui-select-option-hint {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ui-select-option-hint {
  color: var(--sr-muted, #52627a);
  font-size: 12px;
  font-weight: 400;
}
.ui-select-check {
  flex: none;
  width: 12px;
  height: 10px;
  color: var(--sr-brand, #2853bc);
}
@media (prefers-reduced-motion: no-preference) {
  .ui-select-popup {
    animation: ui-select-enter 140ms ease-out backwards;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ui-select-trigger,
  .ui-select-chevron {
    transition: none;
  }
}
@keyframes ui-select-enter {
  from {
    opacity: 0;
    transform: translateY(-2px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
</style>
