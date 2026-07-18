import WelcomeBanner from '@/shared/components/WelcomeBanner';
import Button from '@/shared/components/Button/Button';
import Card from '@/shared/components/Card/Card';
import { cn } from '@/lib/utils';
import entranceStyles from '@/shared/page-entrance/PageEntrance.module.css';
import dashboardStyles from '@/app/(presentation-generator)/(workspace)/dashboard/components/DashboardPage.module.css';

import type { VideoProject } from '../../api/videoApi';
import type { VideoGenWorkspaceController } from '../../hooks/useVideoGenWorkspace';
import type { DrawerTab } from '../../workspace/videoGenWorkspaceModel';
import { STATUS_LABELS, formatDate } from '../../workspace/videoGenWorkspaceModel';
import VideoHistoryPanel from '../HistoryPanel';
import VideoGenWorkflowStepper from '../VideoGenWorkflowStepper';
import VideoGenGenerateStep from './VideoGenGenerateStep';
import VideoGenInputStep from './VideoGenInputStep';
import VideoGenSceneStep from './VideoGenSceneStep';
import VideoGenScriptStep from './VideoGenScriptStep';
import styles from '../../styles/videoGen.module.css';

interface VideoGenWorkspaceViewProps {
  workspace: VideoGenWorkspaceController;
  isEntranceActive: boolean;
}

interface ProjectListProps {
  projects: VideoProject[];
  sidebarLoading: boolean;
  selectedProjectId: string;
  onSelectProject: (projectId: string) => Promise<void>;
}

function ProjectList({
  projects,
  sidebarLoading,
  selectedProjectId,
  onSelectProject,
}: ProjectListProps) {
  return (
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
          onClick={() => {
            void onSelectProject(project.id);
          }}
        >
          <div className={styles.projectRowTop}>
            <strong>{project.title || 'Untitled Project'}</strong>
            <span
              className={`${styles.statusBadge} ${styles[`status_${project.status}`] || ''}`}
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
}

interface ProjectDrawerProps extends ProjectListProps {
  drawerOpen: boolean;
  drawerTab: DrawerTab;
  onClose: () => void;
  onSetDrawerTab: (tab: DrawerTab) => void;
  onLoadProjects: () => Promise<void>;
  onNewProject: () => void;
}

function ProjectDrawer({
  drawerOpen,
  drawerTab,
  projects,
  sidebarLoading,
  selectedProjectId,
  onClose,
  onSetDrawerTab,
  onLoadProjects,
  onNewProject,
  onSelectProject,
}: ProjectDrawerProps) {
  return (
    <>
      <div
        className={`${styles.drawerBackdrop} ${drawerOpen ? styles.drawerBackdropOpen : ''}`}
        onClick={onClose}
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
            onClick={onClose}
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
            onClick={() => onSetDrawerTab('projects')}
          >
            Projects
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={drawerTab === 'history'}
            className={drawerTab === 'history' ? styles.drawerTabActive : ''}
            onClick={() => onSetDrawerTab('history')}
          >
            History
          </button>
        </div>

        <div className={styles.drawerBody}>
          {drawerTab === 'projects' ? (
            <>
              <div className={styles.drawerActions}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void onLoadProjects();
                  }}
                  disabled={sidebarLoading}
                >
                  Refresh List
                </Button>
                <Button type="button" onClick={onNewProject}>
                  New Draft
                </Button>
              </div>
              <ProjectList
                projects={projects}
                sidebarLoading={sidebarLoading}
                selectedProjectId={selectedProjectId}
                onSelectProject={onSelectProject}
              />
            </>
          ) : (
            <div className={styles.drawerHistoryWrap}>
              <VideoHistoryPanel />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

export default function VideoGenWorkspaceView({
  workspace,
  isEntranceActive,
}: VideoGenWorkspaceViewProps) {
  const { state, derived, actions } = workspace;
  const { selectedProject } = state;

  const renderActiveStep = () => {
    switch (state.activeStep) {
      case 'input':
        return (
          <VideoGenInputStep
            draft={state.draft}
            selectedProject={selectedProject}
            plannerProviderOptions={derived.plannerProviderOptions}
            actionLoading={state.actionLoading}
            avatarUploading={state.avatarUploading}
            existingFileName={derived.existingFileName}
            onProjectField={actions.handleProjectField}
            onProjectTitle={actions.handleProjectTitle}
            onSourceText={actions.handleSourceText}
            onSourceFile={actions.handleSourceFile}
            onAvatarUpload={actions.handleAvatarUpload}
            onSaveWorkspace={actions.handleSaveWorkspace}
            onUseCurrentScript={() => actions.setActiveStep('script')}
            onGenerateScripts={actions.handleGenerateScripts}
          />
        );
      case 'script':
        return (
          <VideoGenScriptStep
            selectedProject={selectedProject}
            shots={derived.shots}
            pipelineEvents={derived.pipelineEvents}
            isPlanning={derived.isPlanning}
            actionLoading={state.actionLoading}
            onBackToInput={() => actions.setActiveStep('input')}
            onGenerateScripts={actions.handleGenerateScripts}
            onContinueToScene={() => actions.setActiveStep('scene')}
            onScriptEdit={actions.handleScriptEdit}
          />
        );
      case 'scene':
        return (
          <VideoGenSceneStep
            selectedProject={selectedProject}
            subtitlesEnabled={derived.subtitlesEnabled}
            actionLoading={state.actionLoading}
            onBackToScript={() => actions.setActiveStep('script')}
            onAddScene={actions.handleAddScene}
            onSaveWorkspace={actions.handleSaveWorkspace}
            onRenderProject={actions.handleRenderProject}
            onSceneChange={actions.handleSceneChange}
            onSceneDelete={actions.handleSceneDelete}
            onReorderScenes={actions.handleReorderScenes}
          />
        );
      case 'generate':
        return (
          <VideoGenGenerateStep
            selectedProject={selectedProject}
            pipelineEvents={derived.pipelineEvents}
            videoUrl={derived.videoUrl}
            chaptersUrl={derived.chaptersUrl}
            quizUrl={derived.quizUrl}
            generateSubview={state.generateSubview}
            isRenderingProject={derived.isRenderingProject}
            hasRenderableProject={derived.hasRenderableProject}
            actionLoading={state.actionLoading}
            onBackToScene={() => actions.setActiveStep('scene')}
            onSaveWorkspace={actions.handleSaveWorkspace}
            onRenderProject={actions.handleRenderProject}
            onSelectSubview={actions.setGenerateSubview}
          />
        );
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
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void actions.loadProjects();
                }}
                disabled={state.sidebarLoading}
              >
                <i className="fas fa-rotate-right" /> Refresh
              </Button>
              <Button type="button" variant="outline" onClick={actions.toggleDrawer}>
                <i className="fas fa-folder-open" /> Projects & History
              </Button>
              <Button type="button" onClick={actions.handleNewProject}>
                New Project
              </Button>
            </div>
          </div>
        </Card>

        <div className={styles.stepperStage}>
          <VideoGenWorkflowStepper
            activeStep={state.activeStep}
            availableSteps={derived.availableSteps}
            onStepSelect={actions.handleStepSelect}
          />
        </div>

        <Card className={cn(dashboardStyles.sectionCard, styles.workflowCard)}>
          <div className={styles.workflowCardHeader}>
            <div className={styles.workflowHeaderCopy}>
              <span className={styles.workflowEyebrow}>{derived.cardCopy.summary}</span>
              <h3>{derived.cardCopy.title}</h3>
              <p>{derived.cardCopy.description}</p>
            </div>
          </div>

          <div className={styles.workflowViewport}>{renderActiveStep()}</div>
        </Card>
      </div>

      <ProjectDrawer
        drawerOpen={state.drawerOpen}
        drawerTab={state.drawerTab}
        projects={state.projects}
        sidebarLoading={state.sidebarLoading}
        selectedProjectId={derived.selectedProjectId}
        onClose={actions.closeDrawer}
        onSetDrawerTab={actions.setDrawerTab}
        onLoadProjects={actions.loadProjects}
        onNewProject={actions.handleNewProject}
        onSelectProject={actions.handleSelectProject}
      />

      {state.workspaceLoading ? (
        <div className={styles.loadingMask}>Loading project workspace...</div>
      ) : null}
    </div>
  );
}
