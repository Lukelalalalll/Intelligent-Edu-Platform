import { Bot, ScrollText } from 'lucide-react';

import type { QuestionGeneratorController } from '../../hooks/useQuestionGenerator';
import styles from '../../styles/questionStudio.module.css';
import { EntryCard, HistoryStrip } from '../QuestionStudioCards';

interface QuestionGeneratorHubProps {
    controller: QuestionGeneratorController;
}

export default function QuestionGeneratorHub({ controller }: QuestionGeneratorHubProps) {
    const { state, actions } = controller;

    return (
        <div className={styles.hubSection}>
            <div className={styles.heroGrid}>
                <EntryCard
                    title="Generate Question"
                    description="Start a new question workflow with free-form instructor intent, optional PDF source material, streaming structured results, and export-ready editing."
                    badge="Ready"
                    icon={<Bot size={26} />}
                    actionLabel="Open Generator"
                    onClick={() => {
                        actions.setView('generate');
                        actions.setWorkspaceStep('start');
                    }}
                />
                <EntryCard
                    title="Extract Question"
                    description="Reserved as the next entry point for extraction-first workflows. The card is live in the layout, but the extraction studio stays parked for now."
                    badge="Coming Soon"
                    icon={<ScrollText size={26} />}
                    actionLabel="Not Yet Available"
                    disabled
                />
            </div>

            <HistoryStrip
                items={state.historyState.items}
                loading={state.historyState.loading}
                onOpen={actions.hydrateHistoryResult}
            />
        </div>
    );
}
