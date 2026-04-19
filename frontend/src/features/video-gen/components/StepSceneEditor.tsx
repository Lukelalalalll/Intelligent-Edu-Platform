import React, { useCallback } from 'react';
import type { Scene } from '../data/themes';
import { createScene } from '../data/themes';
import SceneCard from './SceneCard';
import { Reorder, useDragControls } from 'framer-motion';
import s from '../styles/sceneEditor.module.css';
import vs from '../styles/videoGen.module.css';

interface Props {
  scenes: Scene[];
  setScenes: React.Dispatch<React.SetStateAction<Scene[]>>;
  subtitles: boolean;
  onNext: () => void;
  onBack: () => void;
}

const DraggableSceneCard: React.FC<{
  scene: Scene;
  idx: number;
  subtitles: boolean;
  onChange: (id: string, updated: Scene) => void;
  onDelete: (id: string) => void;
}> = ({ scene, idx, subtitles, onChange, onDelete }) => {
  const controls = useDragControls();
  return (
    <Reorder.Item value={scene} dragListener={false} dragControls={controls} style={{ marginBottom: 16 }}>
      <SceneCard
        scene={scene}
        idx={idx}
        subtitles={subtitles}
        onChange={onChange}
        onDelete={onDelete}
        dragControls={controls}
      />
    </Reorder.Item>
  );
};

const StepSceneEditor: React.FC<Props> = ({ scenes, setScenes, subtitles, onNext, onBack }) => {

  const updateScene = useCallback((id: string, updated: Scene) => {
    setScenes(prev => prev.map(s => s.id === id ? updated : s));
  }, [setScenes]);

  const deleteScene = useCallback((id: string) => {
    setScenes(prev => prev.filter(s => s.id !== id));
  }, [setScenes]);

  const addScene = useCallback(() => {
    setScenes(prev => [...prev, createScene('', prev.length)]);
  }, [setScenes]);

  return (
    <div className={vs.stepCard}>
      <div className={vs.stepTitle}>
        <div className={vs.stepIcon}><i className="fas fa-palette" /></div>
        Scene Editor
      </div>
      <div className={s.sceneEditorWrap}>
        <Reorder.Group axis="y" values={scenes} onReorder={setScenes} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {scenes.map((sc, i) => (
            <DraggableSceneCard
              key={sc.id}
              scene={sc}
              idx={i}
              subtitles={subtitles}
              onChange={updateScene}
              onDelete={deleteScene}
            />
          ))}
        </Reorder.Group>
      </div>

      <div className={s.editorFooter}>
        <button className={s.addSceneBtn} onClick={addScene}>
          + Add Scene
        </button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className={vs.secondaryBtn} onClick={onBack}>Back</button>
          <button className={vs.primaryBtn} onClick={onNext} disabled={scenes.length === 0}>
            Start Generation <i className="fas fa-arrow-right" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default StepSceneEditor;
