import React, { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import WelcomeBanner from '@/shared/components/WelcomeBanner';
import { useI18n } from '@/shared/i18n';
import ToolCard from '../components/ToolCard';
import AIChatBox from '../components/AIChatBox';
import layoutStyles from '../styles/HomeLayout.module.css';

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
    highlighter: '/slides/highlighter',
};

export default function HomePage() {
    const location = useLocation();
    const { t } = useI18n();
    const initialTab = new URLSearchParams(location.search).get('tab');
    const [activeTab, setActiveTab] = useState(
        initialTab === 'tools' || initialTab === 'ai' || initialTab === 'homework' ? initialTab : 'ai',
    ); // 'ai' | 'tools' | 'homework'
    const toolCardsData = useMemo(() => [
        { title: t('home.tool.aiSlides.title'), desc: t('home.tool.aiSlides.desc'), icon: "fa-book-open", url: HOME_URLS.sub1 },
        { title: t('home.tool.highlighter.title'), desc: t('home.tool.highlighter.desc'), icon: "fa-highlighter", url: HOME_URLS.highlighter },
        { title: t('home.tool.questions.title'), desc: t('home.tool.questions.desc'), icon: "fa-question-circle", url: HOME_URLS.sub2 },
        { title: t('home.tool.visual.title'), desc: t('home.tool.visual.desc'), icon: "fa-images", url: HOME_URLS.sub4 },
        { title: t('home.tool.studyNotes.title'), desc: t('home.tool.studyNotes.desc'), icon: "fa-book-reader", url: HOME_URLS.sub5 },
        { title: t('home.tool.video.title'), desc: t('home.tool.video.desc'), icon: "fa-film", url: HOME_URLS.videoGen },
    ], [t]);

    const homeworkCardsData = useMemo(() => [
        {
            title: t('home.homework.mailbox.title'),
            desc: t('home.homework.mailbox.desc'),
            icon: "fa-inbox",
            url: HOME_URLS.mailbox,
        },
        {
            title: t('home.homework.publish.title'),
            desc: t('home.homework.publish.desc'),
            icon: "fa-bullhorn",
            url: HOME_URLS.publishHomework,
        },
    ], [t]);


    return (
        <div>
            <WelcomeBanner className={layoutStyles['welcome-banner']} variant="hero" />

            {/* Tab Switcher: AI Space | Tools | Homework Manage */}
            <div className={layoutStyles['tab-switcher']}>
                <button
                    className={`${layoutStyles['tab-btn']} ${activeTab === 'ai' ? layoutStyles['tab-active'] : ''}`}
                    onClick={() => setActiveTab('ai')}
                >
                    <i className="fas fa-robot"></i> {t('home.tab.ai')}
                </button>
                <button
                    className={`${layoutStyles['tab-btn']} ${activeTab === 'tools' ? layoutStyles['tab-active'] : ''}`}
                    onClick={() => setActiveTab('tools')}
                >
                    <i className="fas fa-th-large"></i> {t('home.tab.tools')}
                </button>
                <button
                    className={`${layoutStyles['tab-btn']} ${activeTab === 'homework' ? layoutStyles['tab-active'] : ''}`}
                    onClick={() => setActiveTab('homework')}
                >
                    <i className="fas fa-tasks"></i> {t('home.tab.homework')}
                </button>
            </div>

            {activeTab === 'ai' ? (
                <AIChatBox aiInteractUrl={HOME_URLS.aiInteract} />
            ) : activeTab === 'tools' ? (
                <>
                    <div className={layoutStyles['cards-container']}>
                        {toolCardsData.map((card, index) => (
                            <div key={index}>
                                <ToolCard {...card} />
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <div
                    className={`${layoutStyles['cards-container']} ${layoutStyles['homework-cards']}`}
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
