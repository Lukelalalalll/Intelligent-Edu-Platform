// Home.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { Link } from 'react-router-dom';
import styles from '../styles/home/home.module.css';

const WelcomeBanner = () => {
    const titleRef = useRef(null);
    const descRef = useRef(null);
    const rafRef = useRef(null);

    const handleMouseMove = useCallback((e) => {
        const { clientX, clientY } = e;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);

        rafRef.current = requestAnimationFrame(() => {
            const x = (window.innerWidth / 2 - clientX) / 50;
            const y = (window.innerHeight / 2 - clientY) / 50;
            if (titleRef.current && descRef.current) {
                titleRef.current.style.transform = `translate(${x}px, ${y}px)`;
                descRef.current.style.transform = `translate(${x * 0.5}px, ${y * 0.5}px)`;
                titleRef.current.style.transition = 'none';
                descRef.current.style.transition = 'none';
            }
        });
    }, []);

    const handleMouseLeave = useCallback(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        if (titleRef.current && descRef.current) {
            titleRef.current.style.transform = `translate(0, 0)`;
            descRef.current.style.transform = `translate(0, 0)`;
            titleRef.current.style.transition = 'transform 0.5s ease-out';
            descRef.current.style.transition = 'transform 0.5s ease-out';
        }
    }, []);

    useEffect(() => {
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, []);

    return (
        <section className={styles['welcome-banner']} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
            <h1 ref={titleRef}>Welcome to HKU Educational Tools Platform</h1>
            <p ref={descRef}>Your gateway to intelligent learning and educational resources</p>
        </section>
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

            cardRef.current.style.transform = `perspective(1000px) translateY(-15px) scale(1.05) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
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
                {/* 外部图标库类名保持普通字符串，不使用 styles */}
                <div className={styles['card-icon']}><i className={`fas ${icon}`}></i></div>
                <h3 className={styles['card-title']}>{title}</h3>
                <p className={styles['card-description']}>{desc}</p>
                <Link to={url} className={styles['card-link']}>Enter</Link>
            </div>
        </div>
    );
};

const GeminiChat = ({ aiInteractUrl }) => {
    // 调整初始消息格式，增加 role 属性以便 API 调用
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

    // 自动滚动
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

        // 1. 添加用户消息，并预留一个空的 AI 消息位
        const userMsg = { id: Date.now(), sender: 'user', role: 'user', text: userText };
        const aiPlaceholderId = Date.now() + 1;
        const aiMsg = { id: aiPlaceholderId, sender: 'ai', role: 'assistant', text: '' };

        setMessages(prev => [...prev, userMsg, aiMsg]);
        setIsLoading(true);

        try {
            // 准备给 API 的历史记录
            // 过滤掉当前还没填内容的 AI 占位符，只发送之前的历史
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

                            // 实时更新最后一条 AI 消息的内容
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
            console.error("Chat Error:", error);
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
                width: 100px; height: 100px;
                margin: 0; padding: 0; border: none;
                min-width: 0; min-height: 0; max-width: none; max-height: none;
                visibility: hidden; pointer-events: none; transform: none;
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

            // 【重点修改】：DOM 操作使用 styles 对象获取哈希类名
            container.classList.add(styles['is-fullscreen-layout']);
            document.body.style.overflow = 'hidden';
            // body 上的全局类名保持普通字符串，不要用 module
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

            container.classList.add(styles['is-animating-to-small']);
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
                container.classList.remove(styles['is-animating-to-small']);
                // 移除全局类名
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
        <section className={styles['ai-interaction-section']}>
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
                    {messages.map(msg => {
                        if (msg.sender === 'ai' && !msg.text) return null;
                        return (
                            <div key={msg.id} className={`${styles.message} ${styles[`${msg.sender}-message`]}`}>
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
                            </div>
                        );

                })}
                    {isLoading && (!lastMessage || lastMessage.sender !== 'ai' || !lastMessage.text) && (
                        <div className={`${styles.message} ${styles['ai-message']}`}>
                            <div className={styles.avatar}><i className="fas fa-sparkles"></i></div>
                            <div className={`${styles.bubble} ${styles['typing-bubble']}`}>
                                <div className={styles['typing-indicator']}><span></span><span></span><span></span></div>
                            </div>
                        </div>
                    )}
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
        </section>
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
        <>
            <WelcomeBanner />
            <GeminiChat aiInteractUrl={config.urls.aiInteract} />

            <div className={styles['mailbox-section']}>
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
            </div>

            <div className={styles['cards-container']}>
                {toolCardsData.map((card, index) => (
                    <ToolCard key={index} {...card} />
                ))}
            </div>
        </>
    );
}