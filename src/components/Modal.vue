<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, useId } from 'vue';
import AppIcon from './AppIcon.vue';
import { focusableElements, isTopLayer, registerLayer, unregisterLayer } from './overlayStack';
withDefaults(defineProps<{ title: string; wide?: boolean; bare?: boolean }>(), { wide: false, bare: false });
const emit = defineEmits<{ close: [] }>();
const layer = ref<HTMLElement>();
let mountedElement: HTMLElement | undefined;
const titleId = useId();
const opener = document.activeElement as HTMLElement | null;
function onKey(event: KeyboardEvent) {
  if (!layer.value || !isTopLayer(layer.value) || event.isComposing) return;
  if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); emit('close'); }
  if (event.key === 'Tab') {
    const items = focusableElements(layer.value);
    const first = items[0]; const last = items.at(-1);
    if (!first) { event.preventDefault(); layer.value.focus({ preventScroll: true }); }
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === layer.value)) { event.preventDefault(); last?.focus({ preventScroll: true }); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus({ preventScroll: true }); }
  }
}
function guardFocus(event: FocusEvent) {
  if (layer.value && isTopLayer(layer.value) && !layer.value.contains(event.target as Node)) {
    (focusableElements(layer.value)[0] ?? layer.value).focus({ preventScroll: true });
  }
}
onMounted(async () => {
  mountedElement = layer.value!;
  registerLayer(mountedElement);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('focusin', guardFocus);
  await nextTick();
  (layer.value!.querySelector<HTMLElement>('[data-initial-focus]') ?? focusableElements(layer.value!)[0] ?? layer.value!).focus({ preventScroll: true });
});
onUnmounted(() => {
  document.removeEventListener('keydown', onKey, true);
  document.removeEventListener('focusin', guardFocus);
  if (mountedElement) unregisterLayer(mountedElement);
  if (opener?.isConnected && !opener.closest('[inert]')) opener.focus({ preventScroll: true });
  else document.querySelector<HTMLElement>('#home-link')?.focus({ preventScroll: true });
});
</script>
<template>
  <Teleport to="body">
    <div ref="layer" class="modal-layer k-ios" :class="{ 'bare-layer': bare }" tabindex="-1" role="dialog" aria-modal="true" :aria-labelledby="bare ? undefined : titleId" :aria-label="bare ? title : undefined" @click.self="emit('close')">
      <slot v-if="bare" />
      <section v-else class="modal-surface" :class="{ 'wide-modal': wide }">
        <header class="modal-header">
          <div><slot name="eyebrow" /><h2 :id="titleId">{{ title }}</h2></div>
          <button type="button" class="icon-button close-button" aria-label="关闭面板" @click="emit('close')"><AppIcon name="close" /></button>
        </header>
        <div class="modal-content"><slot /></div>
        <footer v-if="$slots.footer" class="modal-footer"><slot name="footer" /></footer>
      </section>
    </div>
  </Teleport>
</template>
