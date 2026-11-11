import { onMounted, onUnmounted, ref } from 'vue';
import type { TabContext } from '@/shared/types';
import { call } from '../api';

const EMPTY: TabContext = { tabId: null, url: '', kind: 'unsupported', storeHandle: '', themeId: '', schemaName: '' };

export function useTabContext() {
  const ctx = ref<TabContext>({ ...EMPTY });
  const loading = ref(false);
  let timer: number | undefined;

  async function refresh() {
    loading.value = true;
    try { ctx.value = await call<TabContext>({ type: 'GET_TAB_CONTEXT' }); }
    catch { ctx.value = { ...EMPTY }; }
    finally { loading.value = false; }
  }
  const schedule = () => { window.clearTimeout(timer); timer = window.setTimeout(refresh, 250); };
  const onUpdated = (_id: number, info: chrome.tabs.TabChangeInfo) => { if (info.status === 'complete' || info.url) schedule(); };

  onMounted(() => {
    refresh();
    chrome.tabs.onActivated.addListener(schedule);
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
  onUnmounted(() => {
    chrome.tabs.onActivated.removeListener(schedule);
    chrome.tabs.onUpdated.removeListener(onUpdated);
  });
  return { ctx, loading, refresh };
}
