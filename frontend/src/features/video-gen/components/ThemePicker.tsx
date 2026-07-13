import React from 'react';
import { THEMES, THEME_IDS, type ThemeId } from '../data/themes';
import s from '../styles/sceneEditor.module.css';

interface Props {
  value: ThemeId;
  onChange: (id: ThemeId) => void;
}

const ThemePicker: React.FC<Props> = ({ value, onChange }) => (
  <div className={s.themePicker}>
    {THEME_IDS.map(id => (
      <div
        key={id}
        className={`${s.themeSwatch} ${id === value ? s.active : ''}`}
        style={{ background: THEMES[id].bg, boxShadow: `inset 0 -4px 0 ${THEMES[id].accent}` }}
        title={THEMES[id].label}
        onClick={() => onChange(id)}
      />
    ))}
  </div>
);

export default ThemePicker;
