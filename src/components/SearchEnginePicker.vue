<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useId } from 'vue';
import { engines, type Engine } from '../domain/model';
import AppIcon from './AppIcon.vue';
import EngineIcon from './EngineIcon.vue';

const props = defineProps<{ engine: Engine }>();
const emit = defineEmits<{ change: [engine: Engine] }>();
const current = computed(() => engines.find(engine => engine.id === props.engine)!);
const open = ref(false);
const picker = ref<HTMLElement>();
const trigger = ref<HTMLButtonElement>();
const listId = useId();

function outsideClick(event: PointerEvent) {
  if (!picker.value?.contains(event.target as Node)) open.value = false;
}
function leavePicker(event: FocusEvent) {
  if (!picker.value?.contains(event.relatedTarget as Node)) open.value = false;
}
function close() { open.value = false; trigger.value?.focus(); }
function select(engine: Engine) { emit('change', engine); close(); }
async function focusOptions() {
  open.value = true;
  await nextTick();
  picker.value?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
}
onMounted(() => document.addEventListener('pointerdown', outsideClick));
onUnmounted(() => document.removeEventListener('pointerdown', outsideClick));
</script>

<template>
  <div ref="picker" class="engine-picker" @focusout="leavePicker" @keydown.esc.stop.prevent="close">
    <button ref="trigger" type="button" class="engine-trigger" :aria-label="`搜索引擎：${current.label}`" :title="`切换搜索引擎（当前 ${current.label}）`" :aria-expanded="open" :aria-controls="listId" @click="open = !open" @keydown.down.prevent="focusOptions">
      <EngineIcon :engine="engine" /><AppIcon name="chevron-down" :size="12" />
    </button>
    <div v-if="open" :id="listId" class="engine-options" role="group" aria-label="选择搜索引擎">
      <button v-for="option in engines" :key="option.id" type="button" class="engine-option" :aria-pressed="engine === option.id" @click="select(option.id)">
        <EngineIcon :engine="option.id" /><span>{{ option.label }}</span><AppIcon v-if="engine === option.id" name="check" :size="16" />
      </button>
    </div>
  </div>
</template>
