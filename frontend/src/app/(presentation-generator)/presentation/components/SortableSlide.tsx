import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Slide } from '../../types/slide';
import { CSSProperties, useMemo, useRef } from 'react';
import { SlideThumbnailCard } from './SlideThumbnailCard';
interface SortableSlideProps {
    slide: Slide;
    index: number;
    selectedSlide: number;
    onSlideClick: (index: any) => void;
    renderMode?: 'live' | 'shell';
    style?: CSSProperties;
}

export function SortableSlide({
    slide,
    index,
    selectedSlide,
    onSlideClick,
    renderMode = 'live',
    style,
}: SortableSlideProps) {
    const lastClickTime = useRef(0);
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: slide.id || `${slide.index}` });

    const mergedStyle = useMemo<CSSProperties>(() => ({
        ...style,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    }), [isDragging, style, transform, transition]);

    const handleClick = (e: React.MouseEvent) => {
        const now = Date.now();

        // Debounce clicks - only allow one click every 300ms
        if (now - lastClickTime.current < 300) {
            return;
        }

        // Only trigger click if not dragging
        if (!isDragging) {
            lastClickTime.current = now;
            onSlideClick(slide.index);
        }
    };

    return (
        <SlideThumbnailCard
            ref={setNodeRef}
            slide={slide}
            index={index}
            selected={selectedSlide === index}
            renderMode={renderMode}
            style={mergedStyle}
            {...attributes}
            {...listeners}
            onClick={handleClick}
        />
    );
}

