import type { Mode, SnippetTarget, DetectedTheme } from '@/shared/types';

export const FORBIDDEN_PREFIXES = ['config/'];
const FILENAME_RE = /^(assets|layout|locales|sections|snippets|templates|blocks)\/[\w@./-]+$/;

export function isAllowedFilename(filename: string): boolean {
  return FILENAME_RE.test(filename) && !filename.includes('..') && !FORBIDDEN_PREFIXES.some((p) => filename.startsWith(p));
}

export function slugify(v: string): string {
  return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Danh sách các theme thông dụng để nhận diện qua author, doc url hoặc tên hiển thị */
const KNOWN_THEME_RULES: { slug: string; name: string; pattern: RegExp }[] = [
  { slug: 'turbo', name: 'Turbo', pattern: /\b(turbo|out\s*of\s*the\s*sandbox|outofthesandbox)\b/i },
  { slug: 'dawn', name: 'Dawn', pattern: /\b(dawn)\b/i },
  { slug: 'debut', name: 'Debut', pattern: /\b(debut)\b/i },
  { slug: 'debutify', name: 'Debutify', pattern: /\b(debutify)\b/i },
  { slug: 'ella', name: 'Ella', pattern: /\b(ella|halothemes)\b/i },
  { slug: 'minimog', name: 'Minimog', pattern: /\b(minimog|thememove|foxkit)\b/i },
  { slug: 'impact', name: 'Impact', pattern: /\b(impact|maestrooo)\b/i },
  { slug: 'prestige', name: 'Prestige', pattern: /\b(prestige)\b/i },
  { slug: 'warehouse', name: 'Warehouse', pattern: /\b(warehouse)\b/i },
  { slug: 'impulse', name: 'Impulse', pattern: /\b(impulse|archetype)\b/i },
  { slug: 'motion', name: 'Motion', pattern: /\b(motion)\b/i },
  { slug: 'streamline', name: 'Streamline', pattern: /\b(streamline)\b/i },
  { slug: 'broadcast', name: 'Broadcast', pattern: /\b(broadcast|invisible\s*themes)\b/i },
  { slug: 'kalles', name: 'Kalles', pattern: /\b(kalles|the4)\b/i },
  { slug: 'unsen', name: 'Unsen', pattern: /\b(unsen)\b/i },
  { slug: 'gecko', name: 'Gecko', pattern: /\b(gecko)\b/i },
  { slug: 'pipeline', name: 'Pipeline', pattern: /\b(pipeline)\b/i },
  { slug: 'shrine', name: 'Shrine', pattern: /\b(shrine)\b/i },
  { slug: 'symmetry', name: 'Symmetry', pattern: /\b(symmetry|clean\s*canvas)\b/i },
  { slug: 'focal', name: 'Focal', pattern: /\b(focal)\b/i },
  { slug: 'craft', name: 'Craft', pattern: /\b(craft)\b/i },
  { slug: 'sense', name: 'Sense', pattern: /\b(sense)\b/i },
  { slug: 'craving', name: 'Crave', pattern: /\b(crave)\b/i },
  { slug: 'refresh', name: 'Refresh', pattern: /\b(refresh)\b/i },
  { slug: 'ride', name: 'Ride', pattern: /\b(ride)\b/i },
  { slug: 'colorblock', name: 'Colorblock', pattern: /\b(colorblock)\b/i },
  { slug: 'taste', name: 'Taste', pattern: /\b(taste)\b/i },
  { slug: 'rise', name: 'Rise', pattern: /\b(rise)\b/i },
  { slug: 'studio', name: 'Studio', pattern: /\b(studio)\b/i },
  { slug: 'origin', name: 'Origin', pattern: /\b(origin)\b/i },
  { slug: 'spotlight', name: 'Spotlight', pattern: /\b(spotlight)\b/i },
  { slug: 'publisher', name: 'Publisher', pattern: /\b(publisher)\b/i },
  { slug: 'vision', name: 'Vision', pattern: /\b(vision|fuel\s*themes)\b/i },
  { slug: 'enterprise', name: 'Enterprise', pattern: /\b(enterprise)\b/i },
  { slug: 'stiletto', name: 'Stiletto', pattern: /\b(stiletto|fluorescent)\b/i },
  { slug: 'concept', name: 'Concept', pattern: /\b(concept)\b/i },
  { slug: 'sleek', name: 'Sleek', pattern: /\b(sleek)\b/i },
  { slug: 'zest', name: 'Zest', pattern: /\b(zest)\b/i },
  { slug: 'wonder', name: 'Wonder', pattern: /\b(wonder)\b/i },
  { slug: 'xclusive', name: 'Xclusive', pattern: /\b(xclusive)\b/i },
  { slug: 'xtra', name: 'Xtra', pattern: /\b(xtra)\b/i },
  { slug: 'avone', name: 'Avone', pattern: /\b(avone|adornthemes)\b/i },
  { slug: 'eurus', name: 'Eurus', pattern: /\b(eurus|omnithemes)\b/i },
  { slug: 'horizon', name: 'Horizon', pattern: /\b(horizon)\b/i },
  { slug: 'vessel', name: 'Vessel', pattern: /\b(vessel)\b/i },
  { slug: 'unico', name: 'Unico', pattern: /\b(unico)\b/i },
  { slug: 'expanse', name: 'Expanse', pattern: /\b(expanse)\b/i },
  { slug: 'capital', name: 'Capital', pattern: /\b(capital|eight\s*theme)\b/i },
  { slug: 'booster', name: 'Booster', pattern: /\b(booster)\b/i },
  { slug: 'showtime', name: 'Showtime', pattern: /\b(showtime)\b/i },
  { slug: 'glozin', name: 'Glozin', pattern: /\b(glozin)\b/i },
  { slug: 'venue', name: 'Venue', pattern: /\b(venue)\b/i }
];

export function parseThemeInfo(raw: string, fallbackThemeName = ''): DetectedTheme {
  let name = '';
  let version = '';
  let author = '';
  let docUrl = '';
  let supportUrl = '';

  try {
    const arr = JSON.parse(raw.replace(/^\s*\/\*[\s\S]*?\*\//, ''));
    const info = Array.isArray(arr) ? arr.find((x) => x && x.name === 'theme_info') : null;
    if (info) {
      name = info.theme_name || '';
      version = info.theme_version || '';
      author = info.theme_author || '';
      docUrl = info.theme_documentation_url || '';
      supportUrl = info.theme_support_url || '';
    }
  } catch { /* fallback regex */ }

  if (!name) name = raw.match(/"theme_name"\s*:\s*"([^"]+)"/)?.[1] || '';
  if (!version) version = raw.match(/"theme_version"\s*:\s*"([^"]+)"/)?.[1] || '';
  if (!author) author = raw.match(/"theme_author"\s*:\s*"([^"]+)"/)?.[1] || '';
  if (!docUrl) docUrl = raw.match(/"theme_documentation_url"\s*:\s*"([^"]+)"/)?.[1] || '';
  if (!supportUrl) supportUrl = raw.match(/"theme_support_url"\s*:\s*"([^"]+)"/)?.[1] || '';

  // Kết hợp toàn bộ dấu vân tay để nhận diện gốc theme nếu theme_name bị sửa
  const corpus = `${name} ${author} ${docUrl} ${supportUrl} ${fallbackThemeName}`.toLowerCase();

  // Kiểm tra xem name gốc có match với theme đã biết không
  let matchedRule = KNOWN_THEME_RULES.find((r) => r.slug === slugify(name));

  // Nếu name bị sửa (như "TESST", "Custom", "Copy of...") hoặc không khớp, dò qua corpus
  if (!matchedRule) {
    matchedRule = KNOWN_THEME_RULES.find((r) => r.pattern.test(corpus));
  }

  if (matchedRule) {
    return {
      name: name && name.toLowerCase() === matchedRule.slug ? name : `${matchedRule.name} (gốc)`,
      version,
      slug: matchedRule.slug
    };
  }

  // Fallback: nếu không match danh sách chuẩn thì giữ nguyên tên đọc được hoặc fallbackThemeName
  const finalName = name || fallbackThemeName || 'Unknown';
  return { name: finalName, version, slug: slugify(finalName) };
}

function commentPair(filename: string): [string, string] | null {
  const f = filename.toLowerCase();
  if (f.endsWith('.json')) return null;
  if (/\.(s?css)(\.liquid)?$/.test(f)) return ['/* ', ' */'];
  if (/\.js(\.liquid)?$/.test(f)) return ['// ', ''];
  return ['{% comment %} ', ' {% endcomment %}'];
}

export const markerStart = (id: string) => `tib-snippet:${id} start`;

export interface MarkerOpts { at?: string; note?: string }

/** Strip ký tự có thể phá comment theme (liquid/css/js) khỏi ghi chú tự do. */
export function sanitizeMarkerNote(note: string): string {
  return String(note || '')
    .replace(/[{]/g, '(')
    .replace(/[}]/g, ')')
    .replace(/\/\*/g, '/ *')
    .replace(/\*\//g, '* /')
    .replace(/\/\//g, '/ /')
    .replace(/-->/g, '-- >')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

export function markerStartLine(id: string, opts: MarkerOpts = {}): string {
  const parts = [markerStart(id)];
  if (opts.at) parts.push(opts.at);
  const note = sanitizeMarkerNote(opts.note || '');
  if (note) parts.push(note);
  return parts.join(' · ');
}

export function wrapWithMarker(id: string, filename: string, code: string, opts: MarkerOpts = {}): string {
  const pair = commentPair(filename);
  const body = code.trim();
  if (!pair) return body;
  return `${pair[0]}${markerStartLine(id, opts)}${pair[1]}\n${body}\n${pair[0]}tib-snippet:${id} end${pair[1]}`;
}

export interface WritePlan { skipped: boolean; reason?: string; content: string; resolvedMode: string }

export function planWrite(i: {
  current: string; exists: boolean; mode: Mode; filename: string; code: string; snippetId: string;
  marker?: MarkerOpts;
}): WritePlan {
  const code = i.code.trim();
  const wrapped = wrapWithMarker(i.snippetId, i.filename, code, i.marker);
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
