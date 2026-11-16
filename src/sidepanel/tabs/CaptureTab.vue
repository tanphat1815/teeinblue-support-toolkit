<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { call, errMsg } from '../api';
import { copyText } from '../clipboard';
import { useToast } from '../composables/useToast';
import UntitledIcon from '../components/UntitledIcon.vue';
import {
  listHistory,
  loadSettings,
  removeHistory,
  saveSettings,
  type CaptureSettings,
  type UploadRecord
} from '@/features/capture/settings';
import { deleteShopifyFile, testConnection } from '@/features/capture/shopify-files';
import { deleteRecord, listAllRecords, type CaptureRecord } from '@/features/capture/idb';

const toast = useToast();
const cfg = ref<CaptureSettings | null>(null);
const history = ref<UploadRecord[]>([]);
const localCaptures = ref<{
  id: string;
  url: string;
  createdAt: number;
  sourceUrl: string;
  kind: 'image' | 'video';
  duration?: number;
}[]>([]);
const showSettings = ref(false);
const testing = ref(false);

async function reloadLocalCaptures() {
  localCaptures.value.forEach((c) => URL.revokeObjectURL(c.url));
  const all = await listAllRecords();
  localCaptures.value = all.map((r) => ({
    id: r.id,
    url: URL.createObjectURL(r.blob),
    createdAt: r.createdAt,
    sourceUrl: r.sourceUrl,
    kind: r.kind || 'image',
    duration: r.duration
  }));
}

function handleRuntimeMsg(msg: any) {
  if (msg?.type === 'CAPTURES_UPDATED') {
    reloadLocalCaptures();
  }
}

onMounted(async () => {
  cfg.value = await loadSettings();
  history.value = await listHistory();
  showSettings.value = !cfg.value.shop;
  await reloadLocalCaptures();
  chrome.runtime.onMessage.addListener(handleRuntimeMsg);
});

onBeforeUnmount(() => {
  chrome.runtime.onMessage.removeListener(handleRuntimeMsg);
  localCaptures.value.forEach((c) => URL.revokeObjectURL(c.url));
});

async function run(type: 'START_AREA_CAPTURE' | 'START_VIEWPORT_CAPTURE' | 'OPEN_RECORDER') {
  try {
    await call({ type });
  } catch (e) {
    toast.error(errMsg(e));
  }
}

async function openInEditor(c: { id: string; url: string; kind: 'image' | 'video' }) {
  if (c.kind === 'video') {
    // Mở video trong tab mới để xem lại
    await chrome.tabs.create({ url: c.url });
  } else {
    await chrome.tabs.create({ url: chrome.runtime.getURL(`editor.html?id=${c.id}`) });
  }
}

function downloadCapture(c: { url: string; kind: 'image' | 'video' }) {
  const ext = c.kind === 'video' ? 'webm' : 'png';
  const a = document.createElement('a');
  a.href = c.url;
  a.download = `tib-${c.kind}-${Date.now()}.${ext}`;
  a.click();
}

async function copyCaptureImage(id: string) {
  try {
    const all = await listAllRecords();
    const target = all.find((r) => r.id === id);
    if (!target) return toast.error('Ảnh không còn tồn tại.');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': target.blob })]);
    toast.success('Đã copy ảnh vào clipboard (Ctrl+V để dán)!');
  } catch (e) {
    toast.error(errMsg(e));
  }
}

async function removeLocalCapture(id: string) {
  await deleteRecord(id);
  await reloadLocalCaptures();
  toast.success('Đã xóa ảnh khỏi bộ nhớ tạm.');
}

async function save() {
  if (cfg.value) {
    await saveSettings(cfg.value);
    toast.success('Đã lưu cấu hình.');
  }
}

async function test() {
  if (!cfg.value) return;
  testing.value = true;
  try {
    await save();
    const r = await testConnection(cfg.value);
    if (r.missing.length) toast.error(`Kết nối OK (${r.shopName}) nhưng thiếu scope: ${r.missing.join(', ')}`);
    else toast.success(`Kết nối OK: ${r.shopName}`);
  } catch (e) {
    toast.error(errMsg(e));
  } finally {
    testing.value = false;
  }
}

async function del(r: UploadRecord) {
  if (!cfg.value) return;
  if (!window.confirm('Xoá file này khỏi Shopify Files? Link sẽ ngừng hoạt động.')) return;
  try {
    await deleteShopifyFile(cfg.value, r.id);
    await removeHistory(r.id);
    history.value = await listHistory();
    toast.success('Đã xoá file thành công.');
  } catch (e) {
    toast.error(errMsg(e));
  }
}
</script>

<template>
  <section class="space-y-4">
    <!-- Action buttons -->
    <div class="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs space-y-2.5">
      <div class="text-xs font-semibold text-slate-700 uppercase tracking-wider">Công cụ chụp màn hình</div>

      <div class="grid grid-cols-1 gap-2">
        <button
          class="flex items-center justify-between rounded-lg bg-blue-600 px-3.5 py-2.5 text-xs font-medium text-white shadow-xs hover:bg-blue-700 active:scale-[0.99] transition-all cursor-pointer"
          @click="run('START_AREA_CAPTURE')"
        >
          <span class="flex items-center gap-2">
            <UntitledIcon name="copy" :size="15" />
            <span>Chụp vùng màn hình</span>
          </span>
          <kbd class="rounded bg-blue-700/80 px-1.5 py-0.5 text-[10px] font-mono text-blue-100">Alt+Shift+S</kbd>
        </button>

        <button
          class="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 active:scale-[0.99] transition-all cursor-pointer"
          @click="run('START_VIEWPORT_CAPTURE')"
        >
          <UntitledIcon name="link-external" :size="15" class="text-slate-500" />
          <span>Chụp toàn bộ khung nhìn (Viewport)</span>
        </button>

        <button
          class="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 active:scale-[0.99] transition-all cursor-pointer"
          @click="run('OPEN_RECORDER')"
        >
          <span class="h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>
          <span>Quay video màn hình / Tab</span>
        </button>
      </div>

      <p class="text-[11px] text-slate-500 leading-normal pt-1">
        Ảnh chụp sẽ mở trong <b>Editor chuyên dụng</b> để vẽ mũi tên, ghi chú, che thông tin nhạy cảm và bấm <b>Copy ảnh</b> để dán ngay.
      </p>
    </div>

    <!-- Local Screenshots & Videos Cache / History -->
    <div class="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs space-y-2.5">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-1.5 text-xs font-semibold text-slate-700 uppercase tracking-wider">
          <UntitledIcon name="clock" :size="14" class="text-blue-600" />
          <span>Lịch sử chụp & quay gần đây ({{ localCaptures.length }})</span>
        </div>
        <button
          v-if="localCaptures.length"
          class="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
          title="Tải lại danh sách"
          @click="reloadLocalCaptures"
        >
          <UntitledIcon name="refresh-cw" :size="13" />
        </button>
      </div>

      <div v-if="localCaptures.length" class="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1 pt-1">
        <div
          v-for="c in localCaptures"
          :key="c.id"
          class="group relative rounded-xl border border-slate-200 overflow-hidden bg-slate-50 hover:border-blue-400 hover:shadow-sm transition-all"
        >
          <!-- Thumbnail / Video Preview -->
          <div class="h-24 w-full cursor-pointer overflow-hidden bg-slate-900 relative flex items-center justify-center" @click="openInEditor(c)">
            <template v-if="c.kind === 'video'">
              <video :src="c.url" class="h-full w-full object-cover opacity-80" muted preload="metadata"></video>
              <div class="absolute inset-0 flex items-center justify-center">
                <span class="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-xs group-hover:scale-110 transition-transform">
                  ▶
                </span>
              </div>
              <span v-if="c.duration" class="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.5 text-[9px] font-mono text-white">
                {{ String(Math.floor(c.duration / 60)).padStart(2, '0') }}:{{ String(c.duration % 60).padStart(2, '0') }}
              </span>
            </template>
            <template v-else>
              <img :src="c.url" class="h-full w-full object-cover transition-transform group-hover:scale-105" />
            </template>
          </div>

          <!-- Info & Actions -->
          <div class="p-1.5 flex items-center justify-between bg-white text-[10px] text-slate-500">
            <span class="truncate max-w-[70px] flex items-center gap-1">
              <span>{{ c.kind === 'video' ? '🎥' : '🖼' }}</span>
              <span>{{ new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</span>
            </span>
            <div class="flex items-center gap-1">
              <button
                v-if="c.kind === 'video'"
                class="rounded bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 text-slate-700 font-medium cursor-pointer"
                title="Tải video về máy"
                @click.stop="downloadCapture(c)"
              >
                Tải
              </button>
              <button
                v-else
                class="rounded bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 text-slate-700 font-medium cursor-pointer"
                title="Copy ảnh"
                @click.stop="copyCaptureImage(c.id)"
              >
                Copy
              </button>
              <button
                class="rounded bg-slate-100 hover:bg-red-50 hover:text-red-600 px-1 py-0.5 text-slate-400 cursor-pointer"
                title="Xóa mục này"
                @click.stop="removeLocalCapture(c.id)"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="text-center py-4 text-xs text-slate-400">
        Chưa có ảnh/video nào trong bộ nhớ tạm. Hãy thử chụp ảnh hoặc quay màn hình!
      </div>
    </div>

    <!-- Shopify Files Connection Config -->
    <div class="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs space-y-3">
      <div
        class="flex items-center justify-between cursor-pointer select-none"
        @click="showSettings = !showSettings"
      >
        <div class="flex items-center gap-1.5 text-xs font-semibold text-slate-700 uppercase tracking-wider">
          <UntitledIcon name="settings-01" :size="14" class="text-blue-600" />
          <span>Cấu hình Shopify Files (Upload)</span>
        </div>
        <button
          type="button"
          class="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
          :title="showSettings ? 'Thu gọn' : 'Chỉnh sửa cấu hình'"
          @click.stop="showSettings = !showSettings"
        >
          <UntitledIcon :name="showSettings ? 'chevron-up' : 'chevron-down'" :size="14" />
        </button>
      </div>

      <div v-if="showSettings && cfg" class="space-y-2.5 pt-1 border-t border-slate-100">
        <div>
          <label class="block text-[11px] font-medium text-slate-600 mb-1">Store chứa Evidence</label>
          <input
            v-model="cfg.shop"
            class="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
            placeholder="teeinblue-evidence.myshopify.com"
          />
        </div>

        <div>
          <label class="block text-[11px] font-medium text-slate-600 mb-1">Chế độ Token</label>
          <select
            v-model="cfg.tokenMode"
            class="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
          >
            <option value="broker">Token Broker (Khuyến nghị)</option>
            <option value="static">Token tĩnh (shpat_...)</option>
          </select>
        </div>

        <template v-if="cfg.tokenMode === 'broker'">
          <div>
            <label class="block text-[11px] font-medium text-slate-600 mb-1">Broker Endpoint URL</label>
            <input
              v-model="cfg.brokerUrl"
              class="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
              placeholder="https://server/api/support-files/token"
            />
          </div>
          <div>
            <label class="block text-[11px] font-medium text-slate-600 mb-1">Broker Secret Key</label>
            <input
              v-model="cfg.brokerKey"
              type="password"
              class="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
              placeholder="Support staff key"
            />
          </div>
        </template>
        <template v-else>
          <div>
            <label class="block text-[11px] font-medium text-slate-600 mb-1">Admin API Access Token (shpat_...)</label>
            <input
              v-model="cfg.staticToken"
              type="password"
              class="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
              placeholder="shpat_xxxxxxxxxxxxxxxxxxxx"
            />
          </div>
        </template>

        <div class="flex items-center gap-2 pt-2">
          <button
            class="flex-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="testing"
            @click="test"
          >
            {{ testing ? 'Đang kiểm tra…' : 'Lưu & Kiểm tra kết nối' }}
          </button>
          <button
            class="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            @click="save"
          >
            Lưu
          </button>
        </div>
      </div>
      <div v-else-if="!showSettings" class="text-xs text-slate-500 flex items-center justify-between">
        <span>Store: <b class="text-slate-700">{{ cfg?.shop || '(Chưa cấu hình)' }}</b></span>
        <span class="text-[11px] text-slate-400">Mode: {{ cfg?.tokenMode }}</span>
      </div>
    </div>

    <!-- Uploaded to CDN History -->
    <div v-if="history.length" class="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs space-y-2.5">
      <div class="text-xs font-semibold text-slate-700 uppercase tracking-wider">Đã upload lên CDN ({{ history.length }})</div>
      <ul class="space-y-1.5 max-h-56 overflow-y-auto pr-1">
        <li
          v-for="r in history"
          :key="r.id"
          class="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/70 p-2 text-xs hover:bg-slate-50"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 font-medium text-slate-700 truncate">
              <span>{{ r.kind === 'video' ? '🎥' : '🖼' }}</span>
              <span class="truncate">{{ r.filename }}</span>
            </div>
            <div class="text-[10px] text-slate-400">
              {{ new Date(r.createdAt).toLocaleString() }} · {{ Math.round(r.bytes / 1024) }} KB
            </div>
          </div>
          <div class="shrink-0 flex items-center gap-1">
            <button
              class="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 shadow-2xs"
              @click="copyText(r.url).then(() => toast.success('Đã copy link'))"
            >
              Copy
            </button>
            <button
              class="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-red-600 hover:bg-red-50 hover:border-red-200 shadow-2xs"
              title="Xoá khỏi Shopify"
              @click="del(r)"
            >
              ✕
            </button>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>
