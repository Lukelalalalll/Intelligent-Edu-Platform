import React, { useCallback, useEffect, useState } from 'react';
import WelcomeBanner from '../../../shared/components/WelcomeBanner';
import type { ToolSummary, HistoryItem } from '../api/fileCenterHistoryApi';
import { fileCenterHistoryApi } from '../api/fileCenterHistoryApi';
import ToolSummaryCards from '../components/ToolSummaryCards';
import ToolHistoryTab from '../components/ToolHistoryTab';
import HistoryDetailModal from '../components/HistoryDetailModal';
import styles from '../styles/fileCenter.module.css';
import '../../../styles/base.css';

export default function FileCenterPage() {
    const [tools, setTools] = useState<ToolSummary[]>([]);
    const [activeTool, setActiveTool] = useState('');
    const [detailItem, setDetailItem] = useState<HistoryItem | null>(null);

    const loadSummary = useCallback(async () => {
        try {
            const data = await fileCenterHistoryApi.getSummary();
            setTools(data);
        } catch {
            // silently fail
        }
    }, []);

    useEffect(() => { loadSummary(); }, [loadSummary]);

    return (
        <div className={styles.page}>
            <WelcomeBanner
                title={<><i className="fas fa-folder-open" /> File Center</>}
                subtitle="Browse and manage your generation history across all tools"
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
                        onDeleted={loadSummary}
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
