import { deleteRecord, getRecord, purgeOld, putRecord } from '@/features/capture/idb';
import { activeTab } from './storefront';

type Rect = { x: number; y: number; w: number; h: number };

async function snap() {
  const tab = await activeTab();
  if (!tab?.id || tab.windowId == null) throw new Error('Không tìm thấy tab đang active.');
  if (!/^(https?|file):/.test(tab.url || '')) {
    throw new Error('Chrome không cho chụp trang này (chrome://, Web Store, trang nội bộ). Mở trang thường rồi thử lại.');
  }
  // Giới hạn Chrome: tối đa 2 lần/giây → chặn gọi dồn
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  const blob = await (await fetch(dataUrl)).blob();
  const id = crypto.randomUUID();
  await purgeOld().catch(() => {});
  await putRecord({ id, blob, sourceUrl: tab.url || '', createdAt: Date.now() });
  return { tab, id, dataUrl };
}

export async function openEditor(id: string, index: number, auto?: 'copy') {
  await chrome.tabs.create({ url: chrome.runtime.getURL(`editor.html?id=${id}${auto ? `&auto=${auto}` : ''}`), index });
}

let lastSnapAt = 0;
function guardRate() {
  const now = Date.now();
  if (now - lastSnapAt < 600) throw new Error('Thao tác quá nhanh, đợi 1 giây rồi thử lại.');
  lastSnapAt = now;
}

async function waitDelay(tabId: number, delay?: number) {
  if (!delay || delay <= 0) return;
  // Hiển thị overlay countdown 3... 2... 1...
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (sec: number) => {
      const el = document.createElement('div');
      el.id = '__tibk_countdown';
      el.style.cssText =
        'all:initial;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-family:system-ui,sans-serif;font-size:80px;font-weight:900;color:#ffffff;background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);width:140px;height:140px;border-radius:28px;display:flex;align-items:center;justify-content:center;box-shadow:0 12px 40px rgba(0,0,0,0.5);z-index:2147483647;pointer-events:none;transition:transform 0.2s cubic-bezier(0.34,1.56,0.64,1);';
      document.documentElement.appendChild(el);

      let left = sec;
      el.textContent = String(left);
      const timer = setInterval(() => {
        left--;
        if (left <= 0) {
          clearInterval(timer);
          el.remove();
        } else {
          el.textContent = String(left);
          el.style.transform = 'translate(-50%,-50%) scale(1.2)';
          setTimeout(() => {
            el.style.transform = 'translate(-50%,-50%) scale(1)';
          }, 150);
        }
      }, 1000);
    },
    args: [delay]
  });
  await new Promise((r) => setTimeout(r, delay * 1000));
}

export async function startAreaCapture(delay?: number) {
  guardRate();
  const tab = await activeTab();
  if (!tab?.id) throw new Error('Không tìm thấy tab active.');
  if (delay && delay > 0) await waitDelay(tab.id, delay);
  const { id, dataUrl } = await snap();
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/capture-overlay.js'] });
  await chrome.tabs.sendMessage(tab.id, { type: 'TIBK_OVERLAY_START', captureId: id, dataUrl });
}

export async function startViewportCapture(delay?: number) {
  guardRate();
  const tab = await activeTab();
  if (!tab?.id) throw new Error('Không tìm thấy tab active.');
  if (delay && delay > 0) await waitDelay(tab.id, delay);
  const { id } = await snap();
  chrome.runtime.sendMessage({ type: 'CAPTURES_UPDATED' }).catch(() => {});
  await openEditor(id, tab.index + 1);
}

export async function onOverlayDone(
  sender: chrome.runtime.MessageSender,
  msg: { captureId: string; rect: Rect | null; action: 'edit' | 'copy' }
) {
  const rec = await getRecord(msg.captureId);
  if (!rec) throw new Error('Ảnh chụp đã hết hạn, chụp lại.');
  if (msg.rect) {
    rec.crop = msg.rect;
    await putRecord(rec);
  }
  chrome.runtime.sendMessage({ type: 'CAPTURES_UPDATED' }).catch(() => {});
  await openEditor(msg.captureId, (sender.tab?.index ?? 0) + 1, msg.action === 'copy' ? 'copy' : undefined);
}

export const onOverlayCancel = (captureId: string) => deleteRecord(captureId).catch(() => {});

export async function openRecorder(crop?: { x: number; y: number; w: number; h: number; vw: number; vh: number }) {
  const cropParam = crop ? `?crop=${encodeURIComponent(JSON.stringify(crop))}` : '';
  await chrome.windows.create({
    url: chrome.runtime.getURL(`recorder.html${cropParam}`),
    type: 'popup',
    width: 480,
    height: 700
  });
}

export async function startAreaRecord() {
  const tab = await activeTab();
  if (!tab?.id) throw new Error('Không tìm thấy tab đang active.');
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content/record-box-overlay.js']
  });
}

