<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { EditorEngine, type Pt, type Tool } from './engine';
import { getRecord, listAllRecords, type CaptureRecord } from '@/features/capture/idb';
import { LIMITS } from '@/features/capture/constants';
import { addHistory, loadSettings } from '@/features/capture/settings';
import { randomName, uploadToShopifyFiles } from '@/features/capture/shopify-files';

const canvasEl = ref<HTMLCanvasElement | null>(null);
const wrap = ref<HTMLDivElement | null>(null);
let engine: EditorEngine;
const params = new URLSearchParams(location.search);
const currentCaptureId = ref(params.get('id') || '');

// Tools state
const topTab = ref<'annotate' | 'crop' | 'blur' | 'text' | 'highlight' | 'shapes'>('annotate');
const subTool = ref<Tool>('rect');
const activeTool = computed<Tool>(() => {
  if (topTab.value === 'crop') return 'crop';
  if (topTab.value === 'blur') return 'pixelate';
  if (topTab.value === 'text') return 'text';
  if (topTab.value === 'highlight') return 'highlight';
  return subTool.value;
});

// Style properties (right sidebar)
const color = ref('#ef4444');
const thickness = ref(6);
const opacity = ref(100);
const shadow = ref(false);

const zoom = ref(100);
const zoomOptions = [50, 75, 100, 125, 150, 200];

const msg = ref('');
const msgKind = ref<'ok' | 'err' | 'info'>('info');
const link = ref('');
const busy = ref('');
const confirmUpload = ref(false);
const st = reactive({ canUndo: false, canRedo: false, crop: false });
const textBox = reactive({ show: false, x: 0, y: 0, cx: 0, cy: 0, value: '' });
let drawing = false;

// History list (thumbnails at bottom & sidebar)
const captureList = ref<{ id: string; url: string; createdAt: number }[]>([]);

const leftTools: { id: Tool; label: string; icon: string }[] = [
  { id: 'select', label: 'Select', icon: 'cursor' },
  { id: 'pen', label: 'Draw', icon: 'pen' },
  { id: 'arrow', label: 'Arrow', icon: 'arrow' },
  { id: 'rect', label: 'Rectangle', icon: 'rect' },
  { id: 'ellipse', label: 'Circle', icon: 'circle' },
  { id: 'line', label: 'Line', icon: 'line' },
  { id: 'text', label: 'Text', icon: 'text' },
  { id: 'badge', label: 'Badge', icon: 'badge' }
];

const paletteColors = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#10b981', // Green
  '#8b5cf6', // Purple
  '#000000'  // Black
];

const k = () => (engine ? Math.max(1, engine.size.w / 900) : 1);
const currentStyle = () => ({
  color: color.value,
  width: thickness.value * k(),
  font: (16 + thickness.value * 2.5) * k(),
  opacity: opacity.value / 100,
  shadow: shadow.value
});

const say = (t: string, kind: 'ok' | 'err' | 'info' = 'info') => {
  msg.value = t;
  msgKind.value = kind;
};
const sync = () => {
  st.canUndo = engine.canUndo;
  st.canRedo = engine.canRedo;
  st.crop = !!engine.pendingCrop;
};

function selectTopTab(tab: 'annotate' | 'crop' | 'blur' | 'text' | 'highlight' | 'shapes') {
  topTab.value = tab;
  if (tab === 'annotate') subTool.value = 'pen';
  else if (tab === 'crop') subTool.value = 'crop';
  else if (tab === 'blur') subTool.value = 'pixelate';
  else if (tab === 'text') subTool.value = 'text';
  else if (tab === 'highlight') subTool.value = 'highlight';
  else if (tab === 'shapes') subTool.value = 'rect';
}

function selectLeftTool(t: Tool) {
  subTool.value = t;
  if (t === 'text') topTab.value = 'text';
  else if (['rect', 'ellipse', 'line', 'arrow'].includes(t)) topTab.value = 'shapes';
  else topTab.value = 'annotate';
}

function pt(e: PointerEvent): Pt {
  const c = canvasEl.value!,
    r = c.getBoundingClientRect();
  return [(e.clientX - r.left) * (c.width / r.width), (e.clientY - r.top) * (c.height / r.height)];
}

function onDown(e: PointerEvent) {
  if (e.button !== 0) return;
  if (textBox.show) commitText();
  const p = pt(e);
  if (activeTool.value === 'text') {
    const c = canvasEl.value!,
      r = c.getBoundingClientRect();
    // Toạ độ relative trực tiếp theo canvas box (đã bao gồm scale/zoom)
    Object.assign(textBox, {
      show: true,
      value: '',
      cx: p[0],
      cy: p[1],
      x: e.clientX - r.left,
      y: e.clientY - r.top
    });
    e.preventDefault();
    setTimeout(() => document.getElementById('tib-text')?.focus(), 0);
    return;
  }
  if (activeTool.value === 'select') return;
  drawing = true;
  canvasEl.value!.setPointerCapture(e.pointerId);
  engine.begin(activeTool.value, p, currentStyle());
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
  engine.addText(
    [textBox.cx, textBox.cy],
    textBox.value,
    color.value,
    currentStyle().font,
    opacity.value / 100,
    shadow.value
  );
  textBox.show = false;
  sync();
}

function resetCanvas() {
  engine.clearAll();
  say('Đã xóa tất cả annotation.', 'info');
}

async function copyImage(silent = false) {
  try {
    const blob = await engine.toBlob('image/png');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    say('Đã copy ảnh vào clipboard (Ctrl+V để dán).', 'ok');
    return true;
  } catch (e: any) {
    if (!silent) say('Không copy được: ' + (e?.message || e), 'err');
    else say('Chưa tự copy được (bấm nút Copy).', 'info');
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
  say('Đã tải ảnh về máy.', 'ok');
}

async function upload() {
  confirmUpload.value = false;
  busy.value = 'Đang chuẩn bị upload…';
  link.value = '';
  try {
    const cfg = await loadSettings();
    if (!cfg.shop) throw new Error('Chưa cấu hình Shopify store trong Settings của Extension.');
    const { blob, ext } = await engine.exportForUpload(LIMITS.imageMaxBytes, LIMITS.imageMaxPixels);
    const rec = await uploadToShopifyFiles(cfg, blob, {
      kind: 'image',
      filename: randomName(ext),
      onProgress: (s, r) => (busy.value = r != null ? `${s} ${Math.round(r * 100)}%` : s)
    });
    await addHistory(rec);
    link.value = rec.url;
    await copyText(rec.url).catch(() => {});
    say('Upload thành công — link đã được copy!', 'ok');
  } catch (e: any) {
    say('Upload lỗi: ' + (e?.message || e), 'err');
  } finally {
    busy.value = '';
  }
}

async function switchImage(recId: string) {
  if (recId === currentCaptureId.value) return;
  const rec = await getRecord(recId);
  if (!rec) return say('Ảnh không tồn tại hoặc đã hết hạn.', 'err');
  currentCaptureId.value = recId;
  await engine.load(rec.blob, rec.crop);
  sync();
}

async function refreshHistoryList() {
  const all = await listAllRecords();
  captureList.value = all.map((r) => ({
    id: r.id,
    url: URL.createObjectURL(r.blob),
    createdAt: r.createdAt
  }));
}

function closeWindow() {
  window.close();
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
  if (currentCaptureId.value) {
    const rec = await getRecord(currentCaptureId.value);
    if (rec) await engine.load(rec.blob, rec.crop);
    else say('Ảnh chụp không còn. Chụp lại từ extension.', 'err');
  }
  await refreshHistoryList();
  sync();
  window.addEventListener('keydown', onKey);
  if (params.get('auto') === 'copy') {
    if (await copyImage(true)) setTimeout(() => window.close(), 700);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  captureList.value.forEach((item) => URL.revokeObjectURL(item.url));
});
</script>

<template>
  <div class="flex h-screen w-screen flex-col bg-[#f4f6fa] text-slate-800 select-none overflow-hidden font-sans">
    <!-- Top Header -->
    <header class="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h1 class="text-base font-bold text-slate-900 leading-tight">Image Editor</h1>
          <p class="text-xs text-slate-500">Annotate your screenshot with ease</p>
        </div>
      </div>

      <div class="flex items-center gap-2.5">
        <button
          class="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 transition-all"
          @click="resetCanvas"
        >
          <svg class="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Reset</span>
        </button>

        <button
          class="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-95 transition-all"
          @click="download"
        >
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <span>Save Image</span>
        </button>

        <button
          class="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:scale-95 transition-all"
          title="Đóng trang"
          @click="closeWindow"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </header>

    <!-- Sub Toolbar (Categories, Undo/Redo, Zoom) -->
    <div class="flex h-13 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
      <!-- Category Tabs -->
      <div class="flex items-center gap-1">
        <button
          class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
          :class="topTab === 'annotate' ? 'bg-blue-600 text-white shadow-xs font-semibold' : 'text-slate-600 hover:bg-slate-100'"
          @click="selectTopTab('annotate')"
        >
          <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
          <span>Annotate</span>
        </button>

        <button
          class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
          :class="topTab === 'crop' ? 'bg-blue-600 text-white shadow-xs font-semibold' : 'text-slate-600 hover:bg-slate-100'"
          @click="selectTopTab('crop')"
        >
          <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10M4 8h16M8 4v16" /></svg>
          <span>Crop</span>
        </button>

        <button
          class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
          :class="topTab === 'blur' ? 'bg-blue-600 text-white shadow-xs font-semibold' : 'text-slate-600 hover:bg-slate-100'"
          @click="selectTopTab('blur')"
        >
          <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
          <span>Blur</span>
        </button>

        <button
          class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
          :class="topTab === 'text' ? 'bg-blue-600 text-white shadow-xs font-semibold' : 'text-slate-600 hover:bg-slate-100'"
          @click="selectTopTab('text')"
        >
          <span class="font-bold text-xs">T</span>
          <span>Text</span>
        </button>

        <button
          class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
          :class="topTab === 'highlight' ? 'bg-blue-600 text-white shadow-xs font-semibold' : 'text-slate-600 hover:bg-slate-100'"
          @click="selectTopTab('highlight')"
        >
          <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
          <span>Highlight</span>
        </button>

        <button
          class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
          :class="topTab === 'shapes' ? 'bg-blue-600 text-white shadow-xs font-semibold' : 'text-slate-600 hover:bg-slate-100'"
          @click="selectTopTab('shapes')"
        >
          <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" /></svg>
          <span>Shapes</span>
        </button>

        <template v-if="st.crop">
          <span class="mx-2 h-4 w-px bg-slate-200"></span>
          <button class="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 shadow-xs" @click="engine.applyCrop(); sync()">
            ✔ Áp dụng (Enter)
          </button>
          <button class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50" @click="engine.cancelCrop(); sync()">
            Huỷ
          </button>
        </template>
      </div>

      <!-- Undo, Redo, Zoom Controls -->
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1">
          <button
            class="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            :disabled="!st.canUndo"
            title="Undo (Ctrl+Z)"
            @click="engine.undo(); sync()"
          >
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
          </button>
          <button
            class="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            :disabled="!st.canRedo"
            title="Redo (Ctrl+Y)"
            @click="engine.redo(); sync()"
          >
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 10h-10a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" /></svg>
          </button>
        </div>

        <span class="h-4 w-px bg-slate-200"></span>

        <!-- Zoom level -->
        <div class="flex items-center gap-1 text-xs text-slate-600">
          <svg class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" /></svg>
          <select v-model.number="zoom" class="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-500">
            <option v-for="z in zoomOptions" :key="z" :value="z">{{ z }}%</option>
          </select>
        </div>

        <!-- Fullscreen preview -->
        <button
          class="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          title="Vừa màn hình"
          @click="zoom = 100"
        >
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
        </button>
      </div>
    </div>

    <!-- Alert / Toast Banner -->
    <div
      v-if="msg || busy || link"
      class="flex shrink-0 items-center justify-between px-6 py-2 text-xs font-medium transition-all"
      :class="msgKind === 'err' ? 'bg-red-50 text-red-700 border-b border-red-200' : msgKind === 'ok' ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200' : 'bg-blue-50 text-blue-800 border-b border-blue-200'"
    >
      <div class="flex items-center gap-2">
        <span class="inline-block h-2 w-2 rounded-full" :class="busy ? 'bg-blue-600 animate-ping' : msgKind === 'err' ? 'bg-red-600' : 'bg-emerald-600'"></span>
        <span>{{ busy || msg }}</span>
        <template v-if="link">
          <a :href="link" target="_blank" class="font-mono underline text-blue-600 ml-2 truncate max-w-md">{{ link }}</a>
        </template>
      </div>
      <button v-if="link" class="rounded bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs border border-slate-200 hover:bg-slate-50" @click="copyText(link)">
        Copy Link
      </button>
    </div>

    <!-- Main Workspace Area -->
    <div class="flex flex-1 overflow-hidden relative">
      <!-- Left Vertical Toolbar -->
      <aside class="flex w-16 shrink-0 flex-col items-center gap-2 border-r border-slate-200 bg-white py-4 shadow-2xs">
        <button
          v-for="t in leftTools"
          :key="t.id"
          class="group flex flex-col items-center justify-center h-12 w-12 rounded-xl transition-all"
          :class="activeTool === t.id ? 'bg-blue-50 text-blue-600 ring-2 ring-blue-600 font-semibold' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'"
          @click="selectLeftTool(t.id)"
        >
          <!-- Icons -->
          <svg v-if="t.icon === 'cursor'" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" /></svg>
          <svg v-else-if="t.icon === 'pen'" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
          <svg v-else-if="t.icon === 'arrow'" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          <svg v-else-if="t.icon === 'rect'" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" stroke-width="2" /></svg>
          <svg v-else-if="t.icon === 'circle'" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="9" stroke-width="2" /></svg>
          <svg v-else-if="t.icon === 'line'" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 20L20 4" /></svg>
          <span v-else-if="t.icon === 'text'" class="text-sm font-bold">T</span>
          <span v-else-if="t.icon === 'badge'" class="text-xs font-bold rounded-full bg-slate-200 px-1">①</span>

          <span class="text-[9px] mt-0.5 tracking-tight">{{ t.label }}</span>
        </button>
      </aside>

      <!-- Center Canvas Stage with Transparency Grid -->
      <main ref="wrap" class="relative flex flex-1 flex-col items-center justify-center overflow-auto p-6 bg-[#ebedf2]">
        <div
          class="relative flex items-center justify-center rounded-2xl shadow-xl border border-slate-300/80 p-2 overflow-hidden"
          :style="{
            backgroundImage: `linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)`,
            backgroundSize: `20px 20px`,
            backgroundPosition: `0 0, 0 10px, 10px -10px, -10px 0px`,
            backgroundColor: '#ffffff'
          }"
        >
          <!-- Bọc canvas & input trong cùng relative container để toạ độ khớp chính xác 100% -->
          <div
            class="relative inline-block"
            :style="{
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'center center'
            }"
          >
            <canvas
              ref="canvasEl"
              class="max-h-[75vh] max-w-[62vw] cursor-crosshair rounded-xl block"
              style="touch-action: none"
              @pointerdown="onDown"
              @pointermove="onMove"
              @pointerup="onUp"
              @pointercancel="onUp"
            ></canvas>

            <!-- Textarea nhập nội dung realtime & hỗ trợ xuống dòng Enter / Shift+Enter -->
            <textarea
              v-if="textBox.show"
              id="tib-text"
              v-model="textBox.value"
              rows="1"
              class="absolute z-20 min-w-[120px] max-w-[400px] resize-none rounded border-2 border-dashed border-blue-500 bg-white/95 px-2 py-1 shadow-xl outline-none font-sans font-semibold leading-snug"
              :style="{
                left: textBox.x + 'px',
                top: textBox.y + 'px',
                color: color,
                fontSize: Math.max(13, Math.min(28, currentStyle().font / 2)) + 'px',
                opacity: opacity / 100
              }"
              placeholder="Nhập chữ... (Shift+Enter để xuống dòng, Enter hoặc bấm ra ngoài để hoàn tất)"
              @keydown.enter.exact.prevent="commitText"
              @blur="commitText"
            ></textarea>
          </div>
        </div>

        <!-- Bottom Carousel/Thumbnails of Screenshots -->
        <div class="absolute bottom-4 left-6 flex items-center gap-3 bg-white/90 backdrop-blur-md p-2 rounded-2xl border border-slate-200/80 shadow-lg">
          <div
            v-for="item in captureList.slice(0, 8)"
            :key="item.id"
            class="h-14 w-20 rounded-xl overflow-hidden border-2 cursor-pointer transition-all hover:scale-105 shrink-0 relative"
            :class="item.id === currentCaptureId ? 'border-purple-600 ring-2 ring-purple-400' : 'border-slate-200 opacity-75 hover:opacity-100'"
            @click="switchImage(item.id)"
          >
            <img :src="item.url" class="h-full w-full object-cover" />
          </div>

          <button
            class="flex h-14 w-12 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-all shrink-0"
            title="Đóng editor để chụp thêm"
            @click="closeWindow"
          >
            <span class="text-xl font-light">+</span>
          </button>
        </div>
      </main>

      <!-- Right Properties Sidebar (Annotation Style) -->
      <aside class="flex w-72 shrink-0 flex-col justify-between border-l border-slate-200 bg-white p-5 overflow-y-auto">
        <div class="space-y-6">
          <div>
            <h2 class="text-xs font-bold uppercase tracking-wider text-slate-800">Annotation Style</h2>
          </div>

          <!-- Color Palette -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs font-semibold text-slate-600">
              <span>Color</span>
              <span class="font-mono text-[11px] text-slate-400">{{ color }}</span>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button
                v-for="c in paletteColors"
                :key="c"
                class="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 active:scale-95"
                :class="color === c ? 'border-white ring-2 ring-blue-600 scale-105 shadow-sm' : 'border-transparent'"
                :style="{ background: c }"
                @click="color = c"
              ></button>
              <label class="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-slate-300 text-slate-400 hover:border-slate-400 text-xs">
                +
                <input v-model="color" type="color" class="sr-only" />
              </label>
            </div>
          </div>

          <!-- Thickness Slider -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs font-semibold text-slate-600">
              <span>Thickness</span>
              <span class="font-mono text-xs rounded bg-slate-100 px-2 py-0.5">{{ thickness }} px</span>
            </div>
            <input
              v-model.number="thickness"
              type="range"
              min="2"
              max="20"
              class="w-full accent-blue-600 cursor-pointer"
            />
          </div>

          <!-- Opacity Slider -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs font-semibold text-slate-600">
              <span>Opacity</span>
              <span class="font-mono text-xs rounded bg-slate-100 px-2 py-0.5">{{ opacity }}%</span>
            </div>
            <input
              v-model.number="opacity"
              type="range"
              min="10"
              max="100"
              class="w-full accent-blue-600 cursor-pointer"
            />
          </div>

          <!-- Shadow Toggle -->
          <div class="flex items-center justify-between pt-1">
            <span class="text-xs font-semibold text-slate-600">Shadow</span>
            <label class="relative inline-flex cursor-pointer items-center">
              <input v-model="shadow" type="checkbox" class="peer sr-only" />
              <div class="h-5 w-9 rounded-full bg-slate-200 after:absolute after:top-[2px] after:left-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full"></div>
            </label>
          </div>

          <!-- Quick Actions -->
          <div class="space-y-2.5 pt-4 border-t border-slate-100">
            <div class="text-xs font-bold uppercase tracking-wider text-slate-800">Quick Actions</div>

            <button
              class="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:scale-98 transition-all"
              @click="resetCanvas"
            >
              <svg class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span>Clear All</span>
            </button>

            <button
              class="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:scale-98 transition-all"
              @click="copyImage()"
            >
              <svg class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span>Copy Image (Ctrl+C)</span>
            </button>

            <button
              class="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:scale-98 transition-all"
              @click="download"
            >
              <svg class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Download (Ctrl+S)</span>
            </button>

            <button
              class="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm active:scale-98 transition-all disabled:opacity-50"
              :disabled="!!busy"
              @click="confirmUpload = true"
            >
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span>Upload to Shopify</span>
            </button>
          </div>
        </div>

        <!-- Tip Box -->
        <div class="mt-6 rounded-xl bg-blue-50/70 p-3.5 border border-blue-100 flex items-start gap-2.5">
          <div class="text-blue-600 mt-0.5">💡</div>
          <div class="text-[11px] leading-relaxed text-blue-900">
            <span class="font-bold">Tip:</span> Dùng phím tắt <b>Ctrl+Z</b> để Undo, <b>Ctrl+C</b> để copy ảnh dán ngay vào chat!
          </div>
        </div>
      </aside>
    </div>

    <!-- Confirm Upload Modal -->
    <div v-if="confirmUpload" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div class="w-full max-w-md space-y-3 rounded-2xl bg-white p-6 text-slate-800 shadow-2xl">
        <div class="text-base font-bold text-slate-900">Upload lên Shopify Files?</div>
        <p class="text-xs text-slate-600 leading-relaxed">
          Link ảnh sẽ <b>công khai</b> với bất kỳ ai có URL. Hãy chắc chắn bạn đã dùng công cụ <b>Blur</b> hoặc <b>Che đen</b> để che mờ thông tin cá nhân khách hàng (email, họ tên, địa chỉ).
        </p>
        <div class="flex justify-end gap-2.5 pt-3">
          <button class="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold hover:bg-slate-50" @click="confirmUpload = false">
            Huỷ
          </button>
          <button class="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm" @click="upload">
            Tiếp tục Upload
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
