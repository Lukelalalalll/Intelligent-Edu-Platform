import React, { useRef, useState, useEffect } from 'react';
import type { Scene, ThemeId } from '../data/themes';
import { videoApi } from '../api/videoApi';
import ThemePicker from './ThemePicker';
import SlidePreview from './SlidePreview';
import s from '../styles/sceneEditor.module.css';
import { DragControls } from 'framer-motion';

interface Props {
  scene: Scene;
  idx: number;
  subtitles: boolean;
  onChange: (id: string, updated: Scene) => void;
  onDelete: (id: string) => void;
  dragControls?: DragControls;
}

const SceneCard: React.FC<Props> = React.memo(({ scene, idx, subtitles, onChange, onDelete, dragControls }) => {
  const fileRef = useRef<HTMLInputElement>(null);

  const [localScene, setLocalScene] = useState<Scene>(scene);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (!isTyping) {
      setLocalScene(scene);
    }
  }, [scene, isTyping]);

  useEffect(() => {
    if (!isTyping) return;
    const timer = setTimeout(() => {
      onChange(localScene.id, localScene);
      setIsTyping(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [localScene, isTyping, onChange]);

  const patchLocal = (partial: Partial<Scene>) => {
    setIsTyping(true);
    setLocalScene(prev => ({ ...prev, ...partial }));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await videoApi.uploadSceneImage(file);
      patchLocal({
        slideMode: 'image',
        customImagePath: res.path,
        _imagePreviewUrl: URL.createObjectURL(file),
      });
    } catch {
      /* ignore upload error */
    }
  };

  return (
    <div className={s.sceneCard}>
      <div className={s.sceneLeft}>
        <div className={s.sceneHeader}>
          <div
            onPointerDown={(e) => dragControls?.start(e)}
            style={{ cursor: 'grab', marginRight: 12, color: '#999', fontSize: 16, touchAction: 'none', flexShrink: 0 }}
            title="拖拽排序"
          >
            <i className="fas fa-grip-vertical" />
          </div>
          <span className={s.sceneIdx}>Scene {idx + 1}</span>
          <button className={s.deleteBtn} onClick={() => onDelete(localScene.id)} title="删除此场景">✕</button>
        </div>

        {/* Script textarea */}
        <span className={s.label}>旁白脚本</span>
        <textarea
          className={`${s.inputSmall} ${s.scriptArea}`}
          value={localScene.script}
          onChange={e => patchLocal({ script: e.target.value })}
          placeholder="输入本场景的旁白文字..."
        />

        {/* Title + Body */}
        <span className={s.label}>幻灯片标题</span>
        <input
          className={s.inputSmall}
          value={localScene.slideTitle}
          onChange={e => patchLocal({ slideTitle: e.target.value })}
          placeholder="标题"
        />
        <span className={s.label}>幻灯片正文</span>
        <textarea
          className={`${s.inputSmall} ${s.scriptArea}`}
          value={localScene.slideBody}
          onChange={e => patchLocal({ slideBody: e.target.value })}
          placeholder="正文内容..."
          style={{ minHeight: 44 }}
        />

        {/* Theme picker (only for theme mode) */}
        {localScene.slideMode === 'theme' && (
          <>
            <span className={s.label}>主题色</span>
            <ThemePicker value={localScene.themeId} onChange={(id: ThemeId) => patchLocal({ themeId: id })} />
          </>
        )}
      </div>

      <div className={s.sceneRight}>
        {/* Mode toggle */}
        <div className={s.modeRow}>
          <button
            className={`${s.modePill} ${localScene.slideMode === 'theme' ? s.active : ''}`}
            onClick={() => patchLocal({ slideMode: 'theme' })}
          >
            主题色
          </button>
          <button
            className={`${s.modePill} ${localScene.slideMode === 'image' ? s.active : ''}`}
            onClick={() => patchLocal({ slideMode: 'image' })}
          >
            自定义图片
          </button>
        </div>

        {/* Preview / Image upload */}
        {localScene.slideMode === 'theme' ? (
          <SlidePreview
            themeId={localScene.themeId}
            title={localScene.slideTitle}
            body={localScene.slideBody}
            idx={idx}
            subtitle={subtitles ? localScene.script?.slice(0, 80) : undefined}
          />
        ) : (
          <div className={s.imgUploadZone} onClick={() => fileRef.current?.click()}>
            {localScene._imagePreviewUrl ? (
              <img src={localScene._imagePreviewUrl} alt="scene bg" />
            ) : (
              <span>点击上传背景图</span>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={handleImageUpload}
            />
          </div>
        )}
      </div>
    </div>
  );
});

export default SceneCard;
