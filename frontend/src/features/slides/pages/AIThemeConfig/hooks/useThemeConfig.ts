import { useState, useCallback, useMemo } from 'react';
import client from '@/shared/api/client';
import type { BaseTheme, GenerateRenderResponse } from '../types';
import { getStoredAIProvider } from '@/shared/aiProvider';

export function useThemeConfig() {
  const [baseTheme, setBaseTheme] = useState<BaseTheme>('neon_tech');
  const [userCustomThemePrompt, setUserCustomThemePrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<GenerateRenderResponse | null>(null);

  const provider = useMemo(() => getStoredAIProvider(), []);

  const generate = useCallback(
    async (content: string) => {
      if (!content.trim()) {
        setErrorMsg('No content to generate slides from. Please go back and upload a document first.');
        return;
      }
      setGenerating(true);
      setErrorMsg('');
      setResult(null);
      try {
        const filename = localStorage.getItem('combinedFilename') || '';
        const res = await client.post('/slides/generate-render', {
          md_content: content,
          filename,
          base_style: baseTheme,
          custom_style_prompt: userCustomThemePrompt,
          provider,
        });
        setResult(res.data as GenerateRenderResponse);
      } catch (error: unknown) {
        const e = error as { response?: { data?: { detail?: string } }; message?: string };
        setErrorMsg(e.response?.data?.detail || 'Generation failed: ' + (e.message ?? ''));
      } finally {
        setGenerating(false);
      }
    },
    [baseTheme, userCustomThemePrompt, provider]
  );

  return {
    baseTheme,
    setBaseTheme,
    userCustomThemePrompt,
    setUserCustomThemePrompt,
    generating,
    errorMsg,
    result,
    generate,
    setErrorMsg,
  };
}