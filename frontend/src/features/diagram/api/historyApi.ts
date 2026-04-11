/**
 * Diagram — Generation History API (factory-based).
 */
import { createHistoryApi } from '../../../api/historyApiFactory';
import type { GenerationHistoryItem } from '../../../types/api';

const api = createHistoryApi<GenerationHistoryItem>('/diagram');

export const { getGenerationHistory, getGenerationDetail, replayGeneration } = api;
