import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import styles from '../../styles/home.module.css';
import { useAIChatBox } from '../../hooks/AIChatBox/useAIChatBox';
import MessageList from './components/MessageList';
import ChatComposer from './components/ChatComposer';
import 'highlight.js/styles/github-dark.css';

const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    show: {
        opacity: 1,
        y: 0,
        transition: { type: 'spring' as const, stiffness: 300, damping: 24 },
    },
};

interface AIChatBoxProps {
    aiInteractUrl?: string;
}

export default function AIChatBox({ aiInteractUrl }: AIChatBoxProps) {
    const messagesContainerRef = useRef<HTMLDivElement>(null);

    const {
        messages,
        input,
        isLoading,
        editingId,
        editingVal,
        inputAreaRef,
        setEditingId,
        setEditingVal,
        handleInput,
        handleSend,
        handleStop,
        handleRegenerate,
        handleEditUserMsg,
        handleKeyDown,
    } = useAIChatBox(messagesContainerRef);

    return (
        <motion.section variants={itemVariants} className={styles['ai-interaction-section']}>
            <div className={styles['chat-interface-container']}>
                <div className={styles['chat-header']}>
                    <div className={styles['ai-badge']}>
                        <i className="fas fa-sparkles"></i>
                        <Link to={aiInteractUrl} className={styles['powered-by-link']}>
                            <span>AI Workspace</span>
                        </Link>
                    </div>
                </div>

                <div
                    ref={messagesContainerRef}
                    className={`${styles['chat-messages']} ${(messages.length > 0 || isLoading) ? styles['has-interaction'] : ''}`}
                >
                    <MessageList
                        messages={messages}
                        isLoading={isLoading}
                        editingId={editingId}
                        editingVal={editingVal}
                        setEditingId={setEditingId}
                        setEditingVal={setEditingVal}
                        handleEditUserMsg={handleEditUserMsg}
                        handleRegenerate={handleRegenerate}
                    />
                </div>

                <ChatComposer
                    input={input}
                    isLoading={isLoading}
                    inputAreaRef={inputAreaRef}
                    handleInput={handleInput}
                    handleKeyDown={handleKeyDown}
                    handleSend={handleSend}
                    handleStop={handleStop}
                />
            </div>
        </motion.section>
    );
}
