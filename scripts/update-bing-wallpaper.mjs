import { readFile, writeFile, rename } from 'node:fs/promises';

const file = new URL('../public/bing-wallpaper.json', import.meta.url);
const endpoint = 'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN';
function bingUrl(value, image = false) {
  const url = new URL(value, 'https://www.bing.com');
  if (url.protocol !== 'https:' || !['www.bing.com', 'cn.bing.com'].includes(url.hostname) ||
      url.username || url.password || (image && url.pathname !== '/th')) throw new Error('Invalid Bing URL');
  return url.href;
}
try {
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Bing HTTP ${response.status}`);
  const image = (await response.json()).images?.[0];
  if (!image || !/^\d{8}$/.test(image.enddate) || typeof image.copyright !== 'string' || typeof image.title !== 'string') throw new Error('Invalid Bing image data');
  const metadata = { date: image.enddate, imageUrl: bingUrl(image.url, true), title: image.title, copyright: image.copyright, link: bingUrl(image.copyrightlink) };
  const temporary = new URL('../public/bing-wallpaper.json.tmp', import.meta.url);
  await writeFile(temporary, JSON.stringify(metadata, null, 2) + '\n');
  await rename(temporary, file);
  console.log(`Bing wallpaper updated: ${metadata.date} — ${metadata.title}`);
} catch (error) {
  // Network failures must not take down the page or remove the previous image.
  const previous = JSON.parse(await readFile(file, 'utf8'));
  bingUrl(previous.imageUrl, true);
  console.warn(`Bing wallpaper update unavailable; keeping ${previous.date}. ${error.message}`);
}
