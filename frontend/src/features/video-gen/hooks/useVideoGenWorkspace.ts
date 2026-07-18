import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';

import {
  aiConfigApi,
  type AIConfigResponse,
} from '@/features/ai-config/api/aiConfigApi';

import {
  resolveVideoAssetUrl,
  videoApi,
  type VideoProject,
  type VideoProjectEvent,
  type VideoProviderConfig,
  type VideoShot,
} from '../api/videoApi';
import { createScene, type Scene } from '../data/themes';
import {
  VIDEO_GEN_WORKFLOW_STEPS,
  isVideoGenWorkflowStepAvailable,
  resolveLastAvailableVideoGenWorkflowStep,
  resolvePreferredVideoGenWorkflowStep,
  type VideoGenWorkflowStep,
} from '../videoGenWorkflow';
import {
  coerceVideoPlannerProvider,
  getDefaultVideoPlannerProviderOptions,
  getPreferredVideoPlannerProvider,
  getVideoPlannerProviderOptions,
} from '../videoProviderConfig';
import {
  STEP_COPY,
  buildEmptyDraft,
  draftFromProject,
  mergeStoryScripts,
  planningProject,
  resolveEffectiveSourceMode,
  resolveExistingFileName,
  sanitizeScenes,
  type DrawerTab,
  type GenerateSubview,
  type NewProjectDraft,
  type VideoPlannerProviderOption,
} from '../workspace/videoGenWorkspaceModel';

export interface VideoGenWorkspaceController {
  state: {
    projects: VideoProject[];
    selectedProject: VideoProject | null;
    draft: NewProjectDraft;
    drawerOpen: boolean;
    drawerTab: DrawerTab;
    sidebarLoading: boolean;
    workspaceLoading: boolean;
    actionLoading: string;
    avatarUploading: boolean;
    activeStep: VideoGenWorkflowStep;
    generateSubview: GenerateSubview;
    aiConfig: AIConfigResponse | null;
  };
  derived: {
    selectedProjectId: string;
    videoUrl: string;
    chaptersUrl: string;
    quizUrl: string;
    subtitlesEnabled: boolean;
    shots: VideoShot[];
    plannerProviderOptions: VideoPlannerProviderOption[];
    pipelineEvents: VideoProjectEvent[];
    availableSteps: VideoGenWorkflowStep[];
    cardCopy: (typeof STEP_COPY)[VideoGenWorkflowStep];
    hasRenderableProject: boolean;
    isPlanning: boolean;
    isRenderingProject: boolean;
    existingFileName: string;
  };
  actions: {
    loadProjects: () => Promise<void>;
    refreshProject: (projectId: string) => Promise<void>;
    handleSelectProject: (projectId: string) => Promise<void>;
    handleNewProject: () => void;
    handleProjectField: <K extends keyof VideoProviderConfig>(
      key: K,
      value: VideoProviderConfig[K],
    ) => void;
    handleProjectTitle: (value: string) => void;
    handleSourceText: (value: string) => void;
    handleSourceFile: (file: File | null) => void;
    handleSaveWorkspace: () => Promise<void>;
    handleGenerateScripts: () => Promise<void>;
    handleAvatarUpload: (file: File) => Promise<void>;
    handleSceneChange: (sceneId: string, updated: Scene) => void;
    handleSceneDelete: (sceneId: string) => void;
    handleAddScene: () => void;
    handleReorderScenes: (nextScenes: Scene[]) => void;
    handleScriptEdit: (index: number, value: string) => void;
    handleStepSelect: (step: VideoGenWorkflowStep) => void;
    handleRenderProject: () => Promise<void>;
    openDrawer: () => void;
    closeDrawer: () => void;
    toggleDrawer: () => void;
    setDrawerTab: (tab: DrawerTab) => void;
    setActiveStep: (step: VideoGenWorkflowStep) => void;
    setGenerateSubview: (subview: GenerateSubview) => void;
  };
}

export function useVideoGenWorkspace(): VideoGenWorkspaceController {
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
  const existingFileName = resolveExistingFileName(selectedProject);

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
      // Background refresh failures are non-blocking; the next manual refresh will retry.
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    let active = true;

    const loadAiConfig = async () => {
      try {
        const config = await aiConfigApi.get();
        if (active) setAiConfig(config);
      } catch {
        if (active) setAiConfig(null);
      }
    };

    void loadAiConfig();

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
    const projectSnapshot = selectedProject;
    if (!projectSnapshot) return;

    setActionLoading('save');
    try {
      const project = await videoApi.patchProject(projectSnapshot.id, {
        title: draft.title.trim(),
        scenes: sanitizeScenes(projectSnapshot.scenes),
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

    const projectSnapshot = selectedProject;
    const editingExistingProject = Boolean(projectSnapshot);

    setActionLoading('plan');
    setActiveStep('script');

    try {
      const effectiveSourceMode = resolveEffectiveSourceMode(draft, projectSnapshot);
      let project: VideoProject;

      if (projectSnapshot) {
        const updatedSourceProject = await videoApi.updateProjectSource(projectSnapshot.id, {
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
      toast.success(editingExistingProject ? 'Scripts regenerated.' : 'Project created and scripted.');
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
    const projectSnapshot = selectedProject;
    if (!projectSnapshot) return;

    setActionLoading('render');
    try {
      const result = await videoApi.renderProject(projectSnapshot.id, {
        title: draft.title.trim(),
        scenes: sanitizeScenes(projectSnapshot.scenes),
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

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setDrawerOpen((prev) => !prev), []);
  const selectDrawerTab = useCallback((tab: DrawerTab) => setDrawerTab(tab), []);
  const selectActiveStep = useCallback((step: VideoGenWorkflowStep) => setActiveStep(step), []);
  const selectGenerateSubview = useCallback(
    (subview: GenerateSubview) => setGenerateSubview(subview),
    [],
  );

  return {
    state: {
      projects,
      selectedProject,
      draft,
      drawerOpen,
      drawerTab,
      sidebarLoading,
      workspaceLoading,
      actionLoading,
      avatarUploading,
      activeStep,
      generateSubview,
      aiConfig,
    },
    derived: {
      selectedProjectId,
      videoUrl,
      chaptersUrl,
      quizUrl,
      subtitlesEnabled,
      shots,
      plannerProviderOptions,
      pipelineEvents,
      availableSteps,
      cardCopy,
      hasRenderableProject,
      isPlanning,
      isRenderingProject,
      existingFileName,
    },
    actions: {
      loadProjects,
      refreshProject,
      handleSelectProject,
      handleNewProject,
      handleProjectField,
      handleProjectTitle,
      handleSourceText,
      handleSourceFile,
      handleSaveWorkspace,
      handleGenerateScripts,
      handleAvatarUpload,
      handleSceneChange,
      handleSceneDelete,
      handleAddScene,
      handleReorderScenes,
      handleScriptEdit,
      handleStepSelect,
      handleRenderProject,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      setDrawerTab: selectDrawerTab,
      setActiveStep: selectActiveStep,
      setGenerateSubview: selectGenerateSubview,
    },
  };
}
