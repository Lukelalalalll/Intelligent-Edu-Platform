import React from 'react';
import styles from '../../../styles/home.module.css';

export default function ChatComposer({
    input,
    isLoading,
    inputAreaRef,
    handleInput,
    handleKeyDown,
    handleSend,
    handleStop,
}: {
    input: string;
    isLoading: boolean;
    inputAreaRef: React.RefObject<HTMLTextAreaElement>;
    handleInput: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    handleSend: () => void;
    handleStop: () => void;
}) {
    return (
        <div className={styles['input-area']}>
            <div className={styles['input-wrapper']}>
                <textarea
                    id="aiChatBoxInput"
                    className={styles.geminiInput}
                    ref={inputAreaRef}
                    rows={1}
                    placeholder="Ask anything..."
                    value={input}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                ></textarea>
                <button className={styles['stop-btn']} onClick={handleStop} disabled={!isLoading} title="Stop">
                    <i className="fas fa-stop"></i>
                </button>
                <button className={styles['send-btn']} disabled={!input.trim() || isLoading} onClick={handleSend}>
                    <i className="fas fa-paper-plane"></i>
                </button>
            </div>
        </div>
    );
}
