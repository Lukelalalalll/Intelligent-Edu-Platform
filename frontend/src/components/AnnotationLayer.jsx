export default function AnnotationLayer({ annotations, onSelect }) {
    return (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {annotations.map((ann) => (
                <div
                    key={ann.id}
                    style={{
                        position: 'absolute',
                        left: `${(ann.x || 0) * 100}%`,
                        top: `${(ann.y || 0) * 100}%`,
                        width: `${(ann.width || 0.15) * 100}%`,
                        height: `${(ann.height || 0.08) * 100}%`,
                        background: 'rgba(37, 99, 235, 0.18)',
                        border: '1px solid rgba(37,99,235,0.5)',
                        borderRadius: 6,
                        cursor: 'pointer',
                        pointerEvents: 'auto',
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        onSelect?.(ann);
                    }}
                    title={ann.comment || 'Annotation'}
                />
            ))}
        </div>
    );
}
