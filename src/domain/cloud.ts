import { validateData, type AppData } from './model';

export const CLOUD_TABLE = 'yizhestart_documents';
export const CLOUD_SAVE_FUNCTION = 'yizhestart_save_document';
export type CloudDocument = { data: AppData; revision: number };
export class CloudConflict extends Error {
  constructor() { super('另一设备已更新收藏，已加载最新数据，请检查后重新保存。'); }
}
export function parseCloudDocument(row: unknown): CloudDocument {
  if (!row || typeof row !== 'object' || !('payload' in row) || !('revision' in row) ||
      !Number.isSafeInteger(row.revision) || (row.revision as number) < 1) {
    throw new Error('云端数据格式不正确，请先导出备份并检查数据库。');
  }
  return { data: validateData(row.payload), revision: row.revision as number };
}
export function cloudError(error: { code?: string; message?: string }): Error {
  if (error.code === '40001') return new CloudConflict();
  if (['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error.code ?? '')) {
    return new Error('云端存储尚未初始化，请在 Supabase SQL Editor 执行项目的初始化脚本。');
  }
  return new Error('云端请求失败，修改尚未保存。请检查网络、登录状态和数据库配置。');
}
