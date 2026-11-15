<script setup lang="ts">
import { onMounted, ref } from 'vue';
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

const toast = useToast();
const cfg = ref<CaptureSettings | null>(null);
const history = ref<UploadRecord[]>([]);
const showSettings = ref(false);
const testing = ref(false);

onMounted(async () => {
  cfg.value = await loadSettings();
  history.value = await listHistory();
  showSettings.value = !cfg.value.shop;
});

async function run(type: 'START_AREA_CAPTURE' | 'START_VIEWPORT_CAPTURE' | 'OPEN_RECORDER') {
  try {
    await call({ type });
  } catch (e) {
    toast.error(errMsg(e));
  }
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
          class="flex items-center justify-between rounded-lg bg-blue-600 px-3.5 py-2.5 text-xs font-medium text-white shadow-xs hover:bg-blue-700 active:scale-[0.99] transition-all"
          @click="run('START_AREA_CAPTURE')"
        >
          <span class="flex items-center gap-2">
            <UntitledIcon name="copy" :size="15" />
            <span>Chụp vùng màn hình</span>
          </span>
          <kbd class="rounded bg-blue-700/80 px-1.5 py-0.5 text-[10px] font-mono text-blue-100">Alt+Shift+S</kbd>
        </button>

        <button
          class="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 active:scale-[0.99] transition-all"
          @click="run('START_VIEWPORT_CAPTURE')"
        >
          <UntitledIcon name="link-external" :size="15" class="text-slate-500" />
          <span>Chụp toàn bộ khung nhìn (Viewport)</span>
        </button>

        <button
          class="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 active:scale-[0.99] transition-all"
          @click="run('OPEN_RECORDER')"
        >
          <span class="h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>
          <span>Quay video màn hình / Tab</span>
        </button>
      </div>

      <p class="text-[11px] text-slate-500 leading-normal pt-1">
        Ảnh chụp sẽ mở trong <b>Editor chuyên dụng</b>: vẽ mũi tên, ghi chú, che thông tin nhạy cảm và bấm <b>Copy ảnh</b> để dán ngay vào Slack / Discord / Zendesk.
      </p>
    </div>

    <!-- Shopify Files Connection Config -->
    <div class="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-1.5 text-xs font-semibold text-slate-700 uppercase tracking-wider">
          <UntitledIcon name="settings-01" :size="14" class="text-blue-600" />
          <span>Cấu hình Shopify Files (Upload)</span>
        </div>
        <button
          class="text-xs text-blue-600 hover:underline font-medium cursor-pointer"
          @click="showSettings = !showSettings"
        >
          {{ showSettings ? 'Thu gọn' : 'Chỉnh sửa' }}
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

    <!-- Recent History -->
    <div v-if="history.length" class="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs space-y-2.5">
      <div class="text-xs font-semibold text-slate-700 uppercase tracking-wider">Đã upload gần đây ({{ history.length }})</div>
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
