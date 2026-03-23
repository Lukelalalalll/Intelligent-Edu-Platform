// Home.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion'; // 👈 引入 Framer Motion
import styles from '../styles/home/home.module.css';

const containerVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.2,
            delayChildren: 0.2
        }
    }
};

const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    show: {
        opacity: 1,
        y: 0,
        transition: { type: "spring", stiffness: 300, damping: 24 } // 使用弹簧物理效果，更高级
    }
};

const messageVariants = {
    hidden: { opacity: 0, y: 15, scale: 0.98 },
    show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 400, damping: 25 } }
};


const WelcomeBanner = () => {
    return (
        <motion.section
            variants={itemVariants}
            className={styles['welcome-banner']}
        >
            <motion.h1 variants={itemVariants}>
                Welcome to HKU Educational Tools Platform
            </motion.h1>
            <motion.p variants={itemVariants}>
                Your gateway to intelligent learning and educational resources
            </motion.p>
        </motion.section>
    );
};

const ToolCard = ({ title, desc, icon, url }) => {
    const cardRef = useRef(null);
    const sheenRef = useRef(null);
    const rectRef = useRef(null);
    const rafRef = useRef(null);

    const handleMouseEnter = () => {
        if (cardRef.current) {
            cardRef.current.style.transition = 'transform 0.2s ease-out';
            rectRef.current = cardRef.current.getBoundingClientRect();
        }
    };

    const handleMouseMove = (e) => {
        if (!cardRef.current || !sheenRef.current || !rectRef.current) return;
        const { clientX, clientY } = e;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);

        rafRef.current = requestAnimationFrame(() => {
            const rect = rectRef.current;
            const x = clientX - rect.left;
            const y = clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            const rotateX = ((y - centerY) / centerY) * -8;
            const rotateY = ((x - centerX) / centerX) * 8;

            cardRef.current.style.transform = `perspective(1000px) translateY(-15px) scale(1.02) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
            sheenRef.current.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(255,255,255,0.3), transparent 50%)`;
            sheenRef.current.style.opacity = '1';
        });
    };

    const handleMouseLeave = () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rectRef.current = null;
        if (cardRef.current) {
            cardRef.current.style.transition = 'transform 0.5s cubic-bezier(0.23, 1, 0.32, 1)';
            cardRef.current.style.transform = '';
        }
        if (sheenRef.current) sheenRef.current.style.opacity = '0';
    };

    useEffect(() => {
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, []);

    return (
        <div className={styles.card} ref={cardRef} onMouseMove={handleMouseMove} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
            <div className={styles['card-sheen']} ref={sheenRef} style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.4), transparent 60%)',
                opacity: '0', pointerEvents: 'none', zIndex: '3', mixBlendMode: 'overlay', transition: 'opacity 0.4s ease'
            }}></div>
            <div className={styles['card-content']}>
                <div className={styles['card-icon']}><i className={`fas ${icon}`}></i></div>
                <h3 className={styles['card-title']}>{title}</h3>
                <p className={styles['card-description']}>{desc}</p>
                <Link to={url} className={styles['card-link']}>Enter</Link>
            </div>
        </div>
    );
};

const GeminiChat = ({ aiInteractUrl }) => {
    const [messages, setMessages] = useState([
        { id: 'welcome', sender: 'ai', role: 'assistant', text: "Hi there! I'm your HKU AI Assistant. How can I help you with your studies today?" }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isFull, setIsFull] = useState(false);

    const messagesContainerRef = useRef(null);
    const chatContainerRef = useRef(null);
    const spacerRef = useRef(null);
    const inputAreaRef = useRef(null);
    const isAnimatingRef = useRef(false);
    const probeDataRef = useRef({ offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 });

    const markdownComponents = useMemo(() => ({
        code({node, inline, className, children, ...props}) {
            const match = /language-(\w+)/.exec(className || '')
            return !inline && match ? (
                <SyntaxHighlighter language={match[1]} style={undefined} PreTag="div" {...props}>
                    {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
            ) : (<code className={className} {...props}>{children}</code>)
        }
    }), []);

    useEffect(() => {
        if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
    }, [messages, isLoading, isFull]);

    const handleInput = useCallback((e) => {
        const target = e.target;
        setInput(target.value);
        target.style.height = 'auto';
        target.style.height = target.scrollHeight + 'px';
        if(target.value === '') target.style.height = 'auto';
    }, []);

    const handleSend = useCallback(async () => {
        if (!input.trim() || isLoading) return;

        const userText = input.trim();
        setInput('');
        if (inputAreaRef.current) inputAreaRef.current.style.height = 'auto';

        const userMsg = { id: Date.now(), sender: 'user', role: 'user', text: userText };
        const aiPlaceholderId = Date.now() + 1;
        const aiMsg = { id: aiPlaceholderId, sender: 'ai', role: 'assistant', text: '' };

        setMessages(prev => [...prev, userMsg, aiMsg]);
        setIsLoading(true);

        try {
            const historyForAPI = messages
                .concat(userMsg)
                .map(m => ({ role: m.role, content: m.text }));

            const response = await fetch('http://localhost:5009/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: historyForAPI }),
                credentials: 'include'
            });

            if (!response.ok) throw new Error('Network response was not ok');

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let accumulatedText = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: ')) continue;
                    const dataStr = trimmed.replace('data: ', '');
                    if (dataStr === '[DONE]') continue;

                    try {
                        const dataObj = JSON.parse(dataStr);
                        if (dataObj.choices?.[0]?.delta?.content !== undefined) {
                            accumulatedText += dataObj.choices[0].delta.content;
                            setMessages(prev => prev.map(m =>
                                m.id === aiPlaceholderId ? { ...m, text: accumulatedText } : m
                            ));
                        }
                    } catch (e) {
                        console.error("Parse error", e);
                    }
                }
            }
        } catch (error) {
            setMessages(prev => prev.map(m =>
                m.id === aiPlaceholderId ? { ...m, text: "Sorry, I encountered an error connecting to the AI server." } : m
            ));
        } finally {
            setIsLoading(false);
        }
    }, [input, isLoading, messages]);

    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);

    // 原生全屏动画逻辑保留，但外部包裹 motion
    const toggleFullscreen = useCallback(() => {
        if (isAnimatingRef.current) return;
        isAnimatingRef.current = true;

        const container = chatContainerRef.current;
        const spacer = spacerRef.current;
        const animDuration = 600;

        if (!isFull) {
            const rect = container.getBoundingClientRect();
            const computedStyle = window.getComputedStyle(container);

            spacer.style.width = rect.width + 'px';
            spacer.style.height = rect.height + 'px';
            spacer.style.marginTop = computedStyle.marginTop;
            spacer.style.marginBottom = computedStyle.marginBottom;
            spacer.style.marginLeft = computedStyle.marginLeft;
            spacer.style.marginRight = computedStyle.marginRight;
            spacer.style.display = 'block';

            const probe = document.createElement('div');
            probe.style.cssText = `
                position: fixed; top: 0; left: 0;
                width: 100px; height: 100px; visibility: hidden; pointer-events: none;
            `;
            container.parentNode.appendChild(probe);

            const probeRect = probe.getBoundingClientRect();
            const offsetX = probeRect.left;
            const offsetY = probeRect.top;
            const scaleX = probeRect.width / 100 || 1;
            const scaleY = probeRect.height / 100 || 1;

            probeDataRef.current = { offsetX, offsetY, scaleX, scaleY };
            container.parentNode.removeChild(probe);

            container.style.transition = 'none';
            container.style.position = 'fixed';
            container.style.margin = '0';
            container.style.transform = 'none';
            container.style.zIndex = '999999';

            container.style.left = ((rect.left - offsetX) / scaleX) + 'px';
            container.style.top = ((rect.top - offsetY) / scaleY) + 'px';
            container.style.width = (rect.width / scaleX) + 'px';
            container.style.height = (rect.height / scaleY) + 'px';

            void container.offsetHeight;

            container.style.transition = `all ${animDuration}ms cubic-bezier(0.25, 1, 0.3, 1)`;
            container.style.left = ((0 - offsetX) / scaleX) + 'px';
            container.style.top = ((0 - offsetY) / scaleY) + 'px';
            container.style.width = (window.innerWidth / scaleX) + 'px';
            container.style.height = (window.innerHeight / scaleY) + 'px';
            container.style.borderRadius = '0px';

            container.classList.add(styles['is-fullscreen-layout']);
            document.body.style.overflow = 'hidden';
            document.body.classList.add('chat-fullscreen-active');

            setTimeout(() => {
                isAnimatingRef.current = false;
                setIsFull(true);
            }, animDuration);

        } else {
            container.style.transition = 'none';
            container.style.margin = '0';

            const targetRect = spacer.getBoundingClientRect();
            const { offsetX, offsetY, scaleX, scaleY } = probeDataRef.current;

            container.classList.remove(styles['is-fullscreen-layout']);

            container.style.transition = `all ${animDuration}ms cubic-bezier(0.25, 1, 0.3, 1)`;
            container.style.left = ((targetRect.left - offsetX) / scaleX) + 'px';
            container.style.top = ((targetRect.top - offsetY) / scaleY) + 'px';
            container.style.width = (targetRect.width / scaleX) + 'px';
            container.style.height = (targetRect.height / scaleY) + 'px';
            container.style.borderRadius = '24px';

            void container.offsetWidth;

            document.body.style.overflow = '';

            setTimeout(() => {
                container.style.cssText = '';
                spacer.style.display = 'none';
                document.body.classList.remove('chat-fullscreen-active');
                isAnimatingRef.current = false;
                setIsFull(false);
                if(messagesContainerRef.current) {
                    messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
                }
            }, animDuration);
        }
    }, [isFull]);

    const lastMessage = messages[messages.length - 1];

    return (
        <motion.section variants={itemVariants} className={styles['ai-interaction-section']}>
            <div ref={spacerRef} style={{ display: 'none', opacity: 0, pointerEvents: 'none' }}></div>

            <div ref={chatContainerRef} className={styles['chat-interface-container']}>
                <div className={styles['chat-header']}>
                    <div className={styles['ai-badge']}>
                        <i className="fas fa-sparkles"></i>
                        <Link to={aiInteractUrl} className={styles['powered-by-link']}><span>AI Fullscreen Workspace</span></Link>
                    </div>
                    <button onClick={toggleFullscreen} className={styles['fullscreen-btn']} title="Toggle Fullscreen">
                        <i className={isFull ? "fas fa-compress-arrows-alt" : "fas fa-expand-arrows-alt"}></i>
                    </button>
                </div>

                <div ref={messagesContainerRef} className={`${styles['chat-messages']} ${(messages.length > 0 || isLoading) ? styles['has-interaction'] : ''}`}>
                    <AnimatePresence>
                        {messages.map(msg => {
                            if (msg.sender === 'ai' && !msg.text) return null;
                            return (
                                <motion.div
                                    key={msg.id}
                                    variants={messageVariants}
                                    initial="hidden"
                                    animate="show"
                                    className={`${styles.message} ${styles[`${msg.sender}-message`]}`}
                                >
                                    <div className={styles.avatar}>
                                        {msg.sender === 'ai' ? <i className="fas fa-robot"></i> : <i className="fas fa-user"></i>}
                                    </div>
                                    <div className={styles.bubble}>
                                        {msg.sender === 'ai' ? (
                                            <ReactMarkdown components={markdownComponents}>
                                                {msg.text}
                                            </ReactMarkdown>
                                        ) : (msg.text)}
                                    </div>
                                </motion.div>
                            );
                        })}
                        {isLoading && (!lastMessage || lastMessage.sender !== 'ai' || !lastMessage.text) && (
                            <motion.div
                                variants={messageVariants}
                                initial="hidden"
                                animate="show"
                                exit={{ opacity: 0, y: -10 }} // 打字动画消失时的效果
                                className={`${styles.message} ${styles['ai-message']}`}
                            >
                                <div className={styles.avatar}><i className="fas fa-sparkles"></i></div>
                                <div className={`${styles.bubble} ${styles['typing-bubble']}`}>
                                    <div className={styles['typing-indicator']}><span></span><span></span><span></span></div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div className={styles['input-area']}>
                    <div className={styles['input-wrapper']}>
                        <textarea
                            id="geminiInput"
                            className={styles.geminiInput}
                            ref={inputAreaRef}
                            rows="1" placeholder="Ask anything..."
                            value={input} onChange={handleInput}
                            onKeyDown={handleKeyDown}
                        ></textarea>
                        <button className={styles['send-btn']} disabled={!input.trim()} onClick={handleSend}>
                            <i className="fas fa-paper-plane"></i>
                        </button>
                    </div>
                </div>
            </div>
        </motion.section>
    );
};

export default function Home({ config }) {
    const toolCardsData = useMemo(() => [
        { title: "AI Slides Generator", desc: "Intelligent document processing and presentation generation", icon: "fa-book-open", url: config.urls.sub1 },
        { title: "AI Question Generator", desc: "Smart question extraction and automated generation", icon: "fa-users", url: config.urls.sub3 },
        { title: "AI Image Extract System", desc: "PDF image extraction and AI generation tool", icon: "fa-tasks", url: config.urls.sub4 },
        { title: "AI Diagram Tool", desc: "Extract from word/PDF, Search and Edit SVG, AI Generate", icon: "fa-cog", url: config.urls.sub5 },
    ], [config.urls]);

    return (
        // 👈 最外层包裹 motion.div，控制所有子组件的入场时机
        <motion.div
            initial="hidden"
            animate="show"
            variants={containerVariants}
        >
            <WelcomeBanner />
            <GeminiChat aiInteractUrl={config.urls.aiInteract} />

            <motion.div variants={itemVariants} className={styles['mailbox-section']}>
                <Link to={config.urls.mailbox} className={styles['mailbox-banner-card']}>
                    <div className={styles['mailbox-left']}>
                        <div className={styles['mailbox-icon-wrapper']}>
                            <i className="fas fa-inbox"></i><span className={styles['notification-dot']}></span>
                        </div>
                        <div className={styles['mailbox-text']}>
                            <h3>Grading Mailbox</h3><p>Review and grade pending student assignments</p>
                        </div>
                    </div>
                    <div className={styles['mailbox-right']}>
                        <div className={styles['pending-badge']}><i className="fas fa-bell"></i> <span>3 Pending</span></div>
                        <span className={styles['btn-enter-mailbox']}>Enter Workspace <i className="fas fa-arrow-right"></i></span>
                    </div>
                </Link>
            </motion.div>

            {/* 这里的容器不再需要 CSS grid gap 外的其他入场动画了 */}
            <motion.div variants={containerVariants} className={styles['cards-container']}>
                {toolCardsData.map((card, index) => (
                    <motion.div key={index} variants={itemVariants}>
                        <ToolCard {...card} />
                    </motion.div>
                ))}
            </motion.div>
        </motion.div>
    );
}