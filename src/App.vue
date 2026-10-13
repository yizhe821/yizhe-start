<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { kApp, kButton, kDialog, kDialogButton, kList, kListInput, kListButton, kSearchbar, kToast } from 'konsta/vue';
import DateTime from './components/DateTime.vue';
import SearchEnginePicker from './components/SearchEnginePicker.vue';
import AppIcon from './components/AppIcon.vue';
import Modal from './components/Modal.vue';
import EntryGrid from './components/EntryGrid.vue';
import Breadcrumbs from './components/Breadcrumbs.vue';
import { useStart } from './composables/useStart';
import { offerPasswordSave } from './lib/passwordManager';
import { children, deleteEntry, descendants, emptyData, engines, moveEntry, pathTo, reorderEntry, saveEntry, searchUrl, type AppData, type Appearance, type Engine, type Entry, type ParentId } from './domain/model';

const { data, dark, toast, storageError, damagedRaw, notify, commit, parseImport,
  user, cloudLoading, cloudReady, cloudErrorMessage, saving, authenticating, authError, sessionReady, googleEnabled,
  signIn, signUp, signInWithGoogle, checkLoginProviders, signOut, refreshCloud, localBackup } = useStart();
const accountOpen = ref(false);
const email = ref('');
const password = ref('');
const passwordConfirmation = ref('');
const authMode = ref<'login' | 'register'>('login');
const authNotice = ref('');
const syncLabel = computed(() => !sessionReady.value ? '恢复登录中…' : !user.value ? '收藏保存在当前浏览器' : saving.value ? '正在保存到云端…' : cloudLoading.value ? '正在同步云端收藏…' : cloudErrorMessage.value ? '云端连接需要处理' : '收藏已连接云端');
async function submitAccount() {
  authError.value = ''; authNotice.value = '';
  if (authMode.value === 'register' && password.value !== passwordConfirmation.value) { authError.value = '两次输入的密码不一致。'; return; }
  // Capture values before Auth switches the rendered form to the account panel.
  const accountEmail = email.value; const accountPassword = password.value;
  const result = authMode.value === 'register' ? await signUp(accountEmail, accountPassword) : await signIn(accountEmail, accountPassword);
  if (result === true || result === 'signed-in') {
    offerPasswordSave(accountEmail, accountPassword);
    password.value = ''; passwordConfirmation.value = '';
    notify(authMode.value === 'register' ? '注册成功，已登录。' : '已登录，正在读取云端收藏。');
  } else if (result === 'confirm-email') {
    password.value = ''; passwordConfirmation.value = ''; authMode.value = 'login';
    authNotice.value = '请查看邮箱中的验证邮件，打开链接后返回登录；已注册的邮箱可直接登录。';
  }
}
function changeAuthMode(mode: 'login' | 'register') {
  authMode.value = mode; authError.value = ''; authNotice.value = ''; password.value = ''; passwordConfirmation.value = '';
  nextTick(() => document.querySelector<HTMLInputElement>('#account-email')?.focus());
}
function closeAccount() { if (!authenticating.value && !saving.value) { accountOpen.value = false; password.value = ''; passwordConfirmation.value = ''; } }
watch(accountOpen, open => { if (open) void checkLoginProviders(); });
watch(authError, error => { if (error) accountOpen.value = true; });
const query = ref('');
const composing = ref(false);
const fileInput = ref<HTMLInputElement>();
const folderOpen = ref(false);
const activeFolder = ref<ParentId>(null);
const rootEntries = computed(() => children(data.value.nodes, null));
const currentEntries = computed(() => children(data.value.nodes, activeFolder.value));
const currentPath = computed(() => pathTo(data.value.nodes, activeFolder.value));
const stats = computed(() => ({ folders: data.value.nodes.filter(n => n.kind === 'folder').length, bookmarks: data.value.nodes.filter(n => n.kind === 'bookmark').length }));
const actionId = ref<string | null>(null);
const actionNode = computed(() => data.value.nodes.find(n => n.id === actionId.value));
const moveId = ref<string | null>(null);
const moveTarget = ref<ParentId>(null);
const moveNode = computed(() => data.value.nodes.find(n => n.id === moveId.value));
const forbiddenTargets = computed(() => moveId.value ? new Set([moveId.value, ...descendants(data.value.nodes, moveId.value)]) : new Set<string>());
const targetFolders = computed(() => children(data.value.nodes, moveTarget.value).filter(n => n.kind === 'folder' && !forbiddenTargets.value.has(n.id)));
const targetPath = computed(() => pathTo(data.value.nodes, moveTarget.value));
type Editor = { id?: string; kind: Entry['kind']; title: string; url: string; parentId: ParentId; initialTitle: string; initialUrl: string };
const editor = ref<Editor | null>(null);
const editorError = ref('');
type Confirmation = { title: string; message: string; label: string; danger?: boolean; action: () => void | Promise<void> };
const confirmation = ref<Confirmation | null>(null);

watch(() => user.value?.id, () => {
  editor.value = null; confirmation.value = null; actionId.value = null; moveId.value = null;
  folderOpen.value = false; activeFolder.value = null;
});
function migrateLocal() {
  try {
    const backup = localBackup();
    confirmation.value = { title: '将本地收藏保存到此账号？', message: `本地有 ${backup.nodes.length} 个条目。这会替换此账号的全部云端收藏和偏好，本地原数据继续保留。建议先导出当前云端收藏。`, label: '确认迁移', action: async () => {
      if (await commit(backup)) notify('本地收藏已保存到云端，本地原数据仍保留。');
    } };
  } catch (error) { notify(error instanceof Error ? error.message : '无法读取本地收藏。'); }
}

watch(() => data.value.nodes, (nodes, oldNodes) => {
  if (activeFolder.value) {
    const previous = oldNodes.find(n => n.id === activeFolder.value);
    const current = nodes.find(n => n.id === activeFolder.value);
    if (!current || current.parentId !== previous?.parentId) {
      let fallback = previous?.parentId ?? null;
      while (fallback && !nodes.some(n => n.id === fallback && n.kind === 'folder')) fallback = oldNodes.find(n => n.id === fallback)?.parentId ?? null;
      activeFolder.value = fallback;
      if (fallback === null) folderOpen.value = false;
    }
  }
  if (actionId.value && !nodes.some(n => n.id === actionId.value)) actionId.value = null;
  if (moveId.value && !nodes.some(n => n.id === moveId.value)) { moveId.value = null; notify('待移动条目已不存在。'); }
  if (moveTarget.value && !nodes.some(n => n.id === moveTarget.value && n.kind === 'folder')) moveTarget.value = null;
});
async function perform(action: () => AppData, message: string) {
  try { if (await commit(action())) { notify(message); return true; } } catch (error) { notify(error instanceof Error ? error.message : '操作失败。'); }
  return false;
}
function openFolder(id: string) { activeFolder.value = id; folderOpen.value = true; }
function navigateFolder(id: ParentId) { activeFolder.value = id; if (id === null) folderOpen.value = false; }
function changeEngine(engine: Engine) { perform(() => ({ ...data.value, preferences: { ...data.value.preferences, searchEngine: engine } }), `已切换到 ${engines.find(e => e.id === engine)?.label}`); }
function changeAppearance(event: Event) { perform(() => ({ ...data.value, preferences: { ...data.value.preferences, appearance: (event.target as HTMLSelectElement).value as Appearance } }), '外观已更新。'); }
function submitSearch() {
  if (composing.value) return;
  const url = searchUrl(data.value.preferences.searchEngine, query.value);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}
function searchKey(event: KeyboardEvent) {
  if (event.key === 'Enter' && (event.isComposing || event.keyCode === 229 || composing.value)) event.preventDefault();
}
function openEditor(kind: Entry['kind'], node?: Entry) {
  actionId.value = null; editorError.value = '';
  editor.value = { id: node?.id, kind, title: node?.title ?? '', url: node?.kind === 'bookmark' ? node.url : '', parentId: node ? node.parentId : folderOpen.value ? activeFolder.value : null, initialTitle: node?.title ?? '', initialUrl: node?.kind === 'bookmark' ? node.url : '' };
}
function closeEditor() {
  if (saving.value) return;
  if (editor.value && (editor.value.title !== editor.value.initialTitle || editor.value.url !== editor.value.initialUrl)) {
    confirmation.value = { title: '放弃修改？', message: '还有未保存的内容，关闭后这些修改会丢失。', label: '放弃修改', danger: true, action: () => { editor.value = null; } };
  } else editor.value = null;
}
async function saveEditor() {
  if (!editor.value) return;
  try {
    const next = saveEntry(data.value, editor.value);
    if (await commit(next)) { editor.value = null; notify('已保存到收藏。'); }
  } catch (error) { editorError.value = error instanceof Error ? error.message : '请检查填写的内容。'; }
}
function deleteRequest(node: Entry) {
  actionId.value = null;
  const ids = descendants(data.value.nodes, node.id); ids.add(node.id);
  const signature = [...ids].sort().join('|');
  const folders = data.value.nodes.filter(n => ids.has(n.id) && n.kind === 'folder').length;
  const bookmarks = data.value.nodes.filter(n => ids.has(n.id) && n.kind === 'bookmark').length;
  confirmation.value = { title: `删除“${node.title}”？`, message: node.kind === 'folder' ? `将删除 ${folders} 个文件夹（含当前文件夹）和 ${bookmarks} 个书签。此操作无法撤销，可先取消并导出备份。` : '此书签将从收藏中删除，操作无法撤销。', label: '删除', danger: true, action: () => {
    const latest = descendants(data.value.nodes, node.id); latest.add(node.id);
    if ([...latest].sort().join('|') !== signature) { notify('文件夹内容已变化，请重新确认删除。'); return; }
    perform(() => deleteEntry(data.value, node.id), '已删除。');
  } };
}
function openMove(node: Entry) { actionId.value = null; moveId.value = node.id; moveTarget.value = node.parentId; }
async function confirmMove() {
  if (moveId.value && await perform(() => moveEntry(data.value, moveId.value!, moveTarget.value), '已移动。')) moveId.value = null;
}
async function reorder(node: Entry, direction: -1 | 1) {
  if (await perform(() => reorderEntry(data.value, node.id, direction), '顺序已调整。')) actionId.value = null;
}
function canReorder(node: Entry, direction: -1 | 1) {
  const siblings = children(data.value.nodes, node.parentId); return !!siblings[siblings.findIndex(n => n.id === node.id) + direction];
}
function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportData() { download(JSON.stringify(data.value, null, 2), `yizhe-start-${new Intl.DateTimeFormat('sv-SE').format(new Date())}.json`); notify('备份已导出。'); }
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = '';
  if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('备份超过 10 MB，请检查文件是否正确。');
    const imported = parseImport(await file.text());
    const folders = imported.nodes.filter(n => n.kind === 'folder').length;
    confirmation.value = { title: '替换当前收藏？', message: `备份包含 ${folders} 个文件夹、${imported.nodes.length - folders} 个书签。导入会替换${user.value ? '此账号的云端' : '本地'}全部收藏和偏好设置。`, label: '确认导入', action: async () => {
      if (await commit(imported, true)) { folderOpen.value = false; activeFolder.value = null; notify('备份已导入。'); }
    } };
  } catch (error) { notify(error instanceof Error ? error.message : '无法读取该备份。'); }
}
function resetRequest() { confirmation.value = { title: '重置本地数据？', message: '建议先下载异常数据留作备份。确认后将创建一个空的收藏目录。', label: '重置', danger: true, action: async () => { if (await commit(emptyData(), true)) { folderOpen.value = false; activeFolder.value = null; notify('本地数据已重置。'); } } }; }
function acceptConfirmation() { const pending = confirmation.value; confirmation.value = null; pending?.action(); }
function inputValue(event: Event) { return (event.target as HTMLInputElement).value; }
function labelSearch() {
  const search = document.querySelector<HTMLInputElement>('#start-search');
  search?.setAttribute('aria-label', '搜索关键词'); search?.setAttribute('autocomplete', 'off');
  document.querySelector('.hero-search button')?.setAttribute('aria-label', '清空搜索');
}
nextTick(labelSearch);
watch(query, () => nextTick(labelSearch));
</script>

<template>
  <k-app theme="ios" :dark="dark" :ios-hover-highlight="false" class="start-app">
    <div class="page-shell">
      <header class="topbar">
        <a id="home-link" href="#" class="brand" @click.prevent="folderOpen = false"><span class="brand-mark">y<span>·</span></span><span>Yizhe<span class="brand-secondary"> / Start</span></span></a>
        <div class="topbar-actions">
          <label class="theme-control"><AppIcon name="sun" :size="17" /><span class="sr-only">外观主题</span><select :value="data.preferences.appearance" aria-label="外观主题" @change="changeAppearance"><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
          <button type="button" class="toolbar-button" @click="fileInput?.click()"><AppIcon name="download" :size="17" /><span>导入</span></button>
          <button type="button" class="toolbar-button" @click="exportData"><AppIcon name="upload" :size="17" /><span>导出</span></button>
          <button type="button" class="toolbar-button account-button" @click="accountOpen = true" :aria-label="user ? '管理云端账号' : '登录云端账号'"><AppIcon name="cloud" :size="17" /><span>{{ user ? '账号' : '登录' }}</span></button>
        </div>
      </header>

      <section v-if="storageError" class="storage-warning" role="alert">
        <strong>本地数据需要处理</strong><p>{{ storageError }} 原始数据没有被覆盖。</p>
        <div class="flex flex-wrap gap-2"><k-button v-if="damagedRaw !== null" type="button" outline @click="download(damagedRaw!, 'yizhe-start-recovery.json')">下载原始数据</k-button><k-button type="button" outline @click="fileInput?.click()">导入备份</k-button><k-button type="button" clear @click="resetRequest">重置</k-button></div>
      </section>

      <section v-if="cloudErrorMessage" class="storage-warning" role="alert">
        <strong>云端连接需要处理</strong><p>{{ cloudErrorMessage }}</p>
        <k-button type="button" outline :disabled="cloudLoading || saving" @click="refreshCloud">重试连接</k-button>
      </section>

      <main>
        <section class="hero" aria-label="搜索与日期时间">
          <form class="search-form" @submit.prevent="submitSearch" @keydown="searchKey" @compositionstart="composing = true" @compositionend="composing = false">
            <div class="search-row">
              <SearchEnginePicker :engine="data.preferences.searchEngine" @change="changeEngine" />
              <k-searchbar class="hero-search" input-id="start-search" placeholder="想去哪里？搜索一下" :value="query" @input="query = inputValue($event)" @clear="query = ''" />
              <k-button class="search-submit" type="submit" aria-label="搜索"><AppIcon name="arrow" :size="21" /></k-button>
            </div>
          </form>
          <DateTime />
        </section>

        <section class="collection" aria-labelledby="collection-title">
          <header class="collection-header"><div><span class="section-eyebrow">A PLACE FOR YOUR FAVORITES</span><h2 id="collection-title">我的收藏 <span class="count-badge">{{ rootEntries.length }}</span></h2></div>
            <div class="collection-actions"><k-button type="button" clear class="add-bookmark" @click="openEditor('bookmark')"><AppIcon name="bookmark" :size="17" />添加书签</k-button><k-button type="button" class="new-folder" @click="openEditor('folder')"><AppIcon name="plus" :size="18" />新建文件夹</k-button></div>
          </header>
          <EntryGrid v-if="rootEntries.length" :entries="rootEntries" :all-nodes="data.nodes" @open="openFolder" @actions="actionId = $event" />
          <div v-else class="empty-state home-empty">
            <div class="empty-illustration"><span class="empty-orbit orbit-one"></span><span class="empty-orbit orbit-two"></span><span class="empty-folder"><AppIcon name="folder" :size="44" /></span><span class="empty-spark">+</span></div>
            <h3>给喜欢的网站，留一个位置。</h3><p>把工作、灵感与日常装进文件夹。<br />下次打开，就能轻松找到。</p>
            <k-button type="button" class="empty-cta" @click="openEditor('folder')"><AppIcon name="plus" :size="17" />创建第一个文件夹</k-button>
            <button type="button" class="text-button import-empty" @click="fileInput?.click()">已有备份？导入收藏 <AppIcon name="chevron" :size="13" /></button>
          </div>
        </section>
      </main>
      <footer class="page-footer"><span aria-live="polite"><AppIcon :name="user ? 'cloud' : 'shield'" :size="14" />{{ syncLabel }}</span><span>{{ stats.folders }} 个文件夹<span class="footer-dot">·</span>{{ stats.bookmarks }} 个书签</span></footer>
      <input ref="fileInput" class="sr-only" type="file" accept=".json,application/json" aria-label="导入收藏备份" tabindex="-1" @change="importFile" />
    </div>

    <Modal v-if="accountOpen" :title="user ? '云端账号' : authMode === 'register' ? '注册 Yizhe Start' : '登录 Yizhe Start'" @close="closeAccount">
      <template v-if="user">
        <p class="account-email">{{ user.email }}</p>
        <p class="dialog-description">{{ syncLabel }}。登录同一账号可在不同设备使用收藏。</p>
        <p v-if="cloudErrorMessage" class="form-error" role="alert">{{ cloudErrorMessage }}</p>
        <div class="account-actions">
          <k-button type="button" outline :disabled="cloudLoading || saving" @click="refreshCloud">同步最新收藏</k-button>
          <k-button type="button" outline :disabled="!cloudReady || cloudLoading || saving" @click="migrateLocal">迁移本地收藏到云端</k-button>
          <k-button type="button" clear :disabled="saving || authenticating" @click="signOut">退出登录</k-button>
        </div>
      </template>
      <template v-else>
        <p class="dialog-description">{{ authMode === 'register' ? '创建你的账号，在不同设备使用自己的收藏。' : '登录你的账号，让常用网站随你一起。' }}</p>
        <div class="auth-tabs" aria-label="账号操作">
          <button type="button" :aria-pressed="authMode === 'login'" :disabled="authenticating" @click="changeAuthMode('login')">登录</button>
          <button type="button" :aria-pressed="authMode === 'register'" :disabled="authenticating" @click="changeAuthMode('register')">注册</button>
        </div>
        <form :id="authMode === 'register' ? 'signup-form' : 'login-form'" :key="authMode" method="post" autocomplete="on" @submit.prevent="submitAccount">
          <div class="auth-fields">
            <div class="auth-field"><label for="account-email">邮箱</label><input id="account-email" v-model="email" class="field-input" name="email" type="email" autocomplete="username" autocapitalize="none" :spellcheck="false" data-initial-focus required :readonly="authenticating" /></div>
            <div class="auth-field"><label :for="authMode === 'register' ? 'new-password' : 'current-password'">密码</label><input :id="authMode === 'register' ? 'new-password' : 'current-password'" v-model="password" class="field-input" name="password" type="password" :autocomplete="authMode === 'register' ? 'new-password' : 'current-password'" :minlength="authMode === 'register' ? 8 : undefined" :placeholder="authMode === 'register' ? '至少 8 个字符' : ''" required :readonly="authenticating" /></div>
            <div v-if="authMode === 'register'" class="auth-field"><label for="confirm-password">确认密码</label><input id="confirm-password" v-model="passwordConfirmation" class="field-input" name="confirm-password" type="password" autocomplete="new-password" minlength="8" required :readonly="authenticating" /></div>
          </div>
          <p v-if="authError" class="form-error" role="alert">{{ authError }}</p>
          <p v-if="authNotice" class="auth-notice" role="status">{{ authNotice }}</p>
          <k-button type="submit" class="account-submit" :disabled="authenticating || !sessionReady">{{ authenticating ? (authMode === 'register' ? '注册中…' : '登录中…') : (authMode === 'register' ? '创建账号' : '登录并同步') }}</k-button>
        </form>
        <template v-if="googleEnabled"><div class="auth-divider">或</div><k-button type="button" outline :disabled="authenticating || !sessionReady" @click="signInWithGoogle"><AppIcon name="google" :size="18" />使用 Google 登录</k-button></template>
      </template>
    </Modal>

    <Modal v-if="folderOpen" :title="currentPath.at(-1)?.title ?? '我的收藏'" wide @close="folderOpen = false">
      <template #eyebrow><Breadcrumbs :path="currentPath" @navigate="navigateFolder" /></template>
      <div class="folder-toolbar"><button type="button" class="text-button" @click="navigateFolder(currentPath.at(-1)?.parentId ?? null)"><AppIcon name="back" :size="17" />返回上一级</button><div class="flex flex-wrap gap-2"><k-button type="button" clear @click="openEditor('bookmark')">添加书签</k-button><k-button type="button" @click="openEditor('folder')"><AppIcon name="plus" :size="16" />新建文件夹</k-button></div></div>
      <EntryGrid v-if="currentEntries.length" :entries="currentEntries" :all-nodes="data.nodes" @open="openFolder" @actions="actionId = $event" />
      <div v-else class="empty-state folder-empty"><AppIcon name="folder" :size="40" /><h3>这里还空着</h3><p>添加一个书签，或新建子文件夹。</p><k-button type="button" outline @click="openEditor('bookmark')">添加第一个书签</k-button></div>
    </Modal>

    <Modal v-if="actionNode" :title="actionNode.title" @close="actionId = null">
      <p class="dialog-description">{{ actionNode.kind === 'folder' ? '文件夹' : '书签' }}操作</p>
      <k-list strong inset class="action-list"><k-list-button type="button" @click="openEditor(actionNode!.kind, actionNode)">编辑</k-list-button><k-list-button type="button" @click="openMove(actionNode!)">移动到…</k-list-button><k-list-button type="button" :link-props="{ disabled: !canReorder(actionNode, -1) }" @click="reorder(actionNode!, -1)">前移</k-list-button><k-list-button type="button" :link-props="{ disabled: !canReorder(actionNode, 1) }" @click="reorder(actionNode!, 1)">后移</k-list-button><k-list-button type="button" class="danger-action" @click="deleteRequest(actionNode!)">删除</k-list-button></k-list>
    </Modal>

    <Modal v-if="editor" :title="`${editor.id ? '编辑' : '新建'}${editor.kind === 'folder' ? '文件夹' : '书签'}`" @close="closeEditor">
      <form id="entry-form" @submit.prevent="saveEditor">
        <p v-if="editor.kind === 'bookmark'" class="dialog-description">保存一个常用网址，随时回来。</p>
        <k-list strong inset class="editor-list">
          <k-list-input label="名称"><template #input><input id="entry-title" v-model="editor.title" class="field-input" aria-label="名称" data-initial-focus placeholder="例如：灵感收集" required /></template></k-list-input>
          <k-list-input v-if="editor.kind === 'bookmark'" label="网址"><template #input><input id="entry-url" v-model="editor.url" class="field-input" aria-label="网址" type="text" inputmode="url" placeholder="example.com" required /></template></k-list-input>
        </k-list>
        <p v-if="editorError" class="form-error" role="alert">{{ editorError }}</p>
      </form>
      <template #footer><k-button type="button" clear :disabled="saving" @click="closeEditor">取消</k-button><k-button type="submit" form="entry-form" :disabled="saving">{{ saving ? '保存中…' : '保存' }}</k-button></template>
    </Modal>

    <Modal v-if="moveNode" :title="`移动“${moveNode.title}”`" @close="moveId = null">
      <Breadcrumbs :path="targetPath" @navigate="moveTarget = $event" /><p class="dialog-description">选择目标目录，再点击“移动到这里”。</p>
      <button v-if="moveTarget !== null" type="button" class="target-row" @click="moveTarget = targetPath.at(-1)?.parentId ?? null"><AppIcon name="back" />返回上一级</button>
      <button v-for="folder in targetFolders" :key="folder.id" type="button" class="target-row" @click="moveTarget = folder.id"><AppIcon name="folder" /><span>{{ folder.title }}</span><AppIcon name="chevron" :size="16" /></button>
      <p v-if="!targetFolders.length" class="target-empty">此目录下没有可进入的子文件夹。</p>
      <template #footer><k-button type="button" clear @click="moveId = null">取消</k-button><k-button type="button" :disabled="moveNode.parentId === moveTarget || (moveTarget !== null && forbiddenTargets.has(moveTarget))" @click="confirmMove">移动到这里</k-button></template>
    </Modal>

    <Modal v-if="confirmation" :title="confirmation.title" bare @close="confirmation = null"><k-dialog :opened="true" @backdropclick="confirmation = null"><template #title>{{ confirmation.title }}</template>{{ confirmation.message }}<template #buttons><k-dialog-button component="button" @click="confirmation = null">取消</k-dialog-button><k-dialog-button component="button" strong :class="{ 'danger-action': confirmation.danger }" @click="acceptConfirmation">{{ confirmation.label }}</k-dialog-button></template></k-dialog></Modal>
    <Teleport to="body"><div class="k-ios"><k-toast v-if="toast" :opened="true" position="center" class="feedback-toast" role="status" aria-live="polite">{{ toast }}</k-toast></div></Teleport>
  </k-app>
</template>
