import React, { useMemo, useRef, useState } from 'react';
import '@/styles/base.css';
import { motion, AnimatePresence } from 'framer-motion';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { history, historyKeymap, redo, redoDepth, undo, undoDepth } from '@codemirror/commands';
import { search, searchKeymap, openSearchPanel } from '@codemirror/search';
import { keymap, EditorView } from '@codemirror/view';
import type {
  BaseTheme,
  ExportRenderDraftResponse,
  GenerateRenderResponse,
  RenderDraftPreviewResponse,
  ThemeDraftLayout,
  ThemeDraftSlide,
  ThemeDraftStage,
} from './types';
import { THEME_OPTIONS } from './types';
import type { ThemeConfigProviderOption } from './hooks/useThemeConfig';
import client from '@/shared/api/client';
import { resolveApiRoot } from '@/shared/api/root';
import styles from './styles/aiThemeConfig.module.css';
import PptGeneratorShell from '../../components/PptGeneratorShell';
import RenderedMarkdown from '@/shared/markdown/RenderedMarkdown';

interface AIThemeConfigViewProps {
  content: string;
  fetching: boolean;
  baseTheme: BaseTheme;
  setBaseTheme: (theme: BaseTheme) => void;
  title: string;
  setTitle: (title: string) => void;
  userCustomThemePrompt: string;
  setUserCustomThemePrompt: (prompt: string) => void;
  workflowStage: ThemeDraftStage;
  markdownDraft: string;
  generationProgress: number;
  exportProgress: number;
  errorMsg: string;
  result: GenerateRenderResponse | null;
  exportResult: ExportRenderDraftResponse | null;
  draftSlides: ThemeDraftSlide[];
  previewResult: RenderDraftPreviewResponse | null;
  previewLoading: boolean;
  providerLoading: boolean;
  providerOptions: ThemeConfigProviderOption[];
  selectedProvider: ThemeConfigProviderOption['id'];
  setSelectedProvider: (provider: ThemeConfigProviderOption['id']) => void;
  selectedProviderMeta: ThemeConfigProviderOption | null;
  openMarkdownDraft: () => void;
  editMarkdownDraft: (content: string) => void;
  commitMarkdownDraft: (content: string, title: string) => void;
  generate: (finalTitle?: string) => void;
  exportDraft: () => void;
  resetToConfigure: () => void;
  returnToEditing: () => void;
  updateSlide: (slideId: string, patch: Partial<ThemeDraftSlide>) => void;
  updateBullets: (slideId: string, bulletsText: string) => void;
  setSlideLayout: (slideId: string, layout: ThemeDraftLayout) => void;
  onBack: () => void;
}

function buildFullUrl(path: string): string {
  const base = resolveApiRoot();
  return `${base}${path}`;
}

async function handleDownload(url: string): Promise<void> {
  try {
    const res = await client.get(url, { responseType: 'blob' });
    const blobUrl = URL.createObjectURL(
      new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }),
    );
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = url.split('/').pop() || 'presentation.pptx';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
  } catch {
    window.open(buildFullUrl(url), '_blank');
  }
}

function handlePreview(url: string): void {
  window.open(buildFullUrl(url), '_blank', 'noopener,noreferrer');
}

const markdownExtensions = [
  history(),
  search({ top: true }),
  markdown({ codeLanguages: languages }),
  keymap.of([...historyKeymap, ...searchKeymap]),
  EditorView.lineWrapping,
] as const;

const LAYOUT_OPTIONS: Array<{ value: ThemeDraftLayout; label: string; icon: string }> = [
  { value: 'cover', label: 'Cover', icon: 'fa-window-maximize' },
  { value: 'content', label: 'Content', icon: 'fa-align-left' },
  { value: 'split', label: 'Split', icon: 'fa-columns' },
  { value: 'quote', label: 'Quote', icon: 'fa-quote-left' },
];

function getCurrentStep(stage: ThemeDraftStage) {
  if (stage === 'configure' || stage === 'generating') return 1;
  if (stage === 'markdown') return 2;
  if (stage === 'editing' || stage === 'exporting') return 3;
  return 4;
}

function MarkdownDraftWorkbench({
  title,
  markdown,
  onTitleChange,
  onMarkdownChange,
  onContinue,
}: {
  title: string;
  markdown: string;
  onTitleChange: (value: string) => void;
  onMarkdownChange: (value: string) => void;
  onContinue: () => void;
}) {
  const editorRef = useRef<ReactCodeMirrorRef | null>(null);
  const canUndo = editorRef.current?.state ? undoDepth(editorRef.current.state) > 0 : false;
  const canRedo = editorRef.current?.state ? redoDepth(editorRef.current.state) > 0 : false;
  const lineCount = useMemo(() => markdown.split(/\n/).length, [markdown]);
  const wordCount = useMemo(() => markdown.trim().split(/\s+/).filter(Boolean).length, [markdown]);

  const handleUndo = () => {
    const view = editorRef.current?.view;
    if (!view) return;
    undo(view);
  };

  const handleRedo = () => {
    const view = editorRef.current?.view;
    if (!view) return;
    redo(view);
  };

  const handleSearch = () => {
    const view = editorRef.current?.view;
    if (!view) return;
    openSearchPanel(view);
    view.focus();
  };

  return (
    <section className={`${styles.markdownStage} ${styles.stepContainer}`}>
      <div className={styles.markdownHeader}>
        <div>
          <div className={styles.kicker}>Step 3</div>
          <h2>Markdown Draft</h2>
          <p>Refine the source document before slide generation. Edit the markdown, inspect the rendered result, then generate from this finalized draft.</p>
        </div>
        <div className={styles.markdownMeta}>
          <span>{lineCount} lines</span>
          <span>{wordCount} words</span>
        </div>
      </div>

      <div className={styles.markdownTopRow}>
        <div className={styles.markdownTitleField}>
          <label className={styles.fieldLabel}>Presentation Title</label>
          <input
            className={styles.textInput}
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="Presentation title"
          />
        </div>
        <div className={styles.markdownActions}>
          <button type="button" className={styles.secondaryActionBtn} onClick={handleUndo} disabled={!canUndo}>
            <i className="fas fa-rotate-left" /> Undo
          </button>
          <button type="button" className={styles.secondaryActionBtn} onClick={handleRedo} disabled={!canRedo}>
            <i className="fas fa-rotate-right" /> Redo
          </button>
          <button type="button" className={styles.secondaryActionBtn} onClick={handleSearch}>
            <i className="fas fa-magnifying-glass" /> Search
          </button>
          <button type="button" className={styles.generateBtn} onClick={onContinue} disabled={!markdown.trim()}>
            <i className="fas fa-magic" /> Confirm &amp; Generate
          </button>
        </div>
      </div>

      <div className={styles.markdownBoard}>
        <div className={styles.markdownEditorPane}>
          <div className={styles.markdownPaneHeader}>
            <div>
              <span className={styles.markdownPaneEyebrow}>Editor</span>
              <h3>Source Markdown</h3>
            </div>
          </div>
          <div className={styles.markdownEditorShell}>
            <CodeMirror
              ref={editorRef}
              value={markdown}
              height="100%"
              minHeight="100%"
              basicSetup={{
                foldGutter: false,
                autocompletion: true,
              }}
              extensions={[...markdownExtensions]}
              onChange={(value) => onMarkdownChange(value)}
              className={styles.markdownCodeMirror}
            />
          </div>
        </div>

        <div className={styles.markdownPreviewPane}>
          <div className={styles.markdownPaneHeader}>
            <div>
              <span className={styles.markdownPaneEyebrow}>Preview</span>
              <h3>Rendered Output</h3>
            </div>
          </div>
          <div className={styles.markdownPreviewScroll}>
            {markdown.trim() ? (
              <RenderedMarkdown className={`${styles.markdownPreviewBody} markdown-body`} content={markdown} />
            ) : (
              <div className={styles.markdownPreviewEmpty}>Your markdown preview will appear here.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ThemeDraftCanvas({ slide }: { slide: ThemeDraftSlide }) {
  const bodyLines = slide.body.split('\n').filter(Boolean);
  return (
    <div className={`${styles.draftCanvas} ${styles[`layout-${slide.layout}`] || ''} ${styles[`align-${slide.align}`] || ''}`}>
      <div className={styles.canvasGlow} />
      <div className={styles.canvasInner}>
        <div className={styles.canvasHeading}>{slide.heading || 'Untitled Slide'}</div>
        {slide.accent_text ? <div className={styles.canvasAccent}>{slide.accent_text}</div> : null}
        {slide.layout === 'split' ? (
          <div className={styles.canvasSplit}>
            <div className={styles.canvasBodyColumn}>
              {bodyLines.length ? bodyLines.map((line, idx) => <p key={idx}>{line}</p>) : <p>Write the core narrative here.</p>}
            </div>
            <div className={styles.canvasBulletColumn}>
              {(slide.bullets.length ? slide.bullets : ['Key point', 'Supporting point', 'Takeaway']).map((item, idx) => (
                <div key={idx} className={styles.canvasBullet}>{item}</div>
              ))}
            </div>
          </div>
        ) : slide.layout === 'quote' ? (
          <div className={styles.canvasQuote}>{slide.body || 'A memorable line or central takeaway goes here.'}</div>
        ) : (
          <>
            <div className={styles.canvasBody}>
              {bodyLines.length ? bodyLines.map((line, idx) => <p key={idx}>{line}</p>) : <p>Write the body content for this slide.</p>}
            </div>
            {slide.bullets.length > 0 ? (
              <div className={styles.canvasBulletList}>
                {slide.bullets.map((item, idx) => (
                  <div key={idx} className={styles.canvasBullet}>{item}</div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function sanitizePreviewHtml(html: string, selectedIndex: number): string {
  if (!html.trim()) return html;
  const script = `<script>
(function () {
  var slides = document.querySelectorAll('.viewport .slide');
  var activeIndex = ${Math.max(0, selectedIndex)};
  slides.forEach(function (slide, index) {
    slide.classList.toggle('active', index === activeIndex);
    slide.style.display = index === activeIndex ? 'flex' : 'none';
  });
  var nav = document.querySelector('.slide-nav');
  if (nav) nav.style.display = 'none';
  var viewport = document.querySelector('.viewport');
  if (viewport) {
    viewport.style.padding = '0';
    viewport.style.minHeight = '100vh';
  }
})();
</script>`;
  return html.includes('</body>') ? html.replace('</body>', `${script}</body>`) : `${html}${script}`;
}

function WorkflowOverlay({
  open,
  title,
  subtitle,
  progress,
  icon,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  progress: number;
  icon: string;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className={styles.workflowOverlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className={styles.workflowOverlayCard}
            initial={{ y: 20, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 20, scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
          >
            <div className={styles.workflowOrb}>
              <i className={`fas ${icon}`} />
            </div>
            <h3>{title}</h3>
            <p>{subtitle}</p>
            <div className={styles.workflowProgressTrack}>
              <motion.div
                className={styles.workflowProgressBar}
                animate={{ width: `${Math.max(8, Math.min(progress, 100))}%` }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
              />
            </div>
            <div className={styles.workflowProgressMeta}>
              <span>In progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export default function AIThemeConfigView({
  content,
  fetching,
  baseTheme,
  setBaseTheme,
  title,
  setTitle,
  userCustomThemePrompt,
  setUserCustomThemePrompt,
  workflowStage,
  markdownDraft,
  generationProgress,
  exportProgress,
  errorMsg,
  result,
  exportResult,
  draftSlides,
  previewResult,
  previewLoading,
  providerLoading,
  providerOptions,
  selectedProvider,
  setSelectedProvider,
  selectedProviderMeta,
  openMarkdownDraft,
  editMarkdownDraft,
  commitMarkdownDraft,
  generate,
  exportDraft,
  resetToConfigure,
  returnToEditing,
  updateSlide,
  updateBullets,
  setSlideLayout,
  onBack,
}: AIThemeConfigViewProps) {
  const [activeSlideId, setActiveSlideId] = useState<string>('');
  const [draftTitle, setDraftTitle] = useState(title);
  const currentStep = getCurrentStep(workflowStage);
  const canReturnToConfigure = workflowStage === 'markdown' || workflowStage === 'editing' || workflowStage === 'exporting' || workflowStage === 'complete';
  const canReturnToMarkdown = workflowStage === 'editing' || workflowStage === 'exporting' || workflowStage === 'complete';
  const canReturnToEditing = (workflowStage === 'complete' || workflowStage === 'markdown') && draftSlides.length > 0;

  const activeSlide = useMemo(() => {
    const fallback = draftSlides[0] || null;
    if (!fallback) return null;
    return draftSlides.find((slide) => slide.id === activeSlideId) || fallback;
  }, [activeSlideId, draftSlides]);

  const activeSlideIndex = useMemo(
    () => (activeSlide ? draftSlides.findIndex((slide) => slide.id === activeSlide.id) : -1),
    [activeSlide, draftSlides],
  );

  const previewSrcDoc = useMemo(() => {
    if (!previewResult?.html) return '';
    const selectedIndex = activeSlideIndex >= 0 ? activeSlideIndex : previewResult.selected_index;
    return sanitizePreviewHtml(previewResult.html, selectedIndex);
  }, [activeSlideIndex, previewResult]);

  React.useEffect(() => {
    if (draftSlides.length && !draftSlides.some((slide) => slide.id === activeSlideId)) {
      setActiveSlideId(draftSlides[0].id);
    }
  }, [activeSlideId, draftSlides]);

  React.useEffect(() => {
    setDraftTitle(title);
  }, [title]);

  const topBar = (
    <div className={styles.topBar}>
      <button className={styles.backBtn} onClick={onBack}>
        <i className="fas fa-arrow-left" /> Back to Prepare Content
      </button>
      {workflowStage === 'configure' && draftSlides.length > 0 ? (
        <button className={styles.secondaryActionBtn} onClick={returnToEditing}>
          <i className="fas fa-pen-to-square" /> Back to Preview &amp; Edit
        </button>
      ) : null}
      {canReturnToMarkdown ? (
        <button className={styles.secondaryActionBtn} onClick={openMarkdownDraft}>
          <i className="fas fa-file-lines" /> Return to Markdown Draft
        </button>
      ) : null}
      {canReturnToConfigure ? (
        <button className={styles.secondaryActionBtn} onClick={resetToConfigure}>
          <i className="fas fa-sliders-h" /> Return to Style Config
        </button>
      ) : null}
    </div>
  );

  const handleStepSelect = (stepIndex: number) => {
    if (stepIndex === 0) {
      onBack();
      return;
    }
    if (stepIndex === 1 && canReturnToConfigure) {
      resetToConfigure();
      return;
    }
    if (stepIndex === 2 && canReturnToMarkdown) {
      openMarkdownDraft();
      return;
    }
    if (stepIndex === 3 && canReturnToEditing) {
      returnToEditing();
    }
  };

  return (
    <div className={styles.pageShell}>
      <PptGeneratorShell currentStep={currentStep} onStepSelect={handleStepSelect} toolbar={topBar} dense>
        <div className={styles.shellContent}>
          {fetching ? (
            <div className={styles.statusBar}>
              <i className="fas fa-spinner fa-spin" /> Loading document content...
            </div>
          ) : null}
          {!content && !fetching ? (
            <div className={`${styles.statusBar} ${styles.statusWarning}`}>
              <i className="fas fa-exclamation-triangle" /> No content loaded. Please go back and upload a document first.
            </div>
          ) : null}
          {errorMsg ? (
            <div className={styles.errorAlert}>
              <i className="fas fa-exclamation-circle" /> {errorMsg}
            </div>
          ) : null}

          {(workflowStage === 'configure' || workflowStage === 'generating') && (
            <section className={`${styles.configCard} ${styles.stepContainer}`}>
              <div className={styles.configHeader}>
                <div>
                  <div className={styles.kicker}>Step 2</div>
                  <h2>Style Configuration</h2>
                  <p>Choose the visual style and generation runtime first. You will refine the markdown in the next step before any slides are generated.</p>
                </div>
              </div>

              <div className={styles.configLayout}>
                <div className={styles.configMain}>
                  <div className={`${styles.configColumn} ${styles.configFormColumn}`}>
                    <div className={styles.formGroupWide}>
                      <label className={styles.fieldLabel}>Presentation Title</label>
                      <input
                        className={styles.textInput}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Presentation title"
                      />
                    </div>

                    <div className={styles.formGroupWide}>
                      <label className={styles.fieldLabel}>Customize Your Style</label>
                      <textarea
                        className={styles.promptInput}
                        placeholder='e.g. "Sharper contrast, cleaner data-heavy layout, subtle emerald highlight, less glow, more boardroom polish."'
                        value={userCustomThemePrompt}
                        onChange={(e) => setUserCustomThemePrompt(e.target.value)}
                        rows={3}
                      />
                    </div>

                    <div className={`${styles.formGroupWide} ${styles.providerSection}`}>
                      <div className={styles.providerRow}>
                        <div>
                          <label className={styles.fieldLabel}>AI Selector</label>
                          <p className={styles.fieldHint}>Options reflect the saved AI Config and runtime availability.</p>
                        </div>
                        <div className={styles.providerMeta}>
                          {selectedProviderMeta?.model ? <span>{selectedProviderMeta.model}</span> : null}
                          {selectedProviderMeta?.source ? <span>{selectedProviderMeta.source}</span> : null}
                        </div>
                      </div>
                      <div className={styles.providerGrid}>
                        {providerLoading ? (
                          <div className={styles.providerLoading}><i className="fas fa-spinner fa-spin" /> Loading providers...</div>
                        ) : providerOptions.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            disabled={option.disabled}
                            className={`${styles.providerCard} ${selectedProvider === option.id ? styles.providerCardActive : ''} ${option.disabled ? styles.providerCardDisabled : ''}`}
                            onClick={() => setSelectedProvider(option.id)}
                          >
                            <div className={styles.providerCardTop}>
                              <strong>{option.label}</strong>
                              {option.configured ? <span className={styles.providerBadge}>Configured</span> : <span className={styles.providerBadgeMuted}>Local</span>}
                            </div>
                            <div className={styles.providerCardModel}>{option.model || 'Default model'}</div>
                            <div className={styles.providerCardNote}>
                              {option.reason || (option.available ? 'Ready to use' : 'Temporarily unavailable')}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className={`${styles.configColumn} ${styles.configThemeColumn}`}>
                    <div className={`${styles.formGroupWide} ${styles.themeSection}`}>
                      <label className={styles.fieldLabel}>Base Style</label>
                      <div className={styles.themeGrid}>
                        {THEME_OPTIONS.map((theme) => (
                          <button
                            key={theme.value}
                            type="button"
                            className={`${styles.themeCard} ${baseTheme === theme.value ? styles.themeCardActive : ''}`}
                            onClick={() => setBaseTheme(theme.value)}
                          >
                            <div className={`${styles.themePreview} ${styles[theme.previewClass] || ''}`}>
                              <div className={styles.previewSlide}>
                                <div className={styles.previewTitle}>Title</div>
                                <div className={styles.previewBody}>Body text preview</div>
                                <div className={styles.previewBullet}>Key point one</div>
                                <div className={styles.previewBullet}>Key point two</div>
                              </div>
                            </div>
                            <div className={styles.themeInfo}>
                              <h3><i className={`fas ${theme.icon}`} /> {theme.label}</h3>
                              <p>{theme.description}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <aside className={styles.configAside}>
                  <div className={styles.configAsideCard}>
                    <div className={styles.asideHeader}>
                      <div>
                        <div className={styles.kicker}>Flow</div>
                        <h3>Next: Markdown Draft</h3>
                      </div>
                    </div>
                    <p className={styles.configAsideCopy}>
                      Continue into a dedicated editor workspace where you can revise the markdown, inspect a live preview, and generate slides from the finalized draft.
                    </p>
                  </div>

                  <div className={styles.configAsideCard}>
                    <div className={styles.asideHeader}>
                      <div>
                        <div className={styles.kicker}>Source</div>
                        <h3>Document Summary</h3>
                      </div>
                    </div>
                    <div className={styles.contentSummary}>
                      <span>{content.split(/\n/).filter(Boolean).length} lines</span>
                      <span>{content.length} chars</span>
                    </div>
                    <p className={styles.configAsideCopy}>
                      {content.trim()
                        ? 'The imported markdown is ready for editorial cleanup and fine-grained changes.'
                        : 'No source markdown is loaded yet. Go back to Prepare Content first.'}
                    </p>
                  </div>

                  <div className={styles.actionBar}>
                    <button
                      className={styles.generateBtn}
                      onClick={() => {
                        commitMarkdownDraft(markdownDraft, draftTitle);
                        openMarkdownDraft();
                      }}
                      disabled={!content.trim() || providerLoading || !providerOptions.some((item) => item.id === selectedProvider && !item.disabled)}
                    >
                      <i className="fas fa-arrow-right" /> Continue to Markdown Draft
                    </button>
                  </div>
                </aside>
              </div>
            </section>
          )}

          {workflowStage === 'markdown' ? (
            <MarkdownDraftWorkbench
              title={draftTitle}
              markdown={markdownDraft}
              onTitleChange={(value) => {
                setDraftTitle(value);
                commitMarkdownDraft(markdownDraft, value);
              }}
              onMarkdownChange={(value) => {
                editMarkdownDraft(value);
              }}
              onContinue={() => {
                commitMarkdownDraft(markdownDraft, draftTitle);
                generate(draftTitle);
              }}
            />
          ) : null}

          {(workflowStage === 'editing' || workflowStage === 'exporting') && activeSlide && (
            <section className={styles.editorStage}>
              <div className={styles.editorShell}>
                <div className={styles.editorToolbar}>
                  <div>
                    <div className={styles.kicker}>Step 4</div>
                    <h2>Preview &amp; Edit</h2>
                  </div>
                  <div className={styles.editorToolbarMeta}>
                    {result?.provider_resolved ? <span>{result.provider_resolved}</span> : null}
                    {result?.provider_model ? <span>{result.provider_model}</span> : null}
                    {result?.warning ? <span className={styles.warningPill}>{result.warning}</span> : null}
                  </div>
                </div>

                <div className={styles.editorBoard}>
                  <aside className={styles.editorSidebar}>
                    <div className={styles.sidebarHeader}>
                      <h3>Slides</h3>
                      <span>{draftSlides.length}</span>
                    </div>
                    <div className={styles.sidebarList}>
                      {draftSlides.map((slide, index) => (
                        <button
                          key={slide.id}
                          type="button"
                          className={`${styles.sidebarItem} ${activeSlide.id === slide.id ? styles.sidebarItemActive : ''}`}
                          onClick={() => setActiveSlideId(slide.id)}
                        >
                          <div className={styles.sidebarThumbNumber}>{index + 1}</div>
                          <div className={styles.sidebarThumbText}>
                            <strong>{slide.heading || `Slide ${index + 1}`}</strong>
                            <span>{slide.layout}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </aside>

                  <div className={styles.previewPane}>
                    <div className={styles.previewStage}>
                      {previewSrcDoc ? (
                        <iframe
                          title={`Rendered slide preview ${Math.max(activeSlideIndex, 0) + 1}`}
                          className={styles.previewFrame}
                          srcDoc={previewSrcDoc}
                        />
                      ) : (
                        <div className={styles.previewUnavailable}>
                          <i className="fas fa-rectangle-xmark" />
                          <span>Backend render preview is unavailable right now.</span>
                        </div>
                      )}
                      {previewLoading ? (
                        <div className={styles.previewLoadingOverlay}>
                          <i className="fas fa-spinner fa-spin" /> Refreshing export preview...
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className={styles.controlsPane}>
                    <div className={styles.controlsScroll}>
                      <div className={styles.controlsSection}>
                        <label className={styles.fieldLabel}>Headline</label>
                        <input
                          className={styles.textInput}
                          value={activeSlide.heading}
                          onChange={(e) => updateSlide(activeSlide.id, { heading: e.target.value })}
                        />
                      </div>
                      <div className={styles.controlsSection}>
                        <label className={styles.fieldLabel}>Accent Text</label>
                        <input
                          className={styles.textInput}
                          value={activeSlide.accent_text}
                          onChange={(e) => updateSlide(activeSlide.id, { accent_text: e.target.value })}
                        />
                      </div>
                      <div className={styles.controlsSection}>
                        <label className={styles.fieldLabel}>Body Copy</label>
                        <textarea
                          className={styles.promptInput}
                          rows={6}
                          value={activeSlide.body}
                          onChange={(e) => updateSlide(activeSlide.id, { body: e.target.value })}
                        />
                      </div>
                      <div className={styles.controlsSection}>
                        <label className={styles.fieldLabel}>Bullets</label>
                        <textarea
                          className={styles.promptInput}
                          rows={6}
                          value={activeSlide.bullets.join('\n')}
                          onChange={(e) => updateBullets(activeSlide.id, e.target.value)}
                        />
                      </div>
                      <div className={styles.controlsSection}>
                        <label className={styles.fieldLabel}>Layout</label>
                        <div className={styles.segmentedControl}>
                          {LAYOUT_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className={`${styles.segmentBtn} ${activeSlide.layout === option.value ? styles.segmentBtnActive : ''}`}
                              onClick={() => setSlideLayout(activeSlide.id, option.value)}
                            >
                              <i className={`fas ${option.icon}`} /> {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className={styles.controlsSection}>
                        <label className={styles.fieldLabel}>Alignment</label>
                        <div className={styles.segmentedControl}>
                          <button
                            type="button"
                            className={`${styles.segmentBtn} ${activeSlide.align === 'left' ? styles.segmentBtnActive : ''}`}
                            onClick={() => updateSlide(activeSlide.id, { align: 'left' })}
                          >
                            <i className="fas fa-align-left" /> Left
                          </button>
                          <button
                            type="button"
                            className={`${styles.segmentBtn} ${activeSlide.align === 'center' ? styles.segmentBtnActive : ''}`}
                            onClick={() => updateSlide(activeSlide.id, { align: 'center' })}
                          >
                            <i className="fas fa-align-center" /> Center
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className={styles.controlsFooter}>
                      <button
                        className={styles.exportBtn}
                        onClick={exportDraft}
                        disabled={workflowStage === 'exporting'}
                      >
                        <i className="fas fa-file-export" /> Confirm &amp; Export PPTX
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {workflowStage === 'complete' && exportResult ? (
            <section className={styles.resultSection}>
              <div className={styles.resultCard}>
                <div className={styles.resultThumbPane}>
                  {draftSlides[0] ? <ThemeDraftCanvas slide={draftSlides[0]} /> : null}
                </div>
                <div className={styles.resultContent}>
                  <div className={styles.kicker}>Step 5</div>
                  <h2>Export Complete</h2>
                  <p>{exportResult.page_count} slides exported and ready for download.</p>
                  {exportResult.renderer?.mode === 'browser' ? (
                    <div className={styles.resultSuccessNote}><i className="fas fa-check-circle" /> Export used the browser-rendered PPTX pipeline.</div>
                  ) : null}
                  {exportResult.warning ? <div className={styles.resultNote}><i className="fas fa-circle-info" /> {exportResult.warning}</div> : null}
                  <div className={styles.resultActions}>
                    <button className={styles.downloadBtn} onClick={() => handleDownload(exportResult.pptx_download_url)}>
                      <i className="fas fa-download" /> Download PPTX
                    </button>
                    {exportResult.html_preview_url ? (
                      <button className={styles.previewBtn} onClick={() => handlePreview(exportResult.html_preview_url)}>
                        <i className="fas fa-eye" /> Open HTML Preview
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <WorkflowOverlay
            open={workflowStage === 'generating'}
            title="Generating your themed draft..."
            subtitle="Mapping content, shaping style tokens, and preparing the editable preview."
            progress={generationProgress}
            icon="fa-sparkles"
          />
          <WorkflowOverlay
            open={workflowStage === 'exporting'}
            title="Exporting PPTX..."
            subtitle="Rendering the updated preview and packaging your deck for download."
            progress={exportProgress}
            icon="fa-file-export"
          />
        </div>
      </PptGeneratorShell>
    </div>
  );
}
