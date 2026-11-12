import type { MODES } from './constants';

export type Mode = (typeof MODES)[number];
export type Status = 'ok' | 'warning' | 'error';

export interface SnippetTarget { filename: string; mode: Mode; code: string; snippetId?: string }
export interface Snippet {
  id: string;
  title: string;
  category: string;
  description?: string;
  type: 'css' | 'js' | 'liquid' | 'json' | 'mixed';
  themes: string[]; // ['*'] hoặc slug: 'dawn', 'horizon'...
  tags: string[];
  targets: SnippetTarget[];
}
export interface SnippetsPayload { version: number; updatedAt?: string; snippets: Snippet[] }
export interface SnippetsResult { snippets: Snippet[]; source: 'remote' | 'cache' | 'fallback'; error?: string }

export interface ThemeInfo {
  id: string;
  name: string;
  role: string;
  updatedAt?: string;
  createdAt?: string;
  processing?: boolean;
  processingFailed?: boolean;
}
export interface AdminStatus { adminTabId: number | null; storeHandle: string; hasSession: boolean; themes: ThemeInfo[] }
export interface DetectedTheme { name: string; version: string; slug: string }

export type TabKind = 'admin' | 'storefront' | 'other' | 'unsupported';
export interface TabContext {
  tabId: number | null;
  url: string;
  kind: TabKind;
  storeHandle: string;
  themeId: string;
  schemaName: string;
}

export interface ConsoleEntry { type: string; message: string; ts: number; url: string; stack?: string }
export interface BugContext {
  isShopify: boolean;
  capturedAt: string;
  url: string;
  storeDomain: string;
  pageType: string;
  theme: { id: string; name: string; schemaName: string; schemaVersion: string; role: string };
  locale: string;
  currency: string;
  country: string;
  userAgent: string;
  viewport: { width: number; height: number; dpr: number };
  product: { id: string; vendor: string; type: string } | null;
  teeinblue: { scriptSrcs: string[]; hasGlobal: boolean };
  errors: ConsoleEntry[] | null; // null = hook chưa chạy (cần reload trang)
}

export interface HealthCheck { id: string; label: string; status: Status; detail: string }
export interface HealthConflict { id: string; name: string; category: string; evidence: string }
export interface HealthReport {
  isShopify: boolean;
  overall: Status;
  pageType: string;
  url: string;
  checks: HealthCheck[];
  conflicts: HealthConflict[];
  scannedAt: string;
}

export interface InjectResult {
  status: 'WRITTEN' | 'NO_CHANGES';
  written: { filename: string; mode: string }[];
  skipped: { filename: string; reason: string }[];
  undoId?: string;
}
export interface UndoFile {
  filename: string; existed: boolean; previous: string;
  snippetIds: string[]; injectedAt: string; expected: string;
}
export interface UndoRecord {
  id: string; ts: number; createdAt: string; storeHandle: string;
  themeId: string; themeName: string; themeRole: string;
  snippetId: string; snippetIds: string[]; markerNote: string;
  files: UndoFile[];
}
export interface UndoSummary {
  id: string; ts: number; createdAt: string; storeHandle: string;
  themeId: string; themeName: string; themeRole: string;
  snippetId: string; snippetIds: string[]; markerNote: string;
  files: { filename: string; existed: boolean }[];
}
export interface UndoFileResult { filename: string; reason?: string }
export interface UndoResult { restored: string[]; deleted: string[]; manual: UndoFileResult[] }

export interface PreviewRow {
  filename: string; exists: boolean;
  action: 'CREATE' | 'APPEND' | 'INSERT' | 'REPLACE' | 'SKIP';
  detail: string; line: number | null; snippetIds: string[];
}

export type Envelope<T> = { ok: true; data: T } | { ok: false; error: string };
