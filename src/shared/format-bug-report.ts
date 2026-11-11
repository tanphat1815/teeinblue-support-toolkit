import type { BugContext } from './types';

const FENCE = '`'.repeat(3); // tránh làm vỡ code fence của file guide

export function formatBugReport(c: BugContext, opts: { note?: string; includeErrors?: boolean } = {}): string {
  const t = c.theme;
  const themeLine = t.schemaName
    ? `${t.schemaName}${t.schemaVersion ? ' v' + t.schemaVersion : ''} (name: "${t.name}", id: ${t.id}, role: ${t.role})`
    : 'N/A';
  const lines: string[] = [];
  lines.push('### 🐛 Bug Report');
  lines.push(`> Captured: ${c.capturedAt}`);
  lines.push('');
  if (opts.note?.trim()) lines.push('**Issue:**', opts.note.trim(), '');
  lines.push(`- **Store:** ${c.storeDomain}`);
  lines.push(`- **URL:** ${c.url}`);
  lines.push(`- **Page type:** ${c.pageType}`);
  lines.push(`- **Theme:** ${themeLine}`);
  lines.push(`- **Locale / Currency / Country:** ${c.locale || '-'} / ${c.currency || '-'} / ${c.country || '-'}`);
  lines.push(`- **Viewport:** ${c.viewport.width}x${c.viewport.height} @${c.viewport.dpr}x`);
  lines.push(`- **User Agent:** ${c.userAgent}`);
  if (c.product) lines.push(`- **Product:** id ${c.product.id} · ${c.product.type || '-'} · ${c.product.vendor || '-'}`);
  lines.push(
    `- **Teeinblue script:** ${c.teeinblue.scriptSrcs.length ? c.teeinblue.scriptSrcs.join(', ') : 'NOT FOUND'}` +
      `${c.teeinblue.hasGlobal ? ' (window.teeinblue ✔)' : ''}`
  );
  if (opts.includeErrors !== false) {
    lines.push('');
    if (c.errors === null) {
      lines.push('**Console errors:** _(chưa capture được — reload trang rồi tái hiện lỗi)_');
    } else if (!c.errors.length) {
      lines.push('**Console errors:** none');
    } else {
      lines.push(`**Console errors (${c.errors.length}, newest last):**`, FENCE + 'text');
      for (const e of c.errors.slice(-15)) {
        lines.push(`[${new Date(e.ts).toISOString().slice(11, 19)}] ${e.type}: ${e.message.split('\n')[0].slice(0, 300)}`);
      }
      lines.push(FENCE);
    }
  }
  return lines.join('\n');
}
