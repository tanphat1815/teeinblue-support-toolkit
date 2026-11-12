import { reactive } from 'vue';

export interface Toast { id: number; kind: 'success' | 'error' | 'info'; text: string }
const toasts = reactive<Toast[]>([]);
let seq = 0;

function push(kind: Toast['kind'], text: string, ms = 3000) {
  // Tránh spam toast trùng nội dung liên tiếp
  const existingIndex = toasts.findIndex((t) => t.text === text);
  if (existingIndex >= 0) {
    toasts.splice(existingIndex, 1);
  }
  const id = ++seq;
  toasts.push({ id, kind, text });
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id);
    if (i >= 0) toasts.splice(i, 1);
  }, ms);
}
export function useToast() {
  return {
    toasts,
    success: (t: string) => push('success', t),
    info: (t: string) => push('info', t),
    error: (t: string) => push('error', t, 7000)
  };
}
