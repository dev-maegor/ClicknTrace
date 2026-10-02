const tabs = new Map();
const debuggerAttached = new Set();
const requestMaps = new Map();

const ACTION_WINDOW_MS = 6000;
const MAX_ACTIONS = 100;
const MAX_REQUESTS_PER_ACTION = 500;

function stateFor(tabId) {
  if (!tabs.has(tabId)) {
    tabs.set(tabId, {
      recording: false,
      actions: [],
      currentAction: null,
      nextActionId: 1
    });
  }
  return tabs.get(tabId);
}

function sendToPanel(tabId, message) {
  chrome.runtime.sendMessage({ type: "PANEL_EVENT", tabId, ...message }).catch(() => {});
}

async function attach(tabId) {
  if (debuggerAttached.has(tabId)) return;
  await chrome.debugger.attach({ tabId }, "1.3");
  debuggerAttached.add(tabId);
  await chrome.debugger.sendCommand({ tabId }, "Network.enable", {
    maxTotalBufferSize: 10000000,
    maxResourceBufferSize: 5000000
  });
}

async function detach(tabId) {
  if (!debuggerAttached.has(tabId)) return;
  try { await chrome.debugger.detach({ tabId }); } catch (_) {}
  debuggerAttached.delete(tabId);
  requestMaps.delete(tabId);
}

function cssEscape(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, ch => `\\${ch}`);
}

function selectorForClick(click) {
  const bits = [];
  if (click.tag) bits.push(click.tag.toLowerCase());
  if (click.id) bits.push(`#${cssEscape(click.id)}`);
  if (click.classes?.length) bits.push(`.${click.classes.slice(0, 3).map(cssEscape).join('.')}`);
  return bits.join("") || click.tag || "element";
}

function beginAction(tabId, click) {
  const state = stateFor(tabId);
  const action = {
    id: state.nextActionId++,
    timestamp: Date.now(),
    pageUrl: click.pageUrl || "",
    title: click.title || "",
    frameId: click.frameId ?? 0,
    element: {
      tag: click.tag,
      text: click.text,
      id: click.id,
      classes: click.classes,
      selector: selectorForClick(click)
    },
    requests: []
  };
  state.currentAction = action;
  state.actions.unshift(action);
  state.actions = state.actions.slice(0, MAX_ACTIONS);
  sendToPanel(tabId, { event: "ACTION_STARTED", action });
  return action;
}

function addRequestToAction(tabId, request) {
  const state = stateFor(tabId);
  const now = Date.now();
  let action = state.currentAction;
  if (!action || now - action.timestamp > ACTION_WINDOW_MS) return;
  if (action.requests.length >= MAX_REQUESTS_PER_ACTION) return;

  action.requests.push(request);
  sendToPanel(tabId, { event: "REQUEST_UPDATED", actionId: action.id, request });
}

function findActionForRequest(tabId) {
  const state = stateFor(tabId);
  const now = Date.now();
  if (state.currentAction && now - state.currentAction.timestamp <= ACTION_WINDOW_MS) {
    return state.currentAction;
  }
  return null;
}

function sanitizeHeaders(headers) {
  const out = {};
  if (!headers) return out;
  for (const [k, v] of Object.entries(headers)) {
    out[k] = String(v);
  }
  return out;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id ?? message.tabId;

  if (message.type === "CLICK" && tabId != null) {
    const state = stateFor(tabId);
    if (state.recording) beginAction(tabId, { ...message.click, frameId: sender.frameId ?? message.click.frameId ?? 0 });
    return;
  }

  if (message.type === "START_RECORDING") {
    const id = message.tabId;
    (async () => {
      try {
        await attach(id);
        const state = stateFor(id);
        state.recording = true;
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type === "STOP_RECORDING") {
    const id = message.tabId;
    (async () => {
      const state = stateFor(id);
      state.recording = false;
      state.currentAction = null;
      await detach(id);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === "GET_STATE") {
    const state = stateFor(message.tabId);
    sendResponse({
      recording: state.recording,
      actions: state.actions,
      attached: debuggerAttached.has(message.tabId)
    });
    return;
  }

  if (message.type === "CLEAR") {
    const state = stateFor(message.tabId);
    state.actions = [];
    state.currentAction = null;
    sendToPanel(message.tabId, { event: "CLEARED" });
    sendResponse({ ok: true });
    return;
  }

  if (message.type === "EXPORT_STATE") {
    const state = stateFor(message.tabId);
    sendResponse({ actions: state.actions });
  }
});

chrome.debugger.onEvent.addListener(async (source, method, params) => {
  const tabId = source.tabId;
  if (!tabId || !debuggerAttached.has(tabId)) return;
  if (!tabs.get(tabId)?.recording) return;

  if (method === "Network.requestWillBeSent") {
    const p = params.request;
    const request = {
      requestId: params.requestId,
      url: p.url,
      method: p.method,
      type: params.type || "Other",
      timestamp: Date.now(),
      requestHeaders: sanitizeHeaders(p.headers),
      requestBody: p.postData || null,
      status: null,
      responseHeaders: {},
      mimeType: null,
      durationMs: null,
      initiator: params.initiator || null,
      finished: false,
      failed: false
    };
    if (!requestMaps.has(tabId)) requestMaps.set(tabId, new Map());
    requestMaps.get(tabId).set(params.requestId, request);
    const action = findActionForRequest(tabId);
    if (action) {
      action.requests.push(request);
      sendToPanel(tabId, { event: "REQUEST_ADDED", actionId: action.id, request });
    }
    return;
  }

  const map = requestMaps.get(tabId);
  const request = map?.get(params.requestId);
  if (!request) return;

  if (method === "Network.responseReceived") {
    request.status = params.response.status;
    request.responseHeaders = sanitizeHeaders(params.response.headers);
    request.mimeType = params.response.mimeType;
    request.responseUrl = params.response.url;
    request.protocol = params.response.protocol;
    request.encodedDataLength = params.response.encodedDataLength;
    sendToPanel(tabId, { event: "REQUEST_UPDATED", request });
  }

  if (method === "Network.loadingFinished") {
    request.finished = true;
    request.durationMs = Math.max(0, Date.now() - request.timestamp);
    request.encodedDataLength = params.encodedDataLength;
    sendToPanel(tabId, { event: "REQUEST_UPDATED", request });
    setTimeout(() => map.delete(params.requestId), 30000);
  }

  if (method === "Network.loadingFailed") {
    request.failed = true;
    request.errorText = params.errorText;
    request.canceled = params.canceled;
    request.durationMs = Math.max(0, Date.now() - request.timestamp);
    sendToPanel(tabId, { event: "REQUEST_UPDATED", request });
    setTimeout(() => map.delete(params.requestId), 30000);
  }
});

chrome.debugger.onDetach.addListener((source, reason) => {
  const tabId = source.tabId;
  debuggerAttached.delete(tabId);
  const state = stateFor(tabId);
  state.recording = false;
  state.currentAction = null;
  requestMaps.delete(tabId);
  sendToPanel(tabId, { event: "DETACHED", reason });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabs.delete(tabId);
  requestMaps.delete(tabId);
  debuggerAttached.delete(tabId);
});

chrome.runtime.onInstalled.addListener(async () => {
  try { await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); } catch (_) {}
});

chrome.runtime.onStartup.addListener(async () => {
  try { await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); } catch (_) {}
});
