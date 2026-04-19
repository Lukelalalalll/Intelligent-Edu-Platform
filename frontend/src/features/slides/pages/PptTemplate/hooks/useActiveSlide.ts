import { useCallback, useState } from 'react';

export function useActiveSlide(initialIndex = 0) {
    const [activeSlideIdx, setActiveSlideIdx] = useState(initialIndex);

    const setActiveSlide = useCallback((idx: number) => {
        setActiveSlideIdx(idx);
    }, []);

    const resetActiveSlide = useCallback(() => {
        setActiveSlideIdx(0);
    }, []);

    return {
        activeSlideIdx,
        setActiveSlide,
        resetActiveSlide,
    };
}
