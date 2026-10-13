import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { emptyData, rememberSearch, validateData, type AppData, type Engine } from '../domain/model';
import { loadData, persistData, STORAGE_KEY } from '../domain/storage';
import { supabase, authRedirectUrl, googleLoginEnabled } from '../lib/supabase';
import { CLOUD_TABLE, CLOUD_SAVE_FUNCTION, CloudConflict, cloudError, parseCloudDocument } from '../domain/cloud';
import type { User } from '@supabase/supabase-js';

export function useStart() {
  const data = ref<AppData>(emptyData());
  const storageError = ref<string | null>(null);
  const damagedRaw = ref<string | null>(null);
  const toast = ref('');
  const user = ref<User | null>(null);
  const cloudLoading = ref(false);
  const cloudReady = ref(false);
  const cloudErrorMessage = ref('');
  const saving = ref(false);
  const authenticating = ref(false);
  const authError = ref('');
  const googleEnabled = ref(false);
  const sessionReady = ref(false);
  const historyPending = ref(0);
  let historyQueue: Promise<void> = Promise.resolve();
  const historyWaits = new Set<() => void>();
  let revision = 0;
  let generation = 0;
  let disposed = false;
  let unsubscribe: (() => void) | undefined;
  let poll: ReturnType<typeof setInterval>;
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
    if (user.value) return;
    try {
      const result = loadData(localStorage);
      storageError.value = result.error; damagedRaw.value = result.raw;
      if (!result.error) data.value = result.data;
    } catch { storageError.value = '浏览器禁止访问本地存储，请检查隐私设置。'; }
  }
  async function refreshCloud() {
    if (!user.value || saving.value || cloudLoading.value) return;
    const token = generation;
    const userId = user.value.id;
    cloudLoading.value = true;
    try {
      const result = await supabase.from(CLOUD_TABLE).select('payload, revision').eq('user_id', userId).maybeSingle();
      if (token !== generation || disposed) return;
      if (result.error) throw cloudError(result.error);
      const document = result.data ? parseCloudDocument(result.data) : { data: emptyData(), revision: 0 };
      if (!cloudReady.value || document.revision !== revision) data.value = document.data;
      revision = document.revision;
      cloudReady.value = true;
      cloudErrorMessage.value = '';
    } catch (error) {
      if (token === generation && !disposed) {
        cloudReady.value = false;
        cloudErrorMessage.value = error instanceof Error ? error.message : '无法读取云端收藏。';
      }
    } finally { if (token === generation) cloudLoading.value = false; }
  }
  function switchUser(next: User | null) {
    if (disposed) return;
    sessionReady.value = true;
    if (user.value?.id === next?.id) { user.value = next; return; }
    generation++;
    user.value = next;
    cloudReady.value = false;
    cloudLoading.value = false;
    cloudErrorMessage.value = '';
    storageError.value = null;
    damagedRaw.value = null;
    revision = 0;
    data.value = emptyData();
    if (next) {
      // Auth callbacks must return before making another Supabase request.
      setTimeout(() => { if (!disposed) void refreshCloud(); }, 0);
    } else reload();
  }
  async function signIn(email: string, password: string): Promise<boolean> {
    if (authenticating.value || saving.value) return false;
    authenticating.value = true; authError.value = '';
    try {
      const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) {
        authError.value = result.error.code === 'invalid_credentials' ? '邮箱或密码不正确。' : result.error.code === 'email_not_confirmed' ? '请先打开注册邮件中的链接验证邮箱，再登录。' : '登录失败，请检查网络后重试。';
        return false;
      }
      switchUser(result.data.user);
      return true;
    } catch { authError.value = '登录失败，请检查网络后重试。'; return false; }
    finally { authenticating.value = false; }
  }
  async function signUp(email: string, password: string): Promise<'signed-in' | 'confirm-email' | null> {
    if (authenticating.value || saving.value) return null;
    authenticating.value = true; authError.value = '';
    try {
      const { data: result, error } = await supabase.auth.signUp({
        email: email.trim(), password, options: { emailRedirectTo: authRedirectUrl() },
      });
      if (error) {
        const messages: Record<string, string> = {
          user_already_exists: '此邮箱已注册，请切换到登录。',
          email_exists: '此邮箱已注册，请切换到登录。',
          signup_disabled: '注册暂未开放，请稍后再试。',
          weak_password: '密码不符合要求，请使用更长且包含字母、数字的密码。',
          over_email_send_rate_limit: '验证邮件发送过于频繁，请稍后再试。',
          over_request_rate_limit: '操作过于频繁，请稍后再试。',
          email_address_invalid: '请填写有效的邮箱地址。',
          email_address_not_authorized: '暂时无法向该邮箱发送验证邮件，请联系网站管理员。',
        };
        authError.value = messages[error.code ?? ''] ?? '注册失败，请检查网络后重试。';
        return null;
      }
      if (result.session) { switchUser(result.session.user); return 'signed-in'; }
      return 'confirm-email';
    } catch { authError.value = '注册失败，请检查网络后重试。'; return null; }
    finally { authenticating.value = false; }
  }
  async function checkLoginProviders() {
    try { googleEnabled.value = await googleLoginEnabled(); }
    catch { googleEnabled.value = false; }
  }
  async function signInWithGoogle() {
    if (!googleEnabled.value || authenticating.value || saving.value) return;
    authenticating.value = true; authError.value = '';
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: authRedirectUrl() } });
      if (error) throw error;
    } catch { authError.value = 'Google 登录暂时无法连接，请重试或使用邮箱登录。'; authenticating.value = false; }
  }
  async function signOut() {
    if (saving.value || authenticating.value) return;
    authenticating.value = true;
    try {
      // Do not revoke other applications' sessions in this shared Auth project.
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
      switchUser(null); notify('已退出，当前显示此浏览器的本地收藏。');
    } catch { notify('退出失败，请检查网络后重试。'); }
    finally { authenticating.value = false; }
  }
  async function commit(next: AppData, reset = false, silent = false): Promise<boolean> {
    const report = (message: string) => { if (!silent) notify(message); };
    if (!sessionReady.value || saving.value || authenticating.value) { report('正在处理，请稍后再保存。'); return false; }
    if (user.value) {
      if (!cloudReady.value || cloudLoading.value) { report('请等云端收藏加载完成，或重试连接后保存。'); return false; }
      const token = generation;
      saving.value = true;
      try {
        const validated = validateData(next);
        const result = await supabase.rpc(CLOUD_SAVE_FUNCTION, { yizhestart_payload: validated, yizhestart_expected_revision: revision });
        if (token !== generation || disposed) return false;
        if (result.error) throw cloudError(result.error);
        const saved = parseCloudDocument(result.data?.[0]);
        data.value = saved.data; revision = saved.revision;
        cloudErrorMessage.value = '';
        return true;
      } catch (error) {
        if (token !== generation || disposed) return false;
        saving.value = false;
        if (error instanceof CloudConflict) await refreshCloud();
        report(error instanceof Error ? error.message : '保存失败，修改尚未保存。');
        return false;
      } finally { saving.value = false; }
    }
    if (storageError.value && !reset) { report('请先处理本地数据异常，再保存修改。'); return false; }
    try {
      data.value = persistData(localStorage, next);
      storageError.value = null; damagedRaw.value = null;
      return true;
    } catch { report('保存失败：本地存储不可用或空间不足，修改尚未保存。'); return false; }
  }
  function waitForHistoryWrite(token: number): Promise<boolean> {
    const changed = () => disposed || token !== generation;
    const busy = () => !sessionReady.value || saving.value || authenticating.value || cloudLoading.value;
    const ready = () => !user.value || cloudReady.value;
    if (changed()) return Promise.resolve(false);
    if (!busy()) return Promise.resolve(ready());
    return new Promise(resolve => {
      const cancel = () => finish(false);
      const timer = setTimeout(cancel, 15000);
      const stop = watch([sessionReady, saving, authenticating, cloudLoading, user], () => {
        if (changed()) finish(false); else if (!busy()) finish(ready());
      }, { flush: 'sync' });
      function finish(ok: boolean) { clearTimeout(timer); stop(); historyWaits.delete(cancel); resolve(ok); }
      historyWaits.add(cancel);
    });
  }
  function queueHistoryChange(operation: (current: AppData) => AppData): Promise<boolean> {
    const token = generation; historyPending.value++;
    const result = historyQueue.then(async () => {
      try {
        // Rebase only the history operation on the latest document after a CAS
        // conflict. Never retry a stale snapshot of bookmarks or preferences.
        for (let attempt = 0; attempt < 2; attempt++) {
          if (!await waitForHistoryWrite(token)) break;
          const next = operation(data.value);
          if (next === data.value || await commit(next, false, true)) return true;
          if (token !== generation || disposed) return false;
        }
        if (token === generation && !disposed) notify('搜索历史未能保存，请检查存储或云端连接。');
        return false;
      } finally { historyPending.value--; }
    });
    historyQueue = result.then(() => {}, () => {});
    return result;
  }
  function recordSearch(query: string, engine: Engine) {
    const searchedAt = Date.now();
    return queueHistoryChange(current => rememberSearch(current, query, engine, searchedAt));
  }
  async function clearSearchHistory() {
    if (await queueHistoryChange(current => ({ ...current, searchHistory: [] }))) notify('搜索历史已清空。');
  }
  function localBackup(): AppData {
    const result = loadData(localStorage);
    if (result.error) throw new Error('本地收藏有异常，请先退出登录并处理原始数据。');
    return result.data;
  }
  function onStorage(event: StorageEvent) {
    if (!user.value && event.storageArea === localStorage && (event.key === STORAGE_KEY || event.key === null)) {
      reload(); notify(storageError.value ? '另一标签页的数据无法读取，原内容仍保留。' : '已同步另一标签页的修改。');
    }
  }
  function onMedia(event: MediaQueryListEvent) { systemDark.value = event.matches; }
  function onFocus() { if (user.value) void refreshCloud(); }
  onMounted(() => {
    const callback = new URLSearchParams(location.hash.slice(1));
    if (callback.has('error') || callback.has('error_description')) {
      authError.value = '登录或验证链接已失效，请重新登录或注册。';
      history.replaceState(null, '', location.pathname + location.search);
    }
    reload(); addEventListener('storage', onStorage); addEventListener('focus', onFocus); media.addEventListener('change', onMedia);
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => switchUser(session?.user ?? null));
    unsubscribe = () => listener.subscription.unsubscribe();
    void supabase.auth.getSession().then(({ data: session, error }) => {
      if (disposed || sessionReady.value) return;
      if (error) { sessionReady.value = true; authError.value = '无法恢复登录，请重新登录。'; }
      else switchUser(session.session?.user ?? null);
    }).catch(() => { if (!disposed) { sessionReady.value = true; authError.value = '无法恢复登录，请重新登录。'; } });
    poll = setInterval(() => { if (document.visibilityState === 'visible') void refreshCloud(); }, 30000);
  });
  onUnmounted(() => {
    disposed = true; generation++; historyWaits.forEach(cancel => cancel()); unsubscribe?.(); clearInterval(poll); clearTimeout(timer);
    removeEventListener('storage', onStorage); removeEventListener('focus', onFocus); media.removeEventListener('change', onMedia);
  });
  function parseImport(text: string): AppData { return validateData(JSON.parse(text)); }
  return { data, dark, toast, storageError, damagedRaw, notify, commit, parseImport,
    user, cloudLoading, cloudReady, cloudErrorMessage, saving, authenticating, authError, sessionReady, googleEnabled,
    signIn, signUp, signInWithGoogle, checkLoginProviders, signOut, refreshCloud, localBackup,
    recordSearch, clearSearchHistory, historyPending };
}
