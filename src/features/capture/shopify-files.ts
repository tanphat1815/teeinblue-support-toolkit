import type { CaptureSettings, UploadRecord } from './settings';

class AuthError extends Error {}
let cachedToken: { token: string; exp: number } | null = null;
let cachedBroker: { token: string; exp: number } | null = null;

export function normalizeShop(v: string): string {
  const s = v.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return s.includes('.') ? s : `${s}.myshopify.com`;
}

async function bgFetch(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string }
): Promise<{ ok: boolean; status: number; text: string; redirected?: boolean; finalUrl?: string }> {
  console.log('[Capture-Sidepanel] Invoking bgFetch:', url, options);
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'SHOPIFY_FETCH', url, options },
      (res: any) => {
        if (chrome.runtime.lastError) {
          console.error('[Capture-Sidepanel] runtime error:', chrome.runtime.lastError);
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!res) {
          console.error('[Capture-Sidepanel] No response from background service worker');
          return reject(new Error('Background service worker không phản hồi'));
        }
        if (!res.ok && res.error) {
          console.error('[Capture-Sidepanel] Error response:', res.error);
          return reject(new Error(res.error));
        }
        const result = res.data || res;
        console.log('[Capture-Sidepanel] bgFetch result:', result.status, 'len:', result.text?.length);
        resolve({
          ok: Boolean(result.ok),
          status: Number(result.status) || 0,
          text: typeof result.text === 'string' ? result.text : '',
          redirected: result.redirected,
          finalUrl: result.finalUrl
        });
      }
    );
  });
}

async function getToken(cfg: CaptureSettings, force = false): Promise<string> {
  if (cfg.tokenMode === 'static') {
    if (!cfg.staticToken) throw new Error('Chưa nhập API token trong Settings.');
    return cfg.staticToken.trim();
  }

  if (cfg.tokenMode === 'client_credentials') {
    if (!cfg.clientId || !cfg.clientSecret) {
      throw new Error('Chưa nhập Client ID hoặc Client Secret trong Settings.');
    }
    if (!force && cachedToken && cachedToken.exp - Date.now() > 5 * 60_000) {
      return cachedToken.token;
    }

    const shop = normalizeShop(cfg.shop);
    const bodyStr = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: cfg.clientId.trim(),
      client_secret: cfg.clientSecret.trim()
    }).toString();

    const res = await bgFetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: bodyStr
    });

    let j: any = {};
    try {
      j = JSON.parse(res.text);
    } catch {}

    if (!res.ok || !j.access_token) {
      throw new Error(`Shopify Auth lỗi (${res.status}): ${j.error_description || j.error || res.text.slice(0, 100)}`);
    }

    const expiresIn = Number(j.expires_in) || 86400;
    cachedToken = { token: j.access_token, exp: Date.now() + (expiresIn - 300) * 1000 };
    return j.access_token;
  }

  if (!cfg.brokerUrl) throw new Error('Chưa cấu hình Token Broker URL trong Settings.');
  if (!force && cachedBroker && cachedBroker.exp - Date.now() > 5 * 60_000) return cachedBroker.token;
  const res = await fetch(cfg.brokerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Support-Key': cfg.brokerKey }
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.token) throw new Error(`Token Broker lỗi (HTTP ${res.status}): ${j.error || 'không có token'}`);
  cachedBroker = { token: j.token, exp: Number(j.expiresAt) || Date.now() + 3600_000 };
  return j.token;
}

async function gql<T>(
  cfg: CaptureSettings,
  query: string,
  variables: Record<string, unknown> = {},
  retried = false
): Promise<T> {
  const token = await getToken(cfg, retried);
  const shop = normalizeShop(cfg.shop);
  const url = `https://${shop}/admin/api/${cfg.apiVersion}/graphql.json`;

  const res = await bgFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Shopify-Access-Token': token
    },
    body: JSON.stringify({ query, variables })
  });

  if (res.status === 401 && cfg.tokenMode === 'broker' && !retried) {
    cachedBroker = null;
    return gql<T>(cfg, query, variables, true);
  }
  if (res.status === 401 && cfg.tokenMode === 'client_credentials' && !retried) {
    cachedToken = null;
    return gql<T>(cfg, query, variables, true);
  }
  if (res.status === 401 || res.status === 403)
    throw new AuthError(`Shopify từ chối token (HTTP ${res.status}). Kiểm tra token/scope write_files, read_files.`);

  let json: any = null;
  try {
    json = res.text ? JSON.parse(res.text) : null;
  } catch (e) {
    throw new Error(`Shopify phản hồi không hợp lệ (HTTP ${res.status}): ${res.text.slice(0, 100)}`);
  }

  if (!res.ok) throw new Error(`Shopify HTTP ${res.status}: ${res.text.slice(0, 100)}`);
  if (!json || !json.data) {
    if (json?.errors?.length) throw new Error(JSON.stringify(json.errors));
    throw new Error(`Shopify HTTP ${res.status}: ${res.text.slice(0, 100) || 'Không có dữ liệu trả về'}`);
  }
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors));
  return json.data as T;
}

const STAGED_M = `mutation Staged($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}} userErrors{field message}}}`;
const FILE_CREATE_M = `mutation FileCreate($files:[FileCreateInput!]!){fileCreate(files:$files){files{id fileStatus} userErrors{field message}}}`;
const POLL_Q = `query FileStatus($id:ID!){node(id:$id){__typename ... on MediaImage{fileStatus image{url} fileErrors{code message}} ... on Video{fileStatus originalSource{url} sources{url mimeType} fileErrors{code message}}}}`;
const DELETE_M = `mutation FileDelete($fileIds:[ID!]!){fileDelete(fileIds:$fileIds){deletedFileIds userErrors{field message}}}`;

export async function testConnection(cfg: CaptureSettings) {
  const d = await gql<{ shop: { name: string }; currentAppInstallation: { accessScopes: { handle: string }[] } }>(
    cfg,
    `{ shop { name } currentAppInstallation { accessScopes { handle } } }`
  );
  const scopes = d.currentAppInstallation.accessScopes.map((s) => s.handle);
  const missing = ['write_files', 'read_files'].filter((s) => !scopes.includes(s));
  return { shopName: d.shop.name, scopes, missing };
}

function postMultipart(
  url: string,
  params: { name: string; value: string }[],
  blob: Blob,
  filename: string,
  onProgress?: (r: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const fd = new FormData();
    params.forEach((p) => fd.append(p.name, p.value));
    fd.append('file', blob, filename); // field cuối cùng
    const x = new XMLHttpRequest();
    x.open('POST', url);
    x.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    x.onload = () =>
      x.status >= 200 && x.status < 300
        ? resolve()
        : reject(new Error(`Upload staged thất bại: HTTP ${x.status} ${x.responseText.slice(0, 300)}`));
    x.onerror = () => reject(new Error('Lỗi mạng khi upload file lên Shopify.'));
    x.send(fd);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function uploadToShopifyFiles(
  cfg: CaptureSettings,
  blob: Blob,
  opts: { kind: 'image' | 'video'; filename: string; onProgress?: (stage: string, ratio?: number) => void }
): Promise<UploadRecord> {
  const { kind, filename, onProgress } = opts;
  const mime = blob.type || (kind === 'image' ? 'image/png' : 'video/mp4');
  onProgress?.('Chuẩn bị upload…');

  const input: Record<string, string> = {
    filename,
    mimeType: mime,
    resource: kind === 'video' ? 'VIDEO' : 'IMAGE',
    httpMethod: 'POST'
  };
  if (kind === 'video') input.fileSize = String(blob.size); // bắt buộc với VIDEO
  const st = await gql<any>(cfg, STAGED_M, { input: [input] });
  if (st.stagedUploadsCreate.userErrors.length) throw new Error(JSON.stringify(st.stagedUploadsCreate.userErrors));
  const target = st.stagedUploadsCreate.stagedTargets[0];

  await postMultipart(target.url, target.parameters, blob, filename, (r) => onProgress?.('Đang upload…', r));

  onProgress?.('Tạo file trên Shopify…');
  const fc = await gql<any>(cfg, FILE_CREATE_M, {
    files: [{ originalSource: target.resourceUrl, contentType: kind === 'video' ? 'VIDEO' : 'IMAGE', filename }]
  });
  if (fc.fileCreate.userErrors.length) throw new Error(JSON.stringify(fc.fileCreate.userErrors));
  const id: string = fc.fileCreate.files[0].id;

  onProgress?.('Shopify đang xử lý…');
  const deadline = Date.now() + (kind === 'video' ? 15 * 60_000 : 2 * 60_000);
  let delay = 1200;
  while (Date.now() < deadline) {
    const d = await gql<any>(cfg, POLL_Q, { id });
    const n = d.node;
    if (n?.fileStatus === 'FAILED') throw new Error('Shopify xử lý file thất bại: ' + JSON.stringify(n.fileErrors));
    if (n?.fileStatus === 'READY') {
      const url: string | undefined = kind === 'image' ? n.image?.url : n.originalSource?.url || n.sources?.[0]?.url;
      if (url) return { id, url, kind, filename, bytes: blob.size, createdAt: Date.now() };
    }
    await sleep(delay);
    delay = Math.min(delay * 1.3, 5000);
  }
  throw new Error('Hết thời gian chờ Shopify xử lý file (file có thể vẫn xuất hiện trong Content → Files).');
}

export async function deleteShopifyFile(cfg: CaptureSettings, id: string) {
  const d = await gql<any>(cfg, DELETE_M, { fileIds: [id] });
  if (d.fileDelete.userErrors.length) throw new Error(JSON.stringify(d.fileDelete.userErrors));
}

export const randomName = (ext: string) =>
  `tib-support-${Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('')}.${ext}`;

