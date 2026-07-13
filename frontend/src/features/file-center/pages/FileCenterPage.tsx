import React, { useCallback, useEffect, useState } from 'react';
import WelcomeBanner from '../../../shared/components/WelcomeBanner';
import entranceStyles from '@/shared/page-entrance/PageEntrance.module.css';
import { usePageEntrance } from '@/shared/page-entrance/usePageEntrance';
import type { ToolSummary, HistoryItem } from '../api/fileCenterHistoryApi';
import { fileCenterHistoryApi } from '../api/fileCenterHistoryApi';
import { useAsyncLoader } from '@/shared/hooks/useAsyncLoader';
import ToolSummaryCards from '../components/ToolSummaryCards';
import ToolHistoryTab from '../components/ToolHistoryTab';
import HistoryDetailModal from '../components/HistoryDetailModal';
import styles from '../styles/fileCenter.module.css';
import '../../../styles/base.css';

export default function FileCenterPage() {
    const isEntranceActive = usePageEntrance();
    const [activeTool, setActiveTool] = useState('');
    const [detailItem, setDetailItem] = useState<HistoryItem | null>(null);
    const loadToolSummary = useCallback(() => fileCenterHistoryApi.getSummary(), []);

    const {
        data: tools,
        reload: loadSummary,
    } = useAsyncLoader<ToolSummary[]>({
        initialData: [],
        load: loadToolSummary,
    });

    useEffect(() => {
        void loadSummary();
    }, [loadSummary]);

    return (
        <div className={`${styles.page} ${entranceStyles.pageEntrance} ${isEntranceActive ? entranceStyles.pageEntranceActive : ''}`}>
            <WelcomeBanner
                title={<><i className="fas fa-folder-open" /> File Center</>}
                subtitle="Browse and manage your generation history across all tools"
                variant="workspace"
            />

            {/* Tool selection */}
            {!activeTool && (
                <ToolSummaryCards tools={tools} activeTool={activeTool} onSelect={setActiveTool} />
            )}

            {/* History drill-down for selected tool */}
            {activeTool && (
                <>
                    <div className={styles.toolNav}>
                        <button className={styles.backBtn} type="button" onClick={() => setActiveTool('')}>
                            <i className="fas fa-arrow-left" /> Back to Tools
                        </button>
                    </div>
                    <ToolHistoryTab
                        key={activeTool}
                        tool={activeTool}
                        onDeleted={() => void loadSummary()}
                    />
                </>
            )}

            {detailItem && (
                <HistoryDetailModal
                    item={detailItem}
                    tool={activeTool}
                    onClose={() => setDetailItem(null)}
                />
            )}
        </div>
    );
}
