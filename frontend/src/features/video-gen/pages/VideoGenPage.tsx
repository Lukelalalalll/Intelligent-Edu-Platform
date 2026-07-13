import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Reorder, useDragControls } from 'framer-motion';
import WelcomeBanner from '@/shared/components/WelcomeBanner';
import { cn } from '@/lib/utils';
import entranceStyles from '@/shared/page-entrance/PageEntrance.module.css';
import { usePageEntrance } from '@/shared/page-entrance/usePageEntrance';
import Button from '@/shared/components/Button/Button';
import Card from '@/shared/components/Card/Card';
import {
  aiConfigApi,
  type AIConfigResponse,
} from '@/features/ai-config/api/aiConfigApi';
import SceneCard from '../components/SceneCard';
import VideoHistoryPanel from '../components/HistoryPanel';
import VideoPlayerWithChapters from '../components/VideoPlayerWithChapters';
import VideoGenWorkflowStepper from '../components/VideoGenWorkflowStepper';
import dashboardStyles from '@/app/(presentation-generator)/(workspace)/dashboard/components/DashboardPage.module.css';
import styles from '../styles/videoGen.module.css';
import { createScene, type Scene } from '../data/themes';
import {
  defaultVideoProviderConfig,
  resolveVideoAssetUrl,
  videoApi,
  type VideoProject,
  type VideoProjectEvent,
  type VideoProviderConfig,
  type VideoShot,
} from '../api/videoApi';
import {
  VIDEO_GEN_WORKFLOW_STEPS,
  type VideoGenWorkflowStep,
  isVideoGenWorkflowStepAvailable,
  resolveLastAvailableVideoGenWorkflowStep,
  resolvePreferredVideoGenWorkflowStep,
} from '../videoGenWorkflow';
import {
  coerceVideoPlannerProvider,
  getDefaultVideoPlannerProviderOptions,
  getPreferredVideoPlannerProvider,
  getVideoPlannerProviderOptions,
} from '../videoProviderConfig';

type SourceMode = 'text' | 'file';
type DrawerTab = 'projects' | 'history';
type GenerateSubview = 'overview' | 'events' | 'result';

interface NewProjectDraft {
  title: string;
  text: string;
  file: File | null;
  sourceMode: SourceMode;
  providerConfig: VideoProviderConfig;
}

const PIPELINE_STEPS = [
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

const STATUS_LABELS: Record<string, string> = {
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

const STEP_COPY: Record<
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

function buildEmptyDraft(): NewProjectDraft {
  return {
    title: '',
    text: '',
    file: null,
    sourceMode: 'text',
    providerConfig: { ...defaultVideoProviderConfig },
  };
}

function draftFromProject(project: VideoProject): NewProjectDraft {
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

function formatDate(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function sanitizeScenes(scenes: Scene[]): Scene[] {
  return scenes.map(({ _imagePreviewUrl, _layoutImagePreviewUrl, ...rest }) => rest);
}

function mergeStoryScripts(project: VideoProject, scenes: Scene[]): VideoProject {
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

function withDraftSettings(project: VideoProject, draft: NewProjectDraft): VideoProject {
  return {
    ...project,
    title: draft.title || project.title,
    provider_config: {
      ...project.provider_config,
      ...draft.providerConfig,
    },
  };
}

function planningProject(project: VideoProject, draft: NewProjectDraft): VideoProject {
  return {
    ...withDraftSettings(project, draft),
    status: 'planning',
    progress: Math.max(5, project.progress || 0),
    current_step: 'extract',
    latest_message: 'Generating scripts and scene plan...',
    latest_error: '',
  };
}

function resolveEffectiveSourceMode(
  draft: NewProjectDraft,
  project: VideoProject | null,
): SourceMode {
  if (draft.file) return 'file';
  if (draft.text.trim().length > 0) return 'text';
  if (project?.source.kind === 'file' && project.source.uploaded_file_path) return 'file';
  return 'text';
}

function DraggableScene({
  scene,
  idx,
  subtitles,
  onChange,
  onDelete,
}: {
  scene: Scene;
  idx: number;
  subtitles: boolean;
  onChange: (id: string, updated: Scene) => void;
  onDelete: (id: string) => void;
}) {
  const dragControls = useDragControls();
  return (
    <Reorder.Item
      value={scene}
      dragListener={false}
      dragControls={dragControls}
      style={{ listStyle: 'none' }}
    >
      <SceneCard
        scene={scene}
        idx={idx}
        subtitles={subtitles}
        onChange={onChange}
        onDelete={onDelete}
        dragControls={dragControls}
      />
    </Reorder.Item>
  );
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

export default function VideoGenPage() {
  const isEntranceActive = usePageEntrance();
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<VideoProject | null>(null);
  const [draft, setDraft] = useState<NewProjectDraft>(buildEmptyDraft);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('projects');
  const [sidebarLoading, setSidebarLoading] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [activeStep, setActiveStep] = useState<VideoGenWorkflowStep>('input');
  const [generateSubview, setGenerateSubview] = useState<GenerateSubview>('overview');
  const [aiConfig, setAiConfig] = useState<AIConfigResponse | null>(null);
  const streamCleanupRef = useRef<(() => void) | null>(null);

  const selectedProjectId = selectedProject?.id || '';
  const videoUrl = resolveVideoAssetUrl(selectedProject?.artifacts?.final_video?.public_path);
  const chaptersUrl = resolveVideoAssetUrl(selectedProject?.artifacts?.chapters?.public_path);
  const quizUrl = resolveVideoAssetUrl(selectedProject?.artifacts?.quiz?.public_path);
  const subtitlesEnabled = draft.providerConfig.subtitles;
  const shots = selectedProject?.shots || [];
  const plannerProviderOptions = useMemo(
    () =>
      aiConfig ? getVideoPlannerProviderOptions(aiConfig) : getDefaultVideoPlannerProviderOptions(),
    [aiConfig],
  );
  const pipelineEvents = useMemo(
    () => (selectedProject?.events || []).slice().reverse(),
    [selectedProject?.events],
  );
  const availableSteps = useMemo(
    () =>
      VIDEO_GEN_WORKFLOW_STEPS.filter((step) =>
        isVideoGenWorkflowStepAvailable(step, selectedProject),
      ),
    [selectedProject],
  );
  const cardCopy = STEP_COPY[activeStep];
  const hasRenderableProject = Boolean(selectedProject && selectedProject.scenes.length > 0);
  const isPlanning = selectedProject?.status === 'planning' || actionLoading === 'plan';
  const isRenderingProject = ['queued', 'running'].includes(selectedProject?.status || '');
  const existingFileName =
    selectedProject?.source.kind === 'file'
      ? selectedProject.source.source_filename || 'Stored source file'
      : '';

  const loadProjects = useCallback(async () => {
    setSidebarLoading(true);
    try {
      const page = await videoApi.listProjects(1, 24);
      setProjects(page.items);
    } catch {
      toast.error('Failed to load video projects.');
    } finally {
      setSidebarLoading(false);
    }
  }, []);

  const refreshProject = useCallback(async (projectId: string) => {
    if (!projectId) return;
    try {
      const project = await videoApi.getProject(projectId);
      setSelectedProject(project);
      setProjects((prev) => prev.map((item) => (item.id === project.id ? project : item)));
    } catch {
      // ignore background refresh errors
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    let active = true;

    const loadAiConfig = async () => {
      try {
        const config = await aiConfigApi.get();
        if (!active) return;
        setAiConfig(config);
      } catch {
        if (!active) return;
        setAiConfig(null);
      }
    };

    loadAiConfig();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    streamCleanupRef.current?.();
    streamCleanupRef.current = null;

    if (!selectedProjectId) return undefined;
    if (!['planning', 'queued', 'running'].includes(selectedProject?.status || '')) {
      return undefined;
    }

    streamCleanupRef.current = videoApi.projectStreamSSE(
      selectedProjectId,
      async () => {
        await refreshProject(selectedProjectId);
        await loadProjects();
      },
      (error) => toast.error(error),
    );

    return () => {
      streamCleanupRef.current?.();
      streamCleanupRef.current = null;
    };
  }, [loadProjects, refreshProject, selectedProject?.status, selectedProjectId]);

  useEffect(() => {
    if (!selectedProject) {
      if (activeStep !== 'input') {
        setActiveStep('input');
      }
      return;
    }

    if (!isVideoGenWorkflowStepAvailable(activeStep, selectedProject)) {
      setActiveStep(resolveLastAvailableVideoGenWorkflowStep(selectedProject));
    }
  }, [activeStep, selectedProject]);

  useEffect(() => {
    if (activeStep === 'generate' && videoUrl && generateSubview === 'overview') {
      setGenerateSubview('result');
    }
  }, [activeStep, generateSubview, videoUrl]);

  useEffect(() => {
    if (!aiConfig) return;

    const preferredProvider = getPreferredVideoPlannerProvider(aiConfig);
    const nextProvider = coerceVideoPlannerProvider(draft.providerConfig.provider, aiConfig);
    if (draft.providerConfig.provider !== nextProvider) {
      setDraft((prev) => ({
        ...prev,
        providerConfig: {
          ...prev.providerConfig,
          provider: nextProvider,
        },
      }));
    } else if (!selectedProject && draft.providerConfig.provider !== preferredProvider) {
      setDraft((prev) => ({
        ...prev,
        providerConfig: {
          ...prev.providerConfig,
          provider: preferredProvider,
        },
      }));
    }

    if (selectedProject) {
      const projectProvider = coerceVideoPlannerProvider(
        selectedProject.provider_config.provider,
        aiConfig,
      );
      if (projectProvider !== selectedProject.provider_config.provider) {
        setSelectedProject((prev) =>
          prev
            ? {
                ...prev,
                provider_config: {
                  ...prev.provider_config,
                  provider: projectProvider,
                },
              }
            : prev,
        );
      }
    }
  }, [aiConfig, draft.providerConfig.provider, selectedProject]);

  const handleSelectProject = useCallback(async (projectId: string) => {
    setWorkspaceLoading(true);
    try {
      const project = await videoApi.getProject(projectId);
      setSelectedProject(project);
      setDraft(draftFromProject(project));
      setActiveStep(resolvePreferredVideoGenWorkflowStep(project));
      setGenerateSubview(
        resolveVideoAssetUrl(project.artifacts?.final_video?.public_path)
          ? 'result'
          : 'overview',
      );
      setDrawerOpen(false);
    } catch {
      toast.error('Failed to open project.');
    } finally {
      setWorkspaceLoading(false);
    }
  }, []);

  const handleNewProject = useCallback(() => {
    setSelectedProject(null);
    setDraft(buildEmptyDraft());
    setActiveStep('input');
    setGenerateSubview('overview');
    setDrawerOpen(false);
  }, []);

  const handleProjectField = useCallback(
    <K extends keyof VideoProviderConfig>(key: K, value: VideoProviderConfig[K]) => {
      setDraft((prev) => ({
        ...prev,
        providerConfig: {
          ...prev.providerConfig,
          [key]: value,
        },
      }));
      setSelectedProject((prev) =>
        prev
          ? {
              ...prev,
              provider_config: {
                ...prev.provider_config,
                [key]: value,
              },
            }
          : prev,
      );
    },
    [],
  );

  const handleProjectTitle = useCallback((value: string) => {
    setDraft((prev) => ({ ...prev, title: value }));
    setSelectedProject((prev) => (prev ? { ...prev, title: value } : prev));
  }, []);

  const handleSourceText = useCallback((value: string) => {
    setDraft((prev) => ({
      ...prev,
      text: value,
      sourceMode: value.trim().length > 0 ? 'text' : prev.file ? 'file' : prev.sourceMode,
    }));
  }, []);

  const handleSourceFile = useCallback((file: File | null) => {
    setDraft((prev) => ({
      ...prev,
      file,
      sourceMode: file ? 'file' : prev.text.trim().length > 0 ? 'text' : prev.sourceMode,
    }));
  }, []);

  const handleSaveWorkspace = useCallback(async () => {
    if (!selectedProject) return;
    setActionLoading('save');
    try {
      const project = await videoApi.patchProject(selectedProject.id, {
        title: draft.title.trim(),
        scenes: sanitizeScenes(selectedProject.scenes),
        provider_config: draft.providerConfig,
      });
      setSelectedProject(project);
      setDraft((prev) => ({
        ...prev,
        title: project.title,
        providerConfig: { ...prev.providerConfig, ...project.provider_config },
      }));
      await loadProjects();
      toast.success('Project saved.');
    } catch {
      toast.error('Failed to save project.');
    } finally {
      setActionLoading('');
    }
  }, [draft.providerConfig, draft.title, loadProjects, selectedProject]);

  const validateSourceDraft = useCallback((): boolean => {
    const effectiveSourceMode = resolveEffectiveSourceMode(draft, selectedProject);
    const hasExistingFile =
      selectedProject?.source.kind === 'file' && Boolean(selectedProject.source.uploaded_file_path);

    if (effectiveSourceMode === 'text' && draft.text.trim().length < 20) {
      toast.error('Please enter more source text before generating scripts, or upload a source file.');
      return false;
    }
    if (effectiveSourceMode === 'file' && !draft.file && !hasExistingFile) {
      toast.error('Please choose a source file, or continue with a longer input prompt.');
      return false;
    }
    if (draft.providerConfig.avatar_mode !== 'none' && !draft.providerConfig.avatar_img_path) {
      toast.error('Please upload an avatar image when avatar mode is enabled.');
      return false;
    }
    return true;
  }, [draft, selectedProject]);

  const handleGenerateScripts = useCallback(async () => {
    if (!validateSourceDraft()) return;

    setActionLoading('plan');
    setActiveStep('script');

    try {
      const effectiveSourceMode = resolveEffectiveSourceMode(draft, selectedProject);
      let project: VideoProject;

      if (selectedProject) {
        const updatedSourceProject = await videoApi.updateProjectSource(selectedProject.id, {
          title: draft.title.trim(),
          text: draft.text,
          file: draft.file,
          sourceMode: effectiveSourceMode,
        });
        project = await videoApi.patchProject(updatedSourceProject.id, {
          title: draft.title.trim(),
          provider_config: draft.providerConfig,
        });
      } else {
        project = await videoApi.createProject({
          title: draft.title.trim(),
          text: draft.text,
          file: draft.file,
          providerConfig: draft.providerConfig,
        });
      }

      setSelectedProject(planningProject(project, draft));
      setDrawerOpen(false);

      const planned = await videoApi.planProject(project.id);
      setSelectedProject(planned);
      setDraft((prev) => ({
        ...prev,
        file: null,
        title: planned.title,
        providerConfig: {
          ...prev.providerConfig,
          ...planned.provider_config,
        },
      }));
      setActiveStep('script');
      await loadProjects();
      toast.success(selectedProject ? 'Scripts regenerated.' : 'Project created and scripted.');
    } catch {
      toast.error('Failed to generate scripts.');
    } finally {
      setActionLoading('');
    }
  }, [draft, loadProjects, selectedProject, validateSourceDraft]);

  const handleAvatarUpload = useCallback(
    async (file: File) => {
      setAvatarUploading(true);
      try {
        const result = await videoApi.uploadSceneImage(file);
        handleProjectField('avatar_img_path', String(result.path || ''));
        toast.success('Avatar uploaded.');
      } catch {
        toast.error('Failed to upload avatar.');
      } finally {
        setAvatarUploading(false);
      }
    },
    [handleProjectField],
  );

  const handleSceneChange = useCallback((sceneId: string, updated: Scene) => {
    setSelectedProject((prev) => {
      if (!prev) return prev;
      const scenes = prev.scenes.map((scene) => (scene.id === sceneId ? updated : scene));
      return mergeStoryScripts(prev, scenes);
    });
  }, []);

  const handleSceneDelete = useCallback((sceneId: string) => {
    setSelectedProject((prev) => {
      if (!prev) return prev;
      const scenes = prev.scenes.filter((scene) => scene.id !== sceneId);
      return mergeStoryScripts(prev, scenes);
    });
  }, []);

  const handleAddScene = useCallback(() => {
    setSelectedProject((prev) => {
      if (!prev) return prev;
      const scenes = [...prev.scenes, createScene('', prev.scenes.length)];
      return mergeStoryScripts(prev, scenes);
    });
  }, []);

  const handleReorderScenes = useCallback((nextScenes: Scene[]) => {
    setSelectedProject((prev) => (prev ? mergeStoryScripts(prev, nextScenes) : prev));
  }, []);

  const handleScriptEdit = useCallback((index: number, value: string) => {
    setSelectedProject((prev) => {
      if (!prev) return prev;
      const scenes = prev.scenes.map((scene, sceneIndex) =>
        sceneIndex === index ? { ...scene, script: value } : scene,
      );
      return mergeStoryScripts(prev, scenes);
    });
  }, []);

  const handleStepSelect = useCallback(
    (step: VideoGenWorkflowStep) => {
      const currentIndex = VIDEO_GEN_WORKFLOW_STEPS.indexOf(activeStep);
      const targetIndex = VIDEO_GEN_WORKFLOW_STEPS.indexOf(step);
      if (targetIndex < currentIndex && isVideoGenWorkflowStepAvailable(step, selectedProject)) {
        setActiveStep(step);
      }
    },
    [activeStep, selectedProject],
  );

  const handleRenderProject = useCallback(async () => {
    if (!selectedProject) return;
    setActionLoading('render');
    try {
      const result = await videoApi.renderProject(selectedProject.id, {
        title: draft.title.trim(),
        scenes: sanitizeScenes(selectedProject.scenes),
        provider_config: draft.providerConfig,
      });
      setSelectedProject(result.project);
      setActiveStep('generate');
      setGenerateSubview('overview');
      await loadProjects();
      toast.success('Render job started.');
    } catch {
      toast.error('Failed to start render.');
    } finally {
      setActionLoading('');
    }
  }, [draft.providerConfig, draft.title, loadProjects, selectedProject]);

  const renderProjectsList = () => (
    <div className={styles.projectList}>
      {sidebarLoading ? <div className={styles.emptyHint}>Refreshing project list...</div> : null}
      {!sidebarLoading && projects.length === 0 ? (
        <div className={styles.emptyHint}>
          Create your first `/video-gen` project to begin the wizard workflow.
        </div>
      ) : null}
      {projects.map((project) => (
        <button
          key={project.id}
          type="button"
          className={`${styles.projectRow} ${
            selectedProjectId === project.id ? styles.projectRowActive : ''
          }`}
          onClick={() => handleSelectProject(project.id)}
        >
          <div className={styles.projectRowTop}>
            <strong>{project.title || 'Untitled Project'}</strong>
            <span
              className={`${styles.statusBadge} ${
                styles[`status_${project.status}`] || ''
              }`}
            >
              {STATUS_LABELS[project.status] || project.status}
            </span>
          </div>
          <div className={styles.projectMetaRow}>
            <span>{project.metrics?.scene_count || 0} scenes</span>
            <span>{project.metrics?.shot_count || 0} shots</span>
            <span>{project.progress || 0}%</span>
          </div>
          <div className={styles.projectSubtitle}>
            {project.latest_message || formatDate(project.updated_at)}
          </div>
        </button>
      ))}
    </div>
  );

  const renderInputStep = () => {
    const providerFieldHint =
      aiConfig?.text.deepseek.api_key_set
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
                <input
                  value={draft.title}
                  onChange={(event) => handleProjectTitle(event.target.value)}
                />
              </label>

              <label className={cn(styles.fieldBlock, styles.inputPromptField)}>
                <span>Input Prompt</span>
                <textarea
                  className={cn(styles.textArea, styles.inputPromptArea)}
                  rows={14}
                  value={draft.text}
                  onChange={(event) => handleSourceText(event.target.value)}
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
                    onChange={(event) => handleSourceFile(event.target.files?.[0] || null)}
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
                      handleProjectField('lang', event.target.value as VideoProviderConfig['lang'])
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
                      handleProjectField(
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
                      handleProjectField(
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
                      handleProjectField(
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
                      handleProjectField(
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
                      handleProjectField(
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
                      handleProjectField(
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
                      handleProjectField(
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
                          if (file) handleAvatarUpload(file);
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
                    onChange={(event) => handleProjectField('subtitles', event.target.checked)}
                  />
                  <span>Enable subtitles</span>
                </label>

                <label className={styles.inlineCheck}>
                  <input
                    type="checkbox"
                    checked={draft.providerConfig.quiz_enabled}
                    onChange={(event) => handleProjectField('quiz_enabled', event.target.checked)}
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
                    onChange={(event) =>
                      handleProjectField('max_segments', Number(event.target.value))
                    }
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
                          handleProjectField('comfyui_base_url', event.target.value)
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
                          handleProjectField('default_negative_prompt', event.target.value)
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
                onClick={handleSaveWorkspace}
                disabled={actionLoading !== ''}
              >
                {actionLoading === 'save' ? 'Saving...' : 'Save Settings'}
              </Button>
            ) : null}
            {selectedProject?.scenes.length ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setActiveStep('script')}
              >
                Use Current Script
              </Button>
            ) : null}
            <Button type="button" onClick={handleGenerateScripts} disabled={actionLoading !== ''}>
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
  };

  const renderScriptStep = () => (
    <>
      <div className={styles.workflowStepBody}>
        {!selectedProject ? (
          <div className={styles.emptyHint}>
            Start from the input step to create a project and generate scripts.
          </div>
        ) : isPlanning ? (
          <div className={styles.scriptProgressShell}>
            <div className={styles.progressArea}>
              <div className={styles.progressBar}>
                <div style={{ width: `${selectedProject.progress || 0}%` }} />
              </div>
              <p>
                {selectedProject.progress || 0}% -{' '}
                {selectedProject.latest_message || 'Planning project scripts...'}
              </p>
            </div>
            <div className={styles.eventFeed}>
              {pipelineEvents.length === 0 ? (
                <div className={styles.emptyHint}>Waiting for planning events...</div>
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
          </div>
        ) : (
          <div className={styles.scriptStepGrid}>
            <section className={styles.workflowSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <h4>Scene Scripts</h4>
                  <p>Each scene script is editable before you move into the scene editor.</p>
                </div>
              </div>

              {selectedProject.scenes.length === 0 ? (
                <div className={styles.emptyHint}>
                  No planned scenes yet. Return to input and generate scripts from the current source.
                </div>
              ) : (
                <div className={styles.scriptPlannerList}>
                  {selectedProject.scenes.map((scene, index) => (
                    <label key={scene.id} className={styles.scriptPlannerItem}>
                      <span>Scene {index + 1}</span>
                      <textarea
                        rows={4}
                        value={scene.script}
                        onChange={(event) => handleScriptEdit(index, event.target.value)}
                      />
                    </label>
                  ))}
                </div>
              )}
            </section>

            <div className={styles.sideColumn}>
              <section className={styles.workflowSection}>
                <div className={styles.sectionHeader}>
                  <div>
                    <h4>Plan Snapshot</h4>
                    <p>Status, counts, and the current project planning context.</p>
                  </div>
                </div>
                <div className={styles.statsRow}>
                  <StatChip label="Scenes" value={selectedProject.metrics?.scene_count || 0} />
                  <StatChip label="Shots" value={selectedProject.metrics?.shot_count || 0} />
                  <StatChip
                    label="Status"
                    value={STATUS_LABELS[selectedProject.status] || selectedProject.status}
                  />
                  <StatChip label="Updated" value={formatDate(selectedProject.updated_at)} />
                </div>
              </section>

              <section className={styles.workflowSection}>
                <div className={styles.sectionHeader}>
                  <div>
                    <h4>Shot List</h4>
                    <p>AI-generated shot prompts from the current planner provider, ready for render.</p>
                  </div>
                </div>

                <div className={styles.shotList}>
                  {shots.length === 0 ? (
                    <div className={styles.emptyHint}>Shots appear after planning.</div>
                  ) : (
                    shots.map((shot: VideoShot) => (
                      <div key={shot.shot_id} className={styles.shotCard}>
                        <div className={styles.shotHeader}>
                          <strong>
                            Scene {shot.scene_order} / Shot {shot.shot_order}
                          </strong>
                          <span
                            className={`${styles.statusBadge} ${
                              styles[`status_${shot.status}`] || ''
                            }`}
                          >
                            {STATUS_LABELS[shot.status] || shot.status}
                          </span>
                        </div>
                        <div className={styles.shotMeta}>
                          <span>{shot.shot_type}</span>
                          <span>{shot.duration_seconds}s</span>
                          <span>{shot.provider || 'pending'}</span>
                        </div>
                        <p>{shot.visual_prompt}</p>
                        {shot.error ? <div className={styles.errorTip}>{shot.error}</div> : null}
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>

      <div className={styles.workflowFooter}>
        <div className={styles.workflowFooterActions}>
          <Button type="button" variant="ghost" onClick={() => setActiveStep('input')}>
            Back to Input
          </Button>
        </div>
        <div className={styles.workflowFooterActions}>
          <Button
            type="button"
            variant="outline"
            onClick={handleGenerateScripts}
            disabled={actionLoading !== ''}
          >
            {actionLoading === 'plan' ? 'Generating...' : 'Regenerate Script'}
          </Button>
          <Button
            type="button"
            onClick={() => setActiveStep('scene')}
            disabled={!selectedProject?.scenes.length}
          >
            Continue to Scene
          </Button>
        </div>
      </div>
    </>
  );

  const renderSceneStep = () => (
    <>
      <div className={styles.workflowStepBody}>
        {!selectedProject || selectedProject.scenes.length === 0 ? (
          <div className={styles.emptyHint}>
            Generate scripts first to create editable scenes.
          </div>
        ) : (
          <div className={styles.sceneStepShell}>
            <div className={styles.sceneStepToolbar}>
              <p>
                Reorder scenes, adjust narration, and refine the visual layout before rendering.
              </p>
              <div className={styles.summaryInline}>
                <span>{selectedProject.scenes.length} scenes</span>
                <span>{selectedProject.metrics?.shot_count || 0} shots</span>
              </div>
            </div>

            <div className={styles.sceneEditorWrap}>
              <Reorder.Group
                axis="y"
                values={selectedProject.scenes}
                onReorder={handleReorderScenes}
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                }}
              >
                {selectedProject.scenes.map((scene, index) => (
                  <DraggableScene
                    key={scene.id}
                    scene={scene}
                    idx={index}
                    subtitles={subtitlesEnabled}
                    onChange={handleSceneChange}
                    onDelete={handleSceneDelete}
                  />
                ))}
              </Reorder.Group>
            </div>
          </div>
        )}
      </div>

      <div className={styles.workflowFooter}>
        <div className={styles.workflowFooterActions}>
          <Button type="button" variant="ghost" onClick={() => setActiveStep('script')}>
            Back to Script
          </Button>
        </div>
        <div className={styles.workflowFooterActions}>
          <Button
            type="button"
            variant="outline"
            onClick={handleAddScene}
            disabled={!selectedProject || actionLoading !== ''}
          >
            Add Scene
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleSaveWorkspace}
            disabled={!selectedProject || actionLoading !== ''}
          >
            {actionLoading === 'save' ? 'Saving...' : 'Save Scenes'}
          </Button>
          <Button
            type="button"
            onClick={() => {
              void handleRenderProject();
            }}
            disabled={!selectedProject || selectedProject.scenes.length === 0 || actionLoading !== ''}
          >
            {actionLoading === 'render' ? 'Starting...' : 'Generate Video'}
          </Button>
        </div>
      </div>
    </>
  );

  const renderGenerateOverview = () => (
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

  const renderGenerateEvents = () => (
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

  const renderLiveRenderPanel = (variant: 'overview' | 'result') => {
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
  };

  const renderGenerateResult = () => (
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
        renderLiveRenderPanel('result')
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

  const renderGenerateStep = () => (
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
                onClick={() => setGenerateSubview('overview')}
              >
                Overview
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={generateSubview === 'events'}
                className={generateSubview === 'events' ? styles.subviewToggleActive : ''}
                onClick={() => setGenerateSubview('events')}
              >
                Events
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={generateSubview === 'result'}
                className={generateSubview === 'result' ? styles.subviewToggleActive : ''}
                onClick={() => setGenerateSubview('result')}
              >
                Result
              </button>
            </div>

            {generateSubview === 'overview' ? renderGenerateOverview() : null}
            {generateSubview === 'events' ? renderGenerateEvents() : null}
            {generateSubview === 'result' ? renderGenerateResult() : null}
          </>
        )}
      </div>

      <div className={styles.workflowFooter}>
        <div className={styles.workflowFooterActions}>
          <Button type="button" variant="ghost" onClick={() => setActiveStep('scene')}>
            Back to Scene
          </Button>
        </div>
        <div className={styles.workflowFooterActions}>
          <Button
            type="button"
            variant="outline"
            onClick={handleSaveWorkspace}
            disabled={!selectedProject || actionLoading !== ''}
          >
            {actionLoading === 'save' ? 'Saving...' : 'Save Project'}
          </Button>
          <Button
            type="button"
            onClick={handleRenderProject}
            disabled={
              !hasRenderableProject ||
              actionLoading !== '' ||
              isRenderingProject
            }
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

  const renderActiveStep = () => {
    switch (activeStep) {
      case 'input':
        return renderInputStep();
      case 'script':
        return renderScriptStep();
      case 'scene':
        return renderSceneStep();
      case 'generate':
        return renderGenerateStep();
      default:
        return null;
    }
  };

  return (
    <div className={styles.page}>
      <div
        className={cn(
          dashboardStyles.container,
          entranceStyles.workspaceEntrance,
          isEntranceActive && entranceStyles.workspaceEntranceActive,
        )}
      >
        <WelcomeBanner
          className={cn(dashboardStyles.banner, styles.videoBanner)}
          title="AI Teaching Video Generator"
          subtitle="Four-step workflow for prompt input, script planning, scene editing, and final video generation."
          variant="workspace"
        />

        <Card className={cn(dashboardStyles.sectionCard, styles.toolbarCard)}>
          <div className={styles.pageTopBar}>
            <div className={styles.workflowSummaryBar}>
              <span className={styles.workflowSummaryChip}>
                {selectedProject ? selectedProject.title || 'Untitled Project' : 'New draft'}
              </span>
              <span className={styles.workflowSummaryChip}>
                {selectedProject
                  ? STATUS_LABELS[selectedProject.status] || selectedProject.status
                  : '4-step wizard'}
              </span>
              {selectedProject ? (
                <>
                  <span className={styles.workflowSummaryChip}>
                    {selectedProject.metrics?.scene_count || 0} scenes
                  </span>
                  <span className={styles.workflowSummaryChip}>
                    {selectedProject.metrics?.shot_count || 0} shots
                  </span>
                </>
              ) : null}
            </div>
            <div className={styles.pageTopActions}>
              <Button type="button" variant="outline" onClick={loadProjects} disabled={sidebarLoading}>
                <i className="fas fa-rotate-right" /> Refresh
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDrawerOpen((prev) => !prev)}
              >
                <i className="fas fa-folder-open" /> Projects & History
              </Button>
              <Button type="button" onClick={handleNewProject}>
                New Project
              </Button>
            </div>
          </div>
        </Card>

        <div className={styles.stepperStage}>
          <VideoGenWorkflowStepper
            activeStep={activeStep}
            availableSteps={availableSteps}
            onStepSelect={handleStepSelect}
          />
        </div>

        <Card className={cn(dashboardStyles.sectionCard, styles.workflowCard)}>
          <div className={styles.workflowCardHeader}>
            <div className={styles.workflowHeaderCopy}>
              <span className={styles.workflowEyebrow}>{cardCopy.summary}</span>
              <h3>{cardCopy.title}</h3>
              <p>{cardCopy.description}</p>
            </div>
          </div>

          <div className={styles.workflowViewport}>{renderActiveStep()}</div>
        </Card>
      </div>

      <div
        className={`${styles.drawerBackdrop} ${drawerOpen ? styles.drawerBackdropOpen : ''}`}
        onClick={() => setDrawerOpen(false)}
      />
      <aside className={`${styles.historyDrawer} ${drawerOpen ? styles.historyDrawerOpen : ''}`}>
        <div className={styles.drawerHeader}>
          <div>
            <h3>Projects & History</h3>
            <p>Resume saved projects or inspect previous generated videos.</p>
          </div>
          <button
            type="button"
            className={styles.drawerClose}
            onClick={() => setDrawerOpen(false)}
            aria-label="Close project history drawer"
          >
            <i className="fas fa-xmark" />
          </button>
        </div>

        <div className={styles.drawerTabs} role="tablist" aria-label="Projects and history tabs">
          <button
            type="button"
            role="tab"
            aria-selected={drawerTab === 'projects'}
            className={drawerTab === 'projects' ? styles.drawerTabActive : ''}
            onClick={() => setDrawerTab('projects')}
          >
            Projects
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={drawerTab === 'history'}
            className={drawerTab === 'history' ? styles.drawerTabActive : ''}
            onClick={() => setDrawerTab('history')}
          >
            History
          </button>
        </div>

        <div className={styles.drawerBody}>
          {drawerTab === 'projects' ? (
            <>
              <div className={styles.drawerActions}>
                <Button type="button" variant="outline" onClick={loadProjects} disabled={sidebarLoading}>
                  Refresh List
                </Button>
                <Button type="button" onClick={handleNewProject}>
                  New Draft
                </Button>
              </div>
              {renderProjectsList()}
            </>
          ) : (
            <div className={styles.drawerHistoryWrap}>
              <VideoHistoryPanel />
            </div>
          )}
        </div>
      </aside>

      {workspaceLoading ? (
        <div className={styles.loadingMask}>Loading project workspace...</div>
      ) : null}
    </div>
  );
}
