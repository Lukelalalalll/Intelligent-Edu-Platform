import React from 'react';
import { THEMES } from '../data/themes';
import type { Scene } from '../data/themes';
import s from '../styles/sceneEditor.module.css';

interface Props {
  scene: Scene;
  idx: number;
  subtitles: boolean;
}

const apiRoot = (import.meta.env.VITE_API_ROOT || 'http://localhost:5009').replace(/\/$/, '');

const SlidePreview: React.FC<Props> = ({ scene, idx, subtitles }) => {
  const t = THEMES[scene.themeId] ?? THEMES['dark-ocean'];
  const layout = scene.layoutType || 'title-bullets';

  const bgStyle: React.CSSProperties = scene.slideMode === 'image' && scene._imagePreviewUrl
    ? { backgroundImage: `url(${scene._imagePreviewUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: t.bg };

  const layoutImgSrc = scene._layoutImagePreviewUrl
    || (scene.layoutImagePath ? `${apiRoot}/${scene.layoutImagePath}` : '');

  const titleText = scene.slideTitle || `Slide ${idx + 1}`;

  const renderBody = () => {
    const bodyText = scene.slideBody || '';
    const bullets = bodyText.split('\n').filter(l => l.trim());
    return bullets.length > 0
      ? bullets.slice(0, 7).map((b, i) => <div key={i} style={{ color: t.body, fontSize: '10px', lineHeight: 1.5 }}>• {b}</div>)
      : <div style={{ color: t.body, fontSize: '10px', opacity: 0.7 }}>...</div>;
  };

  const renderTitle = () => (
    <div style={{ color: t.title, fontSize: '14px', fontWeight: 700, marginBottom: 4, letterSpacing: '0.02em' }}>{titleText}</div>
  );

  const renderDivider = () => (
    <div style={{ height: 1, background: t.accent, margin: '3px 0 5px', opacity: 0.6 }} />
  );

  const renderImgPlaceholder = (w: string, h: string) => (
    <div style={{ width: w, height: h, background: 'rgba(255,255,255,0.08)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
      {layoutImgSrc
        ? <img src={layoutImgSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <i className="fas fa-image" style={{ color: 'rgba(255,255,255,0.2)', fontSize: 18 }} />}
    </div>
  );

  const renderContent = () => {
    switch (layout) {
      case 'title-bullets':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '14px 16px', overflow: 'hidden' }}>
            <div className={s.accentBar} style={{ background: t.accent }} />
            {renderTitle()}
            {renderDivider()}
            <div style={{ flex: 1, overflow: 'hidden' }}>{renderBody()}</div>
          </div>
        );

      case 'image-left':
        return (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            {renderImgPlaceholder('40%', '100%')}
            <div style={{ flex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {renderTitle()}
              {renderDivider()}
              <div style={{ flex: 1, overflow: 'hidden' }}>{renderBody()}</div>
            </div>
          </div>
        );

      case 'image-right':
        return (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <div style={{ flex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {renderTitle()}
              {renderDivider()}
              <div style={{ flex: 1, overflow: 'hidden' }}>{renderBody()}</div>
            </div>
            {renderImgPlaceholder('40%', '100%')}
          </div>
        );

      case 'image-top':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            {renderImgPlaceholder('100%', '45%')}
            <div style={{ flex: 1, padding: '8px 14px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {renderTitle()}
              {renderDivider()}
              <div style={{ flex: 1, overflow: 'hidden' }}>{renderBody()}</div>
            </div>
          </div>
        );

      case 'big-quote':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '16px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 24, color: t.accent, marginBottom: 4, opacity: 0.5, fontFamily: 'serif' }}>❝</div>
            <div style={{ color: t.title, fontSize: 13, fontWeight: 700, lineHeight: 1.6, maxWidth: '90%' }}>
              {scene.quoteText || titleText}
            </div>
            <div style={{ marginTop: 8, color: t.body, fontSize: 9, opacity: 0.6 }}>── {titleText} ──</div>
          </div>
        );

      case 'two-column': {
        const col1 = (scene.col1Bullets ?? []).filter(b => b.trim());
        const col2 = (scene.col2Bullets ?? []).filter(b => b.trim());
        return (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '12px 14px', overflow: 'hidden' }}>
            {renderTitle()}
            {renderDivider()}
            <div style={{ display: 'flex', flex: 1, gap: 10, overflow: 'hidden' }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: t.accent, fontSize: 10, fontWeight: 700, marginBottom: 3 }}>{scene.col1Title || '左栏'}</div>
                {col1.slice(0, 5).map((b, i) => <div key={i} style={{ color: t.body, fontSize: 9, lineHeight: 1.5 }}>• {b}</div>)}
              </div>
              <div style={{ width: 1, background: t.accent, opacity: 0.3 }} />
              <div style={{ flex: 1 }}>
                <div style={{ color: t.accent, fontSize: 10, fontWeight: 700, marginBottom: 3 }}>{scene.col2Title || '右栏'}</div>
                {col2.slice(0, 5).map((b, i) => <div key={i} style={{ color: t.body, fontSize: 9, lineHeight: 1.5 }}>• {b}</div>)}
              </div>
            </div>
          </div>
        );
      }
    }
  };

  return (
    <div className={s.slidePreview} style={bgStyle}>
      {renderContent()}
      <div className={s.previewPage} style={{ color: t.body }}>{idx + 1}</div>
      {subtitles && scene.script && (
        <div className={s.subtitleStrip}>{scene.script.slice(0, 80)}</div>
      )}
    </div>
  );
};

export default SlidePreview;
