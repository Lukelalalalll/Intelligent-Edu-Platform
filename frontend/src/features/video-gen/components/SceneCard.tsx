import React, { useRef } from 'react';
import type { Scene, ThemeId } from '../data/themes';
import { videoApi } from '../../../api/api';
import ThemePicker from './ThemePicker';
import SlidePreview from './SlidePreview';
import s from '../styles/sceneEditor.module.css';

interface Props {
  scene: Scene;
  idx: number;
  subtitles: boolean;
  onChange: (updated: Scene) => void;
  onDelete: () => void;
}

const SceneCard: React.FC<Props> = ({ scene, idx, subtitles, onChange, onDelete }) => {
  const fileRef = useRef<HTMLInputElement>(null);

  const patch = (partial: Partial<Scene>) => onChange({ ...scene, ...partial });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await videoApi.uploadSceneImage(file);
      patch({
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
          <span className={s.sceneIdx}>Scene {idx + 1}</span>
          <button className={s.deleteBtn} onClick={onDelete} title="删除此场景">✕</button>
        </div>

        {/* Script textarea */}
        <span className={s.label}>旁白脚本</span>
        <textarea
          className={`${s.inputSmall} ${s.scriptArea}`}
          value={scene.script}
          onChange={e => patch({ script: e.target.value })}
          placeholder="输入本场景的旁白文字..."
        />

        {/* Title + Body */}
        <span className={s.label}>幻灯片标题</span>
        <input
          className={s.inputSmall}
          value={scene.slideTitle}
          onChange={e => patch({ slideTitle: e.target.value })}
          placeholder="标题"
        />
        <span className={s.label}>幻灯片正文</span>
        <textarea
          className={`${s.inputSmall} ${s.scriptArea}`}
          value={scene.slideBody}
          onChange={e => patch({ slideBody: e.target.value })}
          placeholder="正文内容..."
          style={{ minHeight: 44 }}
        />

        {/* Theme picker (only for theme mode) */}
        {scene.slideMode === 'theme' && (
          <>
            <span className={s.label}>主题色</span>
            <ThemePicker value={scene.themeId} onChange={(id: ThemeId) => patch({ themeId: id })} />
          </>
        )}
      </div>

      <div className={s.sceneRight}>
        {/* Mode toggle */}
        <div className={s.modeRow}>
          <button
            className={`${s.modePill} ${scene.slideMode === 'theme' ? s.active : ''}`}
            onClick={() => patch({ slideMode: 'theme' })}
          >
            主题色
          </button>
          <button
            className={`${s.modePill} ${scene.slideMode === 'image' ? s.active : ''}`}
            onClick={() => patch({ slideMode: 'image' })}
          >
            自定义图片
          </button>
        </div>

        {/* Preview / Image upload */}
        {scene.slideMode === 'theme' ? (
          <SlidePreview
            themeId={scene.themeId}
            title={scene.slideTitle}
            body={scene.slideBody}
            idx={idx}
            subtitle={subtitles ? scene.script?.slice(0, 80) : undefined}
          />
        ) : (
          <div className={s.imgUploadZone} onClick={() => fileRef.current?.click()}>
            {scene._imagePreviewUrl ? (
              <img src={scene._imagePreviewUrl} alt="scene bg" />
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
};

export default SceneCard;
