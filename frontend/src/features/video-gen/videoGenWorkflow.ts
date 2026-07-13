import type { VideoProject } from './api/videoApi';

export const VIDEO_GEN_WORKFLOW_STEPS = [
  'input',
  'script',
  'scene',
  'generate',
] as const;

export type VideoGenWorkflowStep = (typeof VIDEO_GEN_WORKFLOW_STEPS)[number];

const RENDER_FOCUSED_STATUSES = new Set<VideoProject['status'] | 'queued'>([
  'queued',
  'running',
  'completed',
  'failed',
]);

export function isVideoGenWorkflowStepAvailable(
  step: VideoGenWorkflowStep,
  project: VideoProject | null,
): boolean {
  if (step === 'input') return true;
  if (!project) return false;
  if (step === 'script') return true;
  return project.scenes.length > 0;
}

export function resolveLastAvailableVideoGenWorkflowStep(
  project: VideoProject | null,
): VideoGenWorkflowStep {
  for (let index = VIDEO_GEN_WORKFLOW_STEPS.length - 1; index >= 0; index -= 1) {
    const step = VIDEO_GEN_WORKFLOW_STEPS[index];
    if (isVideoGenWorkflowStepAvailable(step, project)) {
      return step;
    }
  }
  return 'input';
}

export function resolvePreferredVideoGenWorkflowStep(
  project: VideoProject | null,
): VideoGenWorkflowStep {
  if (!project) return 'input';

  const hasScenes = project.scenes.length > 0;
  const hasResult = Boolean(project.artifacts?.final_video?.public_path);
  const hasProgressContext =
    RENDER_FOCUSED_STATUSES.has(project.status) ||
    hasResult ||
    project.progress > 0 ||
    (project.events?.length ?? 0) > 0;

  if (hasScenes && hasProgressContext) return 'generate';
  if (hasScenes) return 'scene';
  return 'script';
}
