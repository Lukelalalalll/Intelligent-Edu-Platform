import React from 'react';
import type { DegreeLevel } from '../types';
import styles from '../styles/mailbox.module.css';

const degreeLevels: DegreeLevel[] = ['bachelor', 'master', 'phd'];
const degreeLabels: Record<DegreeLevel, string> = { bachelor: 'Bachelor', master: 'Master', phd: 'PhD' };
const degreeIcons: Record<DegreeLevel, string> = { bachelor: 'fa-user-graduate', master: 'fa-user-tie', phd: 'fa-microscope' };
const degreeDescs: Record<DegreeLevel, string> = { bachelor: 'Undergraduate Programs', master: 'Taught Postgraduate', phd: 'Research Postgraduate' };

interface DegreeStepProps {
    degreePending: Record<string, number>;
    onSelect: (degree: DegreeLevel) => void;
}

export default function DegreeStep({ degreePending, onSelect }: DegreeStepProps) {
    return (
        <div className={styles.stepContent}>
            <h2 className={styles.sectionTitle}>
                <i className="fas fa-graduation-cap"></i> Select Degree Level
            </h2>
            <div className={styles.selectionGrid}>
                {degreeLevels.map((deg, idx) => (
                    <div
                        key={deg}
                        className={styles.selectionCard}
                        style={{ animationDelay: `${idx * 0.08}s` }}
                        onClick={() => onSelect(deg)}
                    >
                        <div className={styles.cardIconLarge}>
                            <i className={`fas ${degreeIcons[deg]}`}></i>
                        </div>
                        <h3>{degreeLabels[deg]}</h3>
                        <p>{degreeDescs[deg]}</p>
                        <span className={`${styles.badge} ${degreePending[deg] > 0 ? styles.badgePending : styles.badgeSuccess}`}>
                            {degreePending[deg] > 0
                                ? `${degreePending[deg]} Courses`
                                : <><i className="fas fa-check-circle"></i> All Caught Up</>}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
