export const $ = (s) => document.querySelector(s);
export const $$ = (s) => document.querySelectorAll(s);
export const toast = (m) => {
  console.log('Toast:', m);
  if (typeof document !== 'undefined') {
    let container = document.getElementById('vp-global-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'vp-global-toast-container';
      container.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;align-items:center;';
      document.body.appendChild(container);
    }
    const item = document.createElement('div');
    item.style.cssText = 'padding:8px 16px;background:#18181b;color:#f4f4f5;border:1px solid rgba(255,255,255,0.18);border-radius:999px;font-size:12px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,0.6);pointer-events:auto;transition:opacity 0.25s ease;';
    item.textContent = m;
    container.appendChild(item);
    setTimeout(() => {
      item.style.opacity = '0';
      setTimeout(() => item.remove(), 250);
    }, 3000);
  }
};
export const formatNumber = (n) => Number(n).toLocaleString();
