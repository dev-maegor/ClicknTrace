(function () {
  if (window.top === window && location.protocol === 'chrome-extension:') return;

  function cleanText(value, max = 160) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  document.addEventListener('click', (event) => {
    const el = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const payload = {
      pageUrl: location.href,
      title: document.title,
      frameId: 0,
      tag: el.tagName,
      text: cleanText(el.innerText || el.getAttribute('aria-label') || el.getAttribute('title')),
      id: cleanText(el.id, 100),
      classes: Array.from(el.classList || []).slice(0, 8).map(v => cleanText(v, 80)),
      x: Math.round(event.clientX),
      y: Math.round(event.clientY),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      rect: { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
      button: event.button,
      time: Date.now()
    };
    chrome.runtime.sendMessage({ type: 'CLICK', click: payload }).catch(() => {});
  }, true);
})();
