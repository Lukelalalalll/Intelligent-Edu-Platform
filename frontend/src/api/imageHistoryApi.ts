/**
 * Sub3 (Image Extractor) — Generation History API client.
 */
import client from './client';
import type { GenerationHistoryItem } from '../types/api';

export async function getGenerationHistory(
  page = 1,
  pageSize = 10,
): Promise<{ items: GenerationHistoryItem[]; total: number }> {
  const res = await client.get('/image-extractor/generation_history', {
    params: { page, page_size: pageSize },
  });
  return res.data;
}

export async function getGenerationDetail(
  historyId: string,
): Promise<GenerationHistoryItem> {
  const res = await client.get(`/image-extractor/generation_history/${historyId}`);
  return res.data;
}

export async function replayGeneration(
  historyId: string,
): Promise<{ tool: string; params: Record<string, unknown>; data: Record<string, unknown> }> {
  const res = await client.post(`/image-extractor/generation_history/${historyId}/replay`);
  return res.data;
}
