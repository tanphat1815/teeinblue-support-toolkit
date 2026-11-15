<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { EditorEngine, type Pt, type Tool } from './engine';
import { deleteRecord, getRecord } from '@/features/capture/idb';
import { LIMITS } from '@/features/capture/constants';
import { addHistory, loadSettings } from '@/features/capture/settings';
import { randomName, uploadToShopifyFiles } from '@/features/capture/shopify-files';

const canvasEl = ref<HTMLCanvasElement | null>(null);
const wrap = ref<HTMLDivElement | null>(null);
let engine: EditorEngine;
const params = new URLSearchParams(location.search);
const captureId = params.get('id') || '';

const tool = ref<Tool>('rect');
const color = ref('#ef4444');
const width = ref(4);
const msg = ref('');
const msgKind = ref<'ok' | 'err' | 'info'>('info');
const link = ref('');
const busy = ref('');
const confirmUpload = ref(false);
const st = reactive({ canUndo: false, canRedo: false, crop: false });
const textBox = reactive({ show: false, x: 0, y: 0, cx: 0, cy: 0, value: '' });
let drawing = false;

const tools: { id: Tool; label: string }[] = [
  { id: 'crop', label: '⛶ Crop' },
  { id: 'pen', label: '✎ Bút' },
  { id: 'line', label: '／ Đường' },
  { id: 'arrow', label: '➚ Mũi tên' },
  { id: 'rect', label: '▭ Khung' },
  { id: 'ellipse', label: '◯ Elip' },
  { id: 'highlight', label: '▮ Highlight' },
  { id: 'text', label: 'T Chữ' },
  { id: 'badge', label: '① Số' },
  { id: 'pixelate', label: '▦ Pixelate' },
  { id: 'redact', label: '■ Che đen' }
];
const colors = ['#ef4444', '#facc15', '#22c55e', '#3b82f6', '#000000', '#ffffff'];

const k = () => Math.max(1, engine.size.w / 900);
const style = () => ({ color: color.value, width: width.value * k(), font: (16 + width.value * 3) * k() });
const say = (t: string, kind: 'ok' | 'err' | 'info' = 'info') => {
  msg.value = t;
  msgKind.value = kind;
};
const sync = () => {
  st.canUndo = engine.canUndo;
  st.canRedo = engine.canRedo;
  st.crop = !!engine.pendingCrop;
};

function pt(e: PointerEvent): Pt {
  const c = canvasEl.value!,
    r = c.getBoundingClientRect();
  return [(e.clientX - r.left) * (c.width / r.width), (e.clientY - r.top) * (c.height / r.height)];
}
function onDown(e: PointerEvent) {
  if (e.button !== 0) return;
  if (textBox.show) commitText();
  const p = pt(e);
  if (tool.value === 'text') {
    const c = canvasEl.value!,
      r = c.getBoundingClientRect(),
      w = wrap.value!.getBoundingClientRect();
    Object.assign(textBox, {
      show: true,
      value: '',
      cx: p[0],
      cy: p[1],
      x: r.left - w.left + (p[0] * r.width) / c.width,
      y: r.top - w.top + (p[1] * r.height) / c.height
    });
    e.preventDefault();
    setTimeout(() => document.getElementById('tib-text')?.focus(), 0);
    return;
  }
  drawing = true;
  canvasEl.value!.setPointerCapture(e.pointerId);
  engine.begin(tool.value, p, style());
  sync();
}
function onMove(e: PointerEvent) {
  if (drawing) engine.update(pt(e));
}
function onUp() {
  if (!drawing) return;
  drawing = false;
  engine.end();
  sync();
}
function commitText() {
  if (!textBox.show) return;
  engine.addText([textBox.cx, textBox.cy], textBox.value, color.value, style().font);
  textBox.show = false;
  sync();
}

async function copyImage(silent = false) {
  try {
    const blob = await engine.toBlob('image/png');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    say('Đã copy ảnh — dán (Ctrl+V) vào Slack/Discord/Zendesk.', 'ok');
    return true;
  } catch (e: any) {
    if (!silent) say('Không copy được: ' + (e?.message || e) + ' — bấm vào trang editor rồi thử lại.', 'err');
    else say('Chưa tự copy được (trang chưa focus). Bấm nút Copy.', 'info');
    return false;
  }
}
async function copyText(t: string) {
  await navigator.clipboard.writeText(t);
}
async function download() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await engine.toBlob());
  a.download = randomName('png');
  a.click();
}
async function upload() {
  confirmUpload.value = false;
  busy.value = 'Đang chuẩn bị…';
  link.value = '';
  try {
    const cfg = await loadSettings();
    if (!cfg.shop) throw new Error('Chưa cấu hình Shopify store trong Settings (tab 📸 Capture).');
    const { blob, ext } = await engine.exportForUpload(LIMITS.imageMaxBytes, LIMITS.imageMaxPixels);
    const rec = await uploadToShopifyFiles(cfg, blob, {
      kind: 'image',
      filename: randomName(ext),
      onProgress: (s, r) => (busy.value = r != null ? `${s} ${Math.round(r * 100)}%` : s)
    });
    await addHistory(rec);
    link.value = rec.url;
    await copyText(rec.url).catch(() => {});
    say('Upload thành công — link đã được copy.', 'ok');
  } catch (e: any) {
    say('Upload lỗi: ' + (e?.message || e), 'err');
  } finally {
    busy.value = '';
  }
}

function onKey(e: KeyboardEvent) {
  const typing = (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA';
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === 'Escape') {
    if (textBox.show) textBox.show = false;
    else {
      engine.cancelCrop();
      sync();
    }
    return;
  }
  if (typing) {
    if (e.key === 'Enter' && textBox.show && !e.shiftKey) {
      e.preventDefault();
      commitText();
    }
    return;
  }
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    e.shiftKey ? engine.redo() : engine.undo();
    sync();
  } else if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    engine.redo();
    sync();
  } else if (mod && e.key.toLowerCase() === 'c') {
    e.preventDefault();
    copyImage();
  } else if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault();
    download();
  } else if (e.key === 'Enter' && engine.pendingCrop) {
    engine.applyCrop();
    sync();
  }
}

onMounted(async () => {
  engine = new EditorEngine(canvasEl.value!);
  engine.onChange = sync;
  const rec = captureId ? await getRecord(captureId) : undefined;
  if (!rec) return say('Ảnh chụp không còn (đã hết hạn). Chụp lại từ extension.', 'err');
  await engine.load(rec.blob, rec.crop);
  sync();
  window.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', () => {
    if (captureId) deleteRecord(captureId);
  });
  if (params.get('auto') === 'copy') {
    if (await copyImage(true)) setTimeout(() => window.close(), 700);
  }
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="flex h-screen flex-col text-sm text-white select-none">
    <header class="flex flex-wrap items-center gap-2 bg-slate-800 p-2 shadow-md">
      <button
        v-for="t in tools"
        :key="t.id"
        class="rounded px-2 py-1 text-xs font-medium transition-colors"
        :class="tool === t.id ? 'bg-blue-600 text-white shadow' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'"
        @click="tool = t.id"
      >
        {{ t.label }}
      </button>

      <span class="mx-1 h-5 w-px bg-slate-600"></span>

      <div class="flex items-center gap-1.5">
        <button
          v-for="c in colors"
          :key="c"
          class="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
          :class="color === c ? 'border-white ring-2 ring-blue-500 scale-105' : 'border-slate-500'"
          :style="{ background: c }"
          @click="color = c"
        ></button>
      </div>

      <select v-model.number="width" class="rounded bg-slate-700 px-2 py-1 text-xs text-slate-200 outline-none">
        <option :value="2">Mảnh (2px)</option>
        <option :value="4">Vừa (4px)</option>
        <option :value="6">Dày (6px)</option>
        <option :value="8">Rất dày (8px)</option>
      </select>

      <span class="mx-1 h-5 w-px bg-slate-600"></span>

      <button
        class="rounded bg-slate-700 px-2.5 py-1 text-xs hover:bg-slate-600 disabled:opacity-40"
        :disabled="!st.canUndo"
        title="Hoàn tác (Ctrl+Z)"
        @click="engine.undo(); sync()"
      >
        ↶ Undo
      </button>
      <button
        class="rounded bg-slate-700 px-2.5 py-1 text-xs hover:bg-slate-600 disabled:opacity-40"
        :disabled="!st.canRedo"
        title="Làm lại (Ctrl+Y)"
        @click="engine.redo(); sync()"
      >
        ↷ Redo
      </button>

      <template v-if="st.crop">
        <button class="rounded bg-green-600 px-2.5 py-1 text-xs font-medium hover:bg-green-500" @click="engine.applyCrop(); sync()">
          ✔ Áp dụng crop (Enter)
        </button>
        <button class="rounded bg-slate-600 px-2 py-1 text-xs hover:bg-slate-500" @click="engine.cancelCrop(); sync()">
          Huỷ
        </button>
      </template>

      <span class="flex-1"></span>

      <button
        class="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1 font-medium text-xs hover:bg-blue-500 shadow active:scale-95 transition-transform"
        title="Sao chép ảnh (Ctrl+C)"
        @click="copyImage()"
      >
        <span>⧉</span> Copy ảnh
      </button>
      <button
        class="rounded bg-slate-700 px-3 py-1 text-xs hover:bg-slate-600 active:scale-95 transition-transform"
        title="Tải về máy (Ctrl+S)"
        @click="download"
      >
        ⬇ Tải PNG
      </button>
      <button
        class="rounded bg-emerald-600 px-3 py-1 text-xs font-medium hover:bg-emerald-500 disabled:opacity-50 transition-colors"
        :disabled="!!busy"
        @click="confirmUpload = true"
      >
        ☁ Upload & lấy link
      </button>
    </header>

    <div
      v-if="msg || busy || link"
      class="flex items-center gap-3 px-3 py-1.5 text-xs transition-all"
      :class="msgKind === 'err' ? 'bg-red-800 text-white' : msgKind === 'ok' ? 'bg-emerald-800 text-white' : 'bg-slate-700 text-slate-200'"
    >
      <span>{{ busy || msg }}</span>
      <template v-if="link">
        <a :href="link" target="_blank" class="truncate underline text-blue-200">{{ link }}</a>
        <button class="rounded bg-slate-900/50 px-2 py-0.5 hover:bg-slate-900" @click="copyText(link)">Copy link</button>
      </template>
    </div>

    <main ref="wrap" class="relative flex flex-1 items-center justify-center overflow-auto p-4 bg-slate-950">
      <canvas
        ref="canvasEl"
        class="max-h-full max-w-full cursor-crosshair bg-white shadow-2xl rounded-sm"
        style="touch-action: none"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
      ></canvas>

      <input
        v-if="textBox.show"
        id="tib-text"
        v-model="textBox.value"
        class="absolute rounded border border-blue-400 bg-white px-2 py-1 text-black shadow-lg text-sm outline-none"
        :style="{ left: textBox.x + 'px', top: textBox.y + 'px', color }"
        placeholder="Nhập chữ, Enter để xác nhận"
        @blur="commitText"
      />
    </main>

    <div v-if="confirmUpload" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div class="w-full max-w-md space-y-3 rounded-lg bg-white p-5 text-slate-800 shadow-2xl">
        <div class="text-base font-semibold text-slate-900">Upload lên Shopify Files?</div>
        <p class="text-xs text-slate-600 leading-relaxed">
          Link ảnh sẽ <b>công khai</b> với bất kỳ ai có URL. Hãy chắc chắn bạn đã dùng công cụ <b>■ Che đen</b> hoặc <b>▦ Pixelate</b> để che mờ thông tin cá nhân khách hàng (email, họ tên, địa chỉ).
        </p>
        <div class="flex justify-end gap-2 pt-2">
          <button class="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50" @click="confirmUpload = false">
            Huỷ
          </button>
          <button class="rounded bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500 shadow" @click="upload">
            Tiếp tục Upload
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
