(() => {
  'use strict';
  if (window.__tibkBridgeInstalled) return;
  window.__tibkBridgeInstalled = true;

  const FLAG = '__tibToolkit';
  const STATE_KEY = '__tibToolkitState';
  const CFG = {
    appProxyPattern: /\/api\/app_proxy\/([^/?]+)/i,
    graphQlVersion: 'unstable',
    themeGidPrefix: 'gid://shopify/OnlineStoreTheme/',
    roles: new Set(['main', 'unpublished', 'demo', 'development', 'MAIN', 'UNPUBLISHED', 'DEMO', 'DEVELOPMENT', 'draft', 'DRAFT', 'published', 'PUBLISHED']),
    maxResponseText: 4000000
  };

  const LIST_THEMES_Q = 'query ListThemes { onlineStore { themes(first: 50) { edges { node { id name role } } } } }';

  function extractStoreHandle() {
    const m = window.location.pathname.match(/\/store\/([^/?#]+)/);
    return m ? m[1] : '';
  }

  function findCsrfToken() {
    // Thử tìm trong meta tag hoặc cookie
    const meta = document.querySelector('meta[name="csrf-token"]') || document.querySelector('meta[name="shopify-csrf-token"]');
    if (meta && meta.getAttribute('content')) return meta.getAttribute('content');
    const m = document.cookie.match(/_shopify_y=([^;]+)/);
    return '';
  }

  let isFetchingThemes = false;
  let hasFetchedThemes = false;

  async function fetchThemesViaGql() {
    if (isFetchingThemes || hasFetchedThemes) return [];
    try {
      if (!S.session || !S.session.handle || !S.session.headers['x-csrf-token']) return [];
      isFetchingThemes = true;
      console.log('[TIB-Toolkit] Proactively querying themes via GraphQL with handle:', S.session.handle);
      const json = await gql('ListThemes', LIST_THEMES_Q, {});
      const edges = (json.data && json.data.onlineStore && json.data.onlineStore.themes && json.data.onlineStore.themes.edges) || [];
      const list = edges.map((e) => {
        const n = e.node || {};
        return { id: numericId(n.id), name: String(n.name || ''), role: String(n.role || '').toLowerCase() };
      }).filter((t) => t.id && t.name);
      console.log('[TIB-Toolkit] Proactive GraphQL themes query result:', list);
      if (list.length) {
        hasFetchedThemes = true;
        pushThemes(list);
      }
      return list;
    } catch (err) {
      console.warn('[TIB-Toolkit] Failed to proactively query themes via GraphQL:', err);
      return [];
    } finally {
      isFetchingThemes = false;
    }
  }
  const LIST_Q = 'query ListFiles($themeId: ID!, $first: Int!, $after: String) { onlineStore { theme(id: $themeId) { files(first: $first, after: $after) { edges { cursor node { filename } } pageInfo { hasNextPage endCursor } } } } }';
  const WRITE_M = 'mutation WriteFiles($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) { themeFilesUpsert(themeId: $themeId, files: $files) { upsertedThemeFiles { filename } userErrors { filename code message } } }';
  // UNVERIFIED: dùng cho Undo file mới tạo. Phải xử lý lỗi êm (báo "xoá thủ công").
  const DELETE_M = 'mutation DeleteFiles($themeId: ID!, $files: [String!]!) { themeFilesDelete(themeId: $themeId, files: $files) { deletedThemeFiles { filename } userErrors { filename code message } } }';

  const S = (window[STATE_KEY] = window[STATE_KEY] || { session: null, themes: [] });

  const post = (kind, payload) => {
    try { window.postMessage({ [FLAG]: true, kind, ...(payload || {}) }, '*'); } catch (_) {}
  };
  const numericId = (id) => {
    const m = String(id || '').match(/(\d{4,})/);
    return m ? m[1] : String(id || '');
  };
  const toGid = (id) => {
    const raw = String(id || '');
    return raw.startsWith(CFG.themeGidPrefix) ? raw : CFG.themeGidPrefix + numericId(raw);
  };

  function collectHeaders(target, headers) {
    if (!headers) return;
    if (typeof headers.forEach === 'function') {
      headers.forEach((v, k) => { target[String(k).toLowerCase()] = v; });
    } else if (Array.isArray(headers)) {
      for (const p of headers) if (Array.isArray(p) && p.length > 1) target[String(p[0]).toLowerCase()] = p[1];
    } else {
      for (const k of Object.keys(headers)) target[String(k).toLowerCase()] = headers[k];
    }
  }

  function captureAppProxy(url, headers) {
    const urlStr = String(url || '');
    const m = urlStr.match(CFG.appProxyPattern);
    const csrf = headers['x-csrf-token'];
    
    // Nếu bắt được app_proxy rõ ràng
    if (m && csrf) {
      const isNew = !S.session || S.session.handle !== m[1];
      S.session = { headers: { ...headers }, handle: m[1], ts: Date.now() };
      console.log('[TIB-Toolkit] Captured Shopify app proxy session:', m[1]);
      post('session', { handle: m[1] });
      if (isNew || !S.themes.length) {
        fetchThemesViaGql();
      }
      return;
    }

    // Fallback: nếu bất kỳ request nào có x-csrf-token trên trang admin.shopify.com/store/<handle>
    if (csrf) {
      const handle = extractStoreHandle();
      if (handle) {
        const isNew = !S.session || S.session.handle !== handle;
        S.session = { headers: { ...headers }, handle, ts: Date.now() };
        console.log('[TIB-Toolkit] Captured session from store path & csrf header:', handle);
        post('session', { handle });
        if (isNew || !S.themes.length) {
          fetchThemesViaGql();
        }
      }
    }
  }

  function extractThemes(node, acc, depth) {
    if (!node || typeof node !== 'object' || depth > 12) return;
    if (Array.isArray(node)) { for (const c of node) extractThemes(c, acc, depth + 1); return; }
    const name = node.name || node.title;
    if (node.id != null && name && node.role && CFG.roles.has(String(node.role))) {
      acc.push({ id: numericId(node.id), name: String(name), role: String(node.role).toLowerCase() });
    }
    for (const k of Object.keys(node)) {
      try { extractThemes(node[k], acc, depth + 1); } catch (_) {}
    }
  }

  function pushThemes(found) {
    if (!found.length) return;
    const map = new Map(S.themes.map((t) => [t.id, t]));
    let hasNew = false;
    for (const t of found) {
      if (!map.has(t.id)) {
        map.set(t.id, t);
        hasNew = true;
      }
    }
    if (!hasNew && S.themes.length) return; // Không bắn event nếu không có theme mới
    S.themes = [...map.values()];
    console.log('[TIB-Toolkit] Total themes captured in page:', S.themes);
    post('themes', { themes: S.themes });
  }

  function handleResponseText(text) {
    if (!text || text.length > CFG.maxResponseText) return;
    let json;
    try { json = JSON.parse(text); } catch (_) { return; }
    const acc = [];
    extractThemes(json, acc, 0);
    pushThemes(acc);
  }

  // ---- patch fetch
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const h = {};
        if (input && input.headers) collectHeaders(h, input.headers);
        if (init && init.headers) collectHeaders(h, init.headers);
        captureAppProxy(url, h);
      } catch (_) {}
      return origFetch.apply(this, arguments).then((res) => {
        try { res.clone().text().then(handleResponseText).catch(() => {}); } catch (_) {}
        return res;
      });
    };
  }

  // ---- patch XHR
  const xOpen = XMLHttpRequest.prototype.open;
  const xSet = XMLHttpRequest.prototype.setRequestHeader;
  const xSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__tibkUrl = url; this.__tibkHeaders = {};
    return xOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    try { (this.__tibkHeaders = this.__tibkHeaders || {})[String(k).toLowerCase()] = v; } catch (_) {}
    return xSet.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    try { captureAppProxy(this.__tibkUrl, this.__tibkHeaders || {}); } catch (_) {}
    this.addEventListener('load', function () {
      try { handleResponseText(this.responseText); } catch (_) {}
    });
    return xSend.apply(this, arguments);
  };

  // ---- GraphQL qua app proxy
  async function gql(operationName, query, variables) {
    const api = S.session;
    if (!api || !api.handle || !api.headers['x-csrf-token']) {
      throw new Error('NO_SESSION: Chưa bắt được session Shopify. Mở Online Store → Themes và đợi danh sách theme load xong.');
    }
    const url = `/api/app_proxy/${api.handle}?operation=${encodeURIComponent(operationName)}&version=${encodeURIComponent(CFG.graphQlVersion)}`;
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: api.headers,
      body: JSON.stringify({ operationName, variables, query })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
    if (json.errors && json.errors.length) throw new Error(JSON.stringify(json.errors));
    return json;
  }

  async function readFile(themeId, filename) {
    const json = await gql('ReadFile', READ_Q, { themeId: toGid(themeId), fileNames: [filename] });
    const node = ((json.data && json.data.onlineStore && json.data.onlineStore.theme && json.data.onlineStore.theme.files.edges) || [])[0];
    const content = node && node.node && node.node.body && node.node.body.content;
    return { ok: true, filename, exists: typeof content === 'string', content: typeof content === 'string' ? content : '' };
  }

  async function listFiles(themeId) {
    const names = [];
    let after = null;
    for (let guard = 0; guard < 20; guard++) {
      const json = await gql('ListFiles', LIST_Q, { themeId: toGid(themeId), first: 250, after });
      const files = json.data.onlineStore.theme.files;
      for (const e of files.edges || []) if (e.node && e.node.filename) names.push(e.node.filename);
      if (!files.pageInfo.hasNextPage) break;
      after = files.pageInfo.endCursor;
      if (!after) break;
    }
    return { ok: true, filenames: [...new Set(names)].sort() };
  }

  async function writeFiles(themeId, files) {
    const json = await gql('WriteFiles', WRITE_M, {
      themeId: toGid(themeId),
      files: files.map((f) => ({ filename: f.filename, body: { type: 'TEXT', value: f.content } }))
    });
    const r = json.data && json.data.themeFilesUpsert;
    const ue = (r && r.userErrors) || [];
    if (ue.length) return { ok: false, error: JSON.stringify(ue), userErrors: ue };
    return { ok: true, upserted: (r && r.upsertedThemeFiles) || [] };
  }

  async function deleteFiles(themeId, filenames) {
    const json = await gql('DeleteFiles', DELETE_M, { themeId: toGid(themeId), files: filenames });
    const r = json.data && json.data.themeFilesDelete;
    const ue = (r && r.userErrors) || [];
    if (ue.length) return { ok: false, error: JSON.stringify(ue), userErrors: ue };
    return { ok: true, deleted: (r && r.deletedThemeFiles) || [] };
  }

  async function handle(action, p) {
    switch (action) {
      case 'getCapturedThemes':
        if (!S.themes.length && S.session) {
          console.log('[TIB-Toolkit] getCapturedThemes called with empty themes, triggering fetchThemesViaGql');
          await fetchThemesViaGql();
        }
        return { ok: true, themes: S.themes, hasSession: !!S.session, handle: S.session ? S.session.handle : '', sessionTs: S.session ? S.session.ts : 0 };
      case 'readFile': return readFile(p.themeId, p.filename);
      case 'listFiles': return listFiles(p.themeId);
      case 'writeFiles': return writeFiles(p.themeId, p.files || []);
      case 'deleteFiles': return deleteFiles(p.themeId, p.filenames || []);
      default: return { ok: false, error: `Unknown action: ${action}` };
    }
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const d = event.data;
    if (!d || d[FLAG] !== true || d.kind !== 'request') return;
    let result;
    try { result = await handle(d.action, d.payload || {}); }
    catch (e) { result = { ok: false, error: (e && e.message) || String(e) }; }
    post('result', { requestId: d.requestId, result });
  });

  setTimeout(() => {
    if (S.themes.length) post('themes', { themes: S.themes });
    if (S.session) post('session', { handle: S.session.handle });
  }, 1500);
})();
