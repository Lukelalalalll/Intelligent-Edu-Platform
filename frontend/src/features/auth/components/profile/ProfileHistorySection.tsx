import styles from '../../styles/profile.module.css';
import type { ProfileTranslator } from './types';

interface ProfileHistorySectionProps {
    ttlPermanent: boolean;
    ttlInput: string;
    ttlSaving: boolean;
    t: ProfileTranslator;
    onPermanentChange: (checked: boolean) => void;
    onTtlInputChange: (value: string) => void;
    onSave: () => void;
}

export function ProfileHistorySection({
    ttlPermanent,
    ttlInput,
    ttlSaving,
    t,
    onPermanentChange,
    onTtlInputChange,
    onSave,
}: ProfileHistorySectionProps) {
    return (
        <div className={styles.profileEditCard}>
            <div className={styles.cardHeader}>
                <h3><i className="fas fa-clock"></i> {t('profile.historyTitle')}</h3>
                <p className={styles.editSubtitle}>{t('profile.historySubtitle')}</p>
            </div>

            <div className={styles.cardScrollArea}>
                <div className={styles.formGroup}>
                    <label className={styles.checkboxLabel}>
                        <input
                            type="checkbox"
                            checked={ttlPermanent}
                            onChange={(event) => onPermanentChange(event.target.checked)}
                        />
                        {t('profile.keepPermanent')}
                    </label>
                </div>

                {!ttlPermanent && (
                    <div className={styles.formGroup}>
                        <label>{t('profile.autoDeleteAfter')}</label>
                        <div className={styles.inputWithIcon}>
                            <input
                                type="number"
                                min={1}
                                max={3650}
                                value={ttlInput}
                                onChange={(event) => onTtlInputChange(event.target.value)}
                                placeholder="90"
                            />
                            <i className={`fas fa-calendar-alt ${styles.inputIcon}`}></i>
                        </div>
                    </div>
                )}

                <button type="button" className={styles.btnSave} disabled={ttlSaving} onClick={onSave}>
                    {ttlSaving
                        ? <><i className="fas fa-spinner fa-spin"></i> {t('profile.saving')}</>
                        : <><i className="fas fa-save"></i> {t('profile.saveSetting')}</>}
                </button>
            </div>
        </div>
    );
}
