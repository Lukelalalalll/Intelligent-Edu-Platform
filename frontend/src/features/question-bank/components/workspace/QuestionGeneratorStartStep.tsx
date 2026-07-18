import { ArrowLeft, Sparkles } from 'lucide-react';

import Button from '@/shared/components/Button/Button';

import type { QuestionGeneratorController } from '../../hooks/useQuestionGenerator';
import styles from '../../styles/questionStudio.module.css';

interface QuestionGeneratorStartStepProps {
    controller: QuestionGeneratorController;
}

export default function QuestionGeneratorStartStep({ controller }: QuestionGeneratorStartStepProps) {
    const { actions } = controller;

    return (
        <section className={styles.workspace}>
            <div className={styles.startCard}>
                <div className={styles.startHeader}>
                    <span className={styles.statusBadge}>Start</span>
                    <h2 className={styles.entryTitle}>Choose your source mix, then let the model build the set.</h2>
                    <p className={styles.sectionText}>
                        Text can stand on its own, PDFs can stand on their own, and when both are present the PDF becomes the source corpus while your text becomes the instructor intent.
                    </p>
                </div>
                <div className={styles.startActions}>
                    <Button type="button" onClick={() => actions.setWorkspaceStep('composer')}>
                        <Sparkles size={16} /> Begin
                    </Button>
                    <Button type="button" variant="outline" onClick={() => actions.setView('hub')}>
                        <ArrowLeft size={16} /> Back to Studio
                    </Button>
                </div>
            </div>
        </section>
    );
}
