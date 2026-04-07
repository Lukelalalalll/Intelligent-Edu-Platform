export default function AnnotationLayer({ annotations, onSelect, selectedId }) {
    return (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {annotations.map((ann, idx) => (
                <button
                    key={ann.id || `temp-${idx}`}
                    type="button"
                    style={{
                        position: 'absolute',
                        left: `${(ann.x || 0) * 100}%`,
                        top: `${(ann.y || 0) * 100}%`,
                        width: 24,
                        height: 24,
                        transform: 'translate(-50%, -100%)',
                        background: ann.id === selectedId ? '#0b7a57' : '#1d4ed8',
                        border: '2px solid #fff',
                        color: '#fff',
                        borderRadius: '999px',
                        fontSize: 12,
                        fontWeight: 700,
                        lineHeight: '20px',
                        textAlign: 'center',
                        boxShadow: '0 6px 16px rgba(0,0,0,0.2)',
                        cursor: 'pointer',
                        pointerEvents: 'auto',
                        padding: 0,
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        onSelect?.(ann);
                    }}
                    title={ann.comment || ann.title || 'Tag'}
                >
                    {idx + 1}
                </button>
            ))}
        </div>
    );
}
