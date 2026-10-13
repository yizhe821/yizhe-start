import { expect, test, type Page } from '@playwright/test';
import { emptyData, type AppData } from '../src/domain/model';

const userId = '00000000-0000-4000-8000-000000000001';
const localData: AppData = { ...emptyData(), nodes: [{ id: 'local', kind: 'folder', title: '本地收藏', parentId: null, order: 0 }] };
type Row = { payload: AppData; revision: number };
function authResponse() {
  const now = Math.floor(Date.now() / 1000);
  const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: userId, exp: now + 3600, role: 'authenticated' })).toString('base64url')}.test`;
  return { access_token: token, refresh_token: 'mock-refresh', token_type: 'bearer', expires_in: 3600,
    user: { id: userId, email: 'test@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
}

async function mockCloud(page: Page, initial: Row | null) {
  const state = { row: initial, failSave: false, saveCalls: 0, readFailure: false, signupCalls: 0,
    registration: 'immediate' as 'immediate' | 'confirm-email' | 'rejected', loginFailure: false, googleEnabled: false };
  await page.addInitScript(value => localStorage.setItem('yizhe-start:data:v1', JSON.stringify(value)), localData);
  await trackPasswordSaves(page);
  await page.route('https://vghfkcqssvudccsnfwon.supabase.co/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = { 'content-type': 'application/json', 'access-control-allow-origin': '*',
      'access-control-expose-headers': 'X-Supabase-Api-Version', 'x-supabase-api-version': '2024-01-01' };
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
    if (url.pathname === '/auth/v1/settings') {
      await route.fulfill({ headers, json: { external: { email: true, google: state.googleEnabled }, disable_signup: false } });
    } else if (url.pathname === '/auth/v1/token') {
      await route.fulfill(state.loginFailure ? { status: 400, headers, json: { code: 'invalid_credentials', msg: 'Invalid credentials' } } : { headers, json: authResponse() });
    } else if (url.pathname === '/auth/v1/signup') {
      state.signupCalls++;
      expect(url.searchParams.get('redirect_to')).toBe(new URL('/yizhe-start/', page.url()).href);
      expect(request.postDataJSON().email).toBe('test@example.com');
      await route.fulfill(state.registration === 'rejected' ? { status: 422, headers, json: { code: 'user_already_exists', msg: 'Already registered' } } : { headers, json: state.registration === 'confirm-email' ? authResponse().user : authResponse() });
    } else if (url.pathname === '/auth/v1/user') {
      await route.fulfill({ headers, json: authResponse().user });
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

test('search history is stored in the private cloud document and survives reload', async ({ page }) => {
  const state = await mockCloud(page, { payload: emptyData(), revision: 1 });
  await page.goto('./'); await login(page);
  await page.getByRole('button', { name: '关闭面板' }).click();
  await page.evaluate(() => { window.open = () => null; });
  const search = page.getByLabel('搜索关键词');
  await search.fill('云端历史'); await search.press('Enter');
  await expect.poll(() => state.row?.payload.searchHistory[0]?.query).toBe('云端历史');
  expect(state.row?.revision).toBe(2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('yizhe-start:data:v1')!).searchHistory)).toEqual([]);
  await page.reload(); await search.focus();
  await expect(page.getByRole('option', { name: '云端历史' })).toBeVisible();
  await page.getByRole('button', { name: '清空历史' }).click();
  await expect.poll(() => state.row?.payload.searchHistory).toEqual([]);
  expect(state.row?.revision).toBe(3);
});

test('history conflicts rebase on current cloud bookmarks without overwriting them', async ({ page }) => {
  const state = await mockCloud(page, { payload: emptyData(), revision: 1 });
  await page.goto('./'); await login(page); await page.getByRole('button', { name: '关闭面板' }).click();
  state.row = { payload: { ...emptyData(), nodes: [{ id: 'new-cloud', kind: 'folder', title: '另一设备的目录', parentId: null, order: 0 }], searchHistory: [{ query: '其他设备的搜索', engine: 'bing', searchedAt: 1 }] }, revision: 2 };
  await page.evaluate(() => { window.open = () => null; });
  await page.getByLabel('搜索关键词').fill('当前设备的搜索');
  await page.getByLabel('搜索关键词').press('Enter');
  await expect.poll(() => state.row?.revision).toBe(3);
  expect(state.row?.payload.nodes[0].title).toBe('另一设备的目录');
  expect(state.row?.payload.searchHistory.map(item => item.query)).toEqual(['当前设备的搜索', '其他设备的搜索']);
  expect(state.saveCalls).toBe(2);
});

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
  await expect(page.getByRole('dialog', { name: '登录 Yizhe Start', exact: true })).toBeVisible();
  await expect(page.locator('.page-footer')).toContainText('收藏保存在当前浏览器');
  expect(state.row?.revision).toBe(1);
});

async function trackPasswordSaves(page: Page) {
  await page.addInitScript(() => {
    const scope = window as unknown as { credentialSaves: { id: string }[]; PasswordCredential: unknown };
    scope.credentialSaves = [];
    Object.defineProperty(window, 'PasswordCredential', { configurable: true, value: class {
      id: string; constructor(data: { id: string }) { this.id = data.id; }
    } });
    Object.defineProperty(navigator.credentials, 'store', { configurable: true, value: async (credential: { id: string }) => {
      scope.credentialSaves.push({ id: credential.id }); return credential;
    } });
  });
}

test('website registration validates passwords and starts an isolated cloud account', async ({ page }) => {
  const state = await mockCloud(page, null);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('./');
  await page.getByRole('button', { name: '登录云端账号' }).click();
  await expect(page.getByRole('dialog')).not.toContainText('Supabase');
  await page.getByRole('button', { name: '注册', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.cache/signup-mobile.png' });
  await expect(page.getByRole('dialog')).toHaveAttribute('aria-labelledby');
  await page.getByLabel('邮箱', { exact: true }).fill('test@example.com');
  await page.getByLabel('密码', { exact: true }).fill('new-password-123');
  await page.getByLabel('确认密码', { exact: true }).fill('different-password');
  await page.getByRole('button', { name: '创建账号' }).click();
  await expect(page.getByRole('alert')).toContainText('两次输入的密码不一致');
  expect(state.signupCalls).toBe(0);
  await page.getByLabel('确认密码', { exact: true }).fill('new-password-123');
  await page.getByRole('button', { name: '创建账号' }).click();
  await expect(page.getByRole('dialog', { name: '云端账号', exact: true })).toBeVisible();
  await expect(page.locator('.page-footer')).toContainText('收藏已连接云端');
  expect(state.signupCalls).toBe(1); expect(state.saveCalls).toBe(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { credentialSaves: unknown[] }).credentialSaves)).toEqual([{ id: 'test@example.com' }]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('yizhe-start:data:v1')!))).toEqual(localData);
});

test('verification-required registration keeps the visitor local until they verify and log in', async ({ page }) => {
  const state = await mockCloud(page, null); state.registration = 'confirm-email';
  await page.goto('./');
  await page.getByRole('button', { name: '登录云端账号' }).click();
  await page.getByRole('button', { name: '注册', exact: true }).click();
  await page.getByLabel('邮箱', { exact: true }).fill('test@example.com');
  await page.getByLabel('密码', { exact: true }).fill('new-password-123');
  await page.getByLabel('确认密码', { exact: true }).fill('new-password-123');
  await page.getByRole('button', { name: '创建账号' }).click();
  await expect(page.locator('.auth-notice')).toContainText('验证邮件');
  await expect(page.locator('.page-footer')).toContainText('收藏保存在当前浏览器');
  expect(await page.evaluate(() => (window as unknown as { credentialSaves: unknown[] }).credentialSaves)).toEqual([]);
  await expect(page.getByLabel('密码', { exact: true })).toHaveAttribute('autocomplete', 'current-password');
  await page.getByLabel('密码', { exact: true }).fill('new-password-123');
  await page.getByRole('button', { name: '登录并同步' }).click();
  await expect(page.getByRole('dialog', { name: '云端账号', exact: true })).toBeVisible();
});

test('Chrome password storage is offered only after a successful login, with native form metadata', async ({ page }) => {
  const state = await mockCloud(page, null); state.loginFailure = true;
  await page.goto('./');
  await page.getByRole('button', { name: '登录云端账号' }).click();
  await expect(page.locator('#login-form')).toHaveAttribute('method', 'post');
  await expect(page.getByLabel('邮箱', { exact: true })).toHaveAttribute('name', 'email');
  await expect(page.getByLabel('密码', { exact: true })).toHaveAttribute('autocomplete', 'current-password');
  await page.getByLabel('邮箱', { exact: true }).fill('test@example.com');
  await page.getByLabel('密码', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: '登录并同步' }).click();
  await expect(page.getByRole('alert')).toContainText('邮箱或密码不正确');
  expect(await page.evaluate(() => (window as unknown as { credentialSaves: unknown[] }).credentialSaves)).toEqual([]);
  state.loginFailure = false;
  await page.getByRole('button', { name: '登录并同步' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { credentialSaves: unknown[] }).credentialSaves)).toEqual([{ id: 'test@example.com' }]);
});

test('Google login appears only when the provider is enabled and prepares the correct return URL', async ({ page }) => {
  const state = await mockCloud(page, null);
  await page.goto('./'); await page.getByRole('button', { name: '登录云端账号' }).click();
  await expect(page.getByRole('button', { name: '使用 Google 登录' })).toHaveCount(0);
  await page.getByRole('button', { name: '关闭面板' }).click();
  state.googleEnabled = true;
  await page.getByRole('button', { name: '登录云端账号' }).click();
  await expect(page.getByRole('button', { name: '使用 Google 登录' })).toBeVisible();
  // Intercept the navigation rather than visiting Google or creating an account.
  await page.route('https://vghfkcqssvudccsnfwon.supabase.co/auth/v1/authorize?**', async route => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('provider')).toBe('google');
    expect(url.searchParams.get('redirect_to')).toBe(new URL('/yizhe-start/', page.url()).href);
    await route.fulfill({ contentType: 'text/html', body: '<p>Mock Google authorization</p>' });
  });
  await page.getByRole('button', { name: '使用 Google 登录' }).click();
  await expect(page).toHaveURL(/\/auth\/v1\/authorize\?/);
});

test('verification and Google callback sessions load the same private cloud document', async ({ page }) => {
  await mockCloud(page, { payload: emptyData(), revision: 1 });
  const session = authResponse();
  await page.goto(`./#access_token=${session.access_token}&refresh_token=${session.refresh_token}&expires_in=3600&token_type=bearer&type=signup`);
  await expect(page.locator('.page-footer')).toContainText('收藏已连接云端');
  await expect(page.getByRole('button', { name: '管理云端账号' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('');
});

test('rejected registrations retain the form and do not offer password storage', async ({ page }) => {
  const state = await mockCloud(page, null); state.registration = 'rejected';
  await page.goto('./'); await page.getByRole('button', { name: '登录云端账号' }).click();
  await page.getByRole('button', { name: '注册', exact: true }).click();
  await page.getByLabel('邮箱', { exact: true }).fill('test@example.com');
  await page.getByLabel('密码', { exact: true }).fill('new-password-123');
  await page.getByLabel('确认密码', { exact: true }).fill('new-password-123');
  await page.getByRole('button', { name: '创建账号' }).click();
  await expect(page.getByRole('alert')).toContainText('此邮箱已注册');
  await expect(page.getByLabel('密码', { exact: true })).toHaveValue('new-password-123');
  await expect(page.locator('.entry-title')).toHaveText(['本地收藏']);
  expect(await page.evaluate(() => (window as unknown as { credentialSaves: unknown[] }).credentialSaves)).toEqual([]);
});

test('expired authentication callbacks show a login message without losing local bookmarks', async ({ page }) => {
  await mockCloud(page, null);
  await page.goto('./#error=access_denied&error_description=Expired');
  await expect(page.getByRole('dialog', { name: '登录 Yizhe Start' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('链接已失效');
  await expect(page.locator('.entry-title')).toHaveText(['本地收藏']);
  expect(await page.evaluate(() => location.hash)).toBe('');
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
