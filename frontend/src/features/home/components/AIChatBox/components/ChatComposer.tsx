import React from 'react';
import { useI18n } from '@/shared/i18n';
import styles from '../../../styles/HomeAIChat.module.css';

export default function ChatComposer({
    input,
    isLoading,
    inputAreaRef,
    provider,
    setProvider,
    handleInput,
    handleKeyDown,
    handleSend,
    handleStop,
}: {
    input: string;
    isLoading: boolean;
    inputAreaRef: React.RefObject<HTMLTextAreaElement>;
    provider: 'coze' | 'local_ollama' | 'deepseek';
    setProvider: (p: 'coze' | 'local_ollama' | 'deepseek') => void;
    handleInput: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    handleSend: () => void;
    handleStop: () => void;
}) {
    const { t } = useI18n();

    return (
        <div className={styles['input-area']}>
            <div className={styles['provider-selector-container']}>
                <button 
                    className={`${styles['provider-btn']} ${provider === 'local_ollama' ? styles['provider-active'] : ''}`}
                    onClick={() => setProvider('local_ollama')}
                    disabled={isLoading}
                    title={t('aiChat.provider.local.title')}
                >
                    <i className="fas fa-microchip"></i> LLaMA
                </button>
                <button 
                    className={`${styles['provider-btn']} ${provider === 'coze' ? styles['provider-active'] : ''}`}
                    onClick={() => setProvider('coze')}
                    disabled={isLoading}
                    title={t('aiChat.provider.coze.title')}
                >
                    <i className="fas fa-cloud"></i> Coze
                </button>
                <button 
                    className={`${styles['provider-btn']} ${provider === 'deepseek' ? styles['provider-active'] : ''}`}
                    onClick={() => setProvider('deepseek')}
                    disabled={isLoading}
                    title={t('aiChat.provider.deepseek.title')}
                >
                    <i className="fas fa-brain"></i> DeepSeek
                </button>
            </div>
            <div className={styles['input-wrapper']}>
                <textarea
                    id="aiChatBoxInput"
                    className={styles.geminiInput}
                    ref={inputAreaRef}
                    rows={1}
                    placeholder={t('aiChat.askPlaceholder')}
                    value={input}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                ></textarea>
                <button className={styles['stop-btn']} onClick={handleStop} disabled={!isLoading} title={t('aiChat.stop')}>
                    <i className="fas fa-stop"></i>
                </button>
                <button className={styles['send-btn']} disabled={!input.trim() || isLoading} onClick={handleSend}>
                    <i className="fas fa-paper-plane"></i>
                </button>
            </div>
        </div>
    );
}
