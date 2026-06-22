import React, { useState } from 'react';

import type {
    DeepSeekConfig,
    OpenAIConfig,
} from '../api/aiConfigApi';
import type {
    DeepSeekField,
    OpenAIField,
} from '../utils/aiConfigHelpers';
import {
    DEEPSEEK_MODEL_OPTIONS,
    OPENAI_MODEL_OPTIONS,
    formatUpdatedAt,
} from '../utils/aiConfigHelpers';
import styles from '../styles/aiConfig.module.css';

interface SharedCardProps {
    accountLabel: string;
    loading: boolean;
    saving: boolean;
}

interface DeepSeekCardProps extends SharedCardProps {
    form: DeepSeekConfig;
    preview: Array<[string, string]>;
    onFieldChange: <K extends DeepSeekField>(field: K, value: DeepSeekConfig[K]) => void;
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
    onResetDefaults: () => void;
    onClearApiKey: () => void;
}

interface OpenAICardProps extends SharedCardProps {
    form: OpenAIConfig;
    preview: Array<[string, string]>;
    onFieldChange: <K extends OpenAIField>(field: K, value: OpenAIConfig[K]) => void;
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
    onResetDefaults: () => void;
    onClearApiKey: () => void;
}

function renderModelButtons(
    values: string[],
    selected: string,
    onSelect: (value: string) => void,
    disabled: boolean,
) {
    return (
        <div className={styles.modelChoiceGrid}>
            {values.map((model) => (
                <button
                    key={model}
                    type="button"
                    className={`${styles.modelChoice} ${selected === model ? styles.modelChoiceActive : ''}`}
                    onClick={() => onSelect(model)}
                    disabled={disabled}
                >
                    {model}
                </button>
            ))}
        </div>
    );
}

function ProviderPreview({ rows }: { rows: Array<[string, string]> }) {
    return (
        <div className={styles.previewTable}>
            {rows.map(([label, value]) => (
                <div key={label} className={styles.previewRow}>
                    <span>{label}</span>
                    <code>{value}</code>
                </div>
            ))}
        </div>
    );
}

export function DeepSeekConfigCard({
    accountLabel,
    form,
    preview,
    loading,
    saving,
    onFieldChange,
    onSubmit,
    onResetDefaults,
    onClearApiKey,
}: DeepSeekCardProps) {
    return (
        <section className={`${styles.providerCard} ${styles.deepseekCard}`} aria-label="DeepSeek configuration">
            <form className={styles.configForm} onSubmit={onSubmit}>
                <div className={styles.cardBody}>
                    <div className={styles.formColumn}>
                        <div className={styles.cardTop}>
                            <div className={styles.providerIdentity}>
                                <span className={styles.providerIcon}>
                                    <i className="fas fa-brain" />
                                </span>
                                <div>
                                    <p className={styles.eyebrow}>Cloud Model</p>
                                    <h2>DeepSeek</h2>
                                </div>
                            </div>
                            <div className={styles.statusStack}>
                                <span><i className="fas fa-user" /> {accountLabel}</span>
                                <span className={form.api_key_set ? styles.statusOk : styles.statusWarn}>
                                    <i className={`fas ${form.api_key_set ? 'fa-key' : 'fa-exclamation-triangle'}`} />
                                    {form.api_key_set ? 'API key saved' : 'API key missing'}
                                </span>
                            </div>
                        </div>

                        <div className={styles.formGrid}>
                            <div className={`${styles.field} ${styles.fullWidthField}`}>
                                <span>model</span>
                                {renderModelButtons(DEEPSEEK_MODEL_OPTIONS, form.model, (value) => onFieldChange('model', value), loading || saving)}
                            </div>
                            <label className={styles.field}>
                                <span>base_url</span>
                                <input
                                    value={form.base_url}
                                    onChange={(event) => onFieldChange('base_url', event.target.value)}
                                    disabled={loading || saving}
                                />
                            </label>
                            <label className={styles.field}>
                                <span>api_key</span>
                                <ApiKeyField
                                    value={form.api_key}
                                    onChange={(value) => onFieldChange('api_key', value)}
                                    placeholder={form.api_key_set ? 'Saved key is kept unless replaced' : 'sk-...'}
                                    disabled={loading || saving}
                                />
                            </label>
                            <label className={styles.field}>
                                <span>reasoning_effort</span>
                                <select
                                    value={form.reasoning_effort}
                                    onChange={(event) => onFieldChange('reasoning_effort', event.target.value as DeepSeekConfig['reasoning_effort'])}
                                    disabled={loading || saving}
                                >
                                    <option value="low">low</option>
                                    <option value="medium">medium</option>
                                    <option value="high">high</option>
                                </select>
                            </label>
                            <div className={styles.field}>
                                <span>extra_body.thinking.type</span>
                                <div className={styles.segmented} role="group" aria-label="Thinking type">
                                    {(['enabled', 'disabled'] as const).map((value) => (
                                        <button
                                            key={value}
                                            type="button"
                                            className={form.thinking_type === value ? styles.segmentActive : ''}
                                            onClick={() => onFieldChange('thinking_type', value)}
                                            disabled={loading || saving}
                                        >
                                            {value}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <label className={styles.toggleRow}>
                                <input
                                    type="checkbox"
                                    checked={form.stream}
                                    onChange={(event) => onFieldChange('stream', event.target.checked)}
                                    disabled={loading || saving}
                                />
                                <span>stream</span>
                            </label>
                        </div>
                    </div>

                    <aside className={styles.sideColumn}>
                        <ProviderPreview rows={preview} />

                        <div className={styles.cardFooter}>
                            <span className={styles.savedAt}>
                                <i className="fas fa-clock" /> {formatUpdatedAt(form.updated_at)}
                            </span>
                            <div className={styles.actionGroup}>
                                <button type="button" className={styles.secondaryButton} onClick={onResetDefaults} disabled={loading || saving}>
                                    <i className="fas fa-undo" /> Defaults
                                </button>
                                <button type="button" className={styles.secondaryButton} onClick={onClearApiKey} disabled={loading || saving || !form.api_key_set}>
                                    <i className="fas fa-key" /> Clear Key
                                </button>
                                <button type="submit" className={styles.primaryButton} disabled={loading || saving}>
                                    <i className="fas fa-save" /> {saving ? 'Saving' : 'Save'}
                                </button>
                            </div>
                        </div>
                    </aside>
                </div>
            </form>
        </section>
    );
}

function ApiKeyField({
    value,
    placeholder,
    disabled,
    onChange,
}: {
    value: string;
    placeholder: string;
    disabled: boolean;
    onChange: (value: string) => void;
}) {
    const [visible, setVisible] = useState(false);

    return (
        <div className={styles.apiKeyInputWrap}>
            <input
                type={visible ? 'text' : 'password'}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                autoComplete="off"
                disabled={disabled}
            />
            <button
                type="button"
                className={styles.apiKeyToggle}
                onClick={() => setVisible((current) => !current)}
                disabled={disabled}
                aria-label={visible ? 'Hide API key' : 'Show API key'}
                aria-pressed={visible}
            >
                <i className={`fas ${visible ? 'fa-eye-slash' : 'fa-eye'}`} />
            </button>
        </div>
    );
}

export function OpenAIConfigCard({
    accountLabel,
    form,
    preview,
    loading,
    saving,
    onFieldChange,
    onSubmit,
    onResetDefaults,
    onClearApiKey,
}: OpenAICardProps) {
    return (
        <section className={`${styles.providerCard} ${styles.openaiCard}`} aria-label="OpenAI configuration">
            <form className={styles.configForm} onSubmit={onSubmit}>
                <div className={styles.cardBody}>
                    <div className={styles.formColumn}>
                        <div className={styles.cardTop}>
                            <div className={styles.providerIdentity}>
                                <span className={styles.providerIcon}>
                                    <i className="fas fa-magic" />
                                </span>
                                <div>
                                    <p className={styles.eyebrow}>Cloud Model</p>
                                    <h2>OpenAI</h2>
                                </div>
                            </div>
                            <div className={styles.statusStack}>
                                <span><i className="fas fa-user" /> {accountLabel}</span>
                                <span className={form.api_key_set ? styles.statusOk : styles.statusWarn}>
                                    <i className={`fas ${form.api_key_set ? 'fa-key' : 'fa-exclamation-triangle'}`} />
                                    {form.api_key_set ? 'API key saved' : 'API key missing'}
                                </span>
                            </div>
                        </div>

                        <div className={styles.formGrid}>
                            <div className={`${styles.field} ${styles.fullWidthField}`}>
                                <span>model</span>
                                {renderModelButtons(OPENAI_MODEL_OPTIONS, form.model, (value) => onFieldChange('model', value), loading || saving)}
                            </div>
                            <label className={styles.field}>
                                <span>base_url</span>
                                <input
                                    value={form.base_url}
                                    onChange={(event) => onFieldChange('base_url', event.target.value)}
                                    disabled={loading || saving}
                                />
                            </label>
                            <label className={styles.field}>
                                <span>api_key</span>
                                <ApiKeyField
                                    value={form.api_key}
                                    onChange={(value) => onFieldChange('api_key', value)}
                                    placeholder={form.api_key_set ? 'Saved key is kept unless replaced' : 'sk-...'}
                                    disabled={loading || saving}
                                />
                            </label>
                            <label className={styles.toggleRow}>
                                <input
                                    type="checkbox"
                                    checked={form.stream}
                                    onChange={(event) => onFieldChange('stream', event.target.checked)}
                                    disabled={loading || saving}
                                />
                                <span>stream</span>
                            </label>
                        </div>
                    </div>

                    <aside className={styles.sideColumn}>
                        <ProviderPreview rows={preview} />

                        <div className={styles.cardFooter}>
                            <span className={styles.savedAt}>
                                <i className="fas fa-clock" /> {formatUpdatedAt(form.updated_at)}
                            </span>
                            <div className={styles.actionGroup}>
                                <button type="button" className={styles.secondaryButton} onClick={onResetDefaults} disabled={loading || saving}>
                                    <i className="fas fa-undo" /> Defaults
                                </button>
                                <button type="button" className={styles.secondaryButton} onClick={onClearApiKey} disabled={loading || saving || !form.api_key_set}>
                                    <i className="fas fa-key" /> Clear Key
                                </button>
                                <button type="submit" className={styles.primaryButton} disabled={loading || saving}>
                                    <i className="fas fa-save" /> {saving ? 'Saving' : 'Save'}
                                </button>
                            </div>
                        </div>
                    </aside>
                </div>
            </form>
        </section>
    );
}
