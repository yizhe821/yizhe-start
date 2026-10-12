const layers: HTMLElement[] = [];
let previousOverflow = '';
export function registerLayer(element: HTMLElement) {
  if (!layers.length) { previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
  layers.push(element);
  element.style.zIndex = String(100 + layers.length * 10);
  syncLayers();
}
export function unregisterLayer(element: HTMLElement) {
  const index = layers.indexOf(element);
  if (index !== -1) layers.splice(index, 1);
  if (!layers.length) document.body.style.overflow = previousOverflow;
  syncLayers();
}
function syncLayers() {
  const app = document.querySelector<HTMLElement>('#app');
  if (app) {
    app.inert = layers.length > 0;
    if (layers.length) app.setAttribute('aria-hidden', 'true'); else app.removeAttribute('aria-hidden');
  }
  layers.forEach((layer, index) => {
    layer.inert = index !== layers.length - 1;
    if (layer.inert) layer.setAttribute('aria-hidden', 'true'); else layer.removeAttribute('aria-hidden');
  });
}
export function isTopLayer(element: HTMLElement) { return layers.at(-1) === element; }
export function focusableElements(element: HTMLElement) {
  return [...element.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')]
    .filter(el => !el.hasAttribute('disabled') && el.tabIndex >= 0 && !el.closest('[inert]') && el.getClientRects().length > 0);
}
