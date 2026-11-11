import { MSG, STORAGE, UNDO_MAX } from '@/shared/constants';
import type { Req } from '@/shared/messages';
import type {
  AdminStatus, DetectedTheme, InjectResult, ThemeInfo, UndoFile, UndoRecord, UndoResult, UndoSummary
} from '@/shared/types';
import { isAllowedFilename, parseThemeInfo, planWrite } from '@/services/theme-writer';
import { activeTab } from './storefront';

const ADMIN_FRAME_RE = /^https:\/\/(admin\.shopify\.com\/store\/|online-store-web\.shopifyapps\.com\/)/i;
const NO_SESSION =
  'NO_SESSION: Chưa bắt được session Shopify. Mở Shopify Admin → Online Store → Themes, đợi danh sách theme load xong rồi thử lại (nếu vừa reload extension, hãy reload tab Admin).';

interface Sess { frameId: number; handle: string; ts: number }
interface TabState { themes: ThemeInfo[]; sessions: Map<number, Sess> }
const states = new Map<number, TabState>();
class BridgeError extends Error {}

const state = (tabId: number): TabState => {
  if (!states.has(tabId)) states.set(tabId, { themes: [], sessions: new Map() });
  return states.get(tabId)!;
};
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
  const frames = (await getFrames(tabId)).filter((f) => ADMIN_FRAME_RE.test(f.url));
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
  if (!storeHandle) return isAdmin(cur) ? cur : (await chrome.tabs.query({ url: 'https://admin.shopify.com/store/*' }))[0] || null;
  const all = await chrome.tabs.query({ url: 'https://admin.shopify.com/store/*' });
  const match = all.filter((t) => handleFromUrl(t.url || '') === storeHandle); // KHÔNG fallback sang store khác
  return match.find((t) => t.id === cur?.id) || match.find((t) => t.active) || match[0] || null;
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
    .map(({ files, ...r }) => ({ ...r, files: files.map((f) => ({ filename: f.filename, existed: f.existed })) }));
}

// ---- Inject
export async function inject(req: Extract<Req, { type: 'INJECT' }>): Promise<InjectResult> {
  const { adminTabId, themeId, targets, snippetId } = req;
  if (!targets.length) throw new Error('Không có target để inject.');
  for (const t of targets) if (!isAllowedFilename(t.filename)) throw new Error(`Filename bị chặn/không hợp lệ: ${t.filename}`);

  const plans: { filename: string; content: string; mode: string }[] = [];
  const skipped: InjectResult['skipped'] = [];
  const backups: UndoFile[] = [];
  const working = new Map<string, { exists: boolean; content: string }>(); // nhiều target cùng 1 file

  for (const t of targets) {
    let cur = working.get(t.filename);
    if (!cur) {
      const r = await callAdmin<{ exists: boolean; content: string }>(adminTabId, 'readFile', { themeId, filename: t.filename });
      cur = { exists: r.exists, content: r.content };
      backups.push({ filename: t.filename, existed: r.exists, previous: r.content });
    }
    const plan = planWrite({ current: cur.content, exists: cur.exists, mode: t.mode, filename: t.filename, code: t.code, snippetId });
    if (plan.skipped) { skipped.push({ filename: t.filename, reason: plan.reason || 'Skipped.' }); working.set(t.filename, cur); continue; }
    working.set(t.filename, { exists: true, content: plan.content });
    const i = plans.findIndex((p) => p.filename === t.filename);
    if (i >= 0) plans[i] = { filename: t.filename, content: plan.content, mode: plan.resolvedMode };
    else plans.push({ filename: t.filename, content: plan.content, mode: plan.resolvedMode });
  }

  if (!plans.length) return { status: 'NO_CHANGES', written: [], skipped };

  await callAdmin(adminTabId, 'writeFiles', { themeId, files: plans.map((p) => ({ filename: p.filename, content: p.content })) });

  const changed = new Set(plans.map((p) => p.filename));
  const record: UndoRecord = {
    id: `undo_${Date.now().toString(36)}`, ts: Date.now(), storeHandle: req.storeHandle, themeId,
    themeName: req.themeName, snippetId, files: backups.filter((b) => changed.has(b.filename))
  };
  await writeUndo([record, ...(await readUndo())]);
  return { status: 'WRITTEN', written: plans.map((p) => ({ filename: p.filename, mode: p.mode })), skipped, undoId: record.id };
}

export async function undo(adminTabId: number, undoId: string): Promise<UndoResult> {
  const list = await readUndo();
  const rec = list.find((r) => r.id === undoId);
  if (!rec) throw new Error('Không tìm thấy bản ghi undo.');
  const result: UndoResult = { restored: [], deleted: [], manual: [] };

  const toRestore = rec.files.filter((f) => f.existed);
  if (toRestore.length) {
    await callAdmin(adminTabId, 'writeFiles', { themeId: rec.themeId, files: toRestore.map((f) => ({ filename: f.filename, content: f.previous })) });
    result.restored = toRestore.map((f) => f.filename);
  }
  const toDelete = rec.files.filter((f) => !f.existed).map((f) => f.filename);
  if (toDelete.length) {
    try {
      await callAdmin(adminTabId, 'deleteFiles', { themeId: rec.themeId, filenames: toDelete });
      result.deleted = toDelete;
    } catch {
      result.manual = toDelete; // API xoá chưa xác thực → báo xoá thủ công
    }
  }
  await writeUndo(list.filter((r) => r.id !== undoId));
  return result;
}
