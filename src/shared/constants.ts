export const MSG = {
  CONTENT_THEMES: 'TIBK_CONTENT_THEMES',
  CONTENT_SESSION: 'TIBK_CONTENT_SESSION',
  TO_PAGE: 'TIBK_TO_PAGE'
} as const;

export const STORAGE = {
  settings: 'tibk_settings_v1',
  undo: 'tibk_undo_v1',
  snippetsCache: 'tibk_snippets_cache_v1'
} as const;

export const DEFAULT_SNIPPETS_URL: string = import.meta.env.VITE_SNIPPETS_URL || '';
export const SNIPPETS_CACHE_TTL_MS = 10 * 60 * 1000;
export const UNDO_MAX = 10;
export const MODES = ['create', 'append', 'before-head', 'before-body', 'replace'] as const;
