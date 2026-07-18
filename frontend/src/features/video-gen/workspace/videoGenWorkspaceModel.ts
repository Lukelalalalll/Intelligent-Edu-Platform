import type { Scene } from '../data/themes';
import { defaultVideoProviderConfig, type VideoProject, type VideoProjectEvent, type VideoProviderConfig, type VideoShot } from '../api/videoApi';
import type { VideoGenWorkflowStep } from '../videoGenWorkflow';
import type { VideoPlannerProviderOption } from '../videoProviderConfig';

export type SourceMode = 'text' | 'file';
export type DrawerTab = 'projects' | 'history';
export type GenerateSubview = 'overview' | 'events' | 'result';

export interface NewProjectDraft {
  title: string;
  text: string;
  file: File | null;
  sourceMode: SourceMode;
  providerConfig: VideoProviderConfig;
}

export const PIPELINE_STEPS = [
  'draft',
  'extract',
  'scene_build',
  'shot_expand',
  'queued',
  'audio',
  'visual_render',
  'assemble',
  'publish',
] as const;

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  planning: 'Planning',
  planned: 'Planned',
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  pending: 'Pending',
  audio_ready: 'Audio Ready',
  rendering: 'Rendering',
  rendered: 'Rendered',
  muxed: 'Muxed',
};

export const STEP_COPY: Record<
  VideoGenWorkflowStep,
  { title: string; description: string; summary: string }
> = {
  input: {
    title: 'Input Content',
    description:
      'Paste the teaching prompt, upload source material, and set the generation profile before creating or refreshing scripts.',
    summary: 'Input',
  },
  script: {
    title: 'Script Planner',
    description:
      'Watch the project planning progress, then review and edit the generated scene scripts before visual layout work.',
    summary: 'Script',
  },
  scene: {
    title: 'Scene Editor',
    description:
      'Adjust narration, layouts, themes, and visual assets scene by scene before sending the project to render.',
    summary: 'Scene',
  },
  generate: {
    title: 'Generate Video',
    description:
      'Track render progress, inspect project events, and review the final video plus exported artifacts in one place.',
    summary: 'Generate',
  },
};

export function buildEmptyDraft(): NewProjectDraft {
  return {
    title: '',
    text: '',
    file: null,
    sourceMode: 'text',
    providerConfig: { ...defaultVideoProviderConfig },
  };
}

export function draftFromProject(project: VideoProject): NewProjectDraft {
  const source = project.source || {
    kind: 'text',
    text: '',
    source_filename: '',
    file_type: '',
    uploaded_file_path: '',
  };

  return {
    title: project.title || '',
    text: source.text || '',
    file: null,
    sourceMode: source.kind === 'file' ? 'file' : 'text',
    providerConfig: {
      ...defaultVideoProviderConfig,
      ...project.provider_config,
    },
  };
}

export function formatDate(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function sanitizeScenes(scenes: Scene[]): Scene[] {
  return scenes.map((scene) => {
    const cloned = {
      ...scene,
    } as Scene & {
      _imagePreviewUrl?: string;
      _layoutImagePreviewUrl?: string;
    };

    delete cloned._imagePreviewUrl;
    delete cloned._layoutImagePreviewUrl;
    return cloned;
  });
}

export function mergeStoryScripts(project: VideoProject, scenes: Scene[]): VideoProject {
  return {
    ...project,
    scenes,
    storyboard: {
      ...project.storyboard,
      scripts: scenes.map((scene) => scene.script || ''),
      scene_count: scenes.length,
      shot_count: scenes.length,
    },
  };
}

export function withDraftSettings(project: VideoProject, draft: NewProjectDraft): VideoProject {
  return {
    ...project,
    title: draft.title || project.title,
    provider_config: {
      ...project.provider_config,
      ...draft.providerConfig,
    },
  };
}

export function planningProject(project: VideoProject, draft: NewProjectDraft): VideoProject {
  return {
    ...withDraftSettings(project, draft),
    status: 'planning',
    progress: Math.max(5, project.progress || 0),
    current_step: 'extract',
    latest_message: 'Generating scripts and scene plan...',
    latest_error: '',
  };
}

export function resolveEffectiveSourceMode(
  draft: NewProjectDraft,
  project: VideoProject | null,
): SourceMode {
  if (draft.file) return 'file';
  if (draft.text.trim().length > 0) return 'text';
  if (project?.source.kind === 'file' && project.source.uploaded_file_path) return 'file';
  return 'text';
}

export function resolveExistingFileName(project: VideoProject | null): string {
  if (project?.source.kind !== 'file') return '';
  return project.source.source_filename || 'Stored source file';
}

export type { VideoProjectEvent, VideoShot, VideoPlannerProviderOption };
