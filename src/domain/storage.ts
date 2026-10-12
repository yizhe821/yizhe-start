import { emptyData, validateData, type AppData } from './model';
export const STORAGE_KEY = 'yizhe-start:data:v1';
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export type LoadResult = { data: AppData; raw: string | null; error: string | null };
export function loadData(storage: StorageLike): LoadResult {
  let raw: string | null = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
    return { data: raw === null ? emptyData() : validateData(JSON.parse(raw)), raw, error: null };
  } catch (error) {
    return { data: emptyData(), raw, error: error instanceof Error ? error.message : '无法读取本地数据。' };
  }
}
export function persistData(storage: StorageLike, data: AppData): AppData {
  const validated = validateData(data);
  storage.setItem(STORAGE_KEY, JSON.stringify(validated));
  return validated;
}
