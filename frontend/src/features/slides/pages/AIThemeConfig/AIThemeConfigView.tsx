import React from 'react';
import '@/styles/base.css';
import type { BaseTheme, GenerateRenderResponse } from './types';
import { THEME_OPTIONS } from './types';
import WelcomeBanner from '../../../../shared/components/WelcomeBanner';
import SlidesLoadingState from '../../components/SlidesLoadingState';
import client from '@/shared/api/client';
import { resolveApiRoot } from '@/shared/api/root';
import styles from './styles/aiThemeConfig.module.css';

interface AIThemeConfigViewProps {
  content: string;
  fetching: boolean;
  baseTheme: BaseTheme;
  setBaseTheme: (theme: BaseTheme) => void;
  userCustomThemePrompt: string;
  setUserCustomThemePrompt: (prompt: string) => void;
  generating: boolean;
  errorMsg: string;
  result: GenerateRenderResponse | null;
  generate: () => void;
  onBack: () => void;
}

function buildFullUrl(path: string): string {
  const base = resolveApiRoot();
  return `${base}${path}`;
}

async function handleDownload(url: string): Promise<void> {
  try {
    const fullUrl = buildFullUrl(url);
    const res = await client.get(url, { responseType: 'blob' });
    const blobUrl = URL.createObjectURL(
      new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
    );
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = url.split('/').pop() || 'presentation.pptx';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
  } catch {
    // fallback: try direct navigation
    window.open(buildFullUrl(url), '_blank');
  }
}

function handlePreview(url: string): void {
  window.open(buildFullUrl(url), '_blank', 'noopener,noreferrer');
}

const STEP_LABELS = ['Choose Base Style', 'Customize Style', 'Generate & Download'];

export default function AIThemeConfigView({
  content,
  fetching,
  baseTheme,
  setBaseTheme,
  userCustomThemePrompt,
  setUserCustomThemePrompt,
  generating,
  errorMsg,
  result,
  generate,
  onBack,
}: AIThemeConfigViewProps) {
  const currentStep = generating ? 2 : result ? 2 : baseTheme ? 1 : 0;

  if (generating) {
    return (
      <div className={styles.pageShell}>
        <SlidesLoadingState
          title="AI is designing your presentation..."
          subtitle="Choosing fonts, setting colors, and generating slides with your chosen theme."
        />
      </div>
    );
  }

  return (
    <div className={styles.pageShell}>
      <WelcomeBanner
        title={<>AI Theme Configurator</>}
        subtitle="Choose a base style and customize it with natural language"
        className={styles.pageHeader}
        as="header"
        variant="workspace"
      />

      {/* Back nav */}
      <button className={styles.backBtn} onClick={onBack}>
        <i className="fas fa-arrow-left" /> Back to Upload
      </button>

      {/* Stepper */}
      <div className={styles.stepper}>
        {STEP_LABELS.map((label, i) => (
          <div
            key={label}
            className={`${styles.stepperItem} ${i < currentStep ? styles.stepperItemDone : i === currentStep ? styles.stepperItemActive : ''}`}
          >
            <div className={styles.stepperCircle}>
              {i < currentStep ? <i className="fas fa-check" /> : <span>{i + 1}</span>}
            </div>
            <span className={styles.stepperLabel}>{label}</span>
            {i < STEP_LABELS.length - 1 && <div className={styles.stepperLine} />}
          </div>
        ))}
      </div>

      {/* Content status */}
      {fetching && (
        <div className={styles.statusBar}>
          <i className="fas fa-spinner fa-spin" /> Loading document content...
        </div>
      )}
      {!content && !fetching && (
        <div className={`${styles.statusBar} ${styles.statusWarning}`}>
          <i className="fas fa-exclamation-triangle" /> No content loaded. Please go back and upload a document first.
        </div>
      )}

      {/* Step 1: Theme Selection */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.stepBadge}>1</span> Choose a Base Style
        </h2>
        <div className={styles.themeGrid}>
          {THEME_OPTIONS.map((theme, i) => (
            <div
              key={theme.value}
              className={`${styles.themeCard} ${baseTheme === theme.value ? styles.themeCardActive : ''}`}
              style={{ animationDelay: `${0.15 + i * 0.1}s` }}
              onClick={() => setBaseTheme(theme.value)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setBaseTheme(theme.value)}
            >
              <div className={`${styles.themePreview} ${styles[theme.previewClass] || ''}`}>
                <div className={styles.previewSlide}>
                  <div className={styles.previewTitle}>Title</div>
                  <div className={styles.previewBody}>Body text preview</div>
                  <div className={styles.previewBullet}>• Key point one</div>
                  <div className={styles.previewBullet}>• Key point two</div>
                </div>
              </div>
              <div className={styles.themeInfo}>
                <h3>
                  <i className={`fas ${theme.icon}`} /> {theme.label}
                </h3>
                <p>{theme.description}</p>
              </div>
              {baseTheme === theme.value && (
                <div className={styles.activeCheck}>
                  <i className="fas fa-check-circle" /> Selected
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Step 2: Custom Style Prompt */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.stepBadge}>2</span> Customize Your Style (Optional)
        </h2>
        <p className={styles.sectionHint}>
          Describe your desired visual style in natural language. Leave empty to use the base style as-is.
        </p>
        <textarea
          className={styles.promptInput}
          placeholder='e.g. "Dark cyberpunk theme with neon green accents, glowing borders, and monospace fonts. Suitable for a TED tech talk."'
          value={userCustomThemePrompt}
          onChange={(e) => setUserCustomThemePrompt(e.target.value)}
          rows={4}
          disabled={generating}
        />
      </section>

      {/* Content Preview */}
      {content && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.stepBadge}>3</span> Content Preview
          </h2>
          <div className={styles.contentPreview}>
            <details>
              <summary>View Markdown Content ({content.split(/\n/).length} lines, {content.length} chars)</summary>
              <pre className={styles.contentPre}>{content.slice(0, 3000)}{content.length > 3000 ? '...' : ''}</pre>
            </details>
          </div>
        </section>
      )}

      {/* Error */}
      {errorMsg && (
        <div className={styles.errorAlert}>
          <i className="fas fa-exclamation-circle" /> {errorMsg}
        </div>
      )}

      {/* Generate Button */}
      <div className={styles.actionBar}>
        <button
          className={styles.generateBtn}
          onClick={generate}
          disabled={generating || !content.trim()}
        >
          {generating ? (
            <>
              <i className="fas fa-spinner fa-spin" /> Generating...
            </>
          ) : (
            <>
              <i className="fas fa-magic" /> Generate Slides
            </>
          )}
        </button>
      </div>

      {/* Result */}
      {result && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.stepBadge}>✓</span> Generation Complete
          </h2>
          <div className={styles.resultCard}>
            <div className={styles.resultStat}>
              <i className="fas fa-file-powerpoint" />
              <span>{result.page_count} slides generated</span>
            </div>
            <div className={styles.resultActions}>
              {result.pptx_download_url && (
                <button
                  className={styles.downloadBtn}
                  onClick={() => handleDownload(result.pptx_download_url)}
                >
                  <i className="fas fa-download" /> Download PPTX
                </button>
              )}
              {result.html_preview_url && (
                <button
                  className={styles.previewBtn}
                  onClick={() => handlePreview(result.html_preview_url)}
                >
                  <i className="fas fa-eye" /> HTML Preview
                </button>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
