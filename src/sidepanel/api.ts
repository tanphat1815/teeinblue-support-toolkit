import type { Envelope } from '@/shared/types';
import type { Req } from '@/shared/messages';

export async function call<T>(req: Req): Promise<T> {
  const res = (await chrome.runtime.sendMessage(req)) as Envelope<T> | undefined;
  if (!res) throw new Error('Background không phản hồi. Thử reload extension.');
  if (!res.ok) throw new Error(res.error);
  return res.data;
}
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
