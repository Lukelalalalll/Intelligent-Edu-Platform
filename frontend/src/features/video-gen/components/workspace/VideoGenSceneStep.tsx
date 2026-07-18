import Button from '@/shared/components/Button/Button';
import { Reorder, useDragControls } from 'framer-motion';

import type { Scene } from '../../data/themes';
import type { VideoProject } from '../../api/videoApi';
import SceneCard from '../SceneCard';
import styles from '../../styles/videoGen.module.css';

interface VideoGenSceneStepProps {
  selectedProject: VideoProject | null;
  subtitlesEnabled: boolean;
  actionLoading: string;
  onBackToScript: () => void;
  onAddScene: () => void;
  onSaveWorkspace: () => Promise<void>;
  onRenderProject: () => Promise<void>;
  onSceneChange: (sceneId: string, updated: Scene) => void;
  onSceneDelete: (sceneId: string) => void;
  onReorderScenes: (nextScenes: Scene[]) => void;
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

export default function VideoGenSceneStep({
  selectedProject,
  subtitlesEnabled,
  actionLoading,
  onBackToScript,
  onAddScene,
  onSaveWorkspace,
  onRenderProject,
  onSceneChange,
  onSceneDelete,
  onReorderScenes,
}: VideoGenSceneStepProps) {
  return (
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
                onReorder={onReorderScenes}
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
                    onChange={onSceneChange}
                    onDelete={onSceneDelete}
                  />
                ))}
              </Reorder.Group>
            </div>
          </div>
        )}
      </div>

      <div className={styles.workflowFooter}>
        <div className={styles.workflowFooterActions}>
          <Button type="button" variant="ghost" onClick={onBackToScript}>
            Back to Script
          </Button>
        </div>
        <div className={styles.workflowFooterActions}>
          <Button
            type="button"
            variant="outline"
            onClick={onAddScene}
            disabled={!selectedProject || actionLoading !== ''}
          >
            Add Scene
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onSaveWorkspace}
            disabled={!selectedProject || actionLoading !== ''}
          >
            {actionLoading === 'save' ? 'Saving...' : 'Save Scenes'}
          </Button>
          <Button
            type="button"
            onClick={() => {
              void onRenderProject();
            }}
            disabled={!selectedProject || selectedProject.scenes.length === 0 || actionLoading !== ''}
          >
            {actionLoading === 'render' ? 'Starting...' : 'Generate Video'}
          </Button>
        </div>
      </div>
    </>
  );
}
