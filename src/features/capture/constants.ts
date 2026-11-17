export const SHOPIFY_API_VERSION = '2026-10'; // pin; đổi cùng lúc với Gate A
export const LIMITS = {
  imageMaxBytes: 20 * 1024 * 1024 - 64 * 1024, // chừa lề
  imageMaxPixels: 20_000_000,
  videoMaxBytes: 1024 * 1024 * 1024,
  videoMaxSeconds: 600
} as const;

export const VIDEO_MIME_PREFERENCE = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm'
] as const;

export const DB = { name: 'tibk-capture', version: 1, store: 'captures' } as const;
export const KEYS = { settings: 'tibk_capture_settings_v1', history: 'tibk_capture_history_v1' } as const;
export const HISTORY_MAX = 50;

