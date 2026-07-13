import { useI18n } from '@/shared/i18n';
import styles from '../Layout.module.css';

export default function Footer() {
  const { t } = useI18n();

  return (
    <footer className={styles.footer}>
      <div className={styles.footerContent}>
        <p>{t('footer.copyright')}</p>
      </div>
    </footer>
  );
}
