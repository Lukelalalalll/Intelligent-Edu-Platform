import Button from '@/shared/components/Button/Button';
import { cn } from '@/lib/utils';

import type { VideoProviderConfig, VideoProject } from '../../api/videoApi';
import type { VideoPlannerProviderOption } from '../../workspace/videoGenWorkspaceModel';
import {
  resolveEffectiveSourceMode,
  type NewProjectDraft,
} from '../../workspace/videoGenWorkspaceModel';
import styles from '../../styles/videoGen.module.css';

interface VideoGenInputStepProps {
  draft: NewProjectDraft;
  selectedProject: VideoProject | null;
  plannerProviderOptions: VideoPlannerProviderOption[];
  actionLoading: string;
  avatarUploading: boolean;
  existingFileName: string;
  onProjectField: <K extends keyof VideoProviderConfig>(
    key: K,
    value: VideoProviderConfig[K],
  ) => void;
  onProjectTitle: (value: string) => void;
  onSourceText: (value: string) => void;
  onSourceFile: (file: File | null) => void;
  onAvatarUpload: (file: File) => Promise<void>;
  onSaveWorkspace: () => Promise<void>;
  onUseCurrentScript: () => void;
  onGenerateScripts: () => Promise<void>;
}

export default function VideoGenInputStep({
  draft,
  selectedProject,
  plannerProviderOptions,
  actionLoading,
  avatarUploading,
  existingFileName,
  onProjectField,
  onProjectTitle,
  onSourceText,
  onSourceFile,
  onAvatarUpload,
  onSaveWorkspace,
  onUseCurrentScript,
  onGenerateScripts,
}: VideoGenInputStepProps) {
  const providerFieldHint = plannerProviderOptions.some((option) => option.value === 'deepseek')
    ? 'Planner provider is aligned with your AI Config text providers.'
    : 'DeepSeek appears here after it is configured in AI Config. Local Ollama remains available as fallback.';
  const effectiveSourceMode = resolveEffectiveSourceMode(draft, selectedProject);

  return (
    <>
      <div className={styles.workflowStepBody}>
        <div className={styles.inputSplitLayout}>
          <div className={styles.inputMainColumn}>
            <label className={cn(styles.fieldBlock, styles.inputTitleField)}>
              <span>Project Title</span>
              <input value={draft.title} onChange={(event) => onProjectTitle(event.target.value)} />
            </label>

            <label className={cn(styles.fieldBlock, styles.inputPromptField)}>
              <span>Input Prompt</span>
              <textarea
                className={cn(styles.textArea, styles.inputPromptArea)}
                rows={14}
                value={draft.text}
                onChange={(event) => onSourceText(event.target.value)}
                placeholder="Paste the teaching material, course notes, or script seed here..."
              />
              <p className={styles.fieldHint}>
                Use a longer prompt when you want the planner to work directly from text.
              </p>
            </label>

            <div className={cn(styles.fieldBlock, styles.inputFileField)}>
              <span>File Source</span>
              <label className={cn(styles.fileZone, styles.fileZoneCompact)}>
                <i className="fas fa-cloud-upload-alt" />
                <p>{draft.file ? draft.file.name : 'Choose a PDF, MD, or TXT file'}</p>
                <input
                  type="file"
                  accept=".pdf,.md,.txt"
                  hidden
                  onChange={(event) => onSourceFile(event.target.files?.[0] || null)}
                />
              </label>
              <p className={styles.fieldHint}>
                {draft.file
                  ? 'Uploaded file is ready and will be used as the primary source.'
                  : effectiveSourceMode === 'file'
                    ? `Current stored file will be used: ${existingFileName}`
                    : 'Upload a file when you want to plan directly from source material instead of the text prompt.'}
              </p>
              {selectedProject?.source.kind === 'file' && !draft.file ? (
                <p className={styles.sourceFileNote}>Current stored file: {existingFileName}</p>
              ) : null}
            </div>
          </div>

          <div className={styles.inputConfigColumn}>
            <div className={styles.inputConfigGrid}>
              <label className={styles.fieldBlock}>
                <span>Language</span>
                <select
                  value={draft.providerConfig.lang}
                  onChange={(event) =>
                    onProjectField('lang', event.target.value as VideoProviderConfig['lang'])
                  }
                >
                  <option value="zh">Chinese</option>
                  <option value="en">English</option>
                </select>
              </label>

              <label className={styles.fieldBlock} htmlFor="video-gen-planner-provider">
                <span>Planner Provider</span>
                <select
                  id="video-gen-planner-provider"
                  aria-label="Planner Provider"
                  value={draft.providerConfig.provider}
                  onChange={(event) =>
                    onProjectField(
                      'provider',
                      event.target.value as VideoProviderConfig['provider'],
                    )
                  }
                >
                  {plannerProviderOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className={styles.fieldHint}>{providerFieldHint}</p>
              </label>

              <label className={styles.fieldBlock}>
                <span>Audience</span>
                <select
                  value={draft.providerConfig.audience}
                  onChange={(event) =>
                    onProjectField(
                      'audience',
                      event.target.value as VideoProviderConfig['audience'],
                    )
                  }
                >
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                  <option value="researcher">Researcher</option>
                  <option value="general">General</option>
                </select>
              </label>

              <label className={styles.fieldBlock}>
                <span>B-roll Provider</span>
                <select
                  value={draft.providerConfig.broll_provider}
                  onChange={(event) =>
                    onProjectField(
                      'broll_provider',
                      event.target.value as VideoProviderConfig['broll_provider'],
                    )
                  }
                >
                  <option value="comfyui">ComfyUI WAN 2.1</option>
                  <option value="local">Local Slide Fallback</option>
                </select>
              </label>

              <label className={styles.fieldBlock}>
                <span>Subtitle Mode</span>
                <select
                  value={draft.providerConfig.subtitle_mode}
                  onChange={(event) =>
                    onProjectField(
                      'subtitle_mode',
                      event.target.value as VideoProviderConfig['subtitle_mode'],
                    )
                  }
                >
                  <option value="hard_srt">Hard SRT</option>
                  <option value="image_strip">Image Strip</option>
                  <option value="none">None</option>
                </select>
              </label>

              <label className={styles.fieldBlock}>
                <span>Animation Level</span>
                <select
                  value={draft.providerConfig.animation_level}
                  onChange={(event) =>
                    onProjectField(
                      'animation_level',
                      event.target.value as VideoProviderConfig['animation_level'],
                    )
                  }
                >
                  <option value="off">Off</option>
                  <option value="basic">Basic</option>
                  <option value="high">High</option>
                </select>
              </label>

              <label className={styles.fieldBlock}>
                <span>TTS Engine</span>
                <select
                  value={draft.providerConfig.tts_engine}
                  onChange={(event) =>
                    onProjectField(
                      'tts_engine',
                      event.target.value as VideoProviderConfig['tts_engine'],
                    )
                  }
                >
                  <option value="edge_tts">edge-tts</option>
                  <option value="cosyvoice">CosyVoice</option>
                </select>
              </label>

              <label className={styles.fieldBlock}>
                <span>Avatar Mode</span>
                <select
                  value={draft.providerConfig.avatar_mode}
                  onChange={(event) =>
                    onProjectField(
                      'avatar_mode',
                      event.target.value as VideoProviderConfig['avatar_mode'],
                    )
                  }
                >
                  <option value="none">None</option>
                  <option value="wav2lip">Wav2Lip</option>
                  <option value="latentsync">LatentSync</option>
                </select>
              </label>

              {draft.providerConfig.avatar_mode !== 'none' ? (
                <div className={`${styles.fieldBlock} ${styles.fieldBlockWide}`}>
                  <span>Avatar Image</span>
                  <label className={styles.inlineUploadField}>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      hidden
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void onAvatarUpload(file);
                      }}
                    />
                    <i className="fas fa-image" />
                    <strong>
                      {avatarUploading
                        ? 'Uploading...'
                        : draft.providerConfig.avatar_img_path
                          ? 'Replace uploaded avatar'
                          : 'Upload avatar image'}
                    </strong>
                  </label>
                  <p className={styles.fieldHint}>
                    {draft.providerConfig.avatar_img_path ||
                      'Used for talking-head overlays after final assembly.'}
                  </p>
                </div>
              ) : null}

              <label className={styles.inlineCheck}>
                <input
                  type="checkbox"
                  checked={draft.providerConfig.subtitles}
                  onChange={(event) => onProjectField('subtitles', event.target.checked)}
                />
                <span>Enable subtitles</span>
              </label>

              <label className={styles.inlineCheck}>
                <input
                  type="checkbox"
                  checked={draft.providerConfig.quiz_enabled}
                  onChange={(event) => onProjectField('quiz_enabled', event.target.checked)}
                />
                <span>Generate chapters and quiz markers</span>
              </label>

              <label className={`${styles.fieldBlock} ${styles.fieldBlockWide}`}>
                <span>Max Segments</span>
                <input
                  type="range"
                  min={3}
                  max={15}
                  value={draft.providerConfig.max_segments}
                  onChange={(event) => onProjectField('max_segments', Number(event.target.value))}
                />
                <p className={styles.fieldHint}>
                  Current limit: {draft.providerConfig.max_segments}
                </p>
              </label>

              <details className={`${styles.advancedPanel} ${styles.fieldBlockWide}`}>
                <summary className={styles.advancedSummary}>Advanced render settings</summary>
                <div className={styles.advancedFields}>
                  <label className={styles.fieldBlock}>
                    <span>ComfyUI Base URL</span>
                    <input
                      value={draft.providerConfig.comfyui_base_url ?? ''}
                      onChange={(event) =>
                        onProjectField('comfyui_base_url', event.target.value)
                      }
                    />
                    <p className={styles.fieldHint}>
                      Change this only if your local ComfyUI server is running on a different address.
                    </p>
                  </label>

                  <label className={styles.fieldBlock}>
                    <span>Avoid in generated visuals</span>
                    <input
                      value={draft.providerConfig.default_negative_prompt ?? ''}
                      placeholder="Example: blurry, low quality, text watermark, distorted hands"
                      onChange={(event) =>
                        onProjectField('default_negative_prompt', event.target.value)
                      }
                    />
                    <p className={styles.fieldHint}>
                      Optional. Use this only if you want to tell the image/video model what should be avoided.
                    </p>
                  </label>
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.workflowFooter}>
        <div className={styles.workflowFooterHint}>
          {selectedProject
            ? 'Editing this step updates the source prompt and planning configuration for the selected project.'
            : 'Create a project and generate scripts directly from this input step.'}
        </div>
        <div className={styles.workflowFooterActions}>
          {selectedProject ? (
            <Button
              type="button"
              variant="outline"
              onClick={onSaveWorkspace}
              disabled={actionLoading !== ''}
            >
              {actionLoading === 'save' ? 'Saving...' : 'Save Settings'}
            </Button>
          ) : null}
          {selectedProject?.scenes.length ? (
            <Button type="button" variant="ghost" onClick={onUseCurrentScript}>
              Use Current Script
            </Button>
          ) : null}
          <Button type="button" onClick={onGenerateScripts} disabled={actionLoading !== ''}>
            {actionLoading === 'plan'
              ? 'Generating...'
              : selectedProject
                ? 'Regenerate Script'
                : 'Create Project & Generate Script'}
          </Button>
        </div>
      </div>
    </>
  );
}
