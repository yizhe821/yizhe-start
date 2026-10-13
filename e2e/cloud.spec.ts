import { expect, test, type Page } from '@playwright/test';
import { emptyData, type AppData } from '../src/domain/model';

const userId = '00000000-0000-4000-8000-000000000001';
const localData: AppData = { ...emptyData(), nodes: [{ id: 'local', kind: 'folder', title: '本地收藏', parentId: null, order: 0 }] };
type Row = { payload: AppData; revision: number };

async function mockCloud(page: Page, initial: Row | null) {
  const state = { row: initial, failSave: false, saveCalls: 0, readFailure: false };
  await page.addInitScript(value => localStorage.setItem('yizhe-start:data:v1', JSON.stringify(value)), localData);
  await page.route('https://vghfkcqssvudccsnfwon.supabase.co/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
    if (url.pathname === '/auth/v1/token') {
      const now = Math.floor(Date.now() / 1000);
      const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: userId, exp: now + 3600, role: 'authenticated' })).toString('base64url')}.test`;
      await route.fulfill({ headers, json: { access_token: token, refresh_token: 'mock-refresh', token_type: 'bearer', expires_in: 3600,
        user: { id: userId, email: 'test@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } } });
    } else if (url.pathname === '/auth/v1/logout') {
      expect(url.searchParams.get('scope')).toBe('local');
      await route.fulfill({ status: 204, headers });
    } else if (url.pathname === '/rest/v1/yizhestart_documents') {
      expect(request.method()).toBe('GET');
      expect(url.searchParams.get('user_id')).toBe(`eq.${userId}`);
      await route.fulfill(state.readFailure ? { status: 404, headers, json: { code: 'PGRST205', message: 'missing table' } } : { headers, json: state.row ? [state.row] : [] });
    } else if (url.pathname === '/rest/v1/rpc/yizhestart_save_document') {
      state.saveCalls++;
      const body = request.postDataJSON();
      expect(Object.keys(body).sort()).toEqual(['yizhestart_expected_revision', 'yizhestart_payload']);
      if (state.failSave) {
        await route.fulfill({ status: 503, headers, json: { code: 'unavailable', message: 'offline' } });
      } else if (body.yizhestart_expected_revision !== (state.row?.revision ?? 0)) {
        await route.fulfill({ status: 409, headers, json: { code: '40001', message: 'conflict' } });
      } else {
        state.row = { payload: body.yizhestart_payload, revision: (state.row?.revision ?? 0) + 1 };
        await route.fulfill({ headers, json: [state.row] });
      }
    } else {
      throw new Error(`Unexpected Supabase request: ${url.pathname}`);
    }
  });
  return state;
}
async function login(page: Page) {
  await page.getByRole('button', { name: '登录云端账号', exact: true }).click();
  await page.getByLabel('邮箱', { exact: true }).fill('test@example.com');
  await page.getByLabel('密码', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: '登录并同步', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '云端账号', exact: true })).toBeVisible();
  await expect(page.locator('.page-footer')).toContainText('收藏已连接云端');
}

test('cloud login, explicit local migration, reload and scoped logout preserve local data', async ({ page }) => {
  const state = await mockCloud(page, null);
  await page.goto('./');
  await expect(page.locator('.entry-title')).toHaveText(['本地收藏']);
  await login(page);
  await expect(page.locator('.entry-title')).toHaveCount(0);
  expect(state.saveCalls).toBe(0);
  await page.getByRole('button', { name: '迁移本地收藏到云端' }).click();
  await expect(page.getByRole('dialog').last()).toContainText('替换此账号');
  await page.getByRole('button', { name: '确认迁移', exact: true }).click();
  await expect(page.locator('.entry-title')).toHaveText(['本地收藏']);
  expect(state.row?.revision).toBe(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('yizhe-start:data:v1')!))).toEqual(localData);
  await page.reload();
  await expect(page.locator('.page-footer')).toContainText('收藏已连接云端');
  await expect(page.locator('.entry-title')).toHaveText(['本地收藏']);
  await page.getByRole('button', { name: '管理云端账号' }).click();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '登录云端账号', exact: true })).toBeVisible();
  await expect(page.locator('.page-footer')).toContainText('收藏保存在当前浏览器');
  expect(state.row?.revision).toBe(1);
});

test('failed writes preserve the editor; stale writes reload remote changes without overwriting', async ({ page }) => {
  const state = await mockCloud(page, { payload: emptyData(), revision: 1 });
  await page.goto('./'); await login(page);
  await page.getByRole('button', { name: '关闭面板', exact: true }).click();
  await page.getByRole('button', { name: '新建文件夹', exact: true }).click();
  await page.getByLabel('名称', { exact: true }).fill('编辑中');
  state.failSave = true;
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('修改尚未保存');
  await expect(page.getByLabel('名称', { exact: true })).toHaveValue('编辑中');
  expect(state.row?.revision).toBe(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('yizhe-start:data:v1')!))).toEqual(localData);
  state.failSave = false;
  state.row = { payload: { ...emptyData(), nodes: [{ id: 'remote', kind: 'folder', title: '另一设备', parentId: null, order: 0 }] }, revision: 2 };
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('另一设备已更新收藏');
  await expect(page.getByLabel('名称', { exact: true })).toHaveValue('编辑中');
  await expect(page.locator('.entry-title')).toHaveText(['另一设备']);
  expect(state.row.revision).toBe(2);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.entry-title')).toHaveText(['另一设备', '编辑中']);
  expect(state.row.revision).toBe(3);
});

test('missing cloud schema blocks writes and offers retry without replacing local bookmarks', async ({ page }) => {
  const state = await mockCloud(page, null);
  state.readFailure = true;
  await page.goto('./');
  await page.getByRole('button', { name: '登录云端账号', exact: true }).click();
  await page.getByLabel('邮箱', { exact: true }).fill('test@example.com');
  await page.getByLabel('密码', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: '登录并同步', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '云端账号', exact: true })).toContainText('尚未初始化');
  await expect(page.getByRole('button', { name: '迁移本地收藏到云端' })).toBeDisabled();
  expect(state.saveCalls).toBe(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('yizhe-start:data:v1')!))).toEqual(localData);
  state.readFailure = false;
  await page.getByRole('button', { name: '同步最新收藏' }).click();
  await expect(page.locator('.page-footer')).toContainText('收藏已连接云端');
  await expect(page.getByRole('button', { name: '迁移本地收藏到云端' })).toBeEnabled();
});
