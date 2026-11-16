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
            <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-transform group-hover:scale-105">
              <UntitledIcon name="copy" :size="20" />
            </div>
            <div class="text-left">
              <div class="text-xs font-bold text-slate-800">Screenshot</div>
              <div class="text-[11px] text-slate-400">Capture, select or full page</div>
            </div>
          </div>
          <div class="text-slate-400 group-hover:text-blue-600 transition-transform" :class="showScreenshotMenu ? 'rotate-90' : ''">
            <UntitledIcon name="chevron-down" :size="15" />
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
            <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600 transition-transform group-hover:scale-105">
              <span class="text-lg">🎥</span>
            </div>
            <div class="text-left">
              <div class="text-xs font-bold text-slate-800">Record</div>
              <div class="text-[11px] text-slate-400">Record your screen easily</div>
            </div>
          </div>
          <div class="text-slate-400 group-hover:text-purple-600 transition-transform" :class="showRecordMenu ? 'rotate-90' : ''">
            <UntitledIcon name="chevron-down" :size="15" />
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
          <div class="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <span class="text-[9px] text-white/90 font-mono">{{ new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</span>
            <div class="flex items-center gap-1">
              <button
                class="rounded bg-white/90 px-1.5 py-0.5 text-[9px] font-bold text-slate-800 hover:bg-white"
                @click.stop="c.kind === 'video' ? downloadCapture(c) : copyCaptureImage(c.id)"
              >
                {{ c.kind === 'video' ? 'Tải' : 'Copy' }}
              </button>
              <button
                class="rounded bg-red-600/90 px-1 py-0.5 text-[9px] font-bold text-white hover:bg-red-600"
                @click.stop="removeLocalCapture(c.id)"
              >
                ✕
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
            <label class="block font-medium text-slate-700 mb-1">Chế độ Token</label>
            <select
              v-model="cfg.tokenMode"
              class="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-blue-500"
            >
              <option value="broker">Token Broker (Khuyến nghị)</option>
              <option value="static">Token tĩnh (shpat_...)</option>
            </select>
          </div>

          <template v-if="cfg.tokenMode === 'broker'">
            <div>
              <label class="block font-medium text-slate-700 mb-1">Broker Endpoint URL</label>
              <input
                v-model="cfg.brokerUrl"
                class="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-blue-500"
                placeholder="https://server/api/support-files/token"
              />
            </div>
            <div>
              <label class="block font-medium text-slate-700 mb-1">Broker Secret Key</label>
              <input
                v-model="cfg.brokerKey"
                type="password"
                class="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-blue-500"
                placeholder="Staff key"
              />
            </div>
          </template>
          <template v-else>
            <div>
              <label class="block font-medium text-slate-700 mb-1">Admin API Token (shpat_...)</label>
              <input
                v-model="cfg.staticToken"
                type="password"
                class="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-blue-500"
                placeholder="shpat_xxxxxxxxxxxx"
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
      <div class="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl space-y-3 max-h-[80vh] flex flex-col">
        <div class="flex items-center justify-between border-b border-slate-100 pb-2">
          <span class="text-xs font-bold uppercase tracking-wider text-slate-800">Tất cả ảnh & video ({{ localCaptures.length }})</span>
          <button class="text-slate-400 hover:text-slate-600" @click="showAllHistoryModal = false">✕</button>
        </div>

        <div class="flex-1 overflow-y-auto space-y-2 pr-1">
          <div
            v-for="c in localCaptures"
            :key="c.id"
            class="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2 text-xs hover:bg-slate-100"
          >
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-base">{{ c.kind === 'video' ? '🎥' : '🖼' }}</span>
              <div class="truncate">
                <div class="font-medium text-slate-700 truncate">{{ new Date(c.createdAt).toLocaleString() }}</div>
                <div class="text-[10px] text-slate-400">{{ c.kind === 'video' ? `${c.duration || 0}s` : 'PNG image' }}</div>
              </div>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button class="rounded border bg-white px-2 py-1 text-[10px] font-semibold text-slate-700" @click="openInEditor(c)">Mở</button>
              <button class="rounded border bg-white px-1.5 py-1 text-[10px] font-semibold text-red-600" @click="removeLocalCapture(c.id)">✕</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
