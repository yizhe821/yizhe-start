import { expect, test, type Page } from '@playwright/test';

test.use({ timezoneId: 'Asia/Shanghai' });

async function createFolder(page: Page, title: string) {
  await page.getByRole('button', { name: '新建文件夹', exact: true }).click();
  await page.getByLabel('名称', { exact: true }).fill(title);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '新建文件夹' })).toHaveCount(0);
}
test('nested CRUD, safe delete, focus restoration and persistent ordering', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('./');
  await createFolder(page, '工作');
  await createFolder(page, '灵感');
  const work = page.getByRole('button', { name: '工作 0 个项目', exact: true });
  await work.click();
  await createFolder(page, '项目');
  await page.getByRole('button', { name: '项目 0 个项目', exact: true }).click();
  await page.getByRole('button', { name: '添加书签', exact: true }).click();
  await page.getByLabel('名称', { exact: true }).fill('文档');
  await page.getByLabel('网址', { exact: true }).fill('example.com');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('link', { name: '文档 example.com' })).toHaveAttribute('href', 'https://example.com/');
  await page.keyboard.press('Escape');
  await expect(page.locator('#app')).not.toHaveAttribute('inert', '');
  await expect(page.getByRole('button', { name: '工作 1 个项目' })).toBeFocused();
  await page.getByRole('button', { name: '管理工作', exact: true }).click();
  await page.getByRole('button', { name: '后移', exact: true }).click();
  await page.reload();
  await expect(page.locator('.entry-title')).toHaveText(['灵感', '工作']);
  await page.getByRole('button', { name: '管理工作', exact: true }).click();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.getByRole('dialog').last()).toContainText('2 个文件夹');
  await expect(page.getByRole('dialog').last()).toContainText('1 个书签');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.locator('.entry-title')).toHaveText(['灵感', '工作']);
  await page.getByRole('button', { name: '管理工作', exact: true }).click();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.locator('.entry-title')).toHaveText(['灵感']);
  expect(errors).toEqual([]);
});

test('move picker excludes descendants, and unsaved edits survive discard cancellation', async ({ page }) => {
  await page.goto('./');
  await createFolder(page, 'A');
  await createFolder(page, 'B');
  await page.getByRole('button', { name: 'A 0 个项目' }).click();
  await createFolder(page, 'A1');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '管理A', exact: true }).click();
  await page.getByRole('button', { name: '移动到…' }).click();
  await expect(page.locator('.target-row')).toHaveText(['B']);
  await page.locator('.target-row').click();
  await page.getByRole('button', { name: '移动到这里' }).click();
  await expect(page.locator('.entry-title')).toHaveText(['B']);
  await page.getByRole('button', { name: 'B 1 个项目' }).click();
  await page.getByRole('button', { name: '管理A', exact: true }).click();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('名称', { exact: true }).fill('未保存');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog').last()).toContainText('放弃修改');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByLabel('名称', { exact: true })).toHaveValue('未保存');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('button', { name: '未保存 1 个项目' })).toBeVisible();
});

test('search, IME, appearance and desktop/mobile layout', async ({ page }) => {
  await page.goto('./');
  const requests: string[] = [];
  await expect(page.locator('.empty-cta')).toHaveCSS('color', 'rgb(255, 255, 255)');
  await page.evaluate(() => { (window as any).__opened = []; window.open = ((url: string) => { (window as any).__opened.push(url); return null; }) as any; });
  await page.getByLabel('搜索关键词').fill('中文 & +');
  await page.getByLabel('搜索关键词').dispatchEvent('compositionstart');
  await page.getByLabel('搜索关键词').press('Enter');
  expect(await page.evaluate(() => (window as any).__opened.length)).toBe(0);
  await page.getByLabel('搜索关键词').dispatchEvent('compositionend');
  for (const engine of ['Bing', 'Google', 'Yandex']) {
    await page.getByRole('button', { name: /^搜索引擎：/ }).click();
    await page.getByRole('button', { name: engine, exact: true }).click();
    await expect(page.getByRole('group', { name: '选择搜索引擎' })).toHaveCount(0);
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    requests.push(await page.evaluate(() => (window as any).__opened.at(-1)));
  }
  expect(requests.map(value => new URL(value).hostname)).toEqual(['www.bing.com', 'www.google.com', 'yandex.com']);
  await page.getByRole('button', { name: '清空搜索' }).click();
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__opened.length)).toBe(3);
  await page.getByLabel('外观主题').selectOption('dark');
  await expect(page.locator('html')).toHaveClass('dark');
  await page.reload();
  await expect(page.locator('html')).toHaveClass('dark');
  await expect(page.getByRole('button', { name: '搜索引擎：Yandex', exact: true })).toBeVisible();
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByLabel('外观主题').selectOption('light');
  await expect(page.locator('html')).not.toHaveClass('dark');
  await expect(page.getByRole('status')).toBeHidden({ timeout: 6000 });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: '.cache/preview-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 360, height: 900 });
  await page.screenshot({ path: '.cache/preview-mobile.png', fullPage: true });
});

test('clock follows local time across midnight and engine picker supports keyboard and dismissal', async ({ page }) => {
  const start = new Date('2026-10-13T23:59:59+08:00');
  await page.clock.install({ time: new Date(start.getTime() - 1000) });
  await page.clock.pauseAt(start);
  await page.goto('./');
  await expect(page.locator('.clock-time')).toHaveText('23:59:59');
  await expect(page.locator('.clock-date')).toHaveText('2026年10月13日星期二');
  await page.clock.runFor(1000);
  await expect(page.locator('.clock-time')).toHaveText('00:00:00');
  await expect(page.locator('.clock-date')).toHaveText('2026年10月14日星期三');

  const picker = page.getByRole('button', { name: '搜索引擎：Bing', exact: true });
  await picker.focus();
  await picker.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Bing', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '搜索引擎：Google', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('group', { name: '选择搜索引擎' })).toHaveCount(0);
  await page.getByRole('button', { name: '搜索引擎：Google', exact: true }).click();
  await page.getByLabel('搜索关键词').click();
  await expect(page.getByRole('group', { name: '选择搜索引擎' })).toHaveCount(0);
});

test('scrolling page stays aligned through nested dialogs and editor focus has no outline', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 520 });
  await page.goto('./');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  await page.getByRole('button', { name: '新建文件夹', exact: true }).scrollIntoViewIfNeeded();
  const initial = await page.locator('.page-shell').boundingBox();
  const scrollY = await page.evaluate(() => window.scrollY);
  await page.getByRole('button', { name: '新建文件夹', exact: true }).click();
  const title = page.getByLabel('名称', { exact: true });
  await expect(title).toBeFocused();
  await expect(title).toHaveCSS('outline-style', 'none');
  await expect(title).toHaveCSS('box-shadow', 'none');
  await expect(page.getByText('用一个名字，整理你的收藏。', { exact: true })).toHaveCount(0);
  expect((await page.locator('.page-shell').boundingBox())!.x).toBe(initial!.x);
  expect((await page.locator('.page-shell').boundingBox())!.width).toBe(initial!.width);
  await title.fill('未保存');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog').last()).toContainText('放弃修改');
  expect((await page.locator('.page-shell').boundingBox())!.x).toBe(initial!.x);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '放弃修改', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await page.locator('.page-shell').boundingBox())!.x).toBe(initial!.x);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
});

test('damaged data is retained and import requires confirmation', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('yizhe-start:data:v1', '{broken'));
  await page.goto('./');
  await expect(page.getByRole('alert')).toContainText('原始数据没有被覆盖');
  expect(await page.evaluate(() => localStorage.getItem('yizhe-start:data:v1'))).toBe('{broken');
  const backup = { schemaVersion: 1, nodes: [{ id: 'one', kind: 'folder', title: '备份目录', parentId: null, order: 0 }], preferences: { searchEngine: 'google', appearance: 'light' } };
  await page.getByLabel('导入收藏备份').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.getByRole('dialog')).toContainText('1 个文件夹');
  expect(await page.evaluate(() => localStorage.getItem('yizhe-start:data:v1'))).toBe('{broken');
  await page.getByRole('button', { name: '确认导入' }).click();
  await expect(page.locator('.entry-title')).toHaveText(['备份目录']);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('cross-tab updates preserve edit text; quota failures retain form and state', async ({ page, context }) => {
  await page.goto('./');
  await createFolder(page, '初始');
  const other = await context.newPage(); await other.goto('./');
  await page.getByRole('button', { name: '管理初始' }).click();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('名称', { exact: true }).fill('编辑中');
  await createFolder(other, '另一标签');
  await expect(page.getByLabel('名称', { exact: true })).toHaveValue('编辑中');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(other.locator('.entry-title')).toHaveText(['编辑中', '另一标签']);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); }; });
  await page.getByRole('button', { name: '新建文件夹', exact: true }).click();
  await page.getByLabel('名称', { exact: true }).fill('无法保存');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByLabel('名称', { exact: true })).toHaveValue('无法保存');
  await expect(page.getByRole('status')).toContainText('保存失败');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('yizhe-start:data:v1')!).nodes.length)).toBe(2);
});
