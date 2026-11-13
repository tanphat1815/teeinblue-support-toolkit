export const MSG = {
  CONTENT_THEMES: 'TIBK_CONTENT_THEMES',
  CONTENT_SESSION: 'TIBK_CONTENT_SESSION',
  TO_PAGE: 'TIBK_TO_PAGE',
  ADMIN_STATE_UPDATED: 'TIBK_ADMIN_STATE_UPDATED'
} as const;

export const STORAGE = {
  settings: 'tibk_settings_v1',
  undo: 'tibk_undo_v1',
  snippetsCache: 'tibk_snippets_cache_v1',
  partnerDashboard: 'tibk_partner_dashboard_v1',
  favoriteSnippets: 'tibk_favorite_snippets_v1',
  snippetUsageCounts: 'tibk_snippet_usage_counts_v1'
} as const;

export const PARTNER_DASHBOARDS = [
  { id: 'collab', label: 'Partner Collab (Dev Client)', orgId: '129626325', param: 'store_type=collaborations' },
  { id: 'staging', label: 'Partner Staging (Dev Team)', orgId: '129612405', param: 'filter=' }
] as const;

export type PartnerDashboardId = (typeof PARTNER_DASHBOARDS)[number]['id'];

export const DEFAULT_SNIPPETS_URL: string = import.meta.env.VITE_SNIPPETS_URL || '';
export const SNIPPETS_CACHE_TTL_MS = 10 * 60 * 1000;
export const UNDO_MAX = 10;
export const MODES = ['create', 'append', 'before-head', 'before-body', 'replace'] as const;
