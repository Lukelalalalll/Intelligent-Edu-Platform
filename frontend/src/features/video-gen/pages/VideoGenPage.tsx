import { useState } from 'react';
import VideoGenView from '../components/VideoGenView';
import HistoryPanel from '../components/HistoryPanel';
import Button from '../../../shared/components/Button/Button';
import Card from '../../../shared/components/Card/Card';
import WelcomeBanner from '../../../shared/components/WelcomeBanner';
import entranceStyles from '@/shared/page-entrance/PageEntrance.module.css';
import { usePageEntrance } from '@/shared/page-entrance/usePageEntrance';
import videoStyles from '../styles/videoGen.module.css';
import s from '../../../styles/history.module.css';

export default function VideoGenPage() {
    const isEntranceActive = usePageEntrance();
    const [activeView, setActiveView] = useState<'workflow' | 'history'>('workflow');

    const viewSwitchJSX = (
        <div className={s.viewSwitch}>
            <Button type="button" variant={activeView === 'workflow' ? 'primary' : 'outline'} onClick={() => setActiveView('workflow')}>
                <i className="fas fa-video" /> Workflow
            </Button>
            <Button type="button" variant={activeView === 'history' ? 'primary' : 'outline'} onClick={() => setActiveView('history')}>
                <i className="fas fa-history" /> History
            </Button>
        </div>
    );

    return (
        <div className={`container ${entranceStyles.pageEntrance} ${isEntranceActive ? entranceStyles.pageEntranceActive : ''}`}>
            <WelcomeBanner
                className={videoStyles.videoBanner}
                title="AI Teaching Video Generator"
                subtitle="Upload content, generate narration scripts, customise scenes and create teaching videos"
                variant="workspace"
            />
            {viewSwitchJSX}
            {activeView === 'workflow' && <VideoGenView hideBanner />}
            {activeView === 'history' && (
                <Card className={s.historyViewCard} glass>
                    <HistoryPanel />
                </Card>
            )}
        </div>
    );
}
