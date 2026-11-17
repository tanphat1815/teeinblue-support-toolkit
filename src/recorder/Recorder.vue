<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import UntitledIcon from '../sidepanel/components/UntitledIcon.vue';
import { LIMITS, VIDEO_MIME_PREFERENCE } from '@/features/capture/constants';
import { addHistory, loadSettings } from '@/features/capture/settings';
import { randomName, uploadToShopifyFiles } from '@/features/capture/shopify-files';
import { putRecord } from '@/features/capture/idb';

type S = 'idle' | 'recording' | 'paused' | 'stopped' | 'uploading' | 'done';
const state = ref<S>('idle');
const useMic = ref(false);
const err = ref('');
const info = ref('');
const link = ref('');
const seconds = ref(0);
const progress = ref('');
const previewUrl = ref('');
let blob: Blob | null = null;

// Nhận tham số toạ độ crop nếu có từ URL
const urlParams = new URLSearchParams(window.location.search);
const cropJson = urlParams.get('crop');
let cropArea: { x: number; y: number; w: number; h: number; vw: number; vh: number } | null = null;
if (cropJson) {
  try {
    cropArea = JSON.parse(decodeURIComponent(cropJson));
  } catch (_) {}
}

let rec: MediaRecorder | null = null;
let display: MediaStream | null = null;
let mic: MediaStream | null = null;
let ac: AudioContext | null = null;
let cropVideo: HTMLVideoElement | null = null;
let cropAnimId = 0;
let chunks: Blob[] = [];
let timer = 0;

// Tìm MIME tốt nhất được trình duyệt hỗ trợ
const mime = (VIDEO_MIME_PREFERENCE as readonly string[]).find((t) => MediaRecorder.isTypeSupported(t)) || '';
const ext = computed(() => (mime.startsWith('video/mp4') ? 'mp4' : 'webm'));
const clock = computed(() => {
  const m = String(Math.floor(seconds.value / 60)).padStart(2, '0');
  const s = String(seconds.value % 60).padStart(2, '0');
  return `${m}:${s}`;
});

function broadcastTimer() {
  chrome.runtime.sendMessage({ type: 'REC_TICK', clock: clock.value }).catch(() => {});
}

async function start() {
  err.value = '';
  info.value = '';
  if (!mime) {
    err.value = 'Trình duyệt không hỗ trợ định dạng video phù hợp để ghi hình.';
    return;
  }
  try {
    // getDisplayMedia bắt buộc gọi từ user gesture
    display = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: true
    });

    let videoStreamToRecord: MediaStream;

    // Nếu người dùng chọn quay theo vùng cụ thể (cropArea)
    if (cropArea && cropArea.w > 20 && cropArea.h > 20) {
      cropVideo = document.createElement('video');
      cropVideo.srcObject = display;
      cropVideo.muted = true;
      await cropVideo.play();

      const canvas = document.createElement('canvas');
      canvas.width = cropArea.w;
      canvas.height = cropArea.h;
      const ctx = canvas.getContext('2d')!;

      const ratioX = cropVideo.videoWidth / (cropArea.vw || window.innerWidth);
      const ratioY = cropVideo.videoHeight / (cropArea.vh || window.innerHeight);

      const sx = cropArea.x * ratioX;
      const sy = cropArea.y * ratioY;
      const sw = cropArea.w * ratioX;
      const sh = cropArea.h * ratioY;

      function renderFrame() {
        if (!cropVideo || cropVideo.paused || cropVideo.ended) return;
        ctx.drawImage(cropVideo, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        cropAnimId = requestAnimationFrame(renderFrame);
      }
      renderFrame();

      videoStreamToRecord = (canvas as any).captureStream(30);
    } else {
      videoStreamToRecord = display;
    }

    const tracks: MediaStreamTrack[] = [...videoStreamToRecord.getVideoTracks()];
    ac = new AudioContext();
    const dest = ac.createMediaStreamDestination();
    let hasAudio = false;

    // Trộn âm thanh tab / màn hình
    if (display.getAudioTracks().length) {
      ac.createMediaStreamSource(new MediaStream(display.getAudioTracks())).connect(dest);
      hasAudio = true;
    }

    // Trộn âm thanh Micro
    if (useMic.value) {
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        ac.createMediaStreamSource(mic).connect(dest);
        hasAudio = true;
      } catch (micErr) {
        info.value = 'Không truy cập được Micro (sẽ chỉ ghi âm thanh hệ thống).';
      }
    }

    if (hasAudio) {
      tracks.push(...dest.stream.getAudioTracks());
    }

    chunks = [];
    rec = new MediaRecorder(new MediaStream(tracks), {
      mimeType: mime,
      videoBitsPerSecond: 2_500_000,
      audioBitsPerSecond: 128_000
    });

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    rec.onstop = finalize;

    // Người dùng bấm "Stop sharing" của trình duyệt
    display.getVideoTracks()[0].addEventListener('ended', stop);

    rec.start(1000);
    seconds.value = 0;
    state.value = 'recording';
    broadcastTimer();

    timer = window.setInterval(() => {
      if (state.value === 'recording') {
        seconds.value++;
        broadcastTimer();
        if (seconds.value === LIMITS.videoMaxSeconds - 30) {
          info.value = 'Cảnh báo: Còn 30 giây nữa sẽ chạm mốc giới hạn 10 phút!';
        }
        if (seconds.value >= LIMITS.videoMaxSeconds) {
          stop();
        }
      }
    }, 1000);
  } catch (e: any) {
    cleanup();
    err.value = e?.name === 'NotAllowedError'
      ? 'Bạn đã huỷ hoặc không cấp quyền chia sẻ màn hình.'
      : String(e?.message || e);
  }
}

function togglePause() {
  if (!rec) return;
  if (state.value === 'recording') {
    rec.pause();
    state.value = 'paused';
    chrome.runtime.sendMessage({ type: 'REC_PAUSED_STATE', paused: true }).catch(() => {});
  } else if (state.value === 'paused') {
    rec.resume();
    state.value = 'recording';
    chrome.runtime.sendMessage({ type: 'REC_PAUSED_STATE', paused: false }).catch(() => {});
  }
}

function stop() {
  if (rec && rec.state !== 'inactive') {
    rec.stop();
  }
  chrome.runtime.sendMessage({ type: 'REC_STOPPED' }).catch(() => {});
}

function cleanup() {
  clearInterval(timer);
  if (cropAnimId) cancelAnimationFrame(cropAnimId);
  if (cropVideo) {
    cropVideo.pause();
    cropVideo.srcObject = null;
    cropVideo = null;
  }
  display?.getTracks().forEach((t) => t.stop());
  mic?.getTracks().forEach((t) => t.stop());
  ac?.close().catch(() => {});
  display = null;
  mic = null;
  ac = null;
}

function finalize() {
  cleanup();
  blob = new Blob(chunks, { type: rec?.mimeType || mime });
  chunks = [];
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = URL.createObjectURL(blob);
  state.value = 'stopped';

  // Tự động lưu video vào IndexedDB (Lịch sử cục bộ)
  const videoId = crypto.randomUUID();
  putRecord({
    id: videoId,
    blob,
    sourceUrl: 'screen-recording',
    createdAt: Date.now(),
    kind: 'video',
    duration: seconds.value
  }).then(() => {
    chrome.runtime.sendMessage({ type: 'CAPTURES_UPDATED' }).catch(() => {});
  }).catch((e) => console.warn('Lỗi lưu video local:', e));

  if (blob.size > LIMITS.videoMaxBytes) {
    err.value = 'Video vượt quá 1 GB, không thể upload tự động lên Shopify Files.';
  }
}

function download() {
  if (!blob) return;
  const a = document.createElement('a');
  a.href = previewUrl.value;
  a.download = randomName(ext.value);
  a.click();
}

async function copyText(t: string) {
  await navigator.clipboard.writeText(t);
}

async function upload() {
  if (!blob) return;
  err.value = '';
  state.value = 'uploading';
  progress.value = 'Đang chuẩn bị upload video…';
  try {
    const cfg = await loadSettings();
    if (!cfg.shop) throw new Error('Chưa cấu hình Shopify store trong Settings của Extension.');
    const rec2 = await uploadToShopifyFiles(cfg, blob, {
      kind: 'video',
      filename: randomName(ext.value),
      onProgress: (s, r) => (progress.value = r != null ? `${s} ${Math.round(r * 100)}%` : s)
    });
    await addHistory(rec2);
    link.value = rec2.url;
    await copyText(rec2.url).catch(() => {});
    state.value = 'done';
  } catch (e: any) {
    err.value = 'Upload lỗi: ' + (e?.message || e);
    state.value = 'stopped';
  }
}

function recordAgain() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = '';
  blob = null;
  link.value = '';
  err.value = '';
  info.value = '';
  state.value = 'idle';
}

function closeWindow() {
  window.close();
}

// Bắt phím tắt và tin nhắn từ Background / Overlay
function handleMessage(msg: any) {
  if (!msg) return;
  if (msg.type === 'CMD_TOGGLE_RECORD') {
    if (state.value === 'idle') start();
    else if (state.value === 'recording' || state.value === 'paused') stop();
  } else if (msg.type === 'CMD_PAUSE_RECORD' || msg.type === 'REC_TOGGLE_PAUSE') {
    if (state.value === 'recording' || state.value === 'paused') togglePause();
  } else if (msg.type === 'REC_STOP') {
    if (state.value === 'recording' || state.value === 'paused') stop();
  }
}

onMounted(() => {
  chrome.runtime.onMessage.addListener(handleMessage);
  // Nếu có cropArea truyền từ Overlay, tự động mở hộp thoại stream ngay
  if (cropArea) {
    start();
  }
});

onBeforeUnmount(() => {
  chrome.runtime.onMessage.removeListener(handleMessage);
  cleanup();
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
});
</script>

<template>
  <div class="flex h-screen flex-col bg-slate-50 text-slate-800 font-sans select-none overflow-y-auto">
    <!-- Header -->
    <header class="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-2xs">
      <div class="flex items-center gap-2.5">
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white shadow-2xs">
          <span class="h-3 w-3 rounded-full bg-white animate-pulse"></span>
        </div>
        <div>
          <h1 class="text-sm font-bold text-slate-900 leading-none">Teeinblue Recorder</h1>
          <p class="text-[10px] text-slate-400 mt-0.5">
            {{ cropArea ? `Vùng chọn: ${cropArea.w} × ${cropArea.h}` : 'Screen & Tab Video Recording' }}
          </p>
        </div>
      </div>
      <button
        class="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        title="Đóng cửa sổ"
        @click="closeWindow"
      >
        <UntitledIcon name="x-close" :size="15" />
      </button>
    </header>

    <!-- Main Content Body -->
    <main class="flex-1 p-4 space-y-3.5">
      <!-- Error / Warning Messages -->
      <div v-if="err" class="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700 border border-red-200">
        <UntitledIcon name="alert-circle" :size="15" class="mt-0.5 shrink-0 text-red-600" />
        <span class="leading-relaxed">{{ err }}</span>
      </div>

      <div v-if="info" class="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200">
        <UntitledIcon name="alert-triangle" :size="15" class="mt-0.5 shrink-0 text-amber-600" />
        <span class="leading-relaxed">{{ info }}</span>
      </div>

      <!-- State: IDLE -->
      <template v-if="state === 'idle'">
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4 text-center">
          <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
            <span class="h-5 w-5 rounded-full bg-red-600"></span>
          </div>

          <div>
            <h2 class="text-sm font-bold text-slate-900">Sẵn sàng quay video</h2>
            <p class="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              Hỗ trợ quay <b>Chrome Tab</b> (kèm âm thanh tab), <b>Cửa sổ</b> hoặc <b>Toàn bộ màn hình</b>.
            </p>
          </div>

          <!-- Micro Toggle Option -->
          <div class="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-left">
            <div class="flex items-center gap-2.5">
              <UntitledIcon name="headphones-01" :size="18" class="text-slate-600" />
              <div>
                <div class="text-xs font-semibold text-slate-800">Ghi kèm âm thanh Micro</div>
                <div class="text-[10px] text-slate-500">Bật nếu bạn muốn lồng tiếng giải thích lỗi</div>
              </div>
            </div>
            <label class="relative inline-flex cursor-pointer items-center">
              <input v-model="useMic" type="checkbox" class="peer sr-only" />
              <div class="h-5 w-9 rounded-full bg-slate-300 after:absolute after:top-[2px] after:left-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-blue-600 peer-checked:after:translate-x-full"></div>
            </label>
          </div>

          <!-- Action Button -->
          <button
            class="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-xs font-bold text-white shadow-md hover:bg-red-700 active:scale-98 transition-all cursor-pointer"
            @click="start"
          >
            <span class="h-2.5 w-2.5 rounded-full bg-white"></span>
            <span>Chọn nguồn & Bắt đầu quay</span>
          </button>

          <!-- Hotkeys Tip -->
          <div class="rounded-xl bg-slate-50 p-2.5 border border-slate-200 text-left space-y-1">
            <div class="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
              <span>⌨ Phím tắt nhanh:</span>
            </div>
            <div class="flex items-center justify-between text-[10px] text-slate-500">
              <span>Bắt đầu / Dừng:</span>
              <kbd class="font-mono bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-700">Alt+Shift+R</kbd>
            </div>
            <div class="flex items-center justify-between text-[10px] text-slate-500">
              <span>Tạm dừng / Tiếp tục:</span>
              <kbd class="font-mono bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-700">Alt+Shift+P</kbd>
            </div>
          </div>
        </div>
      </template>

      <!-- State: RECORDING or PAUSED -->
      <template v-if="state === 'recording' || state === 'paused'">
        <div class="rounded-2xl border border-red-200 bg-white p-6 shadow-sm text-center space-y-4">
          <div class="flex items-center justify-center gap-2">
            <span
              class="h-3 w-3 rounded-full"
              :class="state === 'recording' ? 'bg-red-600 animate-ping' : 'bg-amber-500'"
            ></span>
            <span
              class="text-xs font-bold uppercase tracking-wider"
              :class="state === 'recording' ? 'text-red-600' : 'text-amber-600'"
            >
              {{ state === 'recording' ? 'Đang ghi hình...' : 'Đang tạm dừng' }}
            </span>
          </div>

          <div class="font-mono text-5xl font-black text-slate-900 tracking-tight">
            {{ clock }}
          </div>

          <!-- Controls: Pause & Stop -->
          <div class="grid grid-cols-2 gap-2 pt-2">
            <button
              class="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 active:scale-98 transition-all cursor-pointer"
              @click="togglePause"
            >
              <span>{{ state === 'recording' ? '⏸ Tạm dừng' : '▶ Tiếp tục' }}</span>
              <kbd class="text-[9px] text-slate-400 font-mono">Alt+Shift+P</kbd>
            </button>

            <button
              class="flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white shadow-md hover:bg-slate-800 active:scale-98 transition-all cursor-pointer"
              @click="stop"
            >
              <span class="h-2.5 w-2.5 bg-red-500 rounded-xs"></span>
              <span>■ Dừng quay</span>
            </button>
          </div>
        </div>
      </template>

      <!-- State: STOPPED / UPLOADING / DONE -->
      <template v-if="state === 'stopped' || state === 'uploading' || state === 'done'">
        <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3.5">
          <div class="flex items-center justify-between text-xs font-semibold text-slate-700">
            <span>Video vừa quay ({{ clock }})</span>
            <button class="text-blue-600 hover:underline cursor-pointer" @click="recordAgain">Quay lại</button>
          </div>

          <!-- Video Player Preview -->
          <div class="overflow-hidden rounded-xl bg-black aspect-video flex items-center justify-center shadow-inner">
            <video :src="previewUrl" controls class="h-full w-full object-contain"></video>
          </div>

          <!-- Action Buttons -->
          <div class="grid grid-cols-2 gap-2 pt-1">
            <button
              class="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 active:scale-98 transition-all cursor-pointer"
              @click="download"
            >
              <UntitledIcon name="folder-download" :size="14" class="text-slate-500" />
              <span>⬇ Tải video (.{{ ext }})</span>
            </button>

            <button
              class="flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
              :disabled="state !== 'stopped' || (blob?.size || 0) > LIMITS.videoMaxBytes"
              @click="upload"
            >
              <UntitledIcon name="palette" :size="14" />
              <span>☁ Upload & Lấy link</span>
            </button>
          </div>

          <!-- Upload Progress Status -->
          <div v-if="state === 'uploading'" class="rounded-xl bg-blue-50 p-3 text-xs text-blue-800 border border-blue-100 flex items-center gap-2">
            <UntitledIcon name="refresh-cw" :size="13" class="animate-spin text-blue-600" />
            <span>{{ progress }}</span>
          </div>

          <!-- Done State -->
          <div v-if="state === 'done'" class="rounded-xl bg-emerald-50 p-3.5 text-xs text-emerald-800 border border-emerald-200 space-y-2">
            <div class="flex items-center gap-1.5 font-bold text-emerald-900">
              <UntitledIcon name="check-circle" :size="15" class="text-emerald-600" />
              <span>Upload thành công! Đã copy link vào clipboard.</span>
            </div>
            <div class="flex items-center justify-between gap-2 bg-white p-2 rounded-lg border border-emerald-100 font-mono text-[11px] text-slate-700">
              <span class="truncate">{{ link }}</span>
              <button class="shrink-0 rounded bg-emerald-600 px-2 py-0.5 text-[10px] text-white font-sans font-semibold hover:bg-emerald-700" @click="copyText(link)">Copy</button>
            </div>
          </div>
        </div>
      </template>
    </main>
  </div>
</template>
