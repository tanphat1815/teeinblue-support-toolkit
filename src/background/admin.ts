import { MSG, STORAGE, UNDO_MAX } from '@/shared/constants';
import type { Req } from '@/shared/messages';
import type {
  AdminStatus, DetectedTheme, InjectResult, PreviewRow, ThemeInfo, UndoFile, UndoRecord, UndoResult, UndoSummary
} from '@/shared/types';
import { isAllowedFilename, markerStart, parseThemeInfo, planWrite } from '@/services/theme-writer';
import { activeTab } from './storefront';

const ADMIN_FRAME_RE = /^https:\/\/(admin\.shopify\.com\/store\/|online-store-web\.shopifyapps\.com\/)/i;
const NO_SESSION =
  'NO_SESSION: Chưa bắt được session Shopify. Mở Shopify Admin → Online Store → Themes, đợi danh sách theme load xong rồi thử lại (nếu vừa reload extension, hãy reload tab Admin).';

interface Sess { frameId: number; handle: string; ts: number }
interface TabState { themes: ThemeInfo[]; sessions: Map<number, Sess>; lastActiveTs: number }
const states = new Map<number, TabState>();
class BridgeError extends Error {}

const state = (tabId: number): TabState => {
  if (!states.has(tabId)) states.set(tabId, { themes: [], sessions: new Map(), lastActiveTs: Date.now() });
  return states.get(tabId)!;
};
export function touchTabActive(tabId: number) {
  if (states.has(tabId)) states.get(tabId)!.lastActiveTs = Date.now();
}
const bestSession = (s: TabState): Sess | null => [...s.sessions.values()].sort((a, b) => b.ts - a.ts)[0] || null;
export const handleFromUrl = (url: string) => url.match(/\/store\/([^/?#]+)/)?.[1] || '';

function mergeThemes(a: ThemeInfo[], b: ThemeInfo[]): ThemeInfo[] {
  const m = new Map<string, ThemeInfo>();
  for (const t of [...a, ...b]) if (t?.id) m.set(t.id, { ...m.get(t.id), ...t, role: String(t.role || '').toLowerCase() });
  return [...m.values()].sort((x, y) =>
    x.role === 'main' && y.role !== 'main' ? -1 : y.role === 'main' && x.role !== 'main' ? 1 : x.name.localeCompare(y.name));
}

// ---- content script → SW (SW có thể bị ngủ, nên luôn có refresh() từ frames)
export function onThemesCaptured(tabId: number, themes: ThemeInfo[]) {
  const s = state(tabId); s.themes = mergeThemes(s.themes, themes);
}
export function onSessionCaptured(tabId: number, frameId: number, handle: string) {
  state(tabId).sessions.set(frameId, { frameId, handle, ts: Date.now() });
}
export function clearTabState(tabId: number) { states.delete(tabId); }

async function getFrames(tabId: number): Promise<{ frameId: number; url: string }[]> {
  try {
    const f = await chrome.webNavigation.getAllFrames({ tabId });
    if (f) return f.map((x) => ({ frameId: x.frameId, url: x.url || '' }));
  } catch { /* fallthrough */ }
  return [{ frameId: 0, url: '' }];
}
const ask = (tabId: number, frameId: number, action: string, payload: unknown): Promise<any> =>
  chrome.tabs.sendMessage(tabId, { type: MSG.TO_PAGE, action, payload }, { frameId });

async function refresh(tabId: number) {
  const s = state(tabId);
  const allFrames = await getFrames(tabId);
  const frames = allFrames.filter((f) => ADMIN_FRAME_RE.test(f.url) || f.frameId === 0);
  await Promise.all(frames.map(async (f) => {
    try {
      const r = await ask(tabId, f.frameId, 'getCapturedThemes', {});
      if (!r?.ok) return;
      if (Array.isArray(r.themes) && r.themes.length) s.themes = mergeThemes(s.themes, r.themes);
      if (r.hasSession && r.handle) s.sessions.set(f.frameId, { frameId: f.frameId, handle: r.handle, ts: r.sessionTs || Date.now() });
    } catch { /* frame không có relay */ }
  }));
}

async function callAdmin<T = any>(tabId: number, action: string, payload: Record<string, unknown> = {}): Promise<T> {
  let sess = bestSession(state(tabId));
  if (!sess) { await refresh(tabId); sess = bestSession(state(tabId)); }
  if (!sess) throw new Error(NO_SESSION);

  const run = async (frameId: number): Promise<T> => {
    const r = await ask(tabId, frameId, action, payload);
    if (!r) throw new Error('Empty response from page bridge.');
    if (r.ok === false) throw new BridgeError(r.error || 'Page bridge error.');
    return r as T;
  };
  try {
    return await run(sess.frameId);
  } catch (e) {
    if (e instanceof BridgeError) throw e;
    await refresh(tabId);
    const next = bestSession(state(tabId));
    if (next && next.frameId !== sess.frameId) return run(next.frameId);
    throw new Error(`Không giao tiếp được với frame Shopify ${sess.frameId}: ${(e as Error).message}`);
  }
}

async function findAdminTab(storeHandle?: string): Promise<chrome.tabs.Tab | null> {
  const cur = await activeTab();
  const isAdmin = (t?: chrome.tabs.Tab | null) => !!t?.url && /^https:\/\/admin\.shopify\.com\/store\//.test(t.url);
  const all = await chrome.tabs.query({ url: 'https://admin.shopify.com/store/*' });

  // Nếu không chỉ định storeHandle: ưu tiên tab hiện tại nếu là Admin, nếu không thì chọn tab Admin tương tác gần nhất
  if (!storeHandle) {
    if (isAdmin(cur)) return cur;
    if (!all.length) return null;
    return all.sort((a, b) => {
      const tsA = (a.id && states.get(a.id)?.lastActiveTs) || 0;
      const tsB = (b.id && states.get(b.id)?.lastActiveTs) || 0;
      return tsB - tsA;
    })[0];
  }

  // Nếu có storeHandle cụ thể: tìm đúng tab thuộc storeHandle đó
  const match = all.filter((t) => handleFromUrl(t.url || '') === storeHandle);
  if (!match.length) return null;
  return match.find((t) => t.id === cur?.id) || match.find((t) => t.active) || match.sort((a, b) => {
    const tsA = (a.id && states.get(a.id)?.lastActiveTs) || 0;
    const tsB = (b.id && states.get(b.id)?.lastActiveTs) || 0;
    return tsB - tsA;
  })[0];
}

export async function adminStatus(storeHandle?: string): Promise<AdminStatus> {
  const tab = await findAdminTab(storeHandle);
  if (!tab?.id) return { adminTabId: null, storeHandle: storeHandle || '', hasSession: false, themes: [] };
  let s = state(tab.id);
  if (!bestSession(s) || !s.themes.length) { await refresh(tab.id); s = state(tab.id); }
  return {
    adminTabId: tab.id,
    storeHandle: handleFromUrl(tab.url || '') || storeHandle || '',
    hasSession: !!bestSession(s),
    themes: s.themes
  };
}

export async function openThemes(storeHandle: string) {
  const url = storeHandle ? `https://admin.shopify.com/store/${storeHandle}/themes` : 'https://admin.shopify.com/';
  const tab = await chrome.tabs.create({ url });
  return { tabId: tab.id ?? null };
}

export async function detectTheme(adminTabId: number, themeId: string): Promise<DetectedTheme> {
  const r = await callAdmin<{ exists: boolean; content: string }>(adminTabId, 'readFile', { themeId, filename: 'config/settings_schema.json' });
  return r.exists ? parseThemeInfo(r.content) : { name: '', version: '', slug: '' };
}

// ---- Undo store
async function readUndo(): Promise<UndoRecord[]> {
  const s = await chrome.storage.local.get(STORAGE.undo);
  return (s[STORAGE.undo] as UndoRecord[]) || [];
}
async function writeUndo(list: UndoRecord[]) {
  let l = list.slice(0, UNDO_MAX);
  while (l.length > 1 && JSON.stringify(l).length > 4_000_000) l = l.slice(0, -1); // chừa quota 10MB
  await chrome.storage.local.set({ [STORAGE.undo]: l });
}
export async function listUndo(storeHandle: string): Promise<UndoSummary[]> {
  return (await readUndo())
    .filter((r) => r.storeHandle === storeHandle)
    .map(({ files, ...r }) => ({
      ...r,
      createdAt: r.createdAt || new Date(r.ts).toISOString(),
      themeRole: (r as UndoRecord).themeRole || '',
      snippetIds: (r as UndoRecord).snippetIds?.length ? (r as UndoRecord).snippetIds : [r.snippetId],
      markerNote: (r as UndoRecord).markerNote || '',
      files: files.map((f) => ({ filename: f.filename, existed: f.existed }))
    }));
}

// ---- Preview (đọc content hiện tại, chạy planWrite KHÔNG ghi) — dòng chỉ là ước lượng
export async function previewInject(adminTabId: number, themeId: string, targets: { filename: string; mode: any; code: string; snippetId?: string }[]): Promise<PreviewRow[]> {
  const rows: PreviewRow[] = [];
  const cache = new Map<string, { exists: boolean; content: string }>();
  const lineOf = (content: string, idx: number) => content.slice(0, idx).split('\n').length;
  for (const t of targets) {
    let cur = cache.get(t.filename);
    if (!cur) {
      const r = await callAdmin<{ exists: boolean; content: string }>(adminTabId, 'readFile', { themeId, filename: t.filename });
      cur = { exists: r.exists, content: r.content || '' };
      cache.set(t.filename, cur);
    }
    const sid = t.snippetId || '';
    const plan = planWrite({ current: cur.content, exists: cur.exists, mode: t.mode, filename: t.filename, code: t.code, snippetId: sid });
    if (plan.skipped) {
      rows.push({ filename: t.filename, exists: cur.exists, action: 'SKIP', detail: plan.reason || 'Skipped.', line: null, snippetIds: [sid] });
      continue;
    }
    let action: PreviewRow['action'] = 'APPEND';
    let line: number | null = null;
    let detail = plan.resolvedMode;
    if (plan.resolvedMode === 'create' && !cur.exists) { action = 'CREATE'; detail = 'File chưa tồn tại — sẽ tạo mới.'; }
    else if (plan.resolvedMode === 'replace') { action = 'REPLACE'; detail = 'Ghi đè toàn bộ file.'; }
    else {
      const mHead = plan.resolvedMode === 'before-head' ? cur.content.search(/\s*<\/head>/i) : -1;
      const mBody = plan.resolvedMode === 'before-body' ? cur.content.search(/\s*<\/body>/i) : -1;
      const m = mHead >= 0 ? mHead : mBody;
      if (m >= 0) { action = 'INSERT'; line = lineOf(cur.content, m); detail = `${plan.resolvedMode} (≈ dòng ${line}, ước lượng tại thời điểm đọc).`; }
      else { action = 'APPEND'; line = cur.content ? cur.content.split('\n').length + 1 : 1; detail = `Nối vào cuối file (≈ dòng ${line}, ước lượng).`; }
    }
    cache.set(t.filename, { exists: true, content: plan.content });
    rows.push({ filename: t.filename, exists: cur.exists, action, detail, line, snippetIds: [sid] });
  }
  // gộp các target cùng filename thành 1 dòng
  const merged = new Map<string, PreviewRow>();
  for (const r of rows) {
    const e = merged.get(r.filename);
    if (!e) merged.set(r.filename, { ...r, snippetIds: [...r.snippetIds] });
    else e.snippetIds.push(...r.snippetIds.filter((s) => !e.snippetIds.includes(s)));
  }
  return [...merged.values()];
}

// ---- Inject
export async function inject(req: Extract<Req, { type: 'INJECT' }>): Promise<InjectResult> {
  const { adminTabId, themeId, targets } = req;
  const snippetIds = req.snippetIds?.length ? req.snippetIds : [req.snippetId];
  const markerNote = (req.markerNote || '').trim();
  const injectedAt = new Date().toISOString();
  if (!targets.length) throw new Error('Không có target để inject.');
  for (const t of targets) if (!isAllowedFilename(t.filename)) throw new Error(`Filename bị chặn/không hợp lệ: ${t.filename}`);

  const plans: { filename: string; content: string; mode: string }[] = [];
  const skipped: InjectResult['skipped'] = [];
  const backups: UndoFile[] = [];
  const fileSnippetIds = new Map<string, Set<string>>();
  const working = new Map<string, { exists: boolean; content: string }>(); // nhiều target cùng 1 file

  for (const t of targets) {
    let cur = working.get(t.filename);
    if (!cur) {
      const r = await callAdmin<{ exists: boolean; content: string }>(adminTabId, 'readFile', { themeId, filename: t.filename });
      cur = { exists: r.exists, content: r.content };
      backups.push({ filename: t.filename, existed: r.exists, previous: r.content, snippetIds: [], injectedAt, expected: '' });
    }
    const sid = (t as { snippetId?: string }).snippetId || snippetIds[0] || req.snippetId;
    let ids = fileSnippetIds.get(t.filename);
    if (!ids) { ids = new Set(); fileSnippetIds.set(t.filename, ids); }
    ids.add(sid);
    const plan = planWrite({ current: cur.content, exists: cur.exists, mode: t.mode, filename: t.filename, code: t.code, snippetId: sid, marker: { at: injectedAt, note: markerNote } });
    if (plan.skipped) { skipped.push({ filename: t.filename, reason: plan.reason || 'Skipped.' }); working.set(t.filename, cur); continue; }
    working.set(t.filename, { exists: true, content: plan.content });
    const i = plans.findIndex((p) => p.filename === t.filename);
    if (i >= 0) plans[i] = { filename: t.filename, content: plan.content, mode: plan.resolvedMode };
    else plans.push({ filename: t.filename, content: plan.content, mode: plan.resolvedMode });
  }

  if (!plans.length) return { status: 'NO_CHANGES', written: [], skipped };

  await callAdmin(adminTabId, 'writeFiles', { themeId, files: plans.map((p) => ({ filename: p.filename, content: p.content })) });

  const changed = new Set(plans.map((p) => p.filename));
  const expectedByFile = new Map(plans.map((p) => [p.filename, p.content]));
  const record: UndoRecord = {
    id: `undo_${Date.now().toString(36)}`, ts: Date.now(), createdAt: injectedAt,
    storeHandle: req.storeHandle, themeId,
    themeName: req.themeName, themeRole: req.themeRole || '',
    snippetId: snippetIds[0] || req.snippetId, snippetIds, markerNote,
    files: backups
      .filter((b) => changed.has(b.filename))
      .map((b) => ({ ...b, snippetIds: [...(fileSnippetIds.get(b.filename) || [])], expected: expectedByFile.get(b.filename) || '' }))
  };
  await writeUndo([record, ...(await readUndo())]);
  return { status: 'WRITTEN', written: plans.map((p) => ({ filename: p.filename, mode: p.mode })), skipped, undoId: record.id };
}

export async function undo(adminTabId: number, undoId: string): Promise<UndoResult> {
  const list = await readUndo();
  const rec = list.find((r) => r.id === undoId);
  if (!rec) throw new Error('Không tìm thấy bản ghi undo.');
  const result: UndoResult = { restored: [], deleted: [], manual: [] };

  // Đọc lại nội dung hiện tại để phát hiện file bị sửa/xoá tay sau khi inject.
  const current = new Map<string, { exists: boolean; content: string }>();
  for (const f of rec.files) {
    if (current.has(f.filename)) continue;
    try {
      const r = await callAdmin<{ exists: boolean; content: string }>(adminTabId, 'readFile', { themeId: rec.themeId, filename: f.filename });
      current.set(f.filename, { exists: r.exists, content: r.content || '' });
    } catch {
      current.set(f.filename, { exists: false, content: '' });
    }
  }

  const toRestore = rec.files.filter((f) => f.existed);
  if (toRestore.length) {
    await callAdmin(adminTabId, 'writeFiles', { themeId: rec.themeId, files: toRestore.map((f) => ({ filename: f.filename, content: f.previous })) });
    result.restored = toRestore.map((f) => {
      const cur = current.get(f.filename);
      return (cur && cur.exists && f.expected && cur.content !== f.expected)
        ? `${f.filename} (file đã bị sửa sau khi inject lúc ${f.injectedAt || rec.createdAt || ''} — đã khôi phục về bản backup)`
        : f.filename;
    });
  }
  const toDelete = rec.files.filter((f) => !f.existed);
  for (const f of toDelete) {
    const cur = current.get(f.filename);
    if (cur && !cur.exists) {
      result.manual.push({ filename: f.filename, reason: `File đã không còn tồn tại (có thể đã bị xoá tay sau khi inject lúc ${f.injectedAt || rec.createdAt || ''}) — không còn gì để undo.` });
      continue;
    }
    const hasMarker = (f.snippetIds || []).some((sid) => cur && cur.exists && cur.content.includes(markerStart(sid)));
    if (cur && cur.exists && !(f.snippetIds || []).length) {
      // record cũ (trước refactor) không có snippetIds → vẫn thử xoá như trước
    } else if (cur && cur.exists && !hasMarker) {
      result.manual.push({ filename: f.filename, reason: `Không tìm thấy marker inject trong file hiện tại (có thể đã bị sửa/xoá tay sau ${f.injectedAt || rec.createdAt || ''}) — cần kiểm tra và xoá thủ công trong Theme Code Editor.` });
      continue;
    }
    try {
      await callAdmin(adminTabId, 'deleteFiles', { themeId: rec.themeId, filenames: [f.filename] });
      result.deleted.push(f.filename);
    } catch {
      result.manual.push({ filename: f.filename, reason: 'API xoá file chưa được xác thực — cần xoá thủ công trong Theme Code Editor.' }); // API xoá chưa xác thực → báo xoá thủ công
    }
  }
  await writeUndo(list.filter((r) => r.id !== undoId));
  return result;
}
