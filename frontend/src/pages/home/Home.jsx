import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import WelcomeBanner from './components/WelcomeBanner';
import ToolCard from './components/ToolCard';
import GeminiChat from './components/GeminiChat';
import styles from '../../styles/home/home.module.css';

export default function Home({ config }) {
    const location = useLocation();
    const [activeTab, setActiveTab] = useState('ai'); // 'ai' | 'tools'
    const toolCardsData = useMemo(() => [
        { title: "AI Slides Generator", desc: "Intelligent document processing and presentation generation", icon: "fa-book-open", url: config.urls.sub1 },
        { title: "AI Question Generator", desc: "Smart question extraction and automated generation", icon: "fa-users", url: config.urls.sub3 },
        { title: "AI Image Extract System", desc: "PDF image extraction and AI generation tool", icon: "fa-tasks", url: config.urls.sub4 },
        { title: "AI Diagram Tool", desc: "Extract from word/PDF, Search and Edit SVG, AI Generate", icon: "fa-cog", url: config.urls.sub5 },
    ], [config.urls]);

    useEffect(() => {
        const tab = new URLSearchParams(location.search).get('tab');
        if (tab === 'tools' || tab === 'ai') {
            setActiveTab(tab);
        }
    }, [location.search]);

    return (
        <div>
            <WelcomeBanner />

            {/* Tab Switcher: AI Space | Tools */}
            <div className={styles['tab-switcher']}>
                <button
                    className={`${styles['tab-btn']} ${activeTab === 'ai' ? styles['tab-active'] : ''}`}
                    onClick={() => setActiveTab('ai')}
                >
                    <i className="fas fa-robot"></i> AI Space
                </button>
                <button
                    className={`${styles['tab-btn']} ${activeTab === 'tools' ? styles['tab-active'] : ''}`}
                    onClick={() => setActiveTab('tools')}
                >
                    <i className="fas fa-th-large"></i> Tools
                </button>
            </div>

            {activeTab === 'ai' ? (
                <GeminiChat aiInteractUrl={config.urls.aiInteract} />
            ) : (
                <>
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
                            <div key={index}>
                                <ToolCard {...card} />
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}