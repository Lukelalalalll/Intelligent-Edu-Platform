import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import WelcomeBanner from '@/shared/components/WelcomeBanner';
import entranceStyles from '@/shared/page-entrance/PageEntrance.module.css';
import { usePageEntrance } from '@/shared/page-entrance/usePageEntrance';
import { useAuthStore } from '@/shared/store/useAuthStore';
import {
    aiConfigApi,
    DEFAULT_BIGMODEL_CONFIG,
    DEFAULT_CLAUDE_CONFIG,
    DEFAULT_DEEPSEEK_CONFIG,
    DEFAULT_MINIMAX_CONFIG,
    DEFAULT_MULTIMODAL_OPENAI_CONFIG,
    DEFAULT_OPENAI_CONFIG,
    type BigModelConfig,
    type ClaudeConfig,
    type DeepSeekConfig,
    type MiniMaxConfig,
    type MultimodalOpenAIConfig,
    type OpenAIConfig,
} from '../api/aiConfigApi';
import {
    BigModelConfigCard,
    DeepSeekConfigCard,
    MiniMaxConfigCard,
    MultimodalOpenAIConfigCard,
    OpenAIConfigCard,
} from '../components/ProviderConfigCards';
import {
    CAPABILITY_OPTIONS,
    CAPABILITY_PROVIDER_OPTIONS,
    type CapabilityId,
    type BigModelField,
    type ClaudeField,
    type DeepSeekField,
    type MiniMaxField,
    type MultimodalOpenAIField,
    type OpenAIField,
    type ProviderId,
    buildBigModelPayload,
    buildClaudePayload,
    buildMiniMaxPayload,
    normalizeBigModelConfig,
    normalizeClaudeConfig,
    normalizeDeepSeekConfig,
    normalizeMiniMaxConfig,
    normalizeMultimodalOpenAIConfig,
    normalizeOpenAIConfig,
    CLAUDE_MODEL_OPTIONS,
    buildDeepSeekPayload,
    buildMultimodalOpenAIPayload,
    buildOpenAIPayload,
} from '../utils/aiConfigHelpers';
import styles from '../styles/aiConfig.module.css';

function buildPreviewRows(
    keyLabel: string,
    form: { api_key: string; api_key_set: boolean; base_url: string; model: string; stream: boolean },
    defaultModel: string,
    extras: Array<[string, string]> = [],
) {
    const keyState = form.api_key.trim()
        ? 'New key pending save'
        : form.api_key_set
            ? 'Saved for account'
            : 'Not set';

    return [
        [keyLabel, keyState],
        ['base_url', form.base_url],
        ['model', form.model || defaultModel],
        ...extras,
        ['stream', String(form.stream)],
    ] as Array<[string, string]>;
}

export default function AIConfigPage() {
    const isEntranceActive = usePageEntrance();
    const user = useAuthStore((state) => state.user);
    const [activeCapability, setActiveCapability] = useState<CapabilityId>('text');
    const [activeProvider, setActiveProvider] = useState<ProviderId>('deepseek');
    const [bigModelForm, setBigModelForm] = useState<BigModelConfig>(DEFAULT_BIGMODEL_CONFIG);
    const [claudeForm, setClaudeForm] = useState<ClaudeConfig>(DEFAULT_CLAUDE_CONFIG);
    const [deepSeekForm, setDeepSeekForm] = useState<DeepSeekConfig>(DEFAULT_DEEPSEEK_CONFIG);
    const [miniMaxForm, setMiniMaxForm] = useState<MiniMaxConfig>(DEFAULT_MINIMAX_CONFIG);
    const [openAIForm, setOpenAIForm] = useState<OpenAIConfig>(DEFAULT_OPENAI_CONFIG);
    const [multimodalOpenAIForm, setMultimodalOpenAIForm] = useState<MultimodalOpenAIConfig>(
        DEFAULT_MULTIMODAL_OPENAI_CONFIG,
    );
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const accountLabel = user?.username || user?.email || 'Current account';
    const providerOptions = CAPABILITY_PROVIDER_OPTIONS[activeCapability];

    const ensureCapabilityProvider = useCallback((capability: CapabilityId, provider: ProviderId) => {
        const nextOptions = CAPABILITY_PROVIDER_OPTIONS[capability];
        if (nextOptions.some((item) => item.id === provider)) {
            return provider;
        }
        return nextOptions[0]?.id || 'openai';
    }, []);

    const loadConfig = useCallback(async () => {
        setLoading(true);
        try {
            const data = await aiConfigApi.get();
            setBigModelForm(normalizeBigModelConfig(data.bigmodel, DEFAULT_BIGMODEL_CONFIG));
            setClaudeForm(normalizeClaudeConfig(data.text.claude, DEFAULT_CLAUDE_CONFIG));
            setDeepSeekForm(normalizeDeepSeekConfig(data.text.deepseek, DEFAULT_DEEPSEEK_CONFIG));
            setMiniMaxForm(normalizeMiniMaxConfig(data.minimax, DEFAULT_MINIMAX_CONFIG));
            setOpenAIForm(normalizeOpenAIConfig(data.text.openai, DEFAULT_OPENAI_CONFIG));
            setMultimodalOpenAIForm(
                normalizeMultimodalOpenAIConfig(
                    data.multimodal.openai,
                    DEFAULT_MULTIMODAL_OPENAI_CONFIG,
                ),
            );
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

    const updateClaudeField = useCallback(<K extends ClaudeField>(field: K, value: ClaudeConfig[K]) => {
        setClaudeForm((current) => ({ ...current, [field]: value }));
    }, []);

    const updateBigModelField = useCallback(<K extends BigModelField>(field: K, value: BigModelConfig[K]) => {
        setBigModelForm((current) => ({ ...current, [field]: value }));
    }, []);

    const updateMiniMaxField = useCallback(<K extends MiniMaxField>(field: K, value: MiniMaxConfig[K]) => {
        setMiniMaxForm((current) => ({ ...current, [field]: value }));
    }, []);

    const updateOpenAIField = useCallback(<K extends OpenAIField>(field: K, value: OpenAIConfig[K]) => {
        setOpenAIForm((current) => ({ ...current, [field]: value }));
    }, []);

    const updateMultimodalOpenAIField = useCallback(
        <K extends MultimodalOpenAIField>(field: K, value: MultimodalOpenAIConfig[K]) => {
            setMultimodalOpenAIForm((current) => ({ ...current, [field]: value }));
        },
        [],
    );

    const switchCapability = useCallback((capability: CapabilityId) => {
        if (capability === activeCapability) return;
        setActiveCapability(capability);
        setActiveProvider((current) => ensureCapabilityProvider(capability, current));
    }, [activeCapability, ensureCapabilityProvider]);

    const switchProvider = useCallback((provider: ProviderId) => {
        if (provider === activeProvider) return;
        setActiveProvider(provider);
    }, [activeProvider]);

    const saveDeepSeek = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSaving(true);
        try {
            const data = await aiConfigApi.updateDeepSeek(buildDeepSeekPayload(deepSeekForm, false));
            setDeepSeekForm(normalizeDeepSeekConfig(data.deepseek, DEFAULT_DEEPSEEK_CONFIG));
            toast.success('DeepSeek text config saved');
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
            toast.success('OpenAI text config saved');
        } catch {
            toast.error('Failed to save OpenAI config');
        } finally {
            setSaving(false);
        }
    };

    const saveClaude = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSaving(true);
        try {
            const data = await aiConfigApi.updateClaude(buildClaudePayload(claudeForm, false));
            setClaudeForm(normalizeClaudeConfig(data.claude, DEFAULT_CLAUDE_CONFIG));
            toast.success(activeCapability === 'multimodal' ? 'Claude multimodal config saved' : 'Claude text config saved');
        } catch {
            toast.error('Failed to save Claude config');
        } finally {
            setSaving(false);
        }
    };

    const saveBigModel = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSaving(true);
        try {
            const data = await aiConfigApi.updateBigModel(buildBigModelPayload(bigModelForm, false));
            setBigModelForm(normalizeBigModelConfig(data.bigmodel, DEFAULT_BIGMODEL_CONFIG));
            toast.success('BigModel / GLM config saved');
        } catch {
            toast.error('Failed to save BigModel config');
        } finally {
            setSaving(false);
        }
    };

    const saveMiniMax = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSaving(true);
        try {
            const data = await aiConfigApi.updateMiniMax(buildMiniMaxPayload(miniMaxForm, false));
            setMiniMaxForm(normalizeMiniMaxConfig(data.minimax, DEFAULT_MINIMAX_CONFIG));
            toast.success('MiniMax config saved');
        } catch {
            toast.error('Failed to save MiniMax config');
        } finally {
            setSaving(false);
        }
    };

    const saveMultimodalOpenAI = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSaving(true);
        try {
            const data = await aiConfigApi.updateMultimodalOpenAI(
                buildMultimodalOpenAIPayload(multimodalOpenAIForm, false),
            );
            setMultimodalOpenAIForm(
                normalizeMultimodalOpenAIConfig(data.openai, DEFAULT_MULTIMODAL_OPENAI_CONFIG),
            );
            toast.success('OpenAI multimodal config saved');
        } catch {
            toast.error('Failed to save multimodal OpenAI config');
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

    const clearClaudeApiKey = async () => {
        if (!claudeForm.api_key_set) return;
        setSaving(true);
        try {
            const data = await aiConfigApi.updateClaude(buildClaudePayload(claudeForm, true));
            setClaudeForm(normalizeClaudeConfig(data.claude, DEFAULT_CLAUDE_CONFIG));
            toast.success('API key cleared');
        } catch {
            toast.error('Failed to clear API key');
        } finally {
            setSaving(false);
        }
    };

    const clearMultimodalOpenAIApiKey = async () => {
        if (!multimodalOpenAIForm.api_key_set) return;
        setSaving(true);
        try {
            const data = await aiConfigApi.updateMultimodalOpenAI(
                buildMultimodalOpenAIPayload(multimodalOpenAIForm, true),
            );
            setMultimodalOpenAIForm(
                normalizeMultimodalOpenAIConfig(data.openai, DEFAULT_MULTIMODAL_OPENAI_CONFIG),
            );
            toast.success('API key cleared');
        } catch {
            toast.error('Failed to clear API key');
        } finally {
            setSaving(false);
        }
    };

    const clearBigModelApiKey = async () => {
        if (!bigModelForm.api_key_set) return;
        setSaving(true);
        try {
            const data = await aiConfigApi.updateBigModel(buildBigModelPayload(bigModelForm, true));
            setBigModelForm(normalizeBigModelConfig(data.bigmodel, DEFAULT_BIGMODEL_CONFIG));
            toast.success('API key cleared');
        } catch {
            toast.error('Failed to clear API key');
        } finally {
            setSaving(false);
        }
    };

    const clearMiniMaxApiKey = async () => {
        if (!miniMaxForm.api_key_set) return;
        setSaving(true);
        try {
            const data = await aiConfigApi.updateMiniMax(buildMiniMaxPayload(miniMaxForm, true));
            setMiniMaxForm(normalizeMiniMaxConfig(data.minimax, DEFAULT_MINIMAX_CONFIG));
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
            api_key: current.api_key,
            api_key_set: current.api_key_set,
            updated_at: current.updated_at,
        }));
    };

    const resetOpenAIDefaults = () => {
        setOpenAIForm((current) => ({
            ...DEFAULT_OPENAI_CONFIG,
            api_key: current.api_key,
            api_key_set: current.api_key_set,
            updated_at: current.updated_at,
        }));
    };

    const resetClaudeDefaults = () => {
        setClaudeForm((current) => ({
            ...DEFAULT_CLAUDE_CONFIG,
            api_key: current.api_key,
            api_key_set: current.api_key_set,
            updated_at: current.updated_at,
        }));
    };

    const resetBigModelDefaults = () => {
        setBigModelForm((current) => ({
            ...DEFAULT_BIGMODEL_CONFIG,
            api_key: current.api_key,
            api_key_set: current.api_key_set,
            updated_at: current.updated_at,
        }));
    };

    const resetMiniMaxDefaults = () => {
        setMiniMaxForm((current) => ({
            ...DEFAULT_MINIMAX_CONFIG,
            api_key: current.api_key,
            api_key_set: current.api_key_set,
            updated_at: current.updated_at,
        }));
    };

    const resetMultimodalOpenAIDefaults = () => {
        setMultimodalOpenAIForm((current) => ({
            ...DEFAULT_MULTIMODAL_OPENAI_CONFIG,
            api_key: current.api_key,
            api_key_set: current.api_key_set,
            updated_at: current.updated_at,
        }));
    };

    const deepSeekPreview = useMemo(
        () => buildPreviewRows(
            'DEEPSEEK_API_KEY',
            deepSeekForm,
            DEFAULT_DEEPSEEK_CONFIG.model,
            [
                ['reasoning_effort', deepSeekForm.reasoning_effort],
                ['extra_body.thinking.type', deepSeekForm.thinking_type],
            ],
        ),
        [deepSeekForm],
    );

    const openAIPreview = useMemo(
        () => buildPreviewRows('OPENAI_API_KEY', openAIForm, DEFAULT_OPENAI_CONFIG.model),
        [openAIForm],
    );

    const claudePreview = useMemo(
        () => buildPreviewRows(
            'ANTHROPIC_API_KEY',
            claudeForm,
            DEFAULT_CLAUDE_CONFIG.model,
            activeCapability === 'multimodal' ? [['mode', 'vision + text']] : [],
        ),
        [activeCapability, claudeForm],
    );

    const multimodalOpenAIPreview = useMemo(
        () => buildPreviewRows(
            'OPENAI_API_KEY',
            multimodalOpenAIForm,
            DEFAULT_MULTIMODAL_OPENAI_CONFIG.model,
            [['mode', 'vision + text']],
        ),
        [multimodalOpenAIForm],
    );

    const bigModelPreview = useMemo(
        () => buildPreviewRows(
            'BIGMODEL_API_KEY',
            {
                api_key: bigModelForm.api_key,
                api_key_set: bigModelForm.api_key_set,
                base_url: bigModelForm.base_url,
                model: activeCapability === 'text' ? bigModelForm.text_model : bigModelForm.image_model,
                stream: bigModelForm.stream,
            },
            activeCapability === 'text'
                ? DEFAULT_BIGMODEL_CONFIG.text_model
                : DEFAULT_BIGMODEL_CONFIG.image_model,
            [
                [
                    activeCapability === 'text' ? 'text_model' : 'image_model',
                    activeCapability === 'text'
                        ? (bigModelForm.text_model || DEFAULT_BIGMODEL_CONFIG.text_model)
                        : (bigModelForm.image_model || DEFAULT_BIGMODEL_CONFIG.image_model),
                ],
            ],
        ),
        [activeCapability, bigModelForm],
    );

    const miniMaxPreview = useMemo(() => {
        const activeModel = activeCapability === 'image'
            ? miniMaxForm.image_model
            : activeCapability === 'multimodal'
                ? miniMaxForm.multimodal_model
                : miniMaxForm.text_model;
        const activeBaseUrl = activeCapability === 'image' ? miniMaxForm.image_base_url : miniMaxForm.base_url;
        const activeKeyLabel = activeCapability === 'image'
            ? 'MINIMAX_IMAGE_API_KEY'
            : activeCapability === 'multimodal'
                ? 'MINIMAX_MULTIMODAL_API_KEY'
                : 'MINIMAX_API_KEY';
        const activeMode = activeCapability === 'image'
            ? 'image-only'
            : activeCapability === 'multimodal'
                ? 'multimodal'
                : 'text';
        return buildPreviewRows(
            activeKeyLabel,
            {
                api_key: miniMaxForm.api_key,
                api_key_set: miniMaxForm.api_key_set,
                base_url: activeBaseUrl,
                model: activeModel,
                stream: miniMaxForm.stream,
            },
            activeModel,
            [
                ['mode', activeMode],
                ['text_model', miniMaxForm.text_model || DEFAULT_MINIMAX_CONFIG.text_model],
                ['multimodal_model', miniMaxForm.multimodal_model || DEFAULT_MINIMAX_CONFIG.multimodal_model],
                ['image_model', miniMaxForm.image_model || DEFAULT_MINIMAX_CONFIG.image_model],
            ],
        );
    }, [activeCapability, miniMaxForm]);

    const capabilitySummary = useMemo(() => {
        const multimodalStatus = multimodalOpenAIForm.api_key_set
            ? `Configured · ${multimodalOpenAIForm.model || DEFAULT_MULTIMODAL_OPENAI_CONFIG.model}`
            : 'Not configured';
        const textStatus = [
            bigModelForm.api_key_set ? 'BigModel' : null,
            claudeForm.api_key_set ? 'Claude' : null,
            deepSeekForm.api_key_set ? 'DeepSeek' : null,
            miniMaxForm.api_key_set ? 'MiniMax' : null,
            openAIForm.api_key_set ? 'OpenAI' : null,
        ].filter(Boolean).join(' / ') || 'No text providers configured';

        const multimodalProviders = [
            multimodalOpenAIForm.api_key_set
                ? `OpenAI (${multimodalOpenAIForm.model || DEFAULT_MULTIMODAL_OPENAI_CONFIG.model})`
                : null,
            claudeForm.api_key_set
                ? `Claude (${claudeForm.model || DEFAULT_CLAUDE_CONFIG.model})`
                : null,
            bigModelForm.api_key_set
                ? `BigModel (${bigModelForm.image_model || DEFAULT_BIGMODEL_CONFIG.image_model})`
                : null,
            miniMaxForm.api_key_set
                ? `MiniMax (${miniMaxForm.multimodal_model || DEFAULT_MINIMAX_CONFIG.multimodal_model})`
                : null,
        ].filter(Boolean).join(' / ');

        const imageProviders = [
            miniMaxForm.api_key_set
                ? `MiniMax (${miniMaxForm.image_model || DEFAULT_MINIMAX_CONFIG.image_model})`
                : null,
        ].filter(Boolean).join(' / ');

        return {
            text: textStatus,
            multimodal: multimodalProviders || multimodalStatus,
            image: imageProviders || 'No image-only providers configured',
        };
    }, [
        bigModelForm.api_key_set,
        bigModelForm.image_model,
        claudeForm.api_key_set,
        claudeForm.model,
        deepSeekForm.api_key_set,
        miniMaxForm.api_key_set,
        miniMaxForm.image_model,
        miniMaxForm.multimodal_model,
        multimodalOpenAIForm.api_key_set,
        multimodalOpenAIForm.model,
        openAIForm.api_key_set,
    ]);

    const renderActiveCard = () => {
        if (activeProvider === 'bigmodel') {
            return (
                <BigModelConfigCard
                    accountLabel={accountLabel}
                    form={bigModelForm}
                    preview={bigModelPreview}
                    activeCapability={activeCapability === 'text' ? 'text' : 'multimodal'}
                    loading={loading}
                    saving={saving}
                    onFieldChange={updateBigModelField}
                    onSubmit={saveBigModel}
                    onResetDefaults={resetBigModelDefaults}
                    onClearApiKey={clearBigModelApiKey}
                />
            );
        }

        if (activeProvider === 'minimax') {
            return (
                <MiniMaxConfigCard
                    accountLabel={accountLabel}
                    form={miniMaxForm}
                    preview={miniMaxPreview}
                    activeCapability={activeCapability}
                    loading={loading}
                    saving={saving}
                    onFieldChange={updateMiniMaxField}
                    onSubmit={saveMiniMax}
                    onResetDefaults={resetMiniMaxDefaults}
                    onClearApiKey={clearMiniMaxApiKey}
                />
            );
        }

        if (activeProvider === 'claude') {
            return (
                <OpenAIConfigCard
                    accountLabel={accountLabel}
                    form={claudeForm}
                    preview={claudePreview}
                    loading={loading}
                    saving={saving}
                    onFieldChange={updateClaudeField}
                    onSubmit={saveClaude}
                    onResetDefaults={resetClaudeDefaults}
                    onClearApiKey={clearClaudeApiKey}
                    title={activeCapability === 'multimodal' ? 'Claude Vision' : 'Claude'}
                    eyebrow={activeCapability === 'multimodal' ? 'Multimodal Model' : 'Pure Text Model'}
                    ariaLabel="Claude configuration"
                    iconClassName="fa-comment-dots"
                    modelOptions={CLAUDE_MODEL_OPTIONS}
                />
            );
        }

        if (activeCapability === 'multimodal') {
            return (
                <MultimodalOpenAIConfigCard
                    accountLabel={accountLabel}
                    form={multimodalOpenAIForm}
                    preview={multimodalOpenAIPreview}
                    loading={loading}
                    saving={saving}
                    onFieldChange={updateMultimodalOpenAIField}
                    onSubmit={saveMultimodalOpenAI}
                    onResetDefaults={resetMultimodalOpenAIDefaults}
                    onClearApiKey={clearMultimodalOpenAIApiKey}
                />
            );
        }

        if (activeProvider === 'deepseek') {
            return (
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
            );
        }

        return (
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
                eyebrow="Pure Text Model"
            />
        );
    };

    return (
        <div className={styles.page}>
            <div
                className={`${styles.container} ${entranceStyles.workspaceEntrance} ${isEntranceActive ? entranceStyles.workspaceEntranceActive : ''}`}
            >
                <WelcomeBanner
                    className={styles.aiConfigBanner}
                    title={<><i className="fas fa-sliders-h" /> AI Config</>}
                    subtitle="Manage text and multimodal providers separately, while keeping PPT Generator generation defaults account-bound."
                    variant="workspace"
                />

                <section className={`${styles.capabilitySummaryGrid} ${styles.entrySection} ${styles.entrySectionSummary}`}>
                    <div className={styles.capabilitySummaryCard}>
                        <span>Pure Text Models</span>
                        <strong>{capabilitySummary.text}</strong>
                    </div>
                    <div className={styles.capabilitySummaryCard}>
                        <span>Multimodal Models</span>
                        <strong>{capabilitySummary.multimodal}</strong>
                    </div>
                    <div className={styles.capabilitySummaryCard}>
                        <span>Image-only Models</span>
                        <strong>{capabilitySummary.image}</strong>
                    </div>
                </section>

                <div
                    className={`${styles.capabilityTabs} ${styles.entrySection} ${styles.entrySectionTabs}`}
                    aria-label="AI capability selector"
                >
                    {CAPABILITY_OPTIONS.map((capability) => {
                        const active = activeCapability === capability.id;
                        return (
                            <button
                                key={capability.id}
                                type="button"
                                className={`${styles.capabilityTab} ${active ? styles.capabilityTabActive : ''}`}
                                onClick={() => switchCapability(capability.id)}
                                disabled={loading || saving}
                            >
                                <i className={`fas ${capability.icon}`} aria-hidden="true" />
                                <span>{capability.label}</span>
                            </button>
                        );
                    })}
                </div>

                <div className={`${styles.configSplit} ${styles.entrySection} ${styles.entrySectionMain}`} aria-busy={loading}>
                    <aside className={styles.providerRail} aria-label="AI provider selector">
                        {providerOptions.map((provider) => {
                            const active = activeProvider === provider.id;
                            return (
                                <button
                                    key={`${activeCapability}-${provider.id}`}
                                    type="button"
                                    className={`${styles.providerRailItem} ${active ? styles.providerRailItemActive : ''}`}
                                    onClick={() => switchProvider(provider.id)}
                                    disabled={loading || saving}
                                >
                                    <span className={styles.providerRailIcon}>
                                        <i className={`fas ${provider.icon}`} aria-hidden="true" />
                                    </span>
                                    <span className={styles.providerRailText}>
                                        <strong>{provider.label}</strong>
                                        <small>
                                            {activeCapability === 'image'
                                                ? 'Image generation'
                                                : activeCapability === 'multimodal'
                                                    ? 'Vision + text'
                                                    : 'Text generation'}
                                        </small>
                                    </span>
                                </button>
                            );
                        })}
                    </aside>

                    <div className={styles.providerContent}>
                        {renderActiveCard()}
                    </div>
                </div>
            </div>
        </div>
    );
}
