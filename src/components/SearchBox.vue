<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { kButton } from 'konsta/vue';
import AppIcon from './AppIcon.vue';
import SearchEnginePicker from './SearchEnginePicker.vue';
import { SEARCH_QUERY_LIMIT, type Engine, type SearchHistoryEntry } from '../domain/model';
import { suggestionSource } from '../domain/suggestions';
import { fetchSuggestions } from '../lib/searchSuggestions';

const props = defineProps<{ engine: Engine; history: SearchHistoryEntry[]; historyLoading: boolean; historyBusy: boolean }>();
const emit = defineEmits<{ search: [query: string]; changeEngine: [engine: Engine]; clearHistory: [] }>();
const root = ref<HTMLFormElement>(); const input = ref<HTMLInputElement>();
const query = ref(''); const focused = ref(false); const open = ref(false); const composing = ref(false);
const active = ref(-1); const suggestions = ref<string[]>([]); const loading = ref(false); const failed = ref(false);
const isHistory = computed(() => !query.value.trim());
const visible = computed(() => focused.value && open.value && !composing.value);
const localMatches = computed(() => props.history.filter(item => item.query.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())).map(item => item.query).slice(0, 8));
const options = computed(() => isHistory.value ? props.history.slice(0, 8).map(item => item.query) : suggestions.value.length ? suggestions.value : localMatches.value);
let debounce: ReturnType<typeof setTimeout>;
let controller: AbortController | undefined; let requestId = 0;
function cancelRequest() { clearTimeout(debounce); controller?.abort(); controller = undefined; requestId++; }
watch([query, () => props.engine, visible], () => {
  cancelRequest(); active.value = -1; suggestions.value = []; failed.value = false; loading.value = false;
  const text = query.value.trim();
  if (!visible.value || !text || text.length > SEARCH_QUERY_LIMIT) return;
  const token = requestId; loading.value = true;
  debounce = setTimeout(async () => {
    controller = new AbortController();
    try {
      const values = await fetchSuggestions(props.engine, text, controller.signal);
      if (token === requestId) suggestions.value = values;
    } catch (error) {
      if (token === requestId && !(error instanceof DOMException && error.name === 'AbortError')) failed.value = true;
    } finally { if (token === requestId) loading.value = false; }
  }, 200);
});
watch(options, values => { if (active.value >= values.length) active.value = -1; });
function focus() { focused.value = true; open.value = true; }
function blur(event: FocusEvent) {
  const next = event.relatedTarget as Node;
  if (next !== input.value && !root.value?.querySelector('.search-panel')?.contains(next)) {
    focused.value = false; open.value = false; active.value = -1;
  }
}
function outside(event: PointerEvent) { if (!root.value?.contains(event.target as Node)) { open.value = false; active.value = -1; } }
function submit() {
  if (composing.value || !query.value.trim()) return;
  const text = query.value.trim(); open.value = false; active.value = -1; emit('search', text);
}
function choose(text: string) { query.value = text; input.value?.focus(); submit(); }
function clear() { query.value = ''; input.value?.focus(); focus(); }
function keydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229 || composing.value) {
    if (event.key === 'Enter') event.preventDefault(); return;
  }
  if (event.key === 'Escape') { event.preventDefault(); open.value = false; active.value = -1; return; }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault(); open.value = true;
    if (options.value.length) active.value = (active.value + (event.key === 'ArrowDown' ? 1 : active.value === -1 ? 0 : -1) + options.value.length) % options.value.length;
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault(); if (visible.value && options.value[active.value]) choose(options.value[active.value]); else submit();
  }
}
onMounted(() => document.addEventListener('pointerdown', outside));
onUnmounted(() => { cancelRequest(); document.removeEventListener('pointerdown', outside); });
</script>

<template>
  <form ref="root" class="search-form" role="search" @submit.prevent="submit" @focusout="blur">
    <div class="search-row" :class="{ 'search-expanded': visible }">
      <SearchEnginePicker :engine="engine" @change="emit('changeEngine', $event)" />
      <div class="hero-search search-input-wrap">
        <input id="start-search" ref="input" v-model="query" name="query" type="search" placeholder="想去哪里？搜索一下" aria-label="搜索关键词" role="combobox" autocomplete="off" aria-autocomplete="list" :aria-expanded="visible" aria-controls="search-options" :aria-activedescendant="visible && active >= 0 ? `search-option-${active}` : undefined" @focus="focus" @click="open = true" @input="open = true" @keydown="keydown" @compositionstart="composing = true" @compositionend="composing = false" />
        <button v-if="query" type="button" class="clear-search" aria-label="清空搜索" @pointerdown.prevent @click="clear"><AppIcon name="close" :size="15" /></button>
      </div>
      <kButton class="search-submit" type="submit" aria-label="搜索"><AppIcon name="arrow" :size="21" /></kButton>
    </div>
    <section v-if="visible" class="search-panel" :aria-label="isHistory ? '搜索历史' : '搜索建议'" @pointerdown.prevent>
      <div class="search-panel-header"><span>{{ isHistory ? '搜索历史' : `${suggestionSource(engine)} 搜索建议` }}</span><button v-if="isHistory && history.length" type="button" class="text-button" :disabled="historyBusy" @click="emit('clearHistory')">清空历史</button></div>
      <ul id="search-options" class="search-options" role="listbox" :aria-label="isHistory ? '搜索历史记录' : '搜索建议记录'">
        <li v-for="(text, index) in options" :id="`search-option-${index}`" :key="text" role="option" :aria-selected="active === index" class="search-option" @pointermove="active = index" @click="choose(text)"><AppIcon :name="isHistory ? 'clock' : 'search'" :size="17" /><span>{{ text }}</span><AppIcon name="arrow" :size="14" /></li>
      </ul>
      <p v-if="isHistory && !options.length" class="search-panel-message">{{ historyLoading ? '正在读取搜索历史…' : '暂无搜索历史，搜索后会显示在这里。' }}</p>
      <p v-else-if="!isHistory" class="search-panel-message" aria-live="polite">{{ loading ? '正在获取建议…' : failed ? '联想暂时不可用，可继续搜索。' : !options.length ? '暂无建议，按 Enter 搜索。' : '' }}</p>
    </section>
  </form>
</template>
