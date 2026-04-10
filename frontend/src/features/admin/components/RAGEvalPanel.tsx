import React, { useState } from 'react';
import styles from '../styles/AdminDashboard.module.css';
import CompareTab from './rag-eval/CompareTab';
import CaseTestTab from './rag-eval/CaseTestTab';
import DatasetsTab from './rag-eval/DatasetsTab';
import OverviewTab from './rag-eval/OverviewTab';
import RunsTab from './rag-eval/RunsTab';
import { TAB_OPTIONS } from './rag-eval/constants';
import type { Tab } from './rag-eval/types';

export default function RAGEvalPanel() {
    const [tab, setTab] = useState<Tab>('overview');

    return (
        <div className={styles.llmMonitorPanel}>
            <div className={styles.monitorToolbar}>
                <div className={styles.monitorTabs}>
                    {TAB_OPTIONS.map(option => (
                        <button
                            key={option.key}
                            className={`${styles.monitorTab} ${tab === option.key ? styles.monitorTabActive : ''}`}
                            onClick={() => setTab(option.key)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className={styles.monitorContent}>
                {tab === 'overview' && <OverviewTab />}
                {tab === 'datasets' && <DatasetsTab />}
                {tab === 'runs' && <RunsTab />}
                {tab === 'case-test' && <CaseTestTab />}
                {tab === 'compare' && <CompareTab />}
            </div>
        </div>
    );
}
