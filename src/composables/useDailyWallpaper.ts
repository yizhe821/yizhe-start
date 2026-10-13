import { onMounted, onUnmounted, ref } from 'vue';
import { parseWallpaper, type Wallpaper } from '../domain/wallpaper';

export function useDailyWallpaper() {
  const wallpaper = ref<Wallpaper | null>(null);
  let disposed = false; let refreshing = false;
  let controller: AbortController | undefined;
  let stopImage: (() => void) | undefined;
  let interval: ReturnType<typeof setInterval>;
  function preload(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const image = new Image(); image.referrerPolicy = 'no-referrer';
      const timer = setTimeout(() => finish(false), 12000);
      function finish(ok: boolean) {
        clearTimeout(timer); image.onload = null; image.onerror = null; stopImage = undefined;
        if (ok) resolve(); else { image.src = ''; reject(new Error('Wallpaper image unavailable')); }
      }
      stopImage = () => finish(false);
      image.onload = () => finish(true); image.onerror = () => finish(false); image.src = url;
    });
  }
  async function refresh() {
    if (disposed || refreshing || document.visibilityState !== 'visible') return;
    refreshing = true; controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 8000);
    try {
      const url = new URL(`${import.meta.env.BASE_URL}bing-wallpaper.json`, location.origin);
      url.searchParams.set('v', String(Math.floor(Date.now() / 1800000)));
      const response = await fetch(url, { cache: 'no-cache', signal: controller.signal });
      if (!response.ok) throw new Error('Wallpaper metadata unavailable');
      const next = parseWallpaper(await response.json());
      if (wallpaper.value && next.date < wallpaper.value.date) return;
      if (wallpaper.value?.imageUrl !== next.imageUrl) await preload(next.imageUrl);
      if (!disposed) wallpaper.value = next;
    } catch { /* Retain the loaded image, or the soft gradient before first load. */ }
    finally { clearTimeout(timeout); refreshing = false; }
  }
  function onVisible() { if (document.visibilityState === 'visible') void refresh(); }
  onMounted(() => { void refresh(); interval = setInterval(onVisible, 1800000); document.addEventListener('visibilitychange', onVisible); });
  onUnmounted(() => { disposed = true; controller?.abort(); stopImage?.(); clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); });
  return { wallpaper, refreshWallpaper: refresh };
}
