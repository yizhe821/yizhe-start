export type Wallpaper = { date: string; imageUrl: string; title: string; copyright: string; link: string };
function bingUrl(value: unknown, image = false): string {
  if (typeof value !== 'string') throw new Error('Invalid wallpaper URL');
  const url = new URL(value);
  if (url.protocol !== 'https:' || !['www.bing.com', 'cn.bing.com'].includes(url.hostname) ||
      url.username || url.password || (image && url.pathname !== '/th')) throw new Error('Invalid wallpaper URL');
  return url.href;
}
export function parseWallpaper(value: unknown): Wallpaper {
  if (!value || typeof value !== 'object') throw new Error('Invalid wallpaper metadata');
  const row = value as Record<string, unknown>;
  if (typeof row.date !== 'string' || !/^\d{8}$/.test(row.date) || typeof row.title !== 'string' || row.title.length > 200 ||
      typeof row.copyright !== 'string' || row.copyright.length > 500) throw new Error('Invalid wallpaper metadata');
  return { date: row.date, imageUrl: bingUrl(row.imageUrl, true), title: row.title, copyright: row.copyright, link: bingUrl(row.link) };
}
