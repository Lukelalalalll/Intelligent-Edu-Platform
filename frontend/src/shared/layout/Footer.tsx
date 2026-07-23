import { Link } from 'react-router-dom';
import { useI18n } from '@/shared/i18n';
import { useCookieConsent } from '@/shared/privacy/CookieConsentContext';
import styles from '../Layout.module.css';

export default function Footer() {
  const { t } = useI18n();
  const { openPreferences } = useCookieConsent();

  return (
    <footer className={styles.footer}>
      <div className={styles.footerContent}>
        <p>{t('footer.copyright')}</p>
        <div className={styles.footerLinks}>
          <Link to="/cookie-policy" className={styles.footerLink}>{t('privacy.footer.policy')}</Link>
          <button type="button" className={styles.footerLinkButton} onClick={openPreferences}>{t('privacy.footer.preferences')}</button>
        </div>
      </div>
    </footer>
  );
}
