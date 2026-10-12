<script setup lang="ts">
import type { Folder, ParentId } from '../domain/model';
import AppIcon from './AppIcon.vue';
defineProps<{ path: Folder[] }>();
const emit = defineEmits<{ navigate: [id: ParentId] }>();
</script>
<template>
  <nav class="breadcrumbs" aria-label="文件夹路径">
    <button type="button" @click="emit('navigate', null)">我的收藏</button>
    <template v-if="path.length > 3">
      <AppIcon name="chevron" :size="12" />
      <details class="path-overflow"><summary aria-label="展开中间路径">···</summary><div class="path-menu">
        <button v-for="folder in path.slice(0, -1)" :key="folder.id" type="button" @click="emit('navigate', folder.id)">{{ folder.title }}</button>
      </div></details>
      <AppIcon name="chevron" :size="12" /><span aria-current="page">{{ path.at(-1)?.title }}</span>
    </template>
    <template v-else v-for="(folder, index) in path" :key="folder.id">
      <AppIcon name="chevron" :size="12" />
      <span v-if="index === path.length - 1" aria-current="page">{{ folder.title }}</span>
      <button v-else type="button" @click="emit('navigate', folder.id)">{{ folder.title }}</button>
    </template>
  </nav>
</template>
