import { useEffect, useMemo, useRef, useState } from 'react';

import { loadGoogleIdentityScript, type GoogleButtonText } from '@/shared/auth/googleIdentity';

import styles from '../../styles/profile.module.css';
import type { GoogleBindingState, ProfileTranslator } from './types';

interface ProfileConnectionsSectionProps {
    googleBinding: GoogleBindingState;
    bindingLoading: boolean;
    linkingBusy: boolean;
    unlinkingBusy: boolean;
    t: ProfileTranslator;
    onBindGoogleCredential: (credential: string) => Promise<void>;
    onUnlinkGoogle: () => Promise<void>;
}

function formatLinkedAt(linkedAt: string | null) {
    if (!linkedAt) {
        return '';
    }
    const date = new Date(linkedAt);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

export function ProfileConnectionsSection({
    googleBinding,
    bindingLoading,
    linkingBusy,
    unlinkingBusy,
    t,
    onBindGoogleCredential,
    onUnlinkGoogle,
}: ProfileConnectionsSectionProps) {
    const buttonContainerRef = useRef<HTMLDivElement>(null);
    const clientId = useMemo(() => import.meta.env.VITE_GOOGLE_AUTH_CLIENT_ID?.trim() || '', []);
    const [isUnavailable, setIsUnavailable] = useState(false);

    useEffect(() => {
        if (bindingLoading || googleBinding.linked || !clientId || !buttonContainerRef.current) {
            return;
        }

        let cancelled = false;
        const buttonText: GoogleButtonText = 'continue_with';

        void loadGoogleIdentityScript()
            .then(() => {
                if (cancelled || !buttonContainerRef.current || !window.google?.accounts?.id) {
                    return;
                }

                const buttonContainer = buttonContainerRef.current;
                buttonContainer.innerHTML = '';
                window.google.accounts.id.initialize({
                    client_id: clientId,
                    callback: ({ credential }) => {
                        if (!credential || linkingBusy) {
                            return;
                        }
                        void onBindGoogleCredential(credential);
                    },
                });

                const width = Math.max(240, Math.floor(buttonContainer.clientWidth || 320));
                window.google.accounts.id.renderButton(buttonContainer, {
                    theme: 'outline',
                    size: 'large',
                    shape: 'pill',
                    text: buttonText,
                    width,
                });
                setIsUnavailable(false);
            })
            .catch(() => {
                if (!cancelled) {
                    setIsUnavailable(true);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [bindingLoading, clientId, googleBinding.linked, linkingBusy, onBindGoogleCredential]);

    const identityTitle = googleBinding.name || googleBinding.email || 'Google';
    const linkedAtText = formatLinkedAt(googleBinding.linkedAt);

    return (
        <div className={styles.profileEditCard}>
            <div className={styles.cardHeader}>
                <h3><i className="fas fa-link"></i> {t('profile.accountBindingTitle')}</h3>
                <p className={styles.editSubtitle}>{t('profile.accountBindingSubtitle')}</p>
            </div>

            <div className={styles.cardScrollArea}>
                <div className={styles.securitySummary}>
                    <span>{t('profile.googleStatus')}</span>
                    <strong>{googleBinding.linked ? t('profile.enabled') : t('profile.disabled')}</strong>
                </div>

                {bindingLoading ? (
                    <div className={styles.courseState}>{t('profile.connectionsLoading')}</div>
                ) : (
                    <>
                        <div className={styles.connectedAccountSummary}>
                            {googleBinding.avatarUrl ? (
                                <img className={styles.connectedAccountAvatar} src={googleBinding.avatarUrl} alt={identityTitle} />
                            ) : (
                                <div className={styles.connectedAccountAvatarFallback}>G</div>
                            )}
                            <div className={styles.connectedAccountMeta}>
                                <strong>{identityTitle}</strong>
                                <span>
                                    {googleBinding.linked
                                        ? googleBinding.email || t('profile.googleConnectedSummary')
                                        : t('profile.googleDisconnectedSummary')}
                                </span>
                                {linkedAtText ? <span>{t('profile.googleLinkedAt', { time: linkedAtText })}</span> : null}
                            </div>
                            <span className={styles.connectedAccountProvider}>Google</span>
                        </div>

                        <p className={styles.accountBindingHint}>
                            {googleBinding.linked ? t('profile.googleLinkedHint') : t('profile.googleLinkHint')}
                        </p>

                        {googleBinding.linked ? (
                            googleBinding.canUnlink ? (
                                <button
                                    type="button"
                                    className={styles.btnSave}
                                    disabled={unlinkingBusy}
                                    onClick={() => {
                                        void onUnlinkGoogle();
                                    }}
                                >
                                    {unlinkingBusy
                                        ? <><i className="fas fa-spinner fa-spin"></i> {t('profile.googleUnlinking')}</>
                                        : <><i className="fas fa-unlink"></i> {t('profile.googleUnlink')}</>}
                                </button>
                            ) : (
                                <div className={styles.courseState}>{t('profile.googleUnlinkRequiresPassword')}</div>
                            )
                        ) : !clientId || isUnavailable ? (
                            <div className={styles.courseState}>{t('auth.googleUnavailable')}</div>
                        ) : (
                            <div className={styles.profileGoogleButtonWrapper}>
                                <div
                                    ref={buttonContainerRef}
                                    className={styles.profileGoogleButtonContainer}
                                    data-testid="profile-google-bind-button"
                                />
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
