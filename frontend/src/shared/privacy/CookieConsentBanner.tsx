import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings2, ShieldCheck, X } from 'lucide-react';

import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/shared/i18n';
import { useCookieConsent } from './CookieConsentContext';
import styles from './CookieConsentBanner.module.css';

export default function CookieConsentBanner() {
  const { t } = useI18n();
  const {
    analyticsEnabled,
    closePreferences,
    isPreferencesOpen,
    isSaving,
    openPreferences,
    rejectNonEssential,
    savePreferences,
    shouldShowBanner,
    acceptAll,
  } = useCookieConsent();
  const [draftAnalyticsEnabled, setDraftAnalyticsEnabled] = useState(analyticsEnabled);

  useEffect(() => {
    if (isPreferencesOpen) {
      setDraftAnalyticsEnabled(analyticsEnabled);
    }
  }, [analyticsEnabled, isPreferencesOpen]);

  return (
    <>
      {shouldShowBanner ? (
        <div className={styles.bannerWrap} role="region" aria-label={t('privacy.banner.regionLabel')}>
          <div className={styles.bannerCard}>
            <div className={styles.bannerContent}>
              <div>
                <p className={styles.eyebrow}>{t('privacy.banner.eyebrow')}</p>
                <h2 className={styles.title}>{t('privacy.banner.title')}</h2>
                <p className={styles.description}>
                  {t('privacy.banner.descriptionBeforeLink')}{' '}
                  <Link className={styles.inlineLink} to="/cookie-policy">
                    {t('privacy.banner.policyLink')}
                  </Link>
                </p>
              </div>

              <div className={styles.bannerActions}>
                <button type="button" className={styles.ghostButton} onClick={openPreferences}>
                  {t('privacy.banner.customize')}
                </button>
                <button type="button" className={styles.secondaryButton} onClick={() => void rejectNonEssential()}>
                  {t('privacy.banner.reject')}
                </button>
                <button type="button" className={styles.primaryButton} onClick={() => void acceptAll()}>
                  {t('privacy.banner.accept')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isPreferencesOpen ? (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="cookie-preferences-title">
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <div>
                <h2 id="cookie-preferences-title" className={styles.modalTitle}>{t('privacy.modal.title')}</h2>
                <p className={styles.modalDescription}>{t('privacy.modal.description')}</p>
              </div>

              <button type="button" className={styles.closeButton} aria-label={t('privacy.modal.close')} onClick={closePreferences}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className={styles.categoryList}>
              <section className={styles.categoryCard}>
                <div className={styles.categoryRow}>
                  <div>
                    <h3 className={styles.categoryTitle}>{t('privacy.category.essentialTitle')}</h3>
                    <p className={styles.categoryText}>{t('privacy.category.essentialDescription')}</p>
                  </div>

                  <div className={styles.alwaysOn}>
                    <ShieldCheck className="h-4 w-4" />
                    {t('privacy.category.alwaysOn')}
                  </div>
                </div>
              </section>

              <section className={styles.categoryCard}>
                <div className={styles.categoryRow}>
                  <div>
                    <h3 className={styles.categoryTitle}>{t('privacy.category.analyticsTitle')}</h3>
                    <p className={styles.categoryText}>{t('privacy.category.analyticsDescription')}</p>
                  </div>

                  <Switch
                    aria-label={t('privacy.category.analyticsToggle')}
                    checked={draftAnalyticsEnabled}
                    onCheckedChange={setDraftAnalyticsEnabled}
                    disabled={isSaving}
                    className="data-[state=checked]:bg-[#5146E5]"
                  />
                </div>
              </section>
            </div>

            <div className={styles.modalActions}>
              <Link className={styles.ghostButton} to="/cookie-policy">
                {t('privacy.footer.policy')}
              </Link>
              <button type="button" className={styles.secondaryButton} onClick={() => void rejectNonEssential()} disabled={isSaving}>
                {t('privacy.banner.reject')}
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => void savePreferences(draftAnalyticsEnabled)}
                disabled={isSaving}
              >
                <Settings2 className="mr-2 inline h-4 w-4" />
                {t('privacy.modal.save')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
