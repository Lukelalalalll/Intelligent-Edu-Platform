import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import WelcomeBanner from '@/shared/components/WelcomeBanner';
import { useAuthStore } from '@/shared/store/useAuthStore';
import {
    aiConfigApi,
    DEFAULT_DEEPSEEK_CONFIG,
    DEFAULT_OPENAI_CONFIG,
    type DeepSeekConfig,
    type OpenAIConfig,
} from '../api/aiConfigApi';
import { DeepSeekConfigCard, OpenAIConfigCard } from '../components/ProviderConfigCards';
import {
    type ProviderId,
    type SlideDirection,
    type DeepSeekField,
    type OpenAIField,
    PROVIDER_OPTIONS,
    normalizeDeepSeekConfig,
    normalizeOpenAIConfig,
    buildDeepSeekPayload,
    buildOpenAIPayload,
} from '../utils/aiConfigHelpers';
import styles from '../styles/aiConfig.module.css';

export default function AIConfigPage() {
    const user = useAuthStore((state) => state.user);
    const [activeProvider, setActiveProvider] = useState<ProviderId>('deepseek');
    const [slideDirection, setSlideDirection] = useState<SlideDirection>('right');
    const [deepSeekForm, setDeepSeekForm] = useState<DeepSeekConfig>(DEFAULT_DEEPSEEK_CONFIG);
    const [openAIForm, setOpenAIForm] = useState<OpenAIConfig>(DEFAULT_OPENAI_CONFIG);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const accountLabel = user?.username || user?.email || 'Current account';

    const loadConfig = useCallback(async () => {
        setLoading(true);
        try {
            const data = await aiConfigApi.get();
            setDeepSeekForm(normalizeDeepSeekConfig(data.deepseek, DEFAULT_DEEPSEEK_CONFIG));
            setOpenAIForm(normalizeOpenAIConfig(data.openai, DEFAULT_OPENAI_CONFIG));
        } catch {
            toast.error('Failed to load AI config');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadConfig();
    }, [loadConfig]);

    const updateDeepSeekField = useCallback(<K extends DeepSeekField>(field: K, value: DeepSeekConfig[K]) => {
        setDeepSeekForm((current) => ({ ...current, [field]: value }));
    }, []);

    const updateOpenAIField = useCallback(<K extends OpenAIField>(field: K, value: OpenAIConfig[K]) => {
        setOpenAIForm((current) => ({ ...current, [field]: value }));
    }, []);

    const switchProvider = (provider: ProviderId) => {
        if (provider === activeProvider) return;
        const currentIndex = PROVIDER_OPTIONS.findIndex((item) => item.id === activeProvider);
        const nextIndex = PROVIDER_OPTIONS.findIndex((item) => item.id === provider);
        setSlideDirection(nextIndex > currentIndex ? 'right' : 'left');
        setActiveProvider(provider);
    };

    const saveDeepSeek = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSaving(true);
        try {
            const data = await aiConfigApi.updateDeepSeek(buildDeepSeekPayload(deepSeekForm, false));
            setDeepSeekForm(normalizeDeepSeekConfig(data.deepseek, DEFAULT_DEEPSEEK_CONFIG));
            toast.success('DeepSeek config saved');
        } catch {
            toast.error('Failed to save DeepSeek config');
        } finally {
            setSaving(false);
        }
    };

    const saveOpenAI = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSaving(true);
        try {
            const data = await aiConfigApi.updateOpenAI(buildOpenAIPayload(openAIForm, false));
            setOpenAIForm(normalizeOpenAIConfig(data.openai, DEFAULT_OPENAI_CONFIG));
            toast.success('OpenAI config saved');
        } catch {
            toast.error('Failed to save OpenAI config');
        } finally {
            setSaving(false);
        }
    };

    const clearDeepSeekApiKey = async () => {
        if (!deepSeekForm.api_key_set) return;
        setSaving(true);
        try {
            const data = await aiConfigApi.updateDeepSeek(buildDeepSeekPayload(deepSeekForm, true));
            setDeepSeekForm(normalizeDeepSeekConfig(data.deepseek, DEFAULT_DEEPSEEK_CONFIG));
            toast.success('API key cleared');
        } catch {
            toast.error('Failed to clear API key');
        } finally {
            setSaving(false);
        }
    };

    const clearOpenAIApiKey = async () => {
        if (!openAIForm.api_key_set) return;
        setSaving(true);
        try {
            const data = await aiConfigApi.updateOpenAI(buildOpenAIPayload(openAIForm, true));
            setOpenAIForm(normalizeOpenAIConfig(data.openai, DEFAULT_OPENAI_CONFIG));
            toast.success('API key cleared');
        } catch {
            toast.error('Failed to clear API key');
        } finally {
            setSaving(false);
        }
    };

    const resetDeepSeekDefaults = () => {
        setDeepSeekForm((current) => ({
            ...DEFAULT_DEEPSEEK_CONFIG,
            api_key: '',
            api_key_set: current.api_key_set,
            updated_at: current.updated_at,
        }));
    };

    const resetOpenAIDefaults = () => {
        setOpenAIForm((current) => ({
            ...DEFAULT_OPENAI_CONFIG,
            api_key: '',
            api_key_set: current.api_key_set,
            updated_at: current.updated_at,
        }));
    };

    const deepSeekPreview = useMemo(() => {
        const keyState = deepSeekForm.api_key.trim()
            ? 'New key pending save'
            : deepSeekForm.api_key_set
                ? 'Saved for account'
                : 'Not set';

        return [
            ['DEEPSEEK_API_KEY', keyState],
            ['base_url', deepSeekForm.base_url || DEFAULT_DEEPSEEK_CONFIG.base_url],
            ['model', deepSeekForm.model || DEFAULT_DEEPSEEK_CONFIG.model],
            ['reasoning_effort', deepSeekForm.reasoning_effort],
            ['extra_body.thinking.type', deepSeekForm.thinking_type],
            ['stream', String(deepSeekForm.stream)],
        ] as Array<[string, string]>;
    }, [deepSeekForm]);

    const openAIPreview = useMemo(() => {
        const keyState = openAIForm.api_key.trim()
            ? 'New key pending save'
            : openAIForm.api_key_set
                ? 'Saved for account'
                : 'Not set';

        return [
            ['OPENAI_API_KEY', keyState],
            ['base_url', openAIForm.base_url || DEFAULT_OPENAI_CONFIG.base_url],
            ['model', openAIForm.model || DEFAULT_OPENAI_CONFIG.model],
            ['stream', String(openAIForm.stream)],
        ] as Array<[string, string]>;
    }, [openAIForm]);

    return (
        <div className={styles.page}>
            <WelcomeBanner
                className={styles.aiConfigBanner}
                title={<><i className="fas fa-sliders-h" /> AI Config</>}
                subtitle="Account-bound provider credentials and runtime defaults"
                variant="workspace"
            />

            <div className={styles.providerStepperWrap} aria-label="AI provider selector" aria-busy={loading}>
                {PROVIDER_OPTIONS.map((provider, index) => {
                    const active = activeProvider === provider.id;
                    return (
                        <button
                            key={provider.id}
                            type="button"
                            className={`${styles.providerStepperItem} ${active ? styles.providerStepperItemActive : ''}`}
                            onClick={() => switchProvider(provider.id)}
                            disabled={loading || saving}
                        >
                            <span className={styles.providerStepperCircle}>
                                {active ? <i className={`fas ${provider.icon}`} /> : index + 1}
                            </span>
                            <span className={styles.providerStepperLabel}>{provider.label}</span>
                        </button>
                    );
                })}
            </div>

            <div className={styles.configArea} aria-busy={loading}>
                <div
                    key={activeProvider}
                    className={`${styles.providerPanel} ${slideDirection === 'right' ? styles.slideFromRight : styles.slideFromLeft}`}
                >
                    {activeProvider === 'deepseek' ? (
                        <DeepSeekConfigCard
                            accountLabel={accountLabel}
                            form={deepSeekForm}
                            preview={deepSeekPreview}
                            loading={loading}
                            saving={saving}
                            onFieldChange={updateDeepSeekField}
                            onSubmit={saveDeepSeek}
                            onResetDefaults={resetDeepSeekDefaults}
                            onClearApiKey={clearDeepSeekApiKey}
                        />
                    ) : (
                        <OpenAIConfigCard
                            accountLabel={accountLabel}
                            form={openAIForm}
                            preview={openAIPreview}
                            loading={loading}
                            saving={saving}
                            onFieldChange={updateOpenAIField}
                            onSubmit={saveOpenAI}
                            onResetDefaults={resetOpenAIDefaults}
                            onClearApiKey={clearOpenAIApiKey}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
