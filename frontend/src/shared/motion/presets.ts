import type { HTMLMotionProps, Transition } from 'framer-motion';

type MotionConfig = Pick<HTMLMotionProps<'div'>, 'initial' | 'animate' | 'exit' | 'transition'>;

const easeOut: Transition['ease'] = [0.22, 1, 0.36, 1];

export function getFadeMotion(reducedMotion: boolean): MotionConfig {
    return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: reducedMotion
            ? { duration: 0.12, ease: 'linear' }
            : { duration: 0.18, ease: 'easeOut' },
    };
}

export function getModalMotion(reducedMotion: boolean): MotionConfig {
    return {
        initial: reducedMotion ? { opacity: 0.9 } : { opacity: 0, y: 10, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 },
        transition: reducedMotion
            ? { duration: 0.12, ease: 'linear' }
            : { duration: 0.22, ease: easeOut },
    };
}

export function getBannerMotion(reducedMotion: boolean): MotionConfig {
    return {
        initial: reducedMotion ? { opacity: 0 } : { y: -40, opacity: 0 },
        animate: { y: 0, opacity: 1 },
        exit: reducedMotion ? { opacity: 0 } : { y: -40, opacity: 0 },
        transition: reducedMotion
            ? { duration: 0.12, ease: 'linear' }
            : { duration: 0.24, ease: easeOut },
    };
}
