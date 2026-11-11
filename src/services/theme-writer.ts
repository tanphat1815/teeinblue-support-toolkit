import type { Mode, SnippetTarget, DetectedTheme } from '@/shared/types';

export const FORBIDDEN_PREFIXES = ['config/'];
const FILENAME_RE = /^(assets|layout|locales|sections|snippets|templates|blocks)\/[\w@./-]+$/;

export function isAllowedFilename(filename: string): boolean {
  return FILENAME_RE.test(filename) && !filename.includes('..') && !FORBIDDEN_PREFIXES.some((p) => filename.startsWith(p));
}

export function slugify(v: string): string {
  return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function parseThemeInfo(raw: string): DetectedTheme {
  let name = '';
  let version = '';
  try {
    const arr = JSON.parse(raw.replace(/^\s*\/\*[\s\S]*?\*\//, ''));
    const info = Array.isArray(arr) ? arr.find((x) => x && x.name === 'theme_info') : null;
    name = info?.theme_name || '';
    version = info?.theme_version || '';
  } catch { /* fallback regex */ }
  if (!name) name = raw.match(/"theme_name"\s*:\s*"([^"]+)"/)?.[1] || '';
  if (!version) version = raw.match(/"theme_version"\s*:\s*"([^"]+)"/)?.[1] || '';
  return { name, version, slug: slugify(name) };
}

function commentPair(filename: string): [string, string] | null {
  const f = filename.toLowerCase();
  if (f.endsWith('.json')) return null;
  if (/\.(s?css)(\.liquid)?$/.test(f)) return ['/* ', ' */'];
  if (/\.js(\.liquid)?$/.test(f)) return ['// ', ''];
  return ['{% comment %} ', ' {% endcomment %}'];
}

export const markerStart = (id: string) => `tib-snippet:${id} start`;

export function wrapWithMarker(id: string, filename: string, code: string): string {
  const pair = commentPair(filename);
  const body = code.trim();
  if (!pair) return body;
  return `${pair[0]}${markerStart(id)}${pair[1]}\n${body}\n${pair[0]}tib-snippet:${id} end${pair[1]}`;
}

export interface WritePlan { skipped: boolean; reason?: string; content: string; resolvedMode: string }

export function planWrite(i: {
  current: string; exists: boolean; mode: Mode; filename: string; code: string; snippetId: string;
}): WritePlan {
  const code = i.code.trim();
  const wrapped = wrapWithMarker(i.snippetId, i.filename, code);
  if (!code) return { skipped: true, reason: 'Empty code.', content: i.current, resolvedMode: i.mode };
  if (!i.exists) return { skipped: false, content: wrapped + '\n', resolvedMode: 'create' };
  if (i.current.includes(markerStart(i.snippetId))) {
    return { skipped: true, reason: 'Snippet đã được inject trước đó (marker tồn tại).', content: i.current, resolvedMode: i.mode };
  }
  if (i.current.includes(code)) {
    return { skipped: true, reason: 'Đoạn code y hệt đã tồn tại.', content: i.current, resolvedMode: i.mode };
  }
  const block = `\n${wrapped}\n`;
  switch (i.mode) {
    case 'create':
      return { skipped: true, reason: 'File đã tồn tại (mode create không ghi đè).', content: i.current, resolvedMode: 'create' };
    case 'replace':
      return { skipped: false, content: wrapped + '\n', resolvedMode: 'replace' };
    case 'append':
      return { skipped: false, content: `${i.current.trimEnd()}\n${block}`, resolvedMode: 'append' };
    case 'before-head': {
      const re = /\s*<\/head>/i;
      return re.test(i.current)
        ? { skipped: false, content: i.current.replace(re, () => `${block}</head>`), resolvedMode: 'before-head' }
        : { skipped: false, content: `${i.current.trimEnd()}\n${block}`, resolvedMode: 'append' };
    }
    case 'before-body': {
      const re = /\s*<\/body>/i;
      return re.test(i.current)
        ? { skipped: false, content: i.current.replace(re, () => `${block}</body>`), resolvedMode: 'before-body' }
        : { skipped: false, content: `${i.current.trimEnd()}\n${block}`, resolvedMode: 'append' };
    }
  }
}

/** Sinh target "link file vào theme.liquid" cho file assets/snippets mới tạo. */
export function buildReferenceTarget(filename: string): SnippetTarget | null {
  const base = filename.split('/').pop() || filename;
  const asset = base.replace(/\.liquid$/, '');
  if (filename.startsWith('assets/') && /\.css$/.test(asset)) {
    return { filename: 'layout/theme.liquid', mode: 'before-head', code: `{{ '${asset}' | asset_url | stylesheet_tag }}` };
  }
  if (filename.startsWith('assets/') && /\.js$/.test(asset)) {
    return { filename: 'layout/theme.liquid', mode: 'before-body', code: `<script src="{{ '${asset}' | asset_url }}" defer></script>` };
  }
  if (filename.startsWith('snippets/') && filename.endsWith('.liquid')) {
    return { filename: 'layout/theme.liquid', mode: 'before-body', code: `{% render '${base.replace(/\.liquid$/, '')}' %}` };
  }
  return null;
}
