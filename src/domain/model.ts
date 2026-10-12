export type Engine = 'bing' | 'google' | 'yandex';
export type Appearance = 'system' | 'light' | 'dark';
export type ParentId = string | null;
type BaseNode = { id: string; title: string; parentId: ParentId; order: number };
export type Folder = BaseNode & { kind: 'folder' };
export type Bookmark = BaseNode & { kind: 'bookmark'; url: string };
export type Entry = Folder | Bookmark;
export type AppData = {
  schemaVersion: 1;
  nodes: Entry[];
  preferences: { searchEngine: Engine; appearance: Appearance };
};
export const engines: { id: Engine; label: string }[] = [
  { id: 'bing', label: 'Bing' }, { id: 'google', label: 'Google' }, { id: 'yandex', label: 'Yandex' },
];
export function emptyData(): AppData {
  return { schemaVersion: 1, nodes: [], preferences: { searchEngine: 'bing', appearance: 'system' } };
}
export function normalizeUrl(value: string): string {
  const text = value.trim();
  if (!text) throw new Error('请输入书签网址。');
  const hostWithPort = /^[\w.-]+:\d+(?:[/?#]|$)/.test(text);
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(text) && !hostWithPort;
  const parsed = new URL(hasScheme ? text : `https://${text}`);
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error('请使用有效的 HTTP 或 HTTPS 网址。');
  }
  return parsed.href;
}
export function searchUrl(engine: Engine, query: string): string | null {
  const value = query.trim();
  if (!value) return null;
  const url = new URL(engine === 'bing' ? 'https://www.bing.com/search' : engine === 'google' ? 'https://www.google.com/search' : 'https://yandex.com/search/');
  url.searchParams.set(engine === 'yandex' ? 'text' : 'q', value);
  return url.href;
}
export function children(nodes: Entry[], parentId: ParentId): Entry[] {
  return nodes.filter(n => n.parentId === parentId).sort((a, b) => a.order - b.order);
}
export function descendants(nodes: Entry[], id: string): Set<string> {
  const byParent = new Map<ParentId, Entry[]>();
  for (const node of nodes) byParent.set(node.parentId, [...(byParent.get(node.parentId) ?? []), node]);
  const result = new Set<string>();
  const pending = [id];
  while (pending.length) {
    const next = pending.pop()!;
    for (const node of byParent.get(next) ?? []) {
      if (!result.has(node.id) && node.id !== id) { result.add(node.id); pending.push(node.id); }
    }
  }
  return result;
}
export function pathTo(nodes: Entry[], id: ParentId): Folder[] {
  const path: Folder[] = [];
  const visited = new Set<string>();
  const lookup = new Map(nodes.map(n => [n.id, n]));
  while (id !== null) {
    if (visited.has(id)) throw new Error('文件夹路径存在循环。');
    visited.add(id);
    const node = lookup.get(id);
    if (!node || node.kind !== 'folder') throw new Error('文件夹已不存在。');
    path.unshift(node); id = node.parentId;
  }
  return path;
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function validateData(value: unknown): AppData {
  if (!record(value) || value.schemaVersion !== 1) throw new Error('数据版本不受支持，请导入第一版备份。');
  if (!Array.isArray(value.nodes) || !record(value.preferences)) throw new Error('备份格式不完整。');
  const { searchEngine, appearance } = value.preferences;
  if (!engines.some(e => e.id === searchEngine) || !['system', 'light', 'dark'].includes(appearance as string)) throw new Error('偏好设置无效。');
  const nodes: Entry[] = value.nodes.map(n => {
    if (!record(n) || typeof n.id !== 'string' || !n.id || typeof n.title !== 'string' || !n.title.trim() ||
      !(n.parentId === null || typeof n.parentId === 'string') || !Number.isSafeInteger(n.order) || (n.order as number) < 0 ||
      !['folder', 'bookmark'].includes(n.kind as string)) throw new Error('备份包含无效的条目。');
    const base = { id: n.id, title: n.title.trim(), parentId: n.parentId as ParentId, order: n.order as number };
    if (n.kind === 'folder') return { ...base, kind: 'folder' };
    if (typeof n.url !== 'string') throw new Error('书签网址缺失。');
    return { ...base, kind: 'bookmark', url: normalizeUrl(n.url) };
  });
  const lookup = new Map(nodes.map(n => [n.id, n]));
  if (lookup.size !== nodes.length) throw new Error('备份包含重复 ID。');
  const orders = new Map<ParentId, Set<number>>();
  for (const node of nodes) {
    if (node.parentId !== null && lookup.get(node.parentId)?.kind !== 'folder') throw new Error('备份包含无效的父文件夹。');
    const siblingOrders = orders.get(node.parentId) ?? new Set<number>();
    if (siblingOrders.has(node.order)) throw new Error('同级条目的排序重复。');
    siblingOrders.add(node.order); orders.set(node.parentId, siblingOrders);
  }
  // Iterative traversal avoids a stack overflow with deeply nested imports.
  const done = new Set<string>();
  for (const node of nodes) {
    let current: Entry | undefined = node;
    const visiting = new Set<string>();
    while (current && !done.has(current.id)) {
      if (visiting.has(current.id)) throw new Error('备份中的文件夹关系存在循环。');
      visiting.add(current.id);
      current = current.parentId === null ? undefined : lookup.get(current.parentId);
    }
    for (const id of visiting) done.add(id);
  }
  return { schemaVersion: 1, nodes, preferences: { searchEngine: searchEngine as Engine, appearance: appearance as Appearance } };
}
function copy(data: AppData): AppData { return { ...data, preferences: { ...data.preferences }, nodes: data.nodes.map(node => ({ ...node })) }; }
function nextOrder(nodes: Entry[], parentId: ParentId) { return Math.max(-1, ...children(nodes, parentId).map(node => node.order)) + 1; }
function renumber(data: AppData, parentId: ParentId) { children(data.nodes, parentId).forEach((n, i) => { n.order = i; }); }
function assertParent(nodes: Entry[], id: ParentId) {
  if (id !== null && !nodes.some(n => n.id === id && n.kind === 'folder')) throw new Error('目标文件夹已不存在。');
}
export function saveEntry(data: AppData, input: { id?: string; kind: Entry['kind']; title: string; url?: string; parentId: ParentId }): AppData {
  const next = copy(data);
  if (!input.title.trim()) throw new Error('请输入名称。');
  assertParent(next.nodes, input.parentId);
  const old = input.id ? next.nodes.find(n => n.id === input.id) : undefined;
  if (input.id && !old) throw new Error('条目已在其他标签页删除，请重新打开编辑。');
  if (old && (old.kind !== input.kind || old.parentId !== input.parentId)) throw new Error('条目已发生变化，请重新打开编辑。');
  const base = { id: old?.id ?? crypto.randomUUID(), title: input.title.trim(), parentId: input.parentId, order: old?.order ?? nextOrder(next.nodes, input.parentId) };
  const entry: Entry = input.kind === 'folder' ? { ...base, kind: 'folder' } : { ...base, kind: 'bookmark', url: normalizeUrl(input.url ?? '') };
  if (old) next.nodes[next.nodes.indexOf(old)] = entry; else next.nodes.push(entry);
  return validateData(next);
}
export function moveEntry(data: AppData, id: string, parentId: ParentId): AppData {
  const next = copy(data);
  const node = next.nodes.find(n => n.id === id);
  if (!node) throw new Error('条目已不存在。');
  assertParent(next.nodes, parentId);
  if (node.id === parentId || (parentId !== null && descendants(next.nodes, id).has(parentId))) throw new Error('不能移动到自身或子文件夹中。');
  if (node.parentId === parentId) return next;
  const oldParent = node.parentId;
  node.order = nextOrder(next.nodes, parentId);
  node.parentId = parentId;
  renumber(next, oldParent);
  return validateData(next);
}
export function deleteEntry(data: AppData, id: string): AppData {
  const next = copy(data);
  const node = next.nodes.find(n => n.id === id);
  if (!node) throw new Error('条目已不存在。');
  const removed = descendants(next.nodes, id); removed.add(id);
  next.nodes = next.nodes.filter(n => !removed.has(n.id));
  renumber(next, node.parentId);
  return validateData(next);
}
export function reorderEntry(data: AppData, id: string, direction: -1 | 1): AppData {
  const next = copy(data);
  const node = next.nodes.find(n => n.id === id);
  if (!node) throw new Error('条目已不存在。');
  const siblings = children(next.nodes, node.parentId);
  const index = siblings.findIndex(n => n.id === id);
  const target = siblings[index + direction];
  if (target) [node.order, target.order] = [target.order, node.order];
  return validateData(next);
}
