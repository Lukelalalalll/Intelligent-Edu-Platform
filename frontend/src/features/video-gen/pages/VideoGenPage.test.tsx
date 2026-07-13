import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VideoProject } from '../api/videoApi';
import { createScene } from '../data/themes';
import VideoGenPage from './VideoGenPage';

const {
  toastSuccess,
  toastError,
  mockVideoApi,
  mockVideoHistoryApi,
  mockAiConfigApi,
} = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  mockVideoApi: {
    createProject: vi.fn(),
    getProject: vi.fn(),
    listProjects: vi.fn(),
    patchProject: vi.fn(),
    planProject: vi.fn(),
    projectStreamSSE: vi.fn(() => vi.fn()),
    renderProject: vi.fn(),
    updateProjectSource: vi.fn(),
    uploadSceneImage: vi.fn(),
  },
  mockVideoHistoryApi: {
    getGenerationHistory: vi.fn(),
    getGenerationDetail: vi.fn(),
  },
  mockAiConfigApi: {
    get: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: toastSuccess,
    error: toastError,
  },
}));

vi.mock('@/shared/page-entrance/usePageEntrance', () => ({
  usePageEntrance: () => false,
}));

vi.mock('framer-motion', () => ({
  Reorder: {
    Group: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Item: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  },
  useDragControls: () => ({ start: vi.fn() }),
}));

vi.mock('../components/SceneCard', () => ({
  default: ({
    scene,
    idx,
    onChange,
  }: {
    scene: { id: string; script: string };
    idx: number;
    onChange: (id: string, updated: { id: string; script: string }) => void;
  }) => (
    <label>
      Scene Script {idx + 1}
      <input
        aria-label={`Scene Script ${idx + 1}`}
        value={scene.script}
        onChange={(event) => onChange(scene.id, { ...scene, script: event.target.value })}
      />
    </label>
  ),
}));

vi.mock('../components/VideoPlayerWithChapters', () => ({
  default: ({ videoUrl }: { videoUrl: string }) => (
    <div data-testid="video-player">{videoUrl}</div>
  ),
}));

vi.mock('@/features/ai-config/api/aiConfigApi', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/ai-config/api/aiConfigApi')
  >('@/features/ai-config/api/aiConfigApi');
  return {
    ...actual,
    aiConfigApi: mockAiConfigApi,
  };
});

vi.mock('../api/videoApi', async () => {
  const actual = await vi.importActual<typeof import('../api/videoApi')>('../api/videoApi');
  return {
    ...actual,
    resolveVideoAssetUrl: (assetPath?: string) =>
      assetPath ? `http://assets.local/${assetPath}` : '',
    videoApi: mockVideoApi,
    getGenerationHistory: mockVideoHistoryApi.getGenerationHistory,
    getGenerationDetail: mockVideoHistoryApi.getGenerationDetail,
  };
});

function makeProject(overrides: Partial<VideoProject> = {}): VideoProject {
  const scenes = overrides.scenes ?? [];
  const shots = overrides.shots ?? [];
  const metrics = overrides.metrics ?? {
    scene_count: scenes.length,
    shot_count: shots.length,
    status_counts: {},
    completed_shots: 0,
    failed_shots: 0,
  };

  return {
    id: overrides.id ?? 'project-1',
    title: overrides.title ?? 'Physics Motion',
    status: overrides.status ?? 'draft',
    progress: overrides.progress ?? 0,
    current_step: overrides.current_step ?? 'draft',
    latest_message: overrides.latest_message ?? 'Ready',
    latest_error: overrides.latest_error ?? '',
    source: overrides.source ?? {
      kind: 'text',
      text: 'Source material for the project.',
      source_filename: '',
      file_type: 'txt',
      uploaded_file_path: '',
    },
    provider_config: overrides.provider_config ?? {
      lang: 'zh',
      provider: 'local_ollama',
      audience: 'student',
      subtitles: true,
      subtitle_mode: 'hard_srt',
      brand_kit: 'none',
      animation_level: 'basic',
      tts_engine: 'edge_tts',
      avatar_mode: 'none',
      avatar_img_path: '',
      quiz_enabled: false,
      max_segments: 8,
      broll_provider: 'comfyui',
      comfyui_base_url: 'http://127.0.0.1:8188',
      comfyui_workflow_path: '',
      default_negative_prompt: '',
    },
    storyboard: overrides.storyboard ?? {
      scripts: scenes.map((scene) => scene.script || ''),
      scene_count: scenes.length,
      shot_count: shots.length,
    },
    scenes,
    shots,
    artifacts: overrides.artifacts ?? {},
    metrics,
    events: overrides.events ?? [],
    created_at: overrides.created_at ?? '2026-07-01T00:00:00Z',
    updated_at: overrides.updated_at ?? '2026-07-01T00:00:00Z',
    completed_at: overrides.completed_at,
  };
}

function makeAiConfig({ deepseek = false }: { deepseek?: boolean } = {}) {
  return {
    deepseek: {
      base_url: 'https://api.deepseek.com',
      api_key: '',
      api_key_set: deepseek,
      model: 'deepseek-v4-pro',
      stream: false,
      reasoning_effort: 'high' as const,
      thinking_type: 'enabled' as const,
      updated_at: null,
    },
    openai: {
      base_url: 'https://api.openai.com/v1',
      api_key: '',
      api_key_set: false,
      model: 'gpt-5.5',
      stream: false,
      updated_at: null,
    },
    bigmodel: {
      base_url: 'https://open.bigmodel.cn/api/paas/v4',
      api_key: '',
      api_key_set: false,
      text_model: 'glm-4.5-flash',
      image_model: 'glm-5v-flash',
      stream: false,
      updated_at: null,
    },
    text: {
      deepseek: {
        base_url: 'https://api.deepseek.com',
        api_key: '',
        api_key_set: deepseek,
        model: 'deepseek-v4-pro',
        stream: false,
        reasoning_effort: 'high' as const,
        thinking_type: 'enabled' as const,
        updated_at: null,
      },
      openai: {
        base_url: 'https://api.openai.com/v1',
        api_key: '',
        api_key_set: false,
        model: 'gpt-5.5',
        stream: false,
        updated_at: null,
      },
      bigmodel: {
        base_url: 'https://open.bigmodel.cn/api/paas/v4',
        api_key: '',
        api_key_set: false,
        model: 'glm-4.5-flash',
        stream: false,
        updated_at: null,
      },
    },
    multimodal: {
      openai: {
        base_url: 'https://api.openai.com/v1',
        api_key: '',
        api_key_set: false,
        model: 'gpt-4o',
        stream: false,
        updated_at: null,
      },
      bigmodel: {
        base_url: 'https://open.bigmodel.cn/api/paas/v4',
        api_key: '',
        api_key_set: false,
        model: 'glm-4.5-flash',
        stream: false,
        updated_at: null,
      },
    },
  };
}

describe('VideoGenPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAiConfigApi.get.mockResolvedValue(makeAiConfig());
    mockVideoApi.listProjects.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 24,
    });
    mockVideoApi.createProject.mockReset();
    mockVideoApi.getProject.mockReset();
    mockVideoApi.patchProject.mockReset();
    mockVideoApi.planProject.mockReset();
    mockVideoApi.projectStreamSSE.mockReturnValue(vi.fn());
    mockVideoApi.renderProject.mockReset();
    mockVideoApi.updateProjectSource.mockReset();
    mockVideoApi.uploadSceneImage.mockReset();
    mockVideoHistoryApi.getGenerationHistory.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 5,
    });
    mockVideoHistoryApi.getGenerationDetail.mockResolvedValue({
      id: 'history-1',
      result: '',
    });
  });

  it('renders the wizard-first input view with a visible source textarea', async () => {
    render(<VideoGenPage />);

    expect(await screen.findByTestId('video-gen-workflow-stepper')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/Paste the teaching material, course notes, or script seed here/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Projects & History/i })).toBeInTheDocument();
  });

  it('creates a project and immediately generates scripts in the script step', async () => {
    const createdProject = makeProject({
      id: 'created-project',
      title: 'Created Project',
    });
    const plannedProject = makeProject({
      id: 'created-project',
      title: 'Created Project',
      status: 'planned',
      scenes: [createScene('Scene one script', 0)],
      metrics: {
        scene_count: 1,
        shot_count: 1,
        status_counts: { pending: 1 },
        completed_shots: 0,
        failed_shots: 0,
      },
    });

    mockVideoApi.createProject.mockResolvedValue(createdProject);
    mockVideoApi.planProject.mockResolvedValue(plannedProject);

    render(<VideoGenPage />);

    fireEvent.change(
      await screen.findByPlaceholderText(
        /Paste the teaching material, course notes, or script seed here/i,
      ),
      { target: { value: 'This source text is definitely long enough to create a project.' } },
    );

    fireEvent.click(screen.getByRole('button', { name: /Create Project & Generate Script/i }));

    await waitFor(() => {
      expect(mockVideoApi.createProject).toHaveBeenCalledTimes(1);
      expect(mockVideoApi.planProject).toHaveBeenCalledWith('created-project');
    });
    expect(await screen.findByText('Scene Scripts')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Scene one script')).toBeInTheDocument();
  });

  it('restores a saved project and still lets the user edit source text from the input step', async () => {
    const draftProject = makeProject({
      id: 'draft-project',
      status: 'draft',
      scenes: [],
      source: {
        kind: 'text',
        text: 'Recovered lecture brief',
        source_filename: '',
        file_type: 'txt',
        uploaded_file_path: '',
      },
      metrics: {
        scene_count: 0,
        shot_count: 0,
        status_counts: {},
        completed_shots: 0,
        failed_shots: 0,
      },
      storyboard: {
        scripts: [],
        scene_count: 0,
        shot_count: 0,
      },
    });

    mockVideoApi.listProjects.mockResolvedValue({
      items: [draftProject],
      total: 1,
      page: 1,
      page_size: 24,
    });
    mockVideoApi.getProject.mockResolvedValue(draftProject);

    render(<VideoGenPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Projects & History/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Physics Motion|draft-project|Untitled/i }));
    expect(await screen.findByText('Script Planner')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Back to Input/i }));
    const textarea = await screen.findByPlaceholderText(
      /Paste the teaching material, course notes, or script seed here/i,
    );
    expect(textarea).toHaveValue('Recovered lecture brief');
  });

  it('regenerates scripts for an existing project through source update plus planning', async () => {
    const draftProject = makeProject({
      id: 'draft-project',
      status: 'draft',
      scenes: [],
      source: {
        kind: 'text',
        text: 'Recovered lecture brief',
        source_filename: '',
        file_type: 'txt',
        uploaded_file_path: '',
      },
      metrics: {
        scene_count: 0,
        shot_count: 0,
        status_counts: {},
        completed_shots: 0,
        failed_shots: 0,
      },
      storyboard: {
        scripts: [],
        scene_count: 0,
        shot_count: 0,
      },
    });
    const sourceUpdatedProject = makeProject({
      ...draftProject,
      title: 'Updated draft project',
      source: {
        ...draftProject.source,
        text: 'Freshened lecture brief for regeneration',
      },
    });
    const plannedProject = makeProject({
      ...sourceUpdatedProject,
      status: 'planned',
      scenes: [createScene('Regenerated scene script', 0)],
      metrics: {
        scene_count: 1,
        shot_count: 1,
        status_counts: { pending: 1 },
        completed_shots: 0,
        failed_shots: 0,
      },
    });

    mockVideoApi.listProjects.mockResolvedValue({
      items: [draftProject],
      total: 1,
      page: 1,
      page_size: 24,
    });
    mockVideoApi.getProject.mockResolvedValue(draftProject);
    mockVideoApi.updateProjectSource.mockResolvedValue(sourceUpdatedProject);
    mockVideoApi.patchProject.mockResolvedValue(sourceUpdatedProject);
    mockVideoApi.planProject.mockResolvedValue(plannedProject);

    render(<VideoGenPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Projects & History/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Physics Motion|draft-project|Untitled/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Back to Input/i }));

    fireEvent.change(
      await screen.findByPlaceholderText(
        /Paste the teaching material, course notes, or script seed here/i,
      ),
      { target: { value: 'Freshened lecture brief for regeneration' } },
    );

    fireEvent.click(screen.getByRole('button', { name: /Regenerate Script/i }));

    await waitFor(() => {
      expect(mockVideoApi.updateProjectSource).toHaveBeenCalledTimes(1);
      expect(mockVideoApi.planProject).toHaveBeenCalledWith('draft-project');
    });
    expect(await screen.findByDisplayValue('Regenerated scene script')).toBeInTheDocument();
  });

  it('starts rendering when continuing from scene editing into generate', async () => {
    const plannedProject = makeProject({
      id: 'planned-project',
      status: 'planned',
      current_step: 'shot_expand',
      progress: 24,
      latest_message: 'Project plan ready',
      scenes: [createScene('Scene one script', 0)],
      shots: [
        {
          shot_id: 'shot-1',
          scene_id: 'scene-1',
          scene_order: 1,
          shot_order: 1,
          shot_type: 'broll',
          duration_seconds: 4,
          visual_prompt: 'Campus establishing shot',
          negative_prompt: '',
          narration_text: 'Scene one script',
          status: 'pending',
          provider: '',
          audio_path: '',
          output_video_path: '',
          error: '',
        },
      ],
      metrics: {
        scene_count: 1,
        shot_count: 1,
        status_counts: { pending: 1 },
        completed_shots: 0,
        failed_shots: 0,
      },
    });
    const queuedProject = makeProject({
      ...plannedProject,
      status: 'queued',
      current_step: 'queued',
      progress: 2,
      latest_message: 'Render job enqueued',
    });

    mockVideoApi.createProject.mockResolvedValue(makeProject({ id: 'planned-project' }));
    mockVideoApi.planProject.mockResolvedValue(plannedProject);
    mockVideoApi.renderProject.mockResolvedValue({
      project: queuedProject,
      taskId: 'planned-project',
      projectId: 'planned-project',
    });

    render(<VideoGenPage />);

    fireEvent.change(
      await screen.findByPlaceholderText(
        /Paste the teaching material, course notes, or script seed here/i,
      ),
      { target: { value: 'This source text is definitely long enough to create a project.' } },
    );
    fireEvent.click(screen.getByRole('button', { name: /Create Project & Generate Script/i }));

    expect(await screen.findByText('Scene Scripts')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Continue to Scene/i }));
    expect(await screen.findByText(/Reorder scenes, adjust narration/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Generate Video/i }));

    await waitFor(() => {
      expect(mockVideoApi.renderProject).toHaveBeenCalledWith('planned-project', {
        title: 'Physics Motion',
        scenes: expect.any(Array),
        provider_config: expect.objectContaining({
          broll_provider: 'comfyui',
        }),
      });
    });
    expect(await screen.findByText('Generate Video')).toBeInTheDocument();
    expect(await screen.findByText('Render job enqueued')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Result/i }));

    expect(await screen.findByText('Rendering in progress')).toBeInTheDocument();
    expect(
      screen.queryByText('Final video will appear here after assembly completes.'),
    ).not.toBeInTheDocument();
  });

  it('opens the right drawer and switches to the history tab', async () => {
    render(<VideoGenPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Projects & History/i }));
    fireEvent.click(screen.getByRole('tab', { name: /History/i }));

    expect(await screen.findByText(/No generation history yet\./i)).toBeInTheDocument();
    expect(mockVideoHistoryApi.getGenerationHistory).toHaveBeenCalled();
  });

  it('shows the final result player for a completed project restored from the drawer', async () => {
    const completedProject = makeProject({
      id: 'completed-project',
      status: 'completed',
      progress: 100,
      current_step: 'publish',
      scenes: [createScene('Scene one script', 0)],
      artifacts: {
        final_video: {
          filename: 'final.mp4',
          public_path: 'artifacts/final.mp4',
        },
      },
      metrics: {
        scene_count: 1,
        shot_count: 1,
        status_counts: { muxed: 1 },
        completed_shots: 1,
        failed_shots: 0,
      },
      events: [
        {
          type: 'step_done',
          step: 'publish',
          message: 'Completed',
          ts: '2026-07-01T00:00:00Z',
          progress: 100,
        },
      ],
    });

    mockVideoApi.listProjects.mockResolvedValue({
      items: [completedProject],
      total: 1,
      page: 1,
      page_size: 24,
    });
    mockVideoApi.getProject.mockResolvedValue(completedProject);

    render(<VideoGenPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Projects & History/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Physics Motion|completed-project|Untitled/i }));

    expect(await screen.findByText('Generate Video')).toBeInTheDocument();
    expect(await screen.findByTestId('video-player')).toHaveTextContent(
      'http://assets.local/artifacts/final.mp4',
    );
    expect(screen.getByText('Final Video')).toBeInTheDocument();
  });
});
