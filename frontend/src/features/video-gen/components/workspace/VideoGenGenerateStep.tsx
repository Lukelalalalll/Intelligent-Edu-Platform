import Button from '@/shared/components/Button/Button';

import type { VideoProject, VideoProjectEvent } from '../../api/videoApi';
import { resolveVideoAssetUrl } from '../../api/videoApi';
import VideoPlayerWithChapters from '../VideoPlayerWithChapters';
import {
  PIPELINE_STEPS,
  STATUS_LABELS,
  formatDate,
  type GenerateSubview,
} from '../../workspace/videoGenWorkspaceModel';
import styles from '../../styles/videoGen.module.css';

interface VideoGenGenerateStepProps {
  selectedProject: VideoProject | null;
  pipelineEvents: VideoProjectEvent[];
  videoUrl: string;
  chaptersUrl: string;
  quizUrl: string;
  generateSubview: GenerateSubview;
  isRenderingProject: boolean;
  hasRenderableProject: boolean;
  actionLoading: string;
  onBackToScene: () => void;
  onSaveWorkspace: () => Promise<void>;
  onRenderProject: () => Promise<void>;
  onSelectSubview: (subview: GenerateSubview) => void;
}

function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.statChip}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ArtifactLink({ label, path }: { label: string; path?: string }) {
  if (!path) return null;
  const url = resolveVideoAssetUrl(path);
  return (
    <a className={styles.artifactLink} href={url} target="_blank" rel="noreferrer">
      <i className="fas fa-file-download" /> {label}
    </a>
  );
}

function LiveRenderPanel({
  selectedProject,
  pipelineEvents,
  isRenderingProject,
  variant,
}: {
  selectedProject: VideoProject | null;
  pipelineEvents: VideoProjectEvent[];
  isRenderingProject: boolean;
  variant: 'overview' | 'result';
}) {
  const latestEvent = pipelineEvents[0];
  const currentStepLabel = selectedProject?.current_step
    ? selectedProject.current_step.replaceAll('_', ' ')
    : 'waiting';
  const liveMessage =
    selectedProject?.latest_message ||
    latestEvent?.message ||
    (variant === 'result'
      ? 'The final video card will swap in as soon as assembly finishes.'
      : 'Render progress is streaming live from the project event feed.');
  const shotCount = selectedProject?.metrics?.shot_count ?? selectedProject?.shots.length ?? 0;
  const completedShots = selectedProject?.metrics?.completed_shots ?? 0;
  const liveTitle = variant === 'result' ? 'Result Preview' : 'Live Refresh';

  return (
    <div className={styles.liveRenderPanel} role="status" aria-live="polite">
      <div className={styles.liveRenderHeader}>
        <div>
          <span className={styles.liveRenderEyebrow}>{liveTitle}</span>
          <strong>
            {isRenderingProject ? 'Rendering in progress' : 'Waiting for final output'}
          </strong>
          <p>{liveMessage}</p>
        </div>

        <div className={styles.liveSpinner} aria-hidden="true">
          <span className={styles.liveSpinnerRing} />
          <span className={styles.liveSpinnerCore} />
        </div>
      </div>

      <div className={styles.liveRenderPreview}>
        <div className={styles.livePreviewFrame}>
          <div className={styles.livePreviewStage}>
            <span className={styles.livePreviewBeam} />
            <span className={styles.livePreviewBlockLg} />
            <span className={styles.livePreviewBlockMd} />
            <span className={styles.livePreviewBlockSm} />
          </div>
          <div className={styles.livePreviewCaption}>
            <span>{currentStepLabel}</span>
            <span>{selectedProject?.progress || 0}%</span>
          </div>
        </div>

        <div className={styles.liveRenderMeta}>
          <div>
            <span>Shots</span>
            <strong>
              {completedShots}/{shotCount || 0}
            </strong>
          </div>
          <div>
            <span>Latest event</span>
            <strong>{latestEvent?.step || selectedProject?.status || 'queued'}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VideoGenGenerateStep({
  selectedProject,
  pipelineEvents,
  videoUrl,
  chaptersUrl,
  quizUrl,
  generateSubview,
  isRenderingProject,
  hasRenderableProject,
  actionLoading,
  onBackToScene,
  onSaveWorkspace,
  onRenderProject,
  onSelectSubview,
}: VideoGenGenerateStepProps) {
  const renderOverview = () => (
    <>
      <div className={styles.generateHero}>
        <div>
          <span className={styles.generateHeroEyebrow}>Current Run</span>
          <strong>
            {selectedProject
              ? STATUS_LABELS[selectedProject.status] || selectedProject.status
              : 'No active project'}
          </strong>
          <p>
            {selectedProject
              ? selectedProject.status === 'planned'
                ? 'Project plan is ready. Rendering starts when you launch the render run.'
                : isRenderingProject
                  ? selectedProject.latest_message || 'Render progress is refreshing live.'
                  : selectedProject.latest_message || 'Render progress will appear here.'
              : 'Render a project to track progress here.'}
          </p>
        </div>
        <div className={styles.generateHeroProgress}>
          <div className={styles.generateHeroProgressLive}>
            {isRenderingProject ? (
              <span className={styles.generateHeroSpinner} aria-hidden="true" />
            ) : null}
            <span>{selectedProject?.progress || 0}%</span>
          </div>
          <div
            className={`${styles.progressBar} ${isRenderingProject ? styles.progressBarLive : ''}`}
          >
            <div style={{ width: `${selectedProject?.progress || 0}%` }} />
          </div>
          {isRenderingProject ? (
            <span className={styles.generateHeroLiveHint}>
              {selectedProject?.current_step || 'queued'}
            </span>
          ) : null}
        </div>
      </div>

      <div className={styles.statsRow}>
        <StatChip
          label="Status"
          value={selectedProject ? STATUS_LABELS[selectedProject.status] || selectedProject.status : '-'}
        />
        <StatChip label="Progress" value={selectedProject ? `${selectedProject.progress || 0}%` : '-'} />
        <StatChip label="Current Step" value={selectedProject?.current_step || '-'} />
        <StatChip label="Updated" value={formatDate(selectedProject?.updated_at)} />
      </div>

      <div className={styles.timelineRow}>
        {PIPELINE_STEPS.map((step) => {
          const active = selectedProject?.current_step === step;
          const done = pipelineEvents.some(
            (event) => event.step === step && event.type === 'step_done',
          );
          return (
            <div
              key={step}
              className={`${styles.timelineStep} ${
                active ? styles.timelineStepActive : ''
              } ${done ? styles.timelineStepDone : ''}`}
            >
              <span>{step.replace('_', ' ')}</span>
            </div>
          );
        })}
      </div>

      {selectedProject?.latest_error ? (
        <div className={styles.errorTip}>
          <i className="fas fa-triangle-exclamation" /> {selectedProject.latest_error}
        </div>
      ) : null}
    </>
  );

  const renderEvents = () => (
    <div className={styles.eventFeed}>
      {pipelineEvents.length === 0 ? (
        <div className={styles.emptyHint}>No pipeline events yet.</div>
      ) : (
        pipelineEvents.map((event: VideoProjectEvent, index: number) => (
          <div key={`${event.ts}-${index}`} className={styles.eventRow}>
            <div>
              <strong>{event.step}</strong>
              <p>{event.message}</p>
            </div>
            <span>{event.progress ?? '-'}%</span>
          </div>
        ))
      )}
    </div>
  );

  const renderResult = () => (
    <>
      {selectedProject?.latest_error ? (
        <div className={styles.errorTip}>
          <i className="fas fa-triangle-exclamation" /> {selectedProject.latest_error}
        </div>
      ) : null}

      {videoUrl ? (
        <VideoPlayerWithChapters
          videoUrl={videoUrl}
          chaptersUrl={chaptersUrl}
          quizUrl={quizUrl}
        />
      ) : isRenderingProject ? (
        <LiveRenderPanel
          selectedProject={selectedProject}
          pipelineEvents={pipelineEvents}
          isRenderingProject={isRenderingProject}
          variant="result"
        />
      ) : (
        <div className={styles.emptyHint}>
          Final video will appear here after assembly completes.
        </div>
      )}

      <div className={styles.artifactGrid}>
        <ArtifactLink label="Final Video" path={selectedProject?.artifacts?.final_video?.public_path} />
        <ArtifactLink label="Storyboard JSON" path={selectedProject?.artifacts?.storyboard?.public_path} />
        <ArtifactLink label="Chapters JSON" path={selectedProject?.artifacts?.chapters?.public_path} />
        <ArtifactLink label="Quiz JSON" path={selectedProject?.artifacts?.quiz?.public_path} />
        <ArtifactLink label="Thumbnail" path={selectedProject?.artifacts?.thumbnail?.public_path} />
      </div>
    </>
  );

  return (
    <>
      <div className={styles.workflowStepBody}>
        {!selectedProject ? (
          <div className={styles.emptyHint}>
            Select a project to inspect render progress and artifacts.
          </div>
        ) : (
          <>
            <div className={styles.subviewToggle} role="tablist" aria-label="Generate step views">
              <button
                type="button"
                role="tab"
                aria-selected={generateSubview === 'overview'}
                className={generateSubview === 'overview' ? styles.subviewToggleActive : ''}
                onClick={() => onSelectSubview('overview')}
              >
                Overview
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={generateSubview === 'events'}
                className={generateSubview === 'events' ? styles.subviewToggleActive : ''}
                onClick={() => onSelectSubview('events')}
              >
                Events
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={generateSubview === 'result'}
                className={generateSubview === 'result' ? styles.subviewToggleActive : ''}
                onClick={() => onSelectSubview('result')}
              >
                Result
              </button>
            </div>

            {generateSubview === 'overview' ? renderOverview() : null}
            {generateSubview === 'events' ? renderEvents() : null}
            {generateSubview === 'result' ? renderResult() : null}
          </>
        )}
      </div>

      <div className={styles.workflowFooter}>
        <div className={styles.workflowFooterActions}>
          <Button type="button" variant="ghost" onClick={onBackToScene}>
            Back to Scene
          </Button>
        </div>
        <div className={styles.workflowFooterActions}>
          <Button
            type="button"
            variant="outline"
            onClick={onSaveWorkspace}
            disabled={!selectedProject || actionLoading !== ''}
          >
            {actionLoading === 'save' ? 'Saving...' : 'Save Project'}
          </Button>
          <Button
            type="button"
            onClick={() => {
              void onRenderProject();
            }}
            disabled={!hasRenderableProject || actionLoading !== '' || isRenderingProject}
          >
            {actionLoading === 'render'
              ? 'Starting...'
              : isRenderingProject
                ? 'Rendering in Progress'
                : 'Render Project'}
          </Button>
        </div>
      </div>
    </>
  );
}
