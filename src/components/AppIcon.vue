<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 });
const paths: Record<string, string> = {
  search: 'm21 21-4.4-4.4M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0',
  folder: 'M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z',
  plus: 'M12 5v14M5 12h14',
  close: 'm6 6 12 12M6 18 18 6',
  back: 'm14 6-6 6 6 6',
  arrow: 'm7 17 10-10M7 7h10v10',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4',
  download: 'M12 3v13m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4',
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  chevron: 'm9 6 6 6-6 6',
  check: 'm5 12 4 4L19 6',
  bookmark: 'M6 4h12v17l-6-4-6 4Z',
  shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z',
};
</script>
<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path :d="paths[name] || paths.bookmark" />
  </svg>
</template>
