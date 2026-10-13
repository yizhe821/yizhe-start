import { suggestionUrl, parseSuggestions } from '../domain/suggestions';
import type { Engine } from '../domain/model';

export function fetchSuggestions(engine: Engine, query: string, signal: AbortSignal): Promise<string[]> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    // These endpoints return JSONP rather than permitting browser CORS fetches.
    // Execute provider code in an opaque-origin frame, with no access to our DOM,
    // cookies, Auth session, localStorage or passwords. Verify the frame and nonce.
    const frame = document.createElement('iframe');
    frame.hidden = true; frame.sandbox.add('allow-scripts'); frame.referrerPolicy = 'no-referrer';
    frame.setAttribute('aria-hidden', 'true'); frame.dataset.yizhestartSuggestions = '';
    const nonce = crypto.randomUUID();
    const literal = (value: string) => JSON.stringify(value).replace(/</g, '\\u003c');
    let complete = false;
    const timer = setTimeout(() => finish(new Error('Suggestion timeout')), 5000);
    function finish(error: Error | null, values: string[] = []) {
      if (complete) return;
      complete = true; clearTimeout(timer); window.removeEventListener('message', onMessage);
      signal.removeEventListener('abort', onAbort); frame.remove();
      if (error) reject(error); else resolve(values);
    }
    function onAbort() { finish(new DOMException('Aborted', 'AbortError')); }
    function onMessage(event: MessageEvent) {
      if (event.source !== frame.contentWindow || event.data?.type !== 'yizhestart_suggestions' || event.data.nonce !== nonce) return;
      if (event.data.error) { finish(new Error('Suggestions unavailable')); return; }
      try { finish(null, parseSuggestions(event.data.payload, query)); }
      catch { finish(new Error('Invalid suggestions')); }
    }
    frame.srcdoc = `<!doctype html><meta name="referrer" content="no-referrer"><script>
      const send = (payload, error) => parent.postMessage({ type: 'yizhestart_suggestions', nonce: ${literal(nonce)}, payload, error }, '*');
      window.yizhestart_suggest_callback = payload => send(payload, false);
      const script = document.createElement('script');
      script.src = ${literal(suggestionUrl(engine, query).href)};
      script.referrerPolicy = 'no-referrer'; script.onerror = () => send(null, true);
      document.head.append(script);
    </script>`;
    window.addEventListener('message', onMessage); signal.addEventListener('abort', onAbort, { once: true });
    document.body.append(frame);
  });
}
