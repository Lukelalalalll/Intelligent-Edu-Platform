import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { Link } from 'react-router-dom';

// 引入对应的 CSS
import '../styles/home/home.css';

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
        <section className="welcome-banner" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
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
        <div className="card" ref={cardRef} onMouseMove={handleMouseMove} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
            <div className="card-sheen" ref={sheenRef} style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.4), transparent 60%)',
                opacity: '0', pointerEvents: 'none', zIndex: '3', mixBlendMode: 'overlay', transition: 'opacity 0.4s ease'
            }}></div>
            <div className="card-content">
                <div className="card-icon"><i className={`fas ${icon}`}></i></div>
                <h3 className="card-title">{title}</h3>
                <p className="card-description">{desc}</p>
                {/* 【重点修改】：使用 Link 替代 a 标签 */}
                <Link to={url} className="card-link">Enter</Link>
            </div>
        </div>
    );
};

const GeminiChat = ({ aiInteractUrl }) => {
    const [messages, setMessages] = useState([]);
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
                <SyntaxHighlighter language={match[1]} PreTag="div" {...props}>
                    {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
            ) : (<code className={className} {...props}>{children}</code>)
        }
    }), []);

    useEffect(() => {
        setIsLoading(true);
        const timer = setTimeout(() => {
            setIsLoading(false);
            setMessages([{ id: 'welcome', sender: 'ai', text: "Hi there! I'm your HKU AI Assistant. How can I help you with your studies today?" }]);
        }, 1200);
        return () => clearTimeout(timer);
    }, []);

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

    const handleSend = useCallback(() => {
        if (!input.trim() || isLoading) return;
        const text = input.trim();
        setInput('');

        if (inputAreaRef.current) {
            inputAreaRef.current.style.height = 'auto';
        }

        setMessages(prev => [...prev, { id: Date.now(), sender: 'user', text: text }]);
        setIsLoading(true);

        // TODO: 之后接真实的 /api/ai/chat 接口
        setTimeout(() => {
            setIsLoading(false);
            setMessages(prev => [...prev, {
                id: Date.now() + 1,
                sender: 'ai',
                text: `You asked: "${text}".\n\nI am ready to assist!`
            }]);
        }, 1500);
    }, [input, isLoading]);

    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);

    // 这里保留你原来又长又帅的全屏动画逻辑
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

            container.classList.add('is-fullscreen-layout');
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

            container.classList.add('is-animating-to-small');
            container.classList.remove('is-fullscreen-layout');

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
                container.classList.remove('is-animating-to-small');
                document.body.classList.remove('chat-fullscreen-active');
                isAnimatingRef.current = false;
                setIsFull(false);
                if(messagesContainerRef.current) {
                    messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
                }
            }, animDuration);
        }
    }, [isFull]);

    return (
        <section className="ai-interaction-section">
            <div ref={spacerRef} style={{ display: 'none', opacity: 0, pointerEvents: 'none' }}></div>

            {/* 移除了 locked class 和 overlay */}
            <div ref={chatContainerRef} className="chat-interface-container">
                <div className="chat-header">
                    <div className="ai-badge">
                        <i className="fas fa-sparkles"></i>
                        <Link to={aiInteractUrl} className="powered-by-link"><span>AI Fullscreen Workspace</span></Link>
                    </div>
                    {/* 移除了 disabled */}
                    <button onClick={toggleFullscreen} className="fullscreen-btn" title="Toggle Fullscreen">
                        <i className={isFull ? "fas fa-compress-arrows-alt" : "fas fa-expand-arrows-alt"}></i>
                    </button>
                </div>

                <div ref={messagesContainerRef} className={`chat-messages ${(messages.length > 0 || isLoading) ? 'has-interaction' : ''}`}>
                    {messages.map(msg => (
                        <div key={msg.id} className={`message ${msg.sender}-message`}>
                            <div className="avatar">
                                {msg.sender === 'ai' ? <i className="fas fa-robot"></i> : <i className="fas fa-user"></i>}
                            </div>
                            <div className="bubble">
                                {msg.sender === 'ai' ? (
                                    <ReactMarkdown components={markdownComponents}>
                                        {msg.text}
                                    </ReactMarkdown>
                                ) : (msg.text)}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="message ai-message">
                            <div className="avatar"><i className="fas fa-sparkles"></i></div>
                            <div className="bubble typing-bubble">
                                <div className="typing-indicator"><span></span><span></span><span></span></div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="input-area">
                    <div className="input-wrapper">
                        {/* 移除了 disabled */}
                        <textarea
                            id="geminiInput"
                            ref={inputAreaRef}
                            rows="1" placeholder="Ask anything..."
                            value={input} onChange={handleInput}
                            onKeyDown={handleKeyDown}
                        ></textarea>
                        {/* 移除了 disabled 的判断 */}
                        <button className="send-btn" disabled={!input.trim()} onClick={handleSend}>
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
            {/* 移除了 isAuthenticated 和 loginUrl */}
            <GeminiChat aiInteractUrl={config.urls.aiInteract} />

            <div className="mailbox-section">
                <Link to={config.urls.mailbox} className="mailbox-banner-card">
                    <div className="mailbox-left">
                        <div className="mailbox-icon-wrapper">
                            <i className="fas fa-inbox"></i><span className="notification-dot"></span>
                        </div>
                        <div className="mailbox-text">
                            <h3>Grading Mailbox</h3><p>Review and grade pending student assignments</p>
                        </div>
                    </div>
                    <div className="mailbox-right">
                        <div className="pending-badge"><i className="fas fa-bell"></i> <span>3 Pending</span></div>
                        <span className="btn-enter-mailbox">Enter Workspace <i className="fas fa-arrow-right"></i></span>
                    </div>
                </Link>
            </div>

            <div className="cards-container">
                {toolCardsData.map((card, index) => (
                    <ToolCard key={index} {...card} />
                ))}
            </div>
        </>
    );
}