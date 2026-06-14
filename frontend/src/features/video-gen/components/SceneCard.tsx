import React, { useRef, useState, useEffect } from 'react';
import type { Scene, ThemeId, LayoutType, ToneMode } from '../data/themes';
import { LAYOUT_OPTIONS, TONE_OPTIONS } from '../data/themes';
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
  const bgFileRef = useRef<HTMLInputElement>(null);
  const layoutFileRef = useRef<HTMLInputElement>(null);

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

  const patchImmediate = (partial: Partial<Scene>) => {
    const updated = { ...localScene, ...partial };
    setLocalScene(updated);
    onChange(updated.id, updated);
  };

  const handleBgImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await videoApi.uploadSceneImage(file);
      patchImmediate({
        slideMode: 'image',
        customImagePath: res.path,
        _imagePreviewUrl: URL.createObjectURL(file),
      });
    } catch { /* ignore */ }
  };

  const handleLayoutImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await videoApi.uploadSceneImage(file);
      patchImmediate({
        layoutImagePath: res.path,
        _layoutImagePreviewUrl: URL.createObjectURL(file),
      });
    } catch { /* ignore */ }
  };

  const needsLayoutImage = ['image-left', 'image-right', 'image-top'].includes(localScene.layoutType);
  const isTwoColumn = localScene.layoutType === 'two-column';
  const isBigQuote = localScene.layoutType === 'big-quote';

  return (
    <div className={s.sceneCard}>
      <div className={s.sceneLeft}>
        {/* Header with drag + delete */}
        <div className={s.sceneHeader}>
          <div
            onPointerDown={(e) => dragControls?.start(e)}
            style={{ cursor: 'grab', marginRight: 12, color: '#999', fontSize: 16, touchAction: 'none', flexShrink: 0 }}
            title="Drag to reorder"
          >
            <i className="fas fa-grip-vertical" />
          </div>
          <span className={s.sceneIdx}>Scene {idx + 1}</span>
          <button className={s.deleteBtn} onClick={() => onDelete(localScene.id)} title="Delete this scene">✕</button>
        </div>

        {/* Script textarea */}
        <span className={s.label}>Narration Script</span>
        <textarea
          className={`${s.inputSmall} ${s.scriptArea}`}
          value={localScene.script}
          onChange={e => patchLocal({ script: e.target.value })}
          placeholder="Enter narration for this scene..."
        />

        {/* Tone selector */}
        <span className={s.label}>Tone Style</span>
        <div className={s.toneRow}>
          {TONE_OPTIONS.map(opt => (
            <button
              key={opt.id}
              className={`${s.tonePill} ${localScene.toneMode === opt.id ? s.active : ''}`}
              onClick={() => patchImmediate({ toneMode: opt.id })}
              title={opt.desc}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Title */}
        <span className={s.label}>Slide Title</span>
        <input
          className={s.inputSmall}
          value={localScene.slideTitle}
          onChange={e => patchLocal({ slideTitle: e.target.value })}
          placeholder="Title"
        />

        {/* Conditional fields based on layout */}
        {isBigQuote ? (
          <>
            <span className={s.label}>Quote Text</span>
            <textarea
              className={`${s.inputSmall} ${s.scriptArea}`}
              value={localScene.quoteText ?? ''}
              onChange={e => patchLocal({ quoteText: e.target.value })}
              placeholder="Key concept or quote..."
              style={{ minHeight: 60 }}
            />
          </>
        ) : isTwoColumn ? (
          <div className={s.twoColFields}>
            <div className={s.colField}>
              <span className={s.label}>Left Column Title</span>
              <input className={s.inputSmall} value={localScene.col1Title ?? ''} onChange={e => patchLocal({ col1Title: e.target.value })} placeholder="Left" />
              <span className={s.label}>Left Column Bullets (one per line)</span>
              <textarea
                className={`${s.inputSmall} ${s.scriptArea}`}
                value={(localScene.col1Bullets ?? []).join('\n')}
                onChange={e => patchLocal({ col1Bullets: e.target.value.split('\n') })}
                placeholder={'Bullet 1\nBullet 2'}
                style={{ minHeight: 60 }}
              />
            </div>
            <div className={s.colField}>
              <span className={s.label}>Right Column Title</span>
              <input className={s.inputSmall} value={localScene.col2Title ?? ''} onChange={e => patchLocal({ col2Title: e.target.value })} placeholder="Right" />
              <span className={s.label}>Right Column Bullets (one per line)</span>
              <textarea
                className={`${s.inputSmall} ${s.scriptArea}`}
                value={(localScene.col2Bullets ?? []).join('\n')}
                onChange={e => patchLocal({ col2Bullets: e.target.value.split('\n') })}
                placeholder={'Bullet 1\nBullet 2'}
                style={{ minHeight: 60 }}
              />
            </div>
          </div>
        ) : (
          <>
            <span className={s.label}>Slide Body</span>
            <textarea
              className={`${s.inputSmall} ${s.scriptArea}`}
              value={localScene.slideBody}
              onChange={e => patchLocal({ slideBody: e.target.value })}
              placeholder="Main content..."
              style={{ minHeight: 44 }}
            />
          </>
        )}

        {/* Layout image upload for image-left/right/top */}
        {needsLayoutImage && (
          <>
            <span className={s.label}>Embedded Layout Image</span>
            <div className={s.layoutImgUpload} onClick={() => layoutFileRef.current?.click()}>
              {localScene._layoutImagePreviewUrl ? (
                <img src={localScene._layoutImagePreviewUrl} alt="layout img" loading="lazy" decoding="async" />
              ) : (
                <span><i className="fas fa-image" /> Upload Image</span>
              )}
              <input ref={layoutFileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleLayoutImageUpload} />
            </div>
          </>
        )}

        {/* Theme picker */}
        <span className={s.label}>Theme Color</span>
        <ThemePicker value={localScene.themeId} onChange={(id: ThemeId) => patchImmediate({ themeId: id })} />
      </div>

      <div className={s.sceneRight}>
        {/* Layout type selector (6-grid) */}
        <span className={s.label}>Layout Type</span>
        <div className={s.layoutGrid}>
          {LAYOUT_OPTIONS.map(opt => (
            <button
              key={opt.id}
              className={`${s.layoutBtn} ${localScene.layoutType === opt.id ? s.active : ''}`}
              onClick={() => patchImmediate({ layoutType: opt.id })}
              title={opt.label}
            >
              <i className={`fas ${opt.icon}`} />
              <span>{opt.label}</span>
            </button>
          ))}
        </div>

        {/* Background toggle */}
        <div className={s.bgToggle}>
          <button
            className={`${s.modePill} ${localScene.slideMode === 'theme' ? s.active : ''}`}
            onClick={() => patchImmediate({ slideMode: 'theme' })}
          >
            Theme Background
          </button>
          <button
            className={`${s.modePill} ${localScene.slideMode === 'image' ? s.active : ''}`}
            onClick={() => bgFileRef.current?.click()}
          >
            Custom Background
          </button>
          <input ref={bgFileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleBgImageUpload} />
        </div>

        {/* Slide Preview */}
        <SlidePreview scene={localScene} idx={idx} subtitles={subtitles} />
      </div>
    </div>
  );
});

export default SceneCard;
