/**
 * Image Extractor — Generation History API (factory-based).
 */
import { createHistoryApi } from '../../../api/historyApiFactory';
import type { GenerationHistoryItem } from '../../../types/api';

const api = createHistoryApi<GenerationHistoryItem>('/image-extractor');

export const { getGenerationHistory, getGenerationDetail, replayGeneration } = api;
