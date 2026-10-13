import { expect, test, type Page } from '@playwright/test';
import { emptyData } from '../src/domain/model';

async function setup(page: Page) {
  await page.addInitScript(data => {
    localStorage.setItem('yizhe-start:data:v1', JSON.stringify(data));
    window.open = url => { (window as unknown as { lastSearch: string }).lastSearch = String(url); return null; };
  }, { ...emptyData(), searchHistory: [{ query: '最近搜索', engine: 'bing', searchedAt: 20 }, { query: '更早的搜索', engine: 'google', searchedAt: 10 }] });
  // Chromium's opaque srcdoc subframes are not routed by Playwright. Replace
  // only their external script URL with an in-frame fixture; keep the production
  // sandbox, callbacks, source/nonce checks, parsing and cleanup intact.
  await page.addInitScript(() => {
    const scope = window as unknown as { suggestionMode: string; suggestionRequests: number };
    scope.suggestionMode = 'normal'; scope.suggestionRequests = 0;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'srcdoc')!;
    Object.defineProperty(HTMLIFrameElement.prototype, 'srcdoc', { ...descriptor, set(value: string) {
      const match = value.match(/script\.src = ("(?:\\.|[^"\\])*");/);
      if (value.includes('yizhestart_suggestions') && match) {
        scope.suggestionRequests++;
        const url = new URL(JSON.parse(match[1])); const query = url.searchParams.get('query') ?? url.searchParams.get('q')!;
        let script = `yizhestart_suggest_callback(${JSON.stringify([query, [`${query} 教程`, `${query} 官网`]])});`;
        if (scope.suggestionMode === 'failure') script = 'send(null, true);';
        if (scope.suggestionMode === 'isolation') script = `try { parent.localStorage.setItem('provider-access', 'bad'); } catch {} yizhestart_suggest_callback(${JSON.stringify([query, ['<img src=x onerror=alert(1)>']])});`;
        if (scope.suggestionMode === 'hold-old' && query === 'old') script = 'void 0;';
        value = value.replace(match[0], `script.src = ${JSON.stringify('data:text/javascript,' + encodeURIComponent(script))};`);
      }
      descriptor.set!.call(this, value);
    } });
  });
}

test('focused history and typed suggestions attach to the search box without moving the layout', async ({ page }) => {
  await setup(page); await page.goto('./');
  for (const width of [1440, 768, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('#home-link').click();
    const initial = await page.locator('.collection').boundingBox();
    const search = page.getByLabel('搜索关键词'); await search.fill('');
    await expect(page.getByRole('option', { name: '最近搜索', exact: true })).toBeVisible();
    const row = (await page.locator('.search-row').boundingBox())!;
    const panel = (await page.locator('.search-panel').boundingBox())!;
    expect(Math.abs(panel.y - (row.y + row.height))).toBeLessThanOrEqual(1);
    expect(panel.x).toBe(row.x); expect(panel.width).toBe(row.width);
    expect((await page.locator('.collection').boundingBox())!.y).toBe(initial!.y);
    await search.fill('vue');
    await expect(page.getByRole('option', { name: 'vue 教程', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: '最近搜索' })).toHaveCount(0);
    expect((await page.locator('.collection').boundingBox())!.y).toBe(initial!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: '.cache/search-suggestions-mobile.png' });
});

test('keyboard selection searches the chosen term, remembers it once and supports dismissal', async ({ page }) => {
  await setup(page); await page.goto('./');
  const search = page.getByLabel('搜索关键词'); await search.focus();
  await search.press('ArrowDown'); await search.press('Enter');
  await expect.poll(() => page.evaluate(() => (window as unknown as { lastSearch: string }).lastSearch)).toContain('q=%E6%9C%80');
  await expect(page.locator('.search-panel')).toHaveCount(0);
  await search.fill('vue'); await expect(page.getByRole('option', { name: 'vue 教程', exact: true })).toBeVisible();
  await search.press('ArrowDown'); await search.press('ArrowDown'); await search.press('Enter');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('yizhe-start:data:v1')!).searchHistory[0]?.query)).toBe('vue 官网');
  await search.fill(''); await expect(page.getByRole('option', { name: 'vue 官网', exact: true })).toBeVisible();
  await search.press('Escape'); await expect(page.locator('.search-panel')).toHaveCount(0);
  await search.click(); await expect(page.locator('.search-panel')).toBeVisible();
  await page.locator('#home-link').click(); await expect(page.locator('.search-panel')).toHaveCount(0);
});

test('Chinese composition postpones requests and failed suggestions keep ordinary search usable', async ({ page }) => {
  await setup(page); await page.goto('./');
  await page.evaluate(() => { (window as unknown as { suggestionMode: string }).suggestionMode = 'failure'; });
  const search = page.getByLabel('搜索关键词'); await search.focus();
  await search.dispatchEvent('compositionstart'); await search.fill('中文');
  await search.press('Enter'); expect(await page.evaluate(() => (window as unknown as { suggestionRequests: number }).suggestionRequests)).toBe(0);
  await search.dispatchEvent('compositionend');
  await expect(page.locator('.search-panel')).toContainText('联想暂时不可用');
  await search.press('Enter');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('yizhe-start:data:v1')!).searchHistory[0]?.query)).toBe('中文');
});

test('suggestion scripts are isolated from the app and result strings are rendered as text', async ({ page }) => {
  await setup(page); await page.goto('./');
  await page.evaluate(() => { (window as unknown as { suggestionMode: string }).suggestionMode = 'isolation'; });
  await page.getByLabel('搜索关键词').fill('safe');
  await expect(page.locator('.search-options').getByRole('option')).toHaveText('<img src=x onerror=alert(1)>');
  expect(await page.evaluate(() => localStorage.getItem('provider-access'))).toBeNull();
  await expect(page.locator('.search-panel img')).toHaveCount(0);
  await expect(page.locator('iframe[data-yizhestart-suggestions]')).toHaveCount(0);
});

test('a late response for an older query cannot replace current suggestions', async ({ page }) => {
  await setup(page); await page.goto('./');
  await page.evaluate(() => { (window as unknown as { suggestionMode: string }).suggestionMode = 'hold-old'; });
  const search = page.getByLabel('搜索关键词'); await search.fill('old');
  await expect(page.locator('iframe[data-yizhestart-suggestions]')).toHaveCount(1);
  await page.evaluate(() => {
    const frame = document.querySelector<HTMLIFrameElement>('iframe[data-yizhestart-suggestions]')!;
    const scope = window as unknown as { oldSuggestionWindow: Window; oldSuggestionNonce: string };
    scope.oldSuggestionWindow = frame.contentWindow!;
    scope.oldSuggestionNonce = JSON.parse(frame.srcdoc.match(/nonce: ("[^"]+")/)![1]);
  });
  await search.fill('new'); await expect(page.getByRole('option', { name: 'new 教程' })).toBeVisible();
  await page.evaluate(() => {
    const scope = window as unknown as { oldSuggestionWindow: Window; oldSuggestionNonce: string };
    window.dispatchEvent(new MessageEvent('message', { source: scope.oldSuggestionWindow, data: { type: 'yizhestart_suggestions', nonce: scope.oldSuggestionNonce, payload: ['old', ['stale result']] } }));
  });
  await expect(page.locator('.search-options').getByRole('option')).toHaveText(['new 教程', 'new 官网']);
});
