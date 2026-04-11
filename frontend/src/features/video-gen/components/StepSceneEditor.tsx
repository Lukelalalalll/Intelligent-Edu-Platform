import React from 'react';
import type { Scene } from '../data/themes';
import { createScene } from '../data/themes';
import SceneCard from './SceneCard';
import s from '../styles/sceneEditor.module.css';
import vs from '../styles/videoGen.module.css';

interface Props {
  scenes: Scene[];
  setScenes: React.Dispatch<React.SetStateAction<Scene[]>>;
  subtitles: boolean;
  onNext: () => void;
  onBack: () => void;
}

const StepSceneEditor: React.FC<Props> = ({ scenes, setScenes, subtitles, onNext, onBack }) => {

  const updateScene = (idx: number, updated: Scene) => {
    setScenes(prev => {
      const next = [...prev];
      next[idx] = updated;
      return next;
    });
  };

  const deleteScene = (idx: number) => {
    setScenes(prev => prev.filter((_, i) => i !== idx));
  };

  const addScene = () => {
    setScenes(prev => [...prev, createScene('', prev.length)]);
  };

  return (
    <div className={vs.stepCard}>
      <h3><i className="fas fa-palette" style={{ marginRight: 8, color: '#7c3aed' }} />Scene Editor</h3>
      <div className={s.sceneEditorWrap}>
        {scenes.map((sc, i) => (
          <SceneCard
            key={sc.id}
            scene={sc}
            idx={i}
            subtitles={subtitles}
            onChange={updated => updateScene(i, updated)}
            onDelete={() => deleteScene(i)}
          />
        ))}
      </div>

      <div className={s.editorFooter}>
        <button className={s.addSceneBtn} onClick={addScene}>
          ＋ 添加场景
        </button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className={vs.secondaryBtn} onClick={onBack}>上一步</button>
          <button className={vs.primaryBtn} onClick={onNext} disabled={scenes.length === 0}>
            开始生成 <i className="fas fa-arrow-right" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default StepSceneEditor;
