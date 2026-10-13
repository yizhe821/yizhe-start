<script setup lang="ts">
import type { Component } from 'vue';
import { IconBrandBing, IconBrandGoogle, IconBrandYandex } from '@tabler/icons-vue';
import type { Engine } from '../domain/model';
defineProps<{ engine: Engine }>();
const icons: Record<Engine, { component: Component; color: string }> = {
  bing: { component: IconBrandBing, color: '#008373' },
  google: { component: IconBrandGoogle, color: '#4285f4' },
  yandex: { component: IconBrandYandex, color: '#fc3f1d' },
};
</script>

<template>
  <component :is="icons[engine].component" class="engine-icon" :size="22" :stroke-width="2" :color="icons[engine].color" aria-hidden="true" />
</template>
