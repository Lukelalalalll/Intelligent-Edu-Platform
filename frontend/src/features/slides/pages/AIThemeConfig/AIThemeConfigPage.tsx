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
      title={themeConfig.title}
      setTitle={themeConfig.setTitle}
      userCustomThemePrompt={themeConfig.userCustomThemePrompt}
      setUserCustomThemePrompt={themeConfig.setUserCustomThemePrompt}
      workflowStage={themeConfig.workflowStage}
      markdownDraft={themeConfig.markdownDraft ?? content}
      generationProgress={themeConfig.generationProgress}
      exportProgress={themeConfig.exportProgress}
      errorMsg={themeConfig.errorMsg}
      result={themeConfig.result}
      exportResult={themeConfig.exportResult}
      draftSlides={themeConfig.draftSlides}
      previewResult={themeConfig.previewResult}
      previewLoading={themeConfig.previewLoading}
      providerLoading={themeConfig.providerLoading}
      providerOptions={themeConfig.providerOptions}
      selectedProvider={themeConfig.selectedProvider}
      setSelectedProvider={themeConfig.setSelectedProvider}
      selectedProviderMeta={themeConfig.selectedProviderMeta}
      openMarkdownDraft={themeConfig.openMarkdownDraft}
      editMarkdownDraft={themeConfig.editMarkdownDraft}
      commitMarkdownDraft={themeConfig.commitMarkdownDraft}
      generate={(finalTitle?: string) => themeConfig.generate(themeConfig.markdownDraft ?? content, finalTitle)}
      exportDraft={themeConfig.exportDraft}
      resetToConfigure={themeConfig.resetToConfigure}
      returnToEditing={themeConfig.returnToEditing}
      updateSlide={themeConfig.updateSlide}
      updateBullets={themeConfig.updateBullets}
      setSlideLayout={themeConfig.setSlideLayout}
      onBack={() => navigate('/slides/md-processor')}
    />
  );
}
