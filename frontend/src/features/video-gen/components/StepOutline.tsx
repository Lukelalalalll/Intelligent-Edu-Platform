import styles from '../styles/videoGen.module.css';

interface Props {
    scripts: string[];
    onEdit: (scripts: string[]) => void;
    onNext: () => void;
    onBack: () => void;
}

export default function StepOutline({ scripts, onEdit, onNext, onBack }: Props) {
    const removeItem = (idx: number) => {
        if (scripts.length <= 1) return;
        onEdit(scripts.filter((_, i) => i !== idx));
    };

    return (
        <div className={styles.stepCard}>
            <div className={styles.stepTitle}>
                <div className={styles.stepIcon}>3</div>
                Content Outline
            </div>
            <p className={styles.hint}>
                This video will have <strong>{scripts.length}</strong> segments.
                Each segment = 1 slide image + AI narration audio.
            </p>

            <div className={styles.outlineList}>
                {scripts.map((s, i) => (
                    <div key={i} className={styles.outlineItem}>
                        <span className={styles.outlineNum}>{i + 1}</span>
                        <span style={{ flex: 1 }}>{s.slice(0, 120)}{s.length > 120 ? '...' : ''}</span>
                        {scripts.length > 1 && (
                            <button
                                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                                onClick={() => removeItem(i)}
                                title="Remove segment"
                            >
                                <i className="fas fa-times" />
                            </button>
                        )}
                    </div>
                ))}
            </div>

            <div className={styles.outlineActions}>
                <button className={styles.secondaryBtn} onClick={onBack}>
                    <i className="fas fa-arrow-left" /> Back to Edit
                </button>
                <button className={styles.primaryBtn} onClick={onNext}>
                    <i className="fas fa-video" /> Generate Video
                </button>
            </div>
        </div>
    );
}
