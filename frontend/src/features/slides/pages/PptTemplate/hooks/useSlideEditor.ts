import { useMemo, useState } from 'react';

export function useSlideEditor(
    pptSchema: any,
    currentSlideIndex: number,
    setCurrentSlideIndex: (index: number) => void,
    reorderCurrentSlideBullets: (from: number, to: number) => void,
) {
    const [dragBulletIndex, setDragBulletIndex] = useState<number | null>(null);
    const [dragOverBulletIndex, setDragOverBulletIndex] = useState<number | null>(null);

    const currentSlide = pptSchema?.slides?.[currentSlideIndex];

    const configuredCount = useMemo(
        () => pptSchema?.slides?.filter((s: any) => s.layout?.name).length || 0,
        [pptSchema],
    );
    const totalSlides = pptSchema?.slides?.length || 0;
    const remainingSlides = Math.max(totalSlides - configuredCount, 0);
    const configProgress = totalSlides > 0 ? Math.round((configuredCount / totalSlides) * 100) : 0;
    const canGenerate = totalSlides > 0 && configuredCount === totalSlides;

    const getNextUnconfiguredSlideIndex = () => {
        if (!pptSchema?.slides?.length) return -1;
        const total = pptSchema.slides.length;
        for (let offset = 1; offset <= total; offset += 1) {
            const idx = (currentSlideIndex + offset) % total;
            if (!pptSchema.slides[idx]?.layout?.name) {
                return idx;
            }
        }
        return -1;
    };

    const jumpToNextUnconfiguredSlide = () => {
        const next = getNextUnconfiguredSlideIndex();
        if (next >= 0) {
            setCurrentSlideIndex(next);
        }
    };

    const moveCurrentBulletBy = (fromIndex: number, delta: number) => {
        const content = Array.isArray(currentSlide?.content) ? currentSlide.content : [];
        const toIndex = fromIndex + delta;
        if (toIndex < 0 || toIndex >= content.length) return;
        reorderCurrentSlideBullets(fromIndex, toIndex);
    };

    const handleBulletKeyDown = (e: React.KeyboardEvent, idx: number) => {
        if (e.altKey && e.key === 'ArrowUp') {
            e.preventDefault();
            moveCurrentBulletBy(idx, -1);
        }
        if (e.altKey && e.key === 'ArrowDown') {
            e.preventDefault();
            moveCurrentBulletBy(idx, 1);
        }
    };

    return {
        currentSlide,
        configuredCount,
        totalSlides,
        remainingSlides,
        configProgress,
        canGenerate,
        jumpToNextUnconfiguredSlide,
        moveCurrentBulletBy,
        handleBulletKeyDown,
        dragBulletIndex,
        setDragBulletIndex,
        dragOverBulletIndex,
        setDragOverBulletIndex,
    };
}
