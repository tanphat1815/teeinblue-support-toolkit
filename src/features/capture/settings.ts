import { HISTORY_MAX, KEYS, SHOPIFY_API_VERSION } from './constants';

export interface CaptureSettings {
  shop: string; // vd: teeinblue-evidence.myshopify.com
  apiVersion: string;
  tokenMode: 'broker' | 'static';
  staticToken: string; // chỉ khi tokenMode='static' (token shpat_ cũ)
  brokerUrl: string; // vd: https://<server>/api/support-files/token
  brokerKey: string; // khoá xác thực staff với broker
  delaySeconds?: number; // 0, 3, 5, 10
  autoCopy?: boolean; // Tự động copy ảnh sau khi chụp
  autoUpload?: boolean; // Tự động upload lên Shopify Files sau khi chụp
}

export const DEFAULT_SETTINGS: CaptureSettings = {
  shop: '',
  apiVersion: SHOPIFY_API_VERSION,
  tokenMode: 'broker',
  staticToken: '',
  brokerUrl: '',
  brokerKey: '',
  delaySeconds: 0,
  autoCopy: false,
  autoUpload: false
};

export async function loadSettings(): Promise<CaptureSettings> {
  const s = await chrome.storage.local.get(KEYS.settings);
  return { ...DEFAULT_SETTINGS, ...(s[KEYS.settings] || {}) };
}

export const saveSettings = (v: CaptureSettings) => chrome.storage.local.set({ [KEYS.settings]: v });

export interface UploadRecord {
  id: string;
  url: string;
  kind: 'image' | 'video';
  filename: string;
  bytes: number;
  createdAt: number;
}

export async function listHistory(): Promise<UploadRecord[]> {
  const s = await chrome.storage.local.get(KEYS.history);
  return (s[KEYS.history] as UploadRecord[]) || [];
}

export async function addHistory(r: UploadRecord) {
  await chrome.storage.local.set({ [KEYS.history]: [r, ...(await listHistory())].slice(0, HISTORY_MAX) });
}

export async function removeHistory(id: string) {
  await chrome.storage.local.set({ [KEYS.history]: (await listHistory()).filter((x) => x.id !== id) });
}
