import type { CaptureSettings, UploadRecord } from './settings';

class AuthError extends Error {}
let cachedBroker: { token: string; exp: number } | null = null;

export function normalizeShop(v: string): string {
  const s = v.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return s.includes('.') ? s : `${s}.myshopify.com`;
}

async function getToken(cfg: CaptureSettings, force = false): Promise<string> {
  if (cfg.tokenMode === 'static') {
    if (!cfg.staticToken) throw new Error('Chưa nhập Admin API token trong Settings.');
    return cfg.staticToken;
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
  const res = await fetch(`https://${normalizeShop(cfg.shop)}/admin/api/${cfg.apiVersion}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables })
  });
  if (res.status === 401 && cfg.tokenMode === 'broker' && !retried) {
    cachedBroker = null;
    return gql<T>(cfg, query, variables, true);
  }
  if (res.status === 401 || res.status === 403)
    throw new AuthError(`Shopify từ chối token (HTTP ${res.status}). Kiểm tra token/scope write_files, read_files.`);
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) throw new Error(`Shopify HTTP ${res.status}`);
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
