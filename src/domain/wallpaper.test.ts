import { describe, expect, it } from 'vitest';
import { parseWallpaper } from './wallpaper';

const metadata = { date: '20261013', title: '每日风景', copyright: '摄影师署名', imageUrl: 'https://www.bing.com/th?id=OHR.Sample_1920x1080.jpg', link: 'https://www.bing.com/search?q=landscape' };
describe('daily wallpaper metadata', () => {
  it('preserves the source title, attribution and original Bing image', () => {
    expect(parseWallpaper(metadata)).toEqual(metadata);
  });
  it.each([
    { ...metadata, imageUrl: 'javascript:alert(1)' },
    { ...metadata, imageUrl: 'https://example.com/image.jpg' },
    { ...metadata, imageUrl: 'https://www.bing.com/search?q=x' },
    { ...metadata, link: 'https://user:pass@www.bing.com/search?q=x' },
    { ...metadata, date: 'bad' },
  ])('rejects unexpected hosts, paths and malformed metadata', value => {
    expect(() => parseWallpaper(value)).toThrow();
  });
});
