import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n, type Locale } from '@/shared/i18n';
import styles from './LanguageSwitcher.module.css';

export default function LanguageSwitcher() {
  const { locale, locales, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [renderMenu, setRenderMenu] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const activeLocale = locales.find((option) => option.code === locale) ?? locales[0];

  const openMenu = useCallback(() => {
    setRenderMenu(true);
    setOpen(true);
  }, []);

  const closeMenu = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeMenu();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeMenu, open]);

  const handleSelect = (nextLocale: Locale) => {
    setLocale(nextLocale);
    closeMenu();
  };

  return (
    <div className={styles.switcher} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => {
          if (open) {
            closeMenu();
          } else {
            openMenu();
          }
        }}
        aria-label={t('language.switcher.label')}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('language.switcher.title')}
      >
        <i className="fas fa-language" aria-hidden="true" />
        <span>{activeLocale.shortLabel}</span>
      </button>

      {renderMenu && (
        <div
          className={`${styles.menu} ${open ? styles.menuOpen : styles.menuClosing}`}
          role="menu"
          aria-label={t('language.switcher.title')}
          onAnimationEnd={() => {
            if (!open) setRenderMenu(false);
          }}
        >
          {locales.map((option) => (
            <button
              type="button"
              key={option.code}
              role="menuitemradio"
              aria-checked={option.code === locale}
              className={`${styles.option} ${option.code === locale ? styles.optionActive : ''}`}
              onClick={() => handleSelect(option.code)}
            >
              <span>{option.label}</span>
              {option.code === locale && <i className="fas fa-check" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
