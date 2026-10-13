import { describe, expect, it } from 'vitest';
import { parseSuggestions, suggestionUrl } from './suggestions';

describe('search suggestions', () => {
  it('uses fixed provider hosts and safely encodes user queries', () => {
    const query = '中文 & </script>';
    const bing = suggestionUrl('bing', query); const google = suggestionUrl('google', query);
    expect(bing.hostname).toBe('www.bing.com'); expect(bing.searchParams.get('query')).toBe(query);
    expect(google.hostname).toBe('suggestqueries.google.com'); expect(google.searchParams.get('q')).toBe(query);
    expect(suggestionUrl('yandex', query).hostname).toBe('www.bing.com');
  });
  it('validates the echoed query, sanitizes the result shape and limits choices', () => {
    expect(parseSuggestions(['vue', [' Vue ', 'vue', ['vue3'], null, '', 'x'.repeat(501)]], 'vue')).toEqual(['Vue', 'vue3']);
    expect(() => parseSuggestions(['old', ['stale']], 'new')).toThrow();
    expect(parseSuggestions(['a', Array.from({ length: 20 }, (_, index) => `a${index}`)], 'a')).toHaveLength(8);
  });
});
