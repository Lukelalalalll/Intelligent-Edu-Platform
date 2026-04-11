import React from 'react';
import { THEMES, type ThemeId } from '../data/themes';
import s from '../styles/sceneEditor.module.css';

interface Props {
  themeId: ThemeId;
  title: string;
  body: string;
  idx: number;
  subtitle?: string;
}

const SlidePreview: React.FC<Props> = ({ themeId, title, body, idx, subtitle }) => {
  const t = THEMES[themeId] ?? THEMES['dark-ocean'];
  return (
    <div className={s.slidePreview} style={{ background: t.bg }}>
      <div className={s.accentBar} style={{ background: t.accent }} />
      <div className={s.previewTitle} style={{ color: t.title }}>{title || `Slide ${idx + 1}`}</div>
      <div className={s.previewDivider} style={{ background: t.accent }} />
      <div className={s.previewBody} style={{ color: t.body }}>
        {body?.slice(0, 200) || '...'}
      </div>
      <div className={s.previewPage} style={{ color: t.body }}>{idx + 1}</div>
      {subtitle && (
        <div className={s.subtitleStrip}>{subtitle.slice(0, 80)}</div>
      )}
    </div>
  );
};

export default SlidePreview;
