import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import WelcomeBanner from '../../shared/components/WelcomeBanner';
import ToolCard from './components/ToolCard';
import AIChatBox from './components/AIChatBox';
import styles from './styles/home.module.css';

export default function Home({ config }) {
    const location = useLocation();
    const [activeTab, setActiveTab] = useState('ai'); // 'ai' | 'tools' | 'homework'
    const toolCardsData = useMemo(() => [
        { title: "AI Slides Generator", desc: "Intelligent document processing and presentation generation", icon: "fa-book-open", url: config.urls.sub1 },
        { title: "AI Question Generator", desc: "Smart question extraction and automated generation", icon: "fa-question-circle", url: config.urls.sub2 },
        { title: "AI Visual Tool", desc: "Diagram extraction, image extraction, SVG editing, AI generation", icon: "fa-images", url: config.urls.sub4 },
        { title: "AI Study Notes", desc: "Generate structured study notes and flashcards from lecture PDFs", icon: "fa-book-reader", url: config.urls.sub5 },
    ], [config.urls]);

    const homeworkCardsData = useMemo(() => [
        {
            title: "Grading Mailbox",
            desc: "Review and grade pending student assignments",
            icon: "fa-inbox",
            url: config.urls.mailbox,
        },
        {
            title: "Publish Homework",
            desc: "Create and publish assignments for your courses",
            icon: "fa-bullhorn",
            url: config.urls.publishHomework,
        },
    ], [config.urls]);

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
                <AIChatBox aiInteractUrl={config.urls.aiInteract} />
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