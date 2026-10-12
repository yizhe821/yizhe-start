import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { emptyData, validateData, type AppData } from '../domain/model';
import { loadData, persistData, STORAGE_KEY } from '../domain/storage';

export function useStart() {
  const data = ref<AppData>(emptyData());
  const storageError = ref<string | null>(null);
  const damagedRaw = ref<string | null>(null);
  const toast = ref('');
  let timer: ReturnType<typeof setTimeout>;
  const media = matchMedia('(prefers-color-scheme: dark)');
  const systemDark = ref(media.matches);
  const dark = computed(() => data.value.preferences.appearance === 'dark' || (data.value.preferences.appearance === 'system' && systemDark.value));
  watch(dark, value => {
    document.documentElement.classList.toggle('dark', value);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', value ? '#000000' : '#f2f2f7');
  }, { immediate: true });
  function notify(message: string) { toast.value = message; clearTimeout(timer); timer = setTimeout(() => { toast.value = ''; }, 4000); }
  function reload() {
    try {
      const result = loadData(localStorage);
      storageError.value = result.error; damagedRaw.value = result.raw;
      if (!result.error) data.value = result.data;
    } catch { storageError.value = '浏览器禁止访问本地存储，请检查隐私设置。'; }
  }
  function commit(next: AppData, reset = false): boolean {
    if (storageError.value && !reset) { notify('请先处理本地数据异常，再保存修改。'); return false; }
    try {
      data.value = persistData(localStorage, next);
      storageError.value = null; damagedRaw.value = null;
      return true;
    } catch { notify('保存失败：本地存储不可用或空间不足，修改尚未保存。'); return false; }
  }
  function onStorage(event: StorageEvent) {
    if (event.storageArea === localStorage && (event.key === STORAGE_KEY || event.key === null)) {
      reload(); notify(storageError.value ? '另一标签页的数据无法读取，原内容仍保留。' : '已同步另一标签页的修改。');
    }
  }
  function onMedia(event: MediaQueryListEvent) { systemDark.value = event.matches; }
  onMounted(() => { reload(); addEventListener('storage', onStorage); media.addEventListener('change', onMedia); });
  onUnmounted(() => { clearTimeout(timer); removeEventListener('storage', onStorage); media.removeEventListener('change', onMedia); });
  function parseImport(text: string): AppData { return validateData(JSON.parse(text)); }
  return { data, dark, toast, storageError, damagedRaw, notify, commit, parseImport };
}
