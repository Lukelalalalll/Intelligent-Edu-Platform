import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

type Props = {
    isGenerating: boolean;
    generateProgress: number;
    onCancelGenerate: () => void;
};

export default function GenerationOverlay({ isGenerating, generateProgress, onCancelGenerate }: Props) {
    return createPortal(
        <AnimatePresence>
            {isGenerating && (
                <motion.div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(255,255,255,0.4)',
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 9999,
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                >
                    <motion.div
                        style={{
                            background: '#fff',
                            borderRadius: 20,
                            padding: '40px 50px',
                            minWidth: 380,
                            maxWidth: 480,
                            boxShadow: '0 12px 48px rgba(0,0,0,0.15)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                        }}
                        initial={{ scale: 0.9, opacity: 0, y: 10 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 10 }}
                        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                    >
                        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'center' }}>
                            <div style={{ width: 50, height: 50, border: '4px solid #e2e8f0', borderTop: '4px solid var(--primary-color)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}>
                                <style>{`
                                    @keyframes spin {
                                        0% { transform: rotate(0deg); }
                                        100% { transform: rotate(360deg); }
                                    }
                                `}</style>
                            </div>
                        </div>

                        <h4 style={{ margin: '0 0 8px', fontSize: '1.3rem', fontWeight: 600, color: '#1e293b' }}>
                            Generating Presentation...
                        </h4>
                        <p style={{ margin: '0 0 24px', fontSize: '0.95rem', color: '#64748b' }}>
                            AI is assigning layouts &amp; rendering slides
                        </p>

                        <div style={{ width: '100%', marginBottom: 24 }}>
                            <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                                <motion.div
                                    style={{ height: '100%', background: 'linear-gradient(90deg, #007B55, #00A676)', borderRadius: 4 }}
                                    animate={{ width: `${generateProgress}%` }}
                                    transition={{ ease: 'easeOut', duration: 0.5 }}
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: '0.85rem', color: '#94a3b8' }}>
                                <span>Progress</span>
                                <span>{Math.round(generateProgress)}%</span>
                            </div>
                        </div>

                        <button
                            onClick={onCancelGenerate}
                            style={{
                                padding: '10px 24px',
                                borderRadius: 8,
                                border: '1px solid #e2e8f0',
                                background: '#fff',
                                color: '#64748b',
                                fontSize: '0.95rem',
                                fontWeight: 500,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                            onMouseOver={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#334155'; }}
                            onMouseOut={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#64748b'; }}
                        >
                            Cancel Generation
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body,
    );
}
