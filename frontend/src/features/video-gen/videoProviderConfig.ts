import type { AIConfigResponse } from '@/features/ai-config/api/aiConfigApi';
import { getStoredAIProvider } from '@/shared/aiProvider';

import type { VideoProviderConfig } from './api/videoApi';

export type VideoPlannerProvider = VideoProviderConfig['provider'];

export interface VideoPlannerProviderOption {
  value: VideoPlannerProvider;
  label: string;
  source: 'ai-config' | 'local' | 'legacy';
}

const DEFAULT_OPTIONS: VideoPlannerProviderOption[] = [
  { value: 'local_ollama', label: 'Local Ollama', source: 'local' },
];

export function getVideoPlannerProviderOptions(
  aiConfig: AIConfigResponse | null | undefined,
): VideoPlannerProviderOption[] {
  const options: VideoPlannerProviderOption[] = [
    { value: 'local_ollama', label: 'Local Ollama', source: 'local' },
  ];

  if (aiConfig?.text.deepseek.api_key_set) {
    options.push({ value: 'deepseek', label: 'DeepSeek', source: 'ai-config' });
  }

  return options;
}

export function getPreferredVideoPlannerProvider(
  aiConfig: AIConfigResponse | null | undefined,
): VideoPlannerProvider {
  const options = getVideoPlannerProviderOptions(aiConfig);
  const values = options.map((option) => option.value);
  const stored = getStoredAIProvider();

  if (stored === 'deepseek' && values.includes('deepseek')) {
    return 'deepseek';
  }
  if (values.includes('deepseek')) {
    return 'deepseek';
  }
  return 'local_ollama';
}

export function coerceVideoPlannerProvider(
  currentProvider: string | null | undefined,
  aiConfig: AIConfigResponse | null | undefined,
): VideoPlannerProvider {
  const options = getVideoPlannerProviderOptions(aiConfig);
  const values = options.map((option) => option.value);

  if (currentProvider === 'deepseek' && values.includes('deepseek')) {
    return 'deepseek';
  }
  if (currentProvider === 'local_ollama' && values.includes('local_ollama')) {
    return 'local_ollama';
  }
  if (currentProvider === 'coze') {
    return getPreferredVideoPlannerProvider(aiConfig);
  }

  return getPreferredVideoPlannerProvider(aiConfig);
}

export function getDefaultVideoPlannerProviderOptions(): VideoPlannerProviderOption[] {
  return DEFAULT_OPTIONS;
}
