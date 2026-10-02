let tabId = null;
let actions = [];
let recording = false;

const $ = (id) => document.getElementById(id);
const startBtn = $('start'), stopBtn = $('stop'), clearBtn = $('clear'), exportBtn = $('export');
const actionsEl = $('actions'), emptyEl = $('empty'), statusEl = $('status'), noticeEl = $('notice');
const actionCountEl = $('actionCount'), requestCountEl = $('requestCount'), errorCountEl = $('errorCount');
const hostEl = $('host'), searchEl = $('search');
let filterQuery = '';

async function currentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

function setRecording(value) {
  recording = value;
  startBtn.disabled = value;
  stopBtn.disabled = !value;
  statusEl.className = `status-pill ${value ? 'live' : 'idle'}`;
  statusEl.querySelector('.status-label').textContent = value ? 'Recording' : 'Idle';
  noticeEl.textContent = value
    ? 'Capturing network activity. Click an element on the webpage to correlate nearby requests.'
    : 'Select a normal webpage tab, then start recording.';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function render() {
  const allRequests = actions.flatMap(a => a.requests || []);
  const errors = allRequests.filter(r => r.failed || Number(r.status) >= 400).length;
  actionCountEl.textContent = actions.length;
  requestCountEl.textContent = allRequests.length;
  errorCountEl.textContent = errors;

  const filtered = actions.filter(action => {
    if (!filterQuery) return true;
    return JSON.stringify(action).toLowerCase().includes(filterQuery);
  });

  emptyEl.style.display = filtered.length ? 'none' : 'flex';
  if (!filtered.length && actions.length) {
    emptyEl.querySelector('strong').textContent = 'No matching activity';
    emptyEl.querySelector('span').textContent = 'Try a different URL, method, status code, or clicked element.';
  } else if (!filtered.length) {
    emptyEl.querySelector('strong').textContent = 'No activity captured';
    emptyEl.querySelector('span').textContent = 'Start recording, then interact with the page. Requests observed shortly after a click will be grouped together.';
  }

  actionsEl.innerHTML = '';
  for (const action of filtered) {
    const card = document.createElement('section');
    card.className = 'action';
    const title = action.element?.text || action.element?.selector || action.element?.tag || 'Element clicked';
    const reqCount = action.requests?.length || 0;
    const hostname = (() => { try { return new URL(action.pageUrl || 'about:blank').hostname; } catch (_) { return ''; } })();
    card.innerHTML = `
      <div class="action-head">
        <div class="clickline"><span class="badge">CLICK</span><span class="clicktext">${escapeHtml(title)}</span><span class="count">${reqCount} req</span></div>
        <div class="meta">${escapeHtml(action.element?.selector || '')} · ${escapeHtml(hostname)}</div>
      </div>
      <div class="requests">${(action.requests || []).map(requestHtml).join('')}</div>`;
    actionsEl.appendChild(card);
  }

  actionsEl.querySelectorAll('.action-head').forEach((head) => {
    head.addEventListener('click', () => head.parentElement.classList.toggle('open'));
  });
  actionsEl.querySelectorAll('.request').forEach((req) => {
    req.addEventListener('click', (event) => {
      event.stopPropagation();
      req.classList.toggle('open');
    });
  });
}

function requestHtml(r) {
  const status = r.status == null ? '…' : r.status;
  const bad = r.status >= 400 || r.failed;
  const details = {
    requestHeaders: r.requestHeaders || {},
    requestBody: r.requestBody,
    responseHeaders: r.responseHeaders || {},
    mimeType: r.mimeType,
    initiator: r.initiator,
    durationMs: r.durationMs,
    error: r.errorText || null
  };
  return `<article class="request">
    <div class="reqline"><span class="method">${escapeHtml(r.method)}</span><span class="status ${bad ? 'bad' : ''}">${escapeHtml(status)}</span><span class="badge">${escapeHtml(r.type)}</span></div>
    <div class="url">${escapeHtml(r.url)}</div>
    <div class="detail"><pre>${escapeHtml(JSON.stringify(details, null, 2))}</pre></div>
  </article>`;
}

async function load() {
  const tab = await currentTab();
  tabId = tab?.id;
  hostEl.textContent = tab?.url ? (() => { try { return new URL(tab.url).hostname; } catch (_) { return tab.url; } })() : 'No page selected';
  if (!tabId) return;
  const state = await chrome.runtime.sendMessage({ type: 'GET_STATE', tabId });
  actions = state?.actions || [];
  setRecording(Boolean(state?.recording));
  render();
}

startBtn.addEventListener('click', async () => {
  const tab = await currentTab();
  tabId = tab?.id;
  if (!tabId) return;
  try {
    const result = await chrome.runtime.sendMessage({ type: 'START_RECORDING', tabId });
    if (!result?.ok) throw new Error(result?.error || 'Could not start recording');
    setRecording(true);
  } catch (e) {
    noticeEl.textContent = `Could not start: ${e.message}. Try a normal http/https webpage.`;
  }
});

stopBtn.addEventListener('click', async () => {
  if (!tabId) return;
  await chrome.runtime.sendMessage({ type: 'STOP_RECORDING', tabId });
  setRecording(false);
});

clearBtn.addEventListener('click', async () => {
  if (!tabId) return;
  await chrome.runtime.sendMessage({ type: 'CLEAR', tabId });
  actions = [];
  render();
});

exportBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), tabId, actions }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `clicktrace-${Date.now()}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'PANEL_EVENT' || message.tabId !== tabId) return;
  if (message.event === 'ACTION_STARTED') {
    actions.unshift(message.action);
    actions = actions.slice(0, 100);
    render();
  } else if (message.event === 'REQUEST_ADDED') {
    const action = actions.find(a => a.id === message.actionId);
    if (action) action.requests.push(message.request);
    render();
  } else if (message.event === 'REQUEST_UPDATED') {
    for (const action of actions) {
      const idx = action.requests.findIndex(r => r.requestId === message.request.requestId);
      if (idx >= 0) action.requests[idx] = { ...action.requests[idx], ...message.request };
    }
    render();
  } else if (message.event === 'CLEARED') {
    actions = []; render();
  } else if (message.event === 'DETACHED') {
    setRecording(false);
    noticeEl.textContent = 'Recording stopped because the debugger connection was detached.';
  }
});

searchEl.addEventListener('input', () => { filterQuery = searchEl.value.trim().toLowerCase(); render(); });

load();
