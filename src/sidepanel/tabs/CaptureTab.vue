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
import { deleteRecord, listAllRecords } from '@/features/capture/idb';

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

const showSettingsDrawer = ref(false);
const showScreenshotMenu = ref(false);
const showRecordMenu = ref(false);
const showAllHistoryModal = ref(false);
const showGuideModal = ref(false);
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
  await reloadLocalCaptures();
  chrome.runtime.onMessage.addListener(handleRuntimeMsg);
});

onBeforeUnmount(() => {
  chrome.runtime.onMessage.removeListener(handleRuntimeMsg);
  localCaptures.value.forEach((c) => URL.revokeObjectURL(c.url));
});

// Quick Tool: Toggle Delay (0s -> 3s -> 5s -> 10s)
function cycleDelay() {
  if (!cfg.value) return;
  const current = cfg.value.delaySeconds || 0;
  const next = current === 0 ? 3 : current === 3 ? 5 : current === 5 ? 10 : 0;
  cfg.value.delaySeconds = next;
  saveSettings(cfg.value);
  toast.success(next > 0 ? `Đã đặt hẹn giờ ${next}s trước khi chụp` : 'Đã tắt hẹn giờ chụp');
}

// Quick Tool: Toggle Auto Copy
function toggleAutoCopy() {
  if (!cfg.value) return;
  cfg.value.autoCopy = !cfg.value.autoCopy;
  saveSettings(cfg.value);
  toast.success(cfg.value.autoCopy ? 'Bật chế độ tự động Copy ảnh' : 'Tắt tự động Copy ảnh');
}

// Quick Tool: Toggle Auto Upload
function toggleAutoUpload() {
  if (!cfg.value) return;
  cfg.value.autoUpload = !cfg.value.autoUpload;
  saveSettings(cfg.value);
  toast.success(cfg.value.autoUpload ? 'Bật chế độ tự động Upload Shopify' : 'Tắt tự động Upload');
}

async function runCapture(type: 'START_AREA_CAPTURE' | 'START_VIEWPORT_CAPTURE') {
  showScreenshotMenu.value = false;
  const delay = cfg.value?.delaySeconds || 0;
  try {
    await call({ type, delay });
  } catch (e) {
    toast.error(errMsg(e));
  }
}

async function runRecord(type: 'START_AREA_RECORD' | 'OPEN_RECORDER') {
  showRecordMenu.value = false;
  try {
    await call({ type });
  } catch (e) {
    toast.error(errMsg(e));
  }
}

async function openLatestEditor() {
  const latestImg = localCaptures.value.find((c) => c.kind === 'image');
  if (latestImg) {
    await chrome.tabs.create({ url: chrome.runtime.getURL(`editor.html?id=${latestImg.id}`) });
  } else {
    // Nếu chưa có ảnh nào thì mở chụp vùng
    await runCapture('START_AREA_CAPTURE');
  }
}

async function openInEditor(c: { id: string; url: string; kind: 'image' | 'video' }) {
  if (c.kind === 'video') {
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
  toast.success('Đã xóa khỏi bộ nhớ tạm.');
}

async function saveConfig() {
  if (cfg.value) {
    await saveSettings(cfg.value);
    toast.success('Đã lưu cấu hình Shopify.');
    showSettingsDrawer.value = false;
  }
}

async function testConfig() {
  if (!cfg.value) return;
  testing.value = true;
  try {
    await saveSettings(cfg.value);
    const r = await testConnection(cfg.value);
    if (r.missing.length) toast.error(`Kết nối OK (${r.shopName}) nhưng thiếu scope: ${r.missing.join(', ')}`);
    else toast.success(`Kết nối OK: ${r.shopName}`);
  } catch (e) {
    toast.error(errMsg(e));
  } finally {
    testing.value = false;
  }
}

async function delCdnFile(r: UploadRecord) {
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
  <div class="space-y-4 font-sans select-none pb-4">
    <!-- 1. Hero Modern Banner (Phù hợp mockup) -->
    <div
      class="relative overflow-hidden rounded-2xl p-5 text-white shadow-lg"
      style="background: linear-gradient(135deg, #1e1b4b 0%, #2e1065 40%, #1e3a8a 100%);"
    >
      <!-- Background Ambient Glow -->
      <div class="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-blue-500/20 blur-2xl"></div>
      <div class="absolute -left-8 -bottom-8 h-32 w-32 rounded-full bg-purple-500/20 blur-2xl"></div>

      <!-- Top Row: REC indicator & Settings icon -->
      <div class="relative z-10 flex items-center justify-between">
        <div class="inline-flex items-center gap-1.5 rounded-full bg-red-500/90 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-white shadow-xs">
          <span class="h-1.5 w-1.5 rounded-full bg-white animate-pulse"></span>
          <span>REC</span>
        </div>

        <button
          class="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-all cursor-pointer"
          title="Cài đặt Shopify Files & Phím tắt"
          @click="showSettingsDrawer = true"
        >
          <UntitledIcon name="settings-01" :size="15" />
        </button>
      </div>

      <!-- Center Title & 3D Camera Icon -->
      <div class="relative z-10 mt-3 flex items-center justify-between">
        <div class="space-y-1">
          <h2 class="text-base font-extrabold tracking-tight text-white leading-tight">
            Teeinblue<br />Support Toolkit
          </h2>
          <p class="text-[11px] font-medium text-purple-200/80">Capture • Record • Edit</p>
        </div>

        <!-- 3D Camera Illustration -->
        <div class="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-400 p-2 shadow-xl ring-4 ring-white/10">
          <div class="h-7 w-7 rounded-full bg-indigo-950 flex items-center justify-center border-2 border-indigo-300 shadow-inner">
            <span class="h-3 w-3 rounded-full bg-blue-400"></span>
          </div>
          <span class="absolute top-1.5 right-2 h-1.5 w-1.5 rounded-full bg-white/60"></span>
        </div>
      </div>
    </div>

    <!-- 2. Primary Action Cards (Screenshot & Record) -->
    <div class="space-y-2.5">
      <!-- Screenshot Card -->
      <div class="relative">
        <button
          class="group flex w-full items-center justify-between rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs hover:border-blue-400 hover:shadow-sm active:scale-[0.99] transition-all cursor-pointer"
          @click="showScreenshotMenu = !showScreenshotMenu"
        >
          <div class="flex items-center gap-3">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md transition-transform group-hover:scale-105">
              <!-- Camera Icon đẹp & to chuẩn mockup -->
              <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div class="text-left">
              <div class="text-[13px] font-bold text-slate-900 leading-tight">Screenshot</div>
              <div class="text-[11px] text-slate-500 mt-0.5">Capture, select or full page</div>
            </div>
          </div>
          <div class="flex h-7 w-7 items-center justify-center rounded-full text-blue-600 group-hover:bg-blue-50 transition-all" :class="showScreenshotMenu ? 'rotate-90' : ''">
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" /></svg>
          </div>
        </button>

        <!-- Submenu Options -->
        <div v-if="showScreenshotMenu" class="mt-1.5 space-y-1 rounded-xl border border-blue-100 bg-blue-50/60 p-2 text-xs">
          <button
            class="flex w-full items-center justify-between rounded-lg bg-white p-2 font-medium text-slate-700 hover:bg-blue-600 hover:text-white transition-all cursor-pointer shadow-2xs"
            @click="runCapture('START_AREA_CAPTURE')"
          >
            <span class="flex items-center gap-2">
              <span>✂</span>
              <span>Kéo chọn vùng (Area Crop)</span>
            </span>
            <kbd class="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-mono text-slate-600 group-hover:bg-blue-700">Alt+Shift+S</kbd>
          </button>
          <button
            class="flex w-full items-center justify-between rounded-lg bg-white p-2 font-medium text-slate-700 hover:bg-blue-600 hover:text-white transition-all cursor-pointer shadow-2xs"
            @click="runCapture('START_VIEWPORT_CAPTURE')"
          >
            <span class="flex items-center gap-2">
              <span>🖼</span>
              <span>Chụp toàn bộ khung nhìn (Viewport)</span>
            </span>
          </button>
        </div>
      </div>

      <!-- Record Card -->
      <div class="relative">
        <button
          class="group flex w-full items-center justify-between rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs hover:border-purple-400 hover:shadow-sm active:scale-[0.99] transition-all cursor-pointer"
          @click="showRecordMenu = !showRecordMenu"
        >
          <div class="flex items-center gap-3">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-md transition-transform group-hover:scale-105">
              <!-- Video Cam Icon to tròn chuẩn mockup -->
              <svg class="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4 6a2 2 0 00-2 2v8a2 2 0 002 2h10a2 2 0 002-2v-2.586l3.293 3.293A1 1 0 0021 16V8a1 1 0 00-1.707-.707L16 10.586V8a2 2 0 00-2-2H4z" />
                <circle cx="9" cy="12" r="1.5" fill="#ffffff" />
              </svg>
            </div>
            <div class="text-left">
              <div class="text-[13px] font-bold text-slate-900 leading-tight">Record</div>
              <div class="text-[11px] text-slate-500 mt-0.5">Record your screen easily</div>
            </div>
          </div>
          <div class="flex h-7 w-7 items-center justify-center rounded-full text-purple-600 group-hover:bg-purple-50 transition-all" :class="showRecordMenu ? 'rotate-90' : ''">
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" /></svg>
          </div>
        </button>

        <!-- Record Submenu Options -->
        <div v-if="showRecordMenu" class="mt-1.5 space-y-1 rounded-xl border border-purple-100 bg-purple-50/60 p-2 text-xs">
          <button
            class="flex w-full items-center justify-between rounded-lg bg-white p-2 font-medium text-slate-700 hover:bg-purple-600 hover:text-white transition-all cursor-pointer shadow-2xs"
            @click="runRecord('START_AREA_RECORD')"
          >
            <span class="flex items-center gap-2">
              <span class="h-2 w-2 rounded-xs border border-red-500 bg-red-100"></span>
              <span>Khung đỏ chọn vùng cần quay</span>
            </span>
          </button>
          <button
            class="flex w-full items-center justify-between rounded-lg bg-white p-2 font-medium text-slate-700 hover:bg-purple-600 hover:text-white transition-all cursor-pointer shadow-2xs"
            @click="runRecord('OPEN_RECORDER')"
          >
            <span class="flex items-center gap-2">
              <span class="h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>
              <span>Quay toàn màn hình / Tab</span>
            </span>
            <kbd class="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-mono text-slate-600">Alt+Shift+R</kbd>
          </button>
        </div>
      </div>
    </div>

    <!-- 3. Quick Tools Horizontal Bar (4 nút theo mockup) -->
    <div class="space-y-2">
      <div class="text-[11px] font-bold uppercase tracking-wider text-slate-700">Quick Tools</div>
      <div class="grid grid-cols-4 gap-2">
        <!-- Delay Tool -->
        <button
          class="flex flex-col items-center justify-center rounded-2xl border p-2.5 transition-all cursor-pointer shadow-2xs"
          :class="(cfg?.delaySeconds || 0) > 0 ? 'border-blue-500 bg-blue-50 text-blue-700 font-bold' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'"
          title="Bấm để đổi hẹn giờ (Tắt / 3s / 5s / 10s)"
          @click="cycleDelay"
        >
          <UntitledIcon name="clock" :size="16" />
          <span class="mt-1 text-[11px] font-semibold">Delay</span>
          <span class="text-[9px] font-mono text-slate-400">{{ (cfg?.delaySeconds || 0) > 0 ? `${cfg?.delaySeconds}s` : 'Off' }}</span>
        </button>

        <!-- Copy Tool -->
        <button
          class="flex flex-col items-center justify-center rounded-2xl border p-2.5 transition-all cursor-pointer shadow-2xs"
          :class="cfg?.autoCopy ? 'border-blue-500 bg-blue-50 text-blue-700 font-bold' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'"
          title="Tự động copy ảnh vào clipboard sau khi chụp"
          @click="toggleAutoCopy"
        >
          <UntitledIcon name="copy" :size="16" />
          <span class="mt-1 text-[11px] font-semibold">Copy</span>
          <span class="text-[9px] font-mono text-slate-400">{{ cfg?.autoCopy ? 'Auto' : 'Manual' }}</span>
        </button>

        <!-- Upload Tool -->
        <button
          class="flex flex-col items-center justify-center rounded-2xl border p-2.5 transition-all cursor-pointer shadow-2xs"
          :class="cfg?.autoUpload ? 'border-blue-500 bg-blue-50 text-blue-700 font-bold' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'"
          title="Tự động upload lên Shopify Files"
          @click="toggleAutoUpload"
        >
          <UntitledIcon name="palette" :size="16" />
          <span class="mt-1 text-[11px] font-semibold">Upload</span>
          <span class="text-[9px] font-mono text-slate-400">{{ cfg?.autoUpload ? 'Auto' : 'Off' }}</span>
        </button>

        <!-- Open Editor Tool -->
        <button
          class="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50 transition-all cursor-pointer shadow-2xs"
          title="Mở ảnh gần nhất trong Editor để chú thích"
          @click="openLatestEditor"
        >
          <UntitledIcon name="edit-02" :size="16" />
          <span class="mt-1 text-[11px] font-semibold">Editor</span>
          <span class="text-[9px] font-mono text-slate-400">Open</span>
        </button>
      </div>
    </div>

    <!-- 4. Recent Gallery (Danh sách hình ảnh & video gần đây) -->
    <div class="space-y-2.5">
      <div class="flex items-center justify-between">
        <div class="text-[11px] font-bold uppercase tracking-wider text-slate-700">
          Recent ({{ localCaptures.length }})
        </div>
        <button
          v-if="localCaptures.length"
          class="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer"
          @click="showAllHistoryModal = true"
        >
          <span>View all</span>
          <span>→</span>
        </button>
      </div>

      <div v-if="localCaptures.length" class="flex gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
        <div
          v-for="c in localCaptures.slice(0, 6)"
          :key="c.id"
          class="group relative h-24 w-36 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-2xs hover:border-blue-500 transition-all cursor-pointer"
          @click="openInEditor(c)"
        >
          <template v-if="c.kind === 'video'">
            <video :src="c.url" class="h-full w-full object-cover opacity-80" muted preload="metadata"></video>
            <div class="absolute inset-0 flex items-center justify-center">
              <span class="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-xs text-xs group-hover:scale-110 transition-transform">
                ▶
              </span>
            </div>
            <span v-if="c.duration" class="absolute bottom-1.5 right-1.5 rounded-md bg-black/80 px-1.5 py-0.5 text-[9px] font-mono text-white">
              {{ String(Math.floor(c.duration / 60)).padStart(2, '0') }}:{{ String(c.duration % 60).padStart(2, '0') }}
            </span>
          </template>
          <template v-else>
            <img :src="c.url" class="h-full w-full object-cover transition-transform group-hover:scale-105" />
          </template>

          <!-- Quick Action Hover Bar -->
          <div class="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <span class="text-[9px] text-white/90 font-mono">{{ new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</span>
            <div class="flex items-center gap-1">
              <button
                class="flex h-6 w-6 items-center justify-center rounded-lg bg-white/90 text-slate-800 hover:bg-white hover:scale-105 active:scale-95 transition-all shadow-xs"
                :title="c.kind === 'video' ? 'Tải video về máy' : 'Copy ảnh vào clipboard'"
                @click.stop="c.kind === 'video' ? downloadCapture(c) : copyCaptureImage(c.id)"
              >
                <UntitledIcon :name="c.kind === 'video' ? 'folder-download' : 'copy'" :size="12" />
              </button>
              <button
                class="flex h-6 w-6 items-center justify-center rounded-lg bg-red-600/90 text-white hover:bg-red-600 hover:scale-105 active:scale-95 transition-all shadow-xs"
                title="Xóa mục này"
                @click.stop="removeLocalCapture(c.id)"
              >
                <UntitledIcon name="x-close" :size="12" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-center text-xs text-slate-400">
        Chưa có ảnh hoặc video nào. Hãy chụp hoặc quay một đoạn!
      </div>
    </div>

    <!-- 5. Settings Drawer Modal (Cấu hình Shopify Files) -->
    <div
      v-if="showSettingsDrawer"
      class="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-xs"
      @click.self="showSettingsDrawer = false"
    >
      <div class="w-full rounded-t-3xl bg-white p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div class="flex items-center gap-2">
            <UntitledIcon name="settings-01" :size="16" class="text-blue-600" />
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-800">Cấu hình Shopify Files</h3>
          </div>
          <button class="text-slate-400 hover:text-slate-600" @click="showSettingsDrawer = false">✕</button>
        </div>

        <div v-if="cfg" class="space-y-3 text-xs">
          <div>
            <label class="block font-medium text-slate-700 mb-1">Evidence Store URL</label>
            <input
              v-model="cfg.shop"
              class="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-blue-500"
              placeholder="teeinblue-evidence.myshopify.com"
            />
          </div>

          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="font-medium text-slate-700">Chế độ Token</label>
              <button
                type="button"
                class="flex h-5 w-5 items-center justify-center rounded-md text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                title="Xem hướng dẫn chi tiết cách tạo & lấy token"
                @click="showGuideModal = true"
              >
                <UntitledIcon name="help-circle" :size="14" />
              </button>
            </div>
            <select
              v-model="cfg.tokenMode"
              class="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-blue-500 bg-white"
            >
              <option value="client_credentials">App Partner / Dev Dashboard (Khuyến nghị 2026)</option>
              <option value="static">Token tĩnh (shpat_... / shpua_...)</option>
              <option value="broker">Token Broker Backend</option>
            </select>
          </div>

          <template v-if="cfg.tokenMode === 'client_credentials'">
            <div>
              <label class="block font-medium text-slate-700 mb-1">App Client ID</label>
              <input
                v-model="cfg.clientId"
                class="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-blue-500 font-mono text-[11px]"
                placeholder="316b6bb8fb2547f7432e2a15b4fb7884"
              />
            </div>
            <div>
              <label class="block font-medium text-slate-700 mb-1">App Client Secret (shpss_...)</label>
              <input
                v-model="cfg.clientSecret"
                type="password"
                class="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-blue-500 font-mono text-[11px]"
                placeholder="shpss_xxxxxxxxxxxxxxxxxxxxxxxx"
              />
            </div>
          </template>

          <template v-else-if="cfg.tokenMode === 'static'">
            <div>
              <label class="block font-medium text-slate-700 mb-1">Admin API Token (shpat_... hoặc shpua_...)</label>
              <input
                v-model="cfg.staticToken"
                type="password"
                class="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-blue-500 font-mono text-[11px]"
                placeholder="shpat_... hoặc shpua_..."
              />
            </div>
          </template>

          <template v-else-if="cfg.tokenMode === 'broker'">
            <div>
              <label class="block font-medium text-slate-700 mb-1">Broker Endpoint URL</label>
              <input
                v-model="cfg.brokerUrl"
                class="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-blue-500 font-mono text-[11px]"
                placeholder="https://server/api/support-files/token"
              />
            </div>
            <div>
              <label class="block font-medium text-slate-700 mb-1">Broker Secret Key</label>
              <input
                v-model="cfg.brokerKey"
                type="password"
                class="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-blue-500 font-mono text-[11px]"
                placeholder="Staff key"
              />
            </div>
          </template>

          <div class="flex items-center gap-2 pt-2">
            <button
              class="flex-1 rounded-xl bg-blue-600 py-2.5 font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              :disabled="testing"
              @click="testConfig"
            >
              {{ testing ? 'Đang kiểm tra…' : 'Kiểm tra kết nối' }}
            </button>
            <button
              class="rounded-xl border border-slate-200 px-4 py-2.5 font-bold text-slate-700 hover:bg-slate-50"
              @click="saveConfig"
            >
              Lưu
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 6. View All History Modal -->
    <div
      v-if="showAllHistoryModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      @click.self="showAllHistoryModal = false"
    >
      <div class="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl space-y-3 max-h-[85vh] flex flex-col">
        <div class="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div class="flex items-center gap-2">
            <UntitledIcon name="clock" :size="15" class="text-blue-600" />
            <span class="text-xs font-bold uppercase tracking-wider text-slate-800">Tất cả ảnh & video ({{ localCaptures.length }})</span>
          </div>
          <button class="h-6 w-6 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 flex items-center justify-center" @click="showAllHistoryModal = false">
            <UntitledIcon name="x-close" :size="14" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto space-y-2.5 pr-1">
          <div
            v-for="c in localCaptures"
            :key="c.id"
            class="group flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-2.5 text-xs hover:border-blue-400 hover:bg-white hover:shadow-xs transition-all"
          >
            <!-- Thumbnail ảnh thật hoặc video preview -->
            <div
              class="h-14 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-900 border border-slate-200 cursor-pointer relative flex items-center justify-center"
              @click="openInEditor(c)"
            >
              <template v-if="c.kind === 'video'">
                <video :src="c.url" class="h-full w-full object-cover opacity-80" muted preload="metadata"></video>
                <span class="absolute flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white text-[9px]">▶</span>
                <span v-if="c.duration" class="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[8px] font-mono text-white">
                  {{ String(Math.floor(c.duration / 60)).padStart(2, '0') }}:{{ String(c.duration % 60).padStart(2, '0') }}
                </span>
              </template>
              <template v-else>
                <img :src="c.url" class="h-full w-full object-cover group-hover:scale-105 transition-transform" />
              </template>
            </div>

            <!-- Meta details -->
            <div class="min-w-0 flex-1 cursor-pointer" @click="openInEditor(c)">
              <div class="font-semibold text-slate-800 truncate leading-tight">
                {{ new Date(c.createdAt).toLocaleDateString([], { month: '2-digit', day: '2-digit' }) }} · {{ new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
              </div>
              <div class="text-[10px] text-slate-400 mt-1 flex items-center gap-1.5 font-medium">
                <span class="rounded px-1.5 py-0.2" :class="c.kind === 'video' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'">
                  {{ c.kind === 'video' ? 'Video' : 'Ảnh PNG' }}
                </span>
                <span v-if="c.kind === 'video'">{{ c.duration || 0 }}s</span>
              </div>
            </div>

            <!-- Action buttons -->
            <div class="flex items-center gap-1.5 shrink-0">
              <button
                class="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-blue-600 shadow-2xs cursor-pointer active:scale-95 transition-all"
                :title="c.kind === 'video' ? 'Tải video về máy' : 'Copy ảnh vào clipboard'"
                @click="c.kind === 'video' ? downloadCapture(c) : copyCaptureImage(c.id)"
              >
                <UntitledIcon :name="c.kind === 'video' ? 'folder-download' : 'copy'" :size="13" />
              </button>
              <button
                class="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 shadow-2xs cursor-pointer active:scale-95 transition-all"
                title="Xóa mục này"
                @click="removeLocalCapture(c.id)"
              >
                <UntitledIcon name="x-close" :size="13" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 7. Setup Guide Modal (Hướng dẫn chi tiết từng chế độ Token) -->
    <div
      v-if="showGuideModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      @click.self="showGuideModal = false"
    >
      <div class="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl space-y-3 max-h-[85vh] flex flex-col">
        <div class="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div class="flex items-center gap-2">
            <UntitledIcon name="help-circle" :size="16" class="text-blue-600" />
            <span class="text-xs font-bold uppercase tracking-wider text-slate-800">Hướng dẫn kết nối Shopify</span>
          </div>
          <button class="h-6 w-6 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 flex items-center justify-center" @click="showGuideModal = false">
            <UntitledIcon name="x-close" :size="14" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto space-y-4 pr-1 text-xs text-slate-700 leading-relaxed">
          <!-- Guide Tab 1: App Partner / Dev Dashboard -->
          <div class="rounded-xl border border-blue-100 bg-blue-50/50 p-3 space-y-2">
            <div class="flex items-center gap-1.5 font-bold text-blue-800">
              <span class="flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-white text-[10px]">1</span>
              <span>App Partner / Dev Dashboard (Mới 2026)</span>
            </div>
            <div class="text-[11px] text-slate-600 space-y-1.5 pl-2">
              <p>Phù hợp cho app nội bộ tạo trên <strong class="text-slate-800">dev.shopify.com</strong> hoặc Partner Dashboard:</p>
              <ol class="list-decimal list-inside space-y-1 text-slate-700">
                <li>Vào <strong class="text-slate-800">Dev Dashboard &gt; Apps &gt; Chọn App &gt; Settings</strong>.</li>
                <li>Copy <code class="rounded bg-white px-1 font-mono text-blue-700">Client ID</code> và <code class="rounded bg-white px-1 font-mono text-blue-700">Client Secret (shpss_...)</code>.</li>
                <li>Vào mục <strong class="text-slate-800">Versions</strong> ở menu trái, bấm <strong class="text-slate-800">Create version</strong>.</li>
                <li>Phần <strong class="text-slate-800">Access scopes</strong>, cấp quyền:
                  <div class="mt-1 rounded bg-white p-1 font-mono text-[10px] text-emerald-700 border border-slate-200">
                    write_files, read_files
                  </div>
                </li>
                <li>Bấm <strong class="text-slate-800">Save &amp; Release</strong> version đó.</li>
                <li>Dán Client ID &amp; Secret vào extension và bấm <strong class="text-blue-700">Kiểm tra kết nối</strong>.</li>
              </ol>
            </div>
          </div>

          <!-- Guide Tab 2: Token tĩnh shpat_ -->
          <div class="rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-2">
            <div class="flex items-center gap-1.5 font-bold text-slate-800">
              <span class="flex h-4 w-4 items-center justify-center rounded-full bg-slate-600 text-white text-[10px]">2</span>
              <span>Token tĩnh (Legacy Custom App)</span>
            </div>
            <div class="text-[11px] text-slate-600 space-y-1.5 pl-2">
              <p>Dành cho các store đã có sẵn Custom App tạo trước ngày 01/01/2026:</p>
              <ol class="list-decimal list-inside space-y-1 text-slate-700">
                <li>Vào <strong class="text-slate-800">Settings &gt; Apps and sales channels &gt; Develop apps</strong>.</li>
                <li>Mở app đã tạo trước đây &gt; tab <strong class="text-slate-800">Configuration</strong>: đảm bảo có quyền <code class="rounded bg-white px-1 font-mono text-emerald-700">write_files, read_files</code>.</li>
                <li>Vào tab <strong class="text-slate-800">API credentials</strong>, copy chuỗi <code class="rounded bg-white px-1 font-mono text-slate-800">shpat_...</code>.</li>
                <li>Dán trực tiếp vào ô Token trên extension.</li>
              </ol>
            </div>
          </div>

          <!-- Guide Tab 3: Token Broker Backend -->
          <div class="rounded-xl border border-purple-100 bg-purple-50/50 p-3 space-y-2">
            <div class="flex items-center gap-1.5 font-bold text-purple-800">
              <span class="flex h-4 w-4 items-center justify-center rounded-full bg-purple-600 text-white text-[10px]">3</span>
              <span>Token Broker Backend (Doanh nghiệp)</span>
            </div>
            <div class="text-[11px] text-slate-600 space-y-1 pl-2">
              <p>Dành cho team có server backend trung gian cấp token ngắn hạn cho nhân viên:</p>
              <ul class="list-disc list-inside space-y-1 text-slate-700">
                <li><strong class="text-slate-800">Broker Endpoint URL</strong>: API server của team trả về token tạm.</li>
                <li><strong class="text-slate-800">Broker Secret Key</strong>: Mật khẩu xác thực nhân viên support.</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="pt-2 border-t border-slate-100 flex justify-end">
          <button
            class="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700 transition-colors"
            @click="showGuideModal = false"
          >
            Đã hiểu
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
