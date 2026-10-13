<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { BaseClock } from '@clock-ui/vue';
import '@clock-ui/vue/base.css';

const now = ref(new Date());
const timeFormat = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const dateFormat = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
const time = computed(() => timeFormat.format(now.value));
const date = computed(() => dateFormat.format(now.value));
let timer: ReturnType<typeof setInterval> | undefined;
function update() { now.value = new Date(); }

onMounted(() => {
  timer = setInterval(update, 1000);
  document.addEventListener('visibilitychange', update);
});
onUnmounted(() => {
  clearInterval(timer);
  document.removeEventListener('visibilitychange', update);
});
</script>

<template>
  <div class="date-time" aria-label="日期时间">
    <BaseClock class="analog-clock" :hours="now.getHours()" :minutes="now.getMinutes()" :seconds="now.getSeconds()" :dual-tone="false" no-border cardinal-only :aria-label="`当前时间 ${time}`" />
    <div class="clock-copy">
      <time class="clock-time" :datetime="now.toISOString()">{{ time }}</time>
      <p class="clock-date">{{ date }}</p>
    </div>
  </div>
</template>
