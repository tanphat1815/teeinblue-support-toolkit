import fallback from '@/data/snippets.fallback.json';
import { MODES, SNIPPETS_CACHE_TTL_MS, STORAGE } from '@/shared/constants';
import type { Mode, Snippet, SnippetsPayload, SnippetsResult } from '@/shared/types';
import { isAllowedFilename } from './theme-writer';

const TYPES = ['css', 'js', 'liquid', 'json', 'mixed'];

export function validatePayload(raw: unknown): SnippetsPayload {
  const list = Array.isArray(raw) ? raw : (raw as any)?.snippets;
  if (!Array.isArray(list)) throw new Error('JSON phải là mảng snippet hoặc { snippets: [...] }.');
  const snippets: Snippet[] = list.map((s: any, idx: number) => {
    const where = `snippets[${idx}]`;
    if (!s?.id || !s?.title || !s?.category) throw new Error(`${where}: thiếu id/title/category.`);
    if (!Array.isArray(s.targets) || !s.targets.length) throw new Error(`${where} (${s.id}): thiếu targets.`);
    const targets = s.targets.map((t: any, j: number) => {
      if (!isAllowedFilename(String(t?.filename || ''))) throw new Error(`${where}.targets[${j}]: filename không hợp lệ/bị chặn: ${t?.filename}`);
      if (!MODES.includes(t.mode)) throw new Error(`${where}.targets[${j}]: mode không hợp lệ: ${t.mode}`);
      if (typeof t.code !== 'string') throw new Error(`${where}.targets[${j}]: code phải là string.`);
      return { filename: String(t.filename), mode: t.mode as Mode, code: t.code };
    });
    return {
      id: String(s.id),
      title: String(s.title),
      category: String(s.category),
      description: s.description ? String(s.description) : '',
      type: TYPES.includes(s.type) ? s.type : 'mixed',
      themes: Array.isArray(s.themes) && s.themes.length ? s.themes.map((x: unknown) => String(x).toLowerCase()) : ['*'],
      tags: Array.isArray(s.tags) ? s.tags.map(String) : [],
      targets
    } as Snippet;
  });
  return { version: Number((raw as any)?.version || 1), updatedAt: (raw as any)?.updatedAt, snippets };
}

function sheetToGviz(url: string): string | null {
  const m = url.match(/\/spreadsheets\/d\/([^/]+)/);
  if (!m) return null;
  const gid = new URL(url).searchParams.get('gid');
  return `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:json${gid ? `&gid=${gid}` : ''}`;
}

function parseGviz(text: string): unknown {
  const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  const cols: string[] = json.table.cols.map((c: any) => String(c.label || '').trim().toLowerCase());
  let rows: any[] = json.table.rows;
  let labels = cols;
  if (cols.every((c) => !c)) { // gviz coi dòng header là data khi toàn cột text
    labels = (rows[0]?.c || []).map((c: any) => String(c?.v ?? '').trim().toLowerCase());
    rows = rows.slice(1);
  }
  const map = new Map<string, any>();
  for (const r of rows) {
    const o: Record<string, string> = {};
    labels.forEach((l, i) => { o[l] = String(r.c?.[i]?.v ?? ''); });
    if (!o.id) continue;
    if (!map.has(o.id)) {
      map.set(o.id, {
        id: o.id, title: o.title, category: o.category, description: o.description, type: o.type,
        themes: (o.themes || '*').split(',').map((x) => x.trim()).filter(Boolean),
        tags: (o.tags || '').split(',').map((x) => x.trim()).filter(Boolean),
        targets: []
      });
    }
    map.get(o.id).targets.push({ filename: o.filename, mode: o.mode, code: o.code });
  }
  return { version: 1, snippets: [...map.values()] };
}

export async function loadSnippets(sourceUrl: string, force = false): Promise<SnippetsResult> {
  const fb = (error?: string): SnippetsResult => ({ snippets: validatePayload(fallback).snippets, source: 'fallback', error });
  const url = sourceUrl.trim();
  if (!url) return fb();

  const store = await chrome.storage.local.get(STORAGE.snippetsCache);
  const cache = store[STORAGE.snippetsCache] as { url: string; ts: number; data: SnippetsPayload } | undefined;
  if (!force && cache && cache.url === url && Date.now() - cache.ts < SNIPPETS_CACHE_TTL_MS) {
    return { snippets: cache.data.snippets, source: 'cache' };
  }
  try {
    const gviz = sheetToGviz(url);
    const res = await fetch(gviz || url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} khi tải snippets.`);
    const text = await res.text();
    const payload = validatePayload(gviz ? parseGviz(text) : JSON.parse(text));
    await chrome.storage.local.set({ [STORAGE.snippetsCache]: { url, ts: Date.now(), data: payload } });
    return { snippets: payload.snippets, source: 'remote' };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    if (cache && cache.url === url) return { snippets: cache.data.snippets, source: 'cache', error: msg };
    return fb(msg);
  }
}
