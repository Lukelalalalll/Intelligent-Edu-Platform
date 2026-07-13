import { useThemeStore } from '../../store/useThemeStore';
import { useI18n } from '@/shared/i18n';
import styles from './ThemeToggle.module.css';

export default function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const { t } = useI18n();
  const label = theme === 'dark' ? t('theme.switchToLight') : t('theme.switchToDark');

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      <i className={`fas ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`} />
    </button>
  );
}
