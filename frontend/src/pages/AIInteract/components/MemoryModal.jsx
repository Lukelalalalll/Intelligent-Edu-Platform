import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import styles from '../../../styles/AIInteract.module.css';

export default function MemoryModal({ show, onClose, memory, onSave, saving }) {
    const [form, setForm] = useState({ name: '', major: '', year: '', preferences: '' });

    useEffect(() => {
        if (show && memory) {
            setForm({
                name: memory.name || '',
                major: memory.major || '',
                year: memory.year || '',
                preferences: memory.preferences || '',
            });
        }
    }, [show, memory]);

    const handleChange = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }));

    const handleSave = () => onSave(form);

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    className={styles['custom-modal-overlay']}
                    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <motion.div
                        className={styles['custom-modal-box']}
                        style={{ width: 420, textAlign: 'left' }}
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    >
                        <div className={styles['modal-icon']} style={{ background: 'rgba(0,123,85,0.1)', color: 'var(--primary-color, #007B55)' }}>
                            <i className="fas fa-brain"></i>
                        </div>
                        <h3 className={styles['modal-title']} style={{ textAlign: 'center' }}>AI Memory</h3>
                        <p className={styles['modal-desc']} style={{ textAlign: 'center' }}>
                            Help the AI remember your background across all conversations.
                        </p>

                        <div className={styles['memory-form']}>
                            <label className={styles['memory-label']}>
                                <span><i className="fas fa-user"></i> Name</span>
                                <input
                                    className={styles['memory-input']}
                                    value={form.name}
                                    onChange={handleChange('name')}
                                    placeholder="e.g. Alex"
                                    maxLength={100}
                                />
                            </label>
                            <label className={styles['memory-label']}>
                                <span><i className="fas fa-graduation-cap"></i> Major</span>
                                <input
                                    className={styles['memory-input']}
                                    value={form.major}
                                    onChange={handleChange('major')}
                                    placeholder="e.g. Computer Science"
                                    maxLength={100}
                                />
                            </label>
                            <label className={styles['memory-label']}>
                                <span><i className="fas fa-calendar-alt"></i> Year</span>
                                <input
                                    className={styles['memory-input']}
                                    value={form.year}
                                    onChange={handleChange('year')}
                                    placeholder="e.g. Year 2"
                                    maxLength={50}
                                />
                            </label>
                            <label className={styles['memory-label']}>
                                <span><i className="fas fa-sliders-h"></i> Preferences</span>
                                <textarea
                                    className={styles['memory-textarea']}
                                    value={form.preferences}
                                    onChange={handleChange('preferences')}
                                    placeholder="e.g. Prefer concise answers with code examples"
                                    maxLength={200}
                                    rows={2}
                                />
                            </label>
                        </div>

                        <div className={styles['modal-actions']} style={{ marginTop: 20 }}>
                            <button className={`${styles['modal-btn']} ${styles['cancel-btn']}`} onClick={onClose}>Cancel</button>
                            <button
                                className={`${styles['modal-btn']} ${styles['confirm-btn']}`}
                                style={{ background: 'var(--primary-color, #007B55)', boxShadow: '0 4px 12px rgba(0,123,85,0.2)' }}
                                onClick={handleSave}
                                disabled={saving}
                            >
                                {saving ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

MemoryModal.propTypes = {
    show: PropTypes.bool,
    onClose: PropTypes.func,
    memory: PropTypes.shape({
        name: PropTypes.string,
        major: PropTypes.string,
        year: PropTypes.string,
        preferences: PropTypes.string,
    }),
    onSave: PropTypes.func,
    saving: PropTypes.bool,
};
