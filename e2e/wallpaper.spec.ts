import { expect, test } from '@playwright/test';

const initial = { date: '20261013', imageUrl: 'https://www.bing.com/th?id=OHR.Test_1920x1080.jpg', title: '测试风景', copyright: '测试来源署名', link: 'https://www.bing.com/search?q=landscape' };
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><defs><linearGradient id="sky" x2="1" y2="1"><stop stop-color="#c6e8ef"/><stop offset=".5" stop-color="#69a5a3"/><stop offset="1" stop-color="#44706d"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#sky)"/><circle cx="1300" cy="170" r="260" fill="#ffe3a6" opacity=".8"/></svg>';

test('wallpaper loads with attribution and frosted controls stay usable in both themes', async ({ page }) => {
  await page.route('**/bing-wallpaper.json?**', route => route.fulfill({ json: initial }));
  await page.route('https://www.bing.com/th?**', route => route.fulfill({ contentType: 'image/svg+xml', body: image }));
  await page.goto('./');
  await expect(page.locator('.wallpaper-image')).toBeVisible();
  await expect(page.locator('.wallpaper-credit')).toContainText('测试来源署名');
  await expect(page.locator('.search-row')).toHaveCSS('backdrop-filter', /blur/);
  for (const width of [1440, 768, 360]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await page.getByLabel('外观主题').selectOption(theme);
      await expect(page.locator('.feedback-toast > div')).toHaveCSS('color', theme === 'dark' ? 'rgb(241, 241, 245)' : 'rgb(34, 52, 61)');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('button', { name: '新建文件夹', exact: true }).click();
      await expect(page.getByLabel('名称', { exact: true })).toBeFocused();
      await page.getByRole('button', { name: '取消', exact: true }).click();
      await page.getByLabel('搜索关键词').focus();
      await expect(page.locator('.search-panel')).toBeVisible();
      await page.getByLabel('搜索关键词').press('Escape');
    }
  }
});

test('failed metadata or images preserve a usable gradient fallback', async ({ page }) => {
  await page.route('**/bing-wallpaper.json?**', route => route.fulfill({ json: initial }));
  await page.route('https://www.bing.com/th?**', route => route.abort());
  await page.goto('./');
  await expect(page.locator('.wallpaper-image')).toHaveCount(0);
  await page.getByRole('button', { name: '新建文件夹', exact: true }).click();
  await page.getByLabel('名称', { exact: true }).fill('背景失败也能保存');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.entry-title')).toHaveText(['背景失败也能保存']);
});

test('a refresh swaps in a new image only after loading and never downgrades a cached date', async ({ page }) => {
  let metadata = initial; let failImage = false; let requests = 0;
  await page.route('**/bing-wallpaper.json?**', route => { requests++; return route.fulfill({ json: metadata }); });
  await page.route('https://www.bing.com/th?**', route => failImage ? route.abort() : route.fulfill({ contentType: 'image/svg+xml', body: image }));
  await page.goto('./'); await expect(page.locator('.wallpaper-image')).toHaveAttribute('src', initial.imageUrl);
  async function refresh() {
    const previous = requests;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(() => requests).toBeGreaterThan(previous);
  }
  metadata = { ...initial, date: '20261014', imageUrl: 'https://www.bing.com/th?id=OHR.Next_1920x1080.jpg', title: '新的一天' };
  await refresh(); await expect(page.locator('.wallpaper-image')).toHaveAttribute('src', metadata.imageUrl);
  metadata = initial; await refresh();
  await expect(page.locator('.wallpaper-image')).toHaveAttribute('src', 'https://www.bing.com/th?id=OHR.Next_1920x1080.jpg');
  failImage = true; metadata = { ...initial, date: '20261015', imageUrl: 'https://www.bing.com/th?id=OHR.Failed_1920x1080.jpg' };
  await refresh(); await expect(page.locator('.wallpaper-credit')).toContainText('新的一天');
});
