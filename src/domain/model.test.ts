import { describe, expect, it } from 'vitest';
import { reactive } from 'vue';
import { children, deleteEntry, emptyData, moveEntry, normalizeUrl, pathTo, reorderEntry, rememberSearch, saveEntry, searchUrl, validateData, type AppData, type Entry } from './model';
import { loadData, persistData, STORAGE_KEY, type StorageLike } from './storage';

const folder = (id: string, parentId: string | null = null, order = 0): Entry => ({ id, parentId, order, kind: 'folder', title: id });
const bookmark = (id: string, parentId: string | null, order = 0): Entry => ({ id, parentId, order, kind: 'bookmark', title: id, url: 'https://example.com/' });
const fixture = (): AppData => ({ ...emptyData(), nodes: [folder('work'), folder('nested', 'work'), bookmark('link', 'nested'), folder('other', null, 1)] });

describe('nested bookmarks', () => {
  it('creates, edits and keeps source data immutable, including Vue reactive state', () => {
    const data = reactive(fixture());
    const saved = saveEntry(data, { kind: 'bookmark', title: ' New ', url: 'example.org', parentId: 'work' });
    expect(data.nodes).toHaveLength(4);
    const created = saved.nodes.at(-1)!;
    expect(created.title).toBe('New');
    expect(created.order).toBe(1);
    const edited = saveEntry(saved, { id: created.id, kind: 'bookmark', title: 'Changed', url: 'https://example.net', parentId: 'work' });
    expect(edited.nodes.at(-1)).toMatchObject({ id: created.id, title: 'Changed', order: 1 });
    expect(pathTo(saved.nodes, 'nested').map(n => n.id)).toEqual(['work', 'nested']);
  });
  it('moves the entire subtree and rejects self/descendant targets', () => {
    const data = fixture();
    expect(() => moveEntry(data, 'work', 'work')).toThrow();
    expect(() => moveEntry(data, 'work', 'nested')).toThrow();
    const moved = moveEntry(data, 'nested', 'other');
    expect(pathTo(moved.nodes, 'nested').map(n => n.id)).toEqual(['other', 'nested']);
    expect(moved.nodes.find(n => n.id === 'link')?.parentId).toBe('nested');
    expect(moveEntry(data, 'nested', 'work')).toEqual(data);
    expect(() => moveEntry(data, 'nested', 'link')).toThrow();
  });
  it('deletes only the target subtree and renumbers its siblings', () => {
    const data = fixture();
    expect(deleteEntry(data, 'work').nodes).toEqual([folder('other')]);
    expect(data.nodes).toHaveLength(4);
  });
  it('reorders a mixed list and preserves order after JSON roundtrip', () => {
    const data = fixture(); data.nodes.push(bookmark('root-link', null, 2));
    const reordered = reorderEntry(data, 'root-link', -1);
    expect(children(validateData(JSON.parse(JSON.stringify(reordered))).nodes, null).map(n => n.id)).toEqual(['work', 'root-link', 'other']);
  });
  it('accepts valid order gaps and appends safely after import', () => {
    const data = fixture(); data.nodes.find(n => n.id === 'other')!.order = 5;
    expect(saveEntry(data, { kind: 'folder', title: 'new', parentId: null }).nodes.at(-1)?.order).toBe(6);
  });
  it('rejects stale edit targets and missing parents', () => {
    expect(() => saveEntry(fixture(), { id: 'missing', kind: 'folder', title: 'x', parentId: null })).toThrow();
    expect(() => saveEntry(fixture(), { id: 'nested', kind: 'folder', title: 'x', parentId: 'other' })).toThrow();
    expect(() => saveEntry(fixture(), { kind: 'folder', title: 'x', parentId: 'gone' })).toThrow();
  });
});
describe('import validation', () => {
  it.each([
    { schemaVersion: 2, nodes: [], preferences: emptyData().preferences },
    { ...emptyData(), nodes: [folder('same'), folder('same', null, 1)] },
    { ...emptyData(), nodes: [folder('orphan', 'missing')] },
    { ...emptyData(), nodes: [folder('a', 'b'), folder('b', 'a')] },
    { ...emptyData(), nodes: [folder('a'), folder('b')] },
    { ...emptyData(), nodes: [{ ...bookmark('link', null), url: 'javascript:alert(1)' }] },
    { ...emptyData(), nodes: [{ ...folder('a'), order: -1 }] },
    { ...emptyData(), preferences: { searchEngine: 'unknown', appearance: 'system' } },
  ])('rejects malformed trees and preferences without changing existing data', value => {
    const existing = fixture(); expect(() => validateData(value)).toThrow(); expect(existing.nodes).toHaveLength(4);
  });
  it('validates a deeply nested tree without recursive stack overflow', () => {
    const nodes = Array.from({ length: 5000 }, (_, i) => folder(String(i), i ? String(i - 1) : null));
    expect(validateData({ ...emptyData(), nodes }).nodes).toHaveLength(5000);
  });
});
describe('search and URL handling', () => {
  it.each(['bing', 'google', 'yandex'] as const)('encodes Chinese and special characters for %s', engine => {
    const url = new URL(searchUrl(engine, ' 中文 & a+b ? ')!);
    expect(url.searchParams.get(engine === 'yandex' ? 'text' : 'q')).toBe('中文 & a+b ?');
    expect(searchUrl(engine, '  ')).toBeNull();
  });
  it('normalizes HTTPS and rejects unsafe protocols and embedded credentials', () => {
    expect(normalizeUrl('example.com/path')).toBe('https://example.com/path');
    expect(normalizeUrl('localhost:8080/path')).toBe('https://localhost:8080/path');
    expect(() => normalizeUrl('data:text/html,x')).toThrow();
    expect(() => normalizeUrl('https://user:pass@example.com')).toThrow();
  });
});
describe('storage transactions', () => {
  function memory(raw: string | null = null): StorageLike {
    const entries = new Map<string, string>(); if (raw !== null) entries.set(STORAGE_KEY, raw);
    return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => { entries.set(key, value); } };
  }
  it('roundtrips every node, order and preference', () => {
    const storage = memory(); const data = fixture(); data.preferences.appearance = 'dark';
    persistData(storage, data); expect(loadData(storage).data).toEqual(data);
  });
  it('retains damaged raw data and never silently overwrites it', () => {
    const storage = memory('{broken'); const loaded = loadData(storage);
    expect(loaded.error).toBeTruthy(); expect(loaded.raw).toBe('{broken'); expect(storage.getItem(STORAGE_KEY)).toBe('{broken');
  });
  it('does not commit invalid data or hide a failed write', () => {
    const storage = memory(JSON.stringify(fixture()));
    expect(() => persistData(storage, { ...emptyData(), nodes: [folder('x', 'missing')] })).toThrow();
    expect(loadData(storage).data).toEqual(fixture());
    const full: StorageLike = { getItem: storage.getItem, setItem: () => { throw new Error('quota'); } };
    expect(() => persistData(full, emptyData())).toThrow('quota');
  });
});

describe('search history', () => {
  it('loads old documents and backups without history', () => {
    const { searchHistory: _history, ...old } = fixture();
    expect(validateData(old).searchHistory).toEqual([]);
    expect(validateData(old).nodes).toEqual(old.nodes);
  });
  it('remembers recent searches, deduplicates and preserves the original tree', () => {
    const original = fixture();
    const first = rememberSearch(original, ' Vue ', 'bing', 10);
    const second = rememberSearch(first, 'TypeScript', 'google', 20);
    const repeated = rememberSearch(second, 'vue', 'yandex', 30);
    expect(repeated.searchHistory).toEqual([{ query: 'vue', engine: 'yandex', searchedAt: 30 }, { query: 'TypeScript', engine: 'google', searchedAt: 20 }]);
    expect(original.searchHistory).toEqual([]); expect(repeated.nodes).toEqual(original.nodes);
    expect(saveEntry(repeated, { kind: 'folder', title: 'new', parentId: null }).searchHistory).toEqual(repeated.searchHistory);
  });
  it('keeps at most 100 terms and skips blank or oversized terms', () => {
    let data = emptyData();
    for (let index = 0; index < 105; index++) data = rememberSearch(data, `term-${index}`, 'bing', index);
    expect(data.searchHistory).toHaveLength(100);
    expect(data.searchHistory[0].query).toBe('term-104');
    expect(rememberSearch(data, ' ', 'bing')).toBe(data);
    expect(rememberSearch(data, 'x'.repeat(501), 'bing')).toBe(data);
  });
  it.each([null, [{}], [{ query: 'a', engine: 'bad', searchedAt: 1 }], [{ query: 'a', engine: 'bing', searchedAt: -1 }], [{ query: 'a', engine: 'bing', searchedAt: 1 }, { query: 'A', engine: 'bing', searchedAt: 2 }]])('rejects malformed histories', history => {
    expect(() => validateData({ ...emptyData(), searchHistory: history })).toThrow();
  });
});
