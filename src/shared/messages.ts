import type { SnippetTarget } from './types';

export type Req =
  | { type: 'GET_TAB_CONTEXT' }
  | { type: 'CAPTURE_BUG' }
  | { type: 'RUN_HEALTH' }
  | { type: 'ADMIN_STATUS'; storeHandle?: string }
  | { type: 'DETECT_THEME'; adminTabId: number; themeId: string }
  | {
      type: 'INJECT';
      adminTabId: number;
      storeHandle: string;
      themeId: string;
      themeName: string;
      themeRole: string;
      snippetId: string;
      snippetIds: string[];
      markerNote: string;
      targets: SnippetTarget[];
    }
  | { type: 'LIST_UNDO'; storeHandle: string }
  | { type: 'UNDO'; adminTabId: number; undoId: string }
  | { type: 'PREVIEW_INJECT'; adminTabId: number; themeId: string; targets: SnippetTarget[] }
  | { type: 'FETCH_SNIPPETS'; sourceUrl: string; force?: boolean }
  | { type: 'OPEN_THEMES'; storeHandle: string }
  | { type: 'RELOAD_ADMIN_TAB'; tabId: number }
  | { type: 'START_AREA_CAPTURE'; delay?: number }
  | { type: 'START_VIEWPORT_CAPTURE'; delay?: number }
  | { type: 'START_AREA_RECORD' }
  | { type: 'OPEN_RECORDER'; crop?: { x: number; y: number; w: number; h: number; vw: number; vh: number } };
