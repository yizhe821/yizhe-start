import { SEARCH_QUERY_LIMIT, type Engine } from './model';

export const SUGGESTION_LIMIT = 8;
export function suggestionSource(engine: Engine): string { return engine === 'google' ? 'Google' : 'Bing'; }
export function suggestionUrl(engine: Engine, query: string): URL {
  const url = new URL(engine === 'google' ? 'https://suggestqueries.google.com/complete/search' : 'https://www.bing.com/osjson.aspx');
  if (engine === 'google') {
    url.searchParams.set('client', 'chrome'); url.searchParams.set('hl', 'zh-CN');
    url.searchParams.set('q', query); url.searchParams.set('callback', 'yizhestart_suggest_callback');
  } else {
    url.searchParams.set('query', query); url.searchParams.set('mkt', 'zh-CN');
    url.searchParams.set('JsonType', 'callback'); url.searchParams.set('JsonCallback', 'yizhestart_suggest_callback');
  }
  return url;
}
export function parseSuggestions(payload: unknown, query: string): string[] {
  if (!Array.isArray(payload) || payload[0] !== query || !Array.isArray(payload[1])) throw new Error('Invalid suggestion response');
  const result: string[] = []; const seen = new Set<string>();
  for (const item of payload[1].slice(0, 30)) {
    const text = typeof item === 'string' ? item : Array.isArray(item) ? item[0] : undefined;
    if (typeof text !== 'string' || !text.trim() || text.length > SEARCH_QUERY_LIMIT) continue;
    const key = text.trim().toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key); result.push(text.trim());
    if (result.length === SUGGESTION_LIMIT) break;
  }
  return result;
}
