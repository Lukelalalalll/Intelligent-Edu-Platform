import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useThemeConfig } from './hooks/useThemeConfig';
import AIThemeConfigView from './AIThemeConfigView';
import client from '@/shared/api/client';

export default function AIThemeConfigPage() {
  const navigate = useNavigate();
  const themeConfig = useThemeConfig();
  const [content, setContent] = React.useState('');
  const [fetching, setFetching] = React.useState(false);

  useEffect(() => {
    const storedContent = localStorage.getItem('slidesContentMD');
    if (storedContent) {
      setContent(storedContent);
      // clear after reading so stale content doesn't persist across visits
      localStorage.removeItem('slidesContentMD');
      return;
    }

    const filename = localStorage.getItem('combinedFilename');
    if (filename) {
      setFetching(true);
      client
        .get(`/slides/download/${filename}`)
        .then((res) => {
          const text = typeof res.data === 'string' ? res.data : res.data?.content || '';
          setContent(text);
        })
        .catch(() => {
          themeConfig.setErrorMsg(
            'Failed to load document content. The file may have expired. Please go back and re-upload your document.'
          );
        })
        .finally(() => setFetching(false));
    }
  }, []);

  return (
    <AIThemeConfigView
      content={content}
      fetching={fetching}
      baseTheme={themeConfig.baseTheme}
      setBaseTheme={themeConfig.setBaseTheme}
      userCustomThemePrompt={themeConfig.userCustomThemePrompt}
      setUserCustomThemePrompt={themeConfig.setUserCustomThemePrompt}
      generating={themeConfig.generating}
      errorMsg={themeConfig.errorMsg}
      result={themeConfig.result}
      generate={() => themeConfig.generate(content)}
      onBack={() => navigate('/slides/md-processor')}
    />
  );
}
