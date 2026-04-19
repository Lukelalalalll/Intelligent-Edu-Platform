import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import WelcomeBanner from '@/shared/components/WelcomeBanner';
import ToolCard from './ToolCard';
import AIChatBox from './AIChatBox';
import styles from '../styles/home.module.css';

const HOME_URLS = {
    sub1: '/slides/md-processor',
    sub2: '/questions',
    sub4: '/diagram',
    sub5: '/study-notes',
    mailbox: '/mailbox',
    publishHomework: '/publish-homework',
    aiInteract: '/ai-interaction',
    knowledgeBase: '/knowledge-base',
    videoGen: '/video-gen',
};

export default function HomePage() {
    const location = useLocation();
    const [activeTab, setActiveTab] = useState('ai'); // 'ai' | 'tools' | 'homework'
    const toolCardsData = useMemo(() => [
        { title: "AI Slides Generator", desc: "Intelligent document processing and presentation generation", icon: "fa-book-open", url: HOME_URLS.sub1 },
        { title: "AI Question Generator", desc: "Smart question extraction and automated generation", icon: "fa-question-circle", url: HOME_URLS.sub2 },
        { title: "AI Visual Tool", desc: "Diagram extraction, image extraction, SVG editing, AI generation", icon: "fa-images", url: HOME_URLS.sub4 },
        { title: "AI Study Notes", desc: "Generate structured study notes and flashcards from lecture PDFs", icon: "fa-book-reader", url: HOME_URLS.sub5 },
        { title: "AI Video Generator", desc: "Turn PDFs, notes or text into narrated teaching videos", icon: "fa-film", url: HOME_URLS.videoGen },
    ], []);

    const homeworkCardsData = useMemo(() => [
        {
            title: "Grading Mailbox",
            desc: "Review and grade pending student assignments",
            icon: "fa-inbox",
            url: HOME_URLS.mailbox,
        },
        {
            title: "Publish Homework",
            desc: "Create and publish assignments for your courses",
            icon: "fa-bullhorn",
            url: HOME_URLS.publishHomework,
        },
    ], []);

    useEffect(() => {
        const tab = new URLSearchParams(location.search).get('tab');
        if (tab === 'tools' || tab === 'ai' || tab === 'homework') {
            setActiveTab(tab);
        }
    }, [location.search]);

    return (
        <div>
            <WelcomeBanner className={styles['welcome-banner']} />

            {/* Tab Switcher: AI Space | Tools | Homework Manage */}
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
                <button
                    className={`${styles['tab-btn']} ${activeTab === 'homework' ? styles['tab-active'] : ''}`}
                    onClick={() => setActiveTab('homework')}
                >
                    <i className="fas fa-tasks"></i> Homework Manage
                </button>
            </div>

            {activeTab === 'ai' ? (
                <AIChatBox aiInteractUrl={HOME_URLS.aiInteract} />
            ) : activeTab === 'tools' ? (
                <>
                    <div className={styles['cards-container']}>
                        {toolCardsData.map((card, index) => (
                            <div key={index}>
                                <ToolCard {...card} />
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <div
                    className={styles['cards-container']}
                    style={{ gridTemplateColumns: 'repeat(2, minmax(260px, 1fr))', maxWidth: '900px', marginLeft: 'auto', marginRight: 'auto' }}
                >
                    {homeworkCardsData.map((card, index) => (
                        <div key={index}>
                            <ToolCard {...card} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}