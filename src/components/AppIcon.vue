<script setup lang="ts">
import type { Component } from 'vue';
import { IconArrowUpRight, IconBookmark, IconCheck, IconCloud, IconChevronDown, IconChevronLeft, IconChevronRight, IconDownload, IconFolder, IconPlus, IconSearch, IconShieldCheck, IconSun, IconUpload, IconX } from '@tabler/icons-vue';

withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 });
const icons: Record<string, Component> = {
  search: IconSearch,
  folder: IconFolder,
  plus: IconPlus,
  close: IconX,
  back: IconChevronLeft,
  arrow: IconArrowUpRight,
  upload: IconUpload,
  download: IconDownload,
  sun: IconSun,
  chevron: IconChevronRight,
  'chevron-down': IconChevronDown,
  check: IconCheck,
  bookmark: IconBookmark,
  shield: IconShieldCheck,
  cloud: IconCloud,
};
</script>
<template>
  <component :is="icons[name] || IconBookmark" :size="size" :stroke-width="1.7" aria-hidden="true" />
</template>
