<script setup lang="ts">
import type { Entry } from '../domain/model';
import AppIcon from './AppIcon.vue';
defineProps<{ entries: Entry[]; allNodes: Entry[] }>();
const emit = defineEmits<{ open: [id: string]; actions: [id: string] }>();
function domain(node: Entry) { return node.kind === 'bookmark' ? new URL(node.url).hostname.replace(/^www\./, '') : ''; }
function tint(node: Entry) { return ['blue', 'purple', 'orange', 'green'][[...node.title].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4]; }
</script>
<template>
  <div class="entry-grid">
    <article v-for="entry in entries" :key="entry.id" class="entry-card" :data-entry-id="entry.id">
      <button type="button" class="entry-more" :aria-label="`管理${entry.title}`" @click="emit('actions', entry.id)"><span aria-hidden="true">···</span></button>
      <button v-if="entry.kind === 'folder'" type="button" class="entry-main" @click="emit('open', entry.id)">
        <span class="entry-symbol" :class="tint(entry)"><AppIcon name="folder" :size="28" /></span>
        <span class="entry-title">{{ entry.title }}</span>
        <span class="entry-meta">{{ allNodes.filter(n => n.parentId === entry.id).length }} 个项目</span>
      </button>
      <a v-else class="entry-main" :href="entry.url" target="_blank" rel="noopener noreferrer">
        <span class="entry-symbol bookmark-symbol" :class="tint(entry)">{{ entry.title.slice(0, 1).toLocaleUpperCase() }}</span>
        <span class="entry-title">{{ entry.title }}</span>
        <span class="entry-meta">{{ domain(entry) }}</span>
        <AppIcon class="external-arrow" name="arrow" :size="14" />
      </a>
    </article>
  </div>
</template>
