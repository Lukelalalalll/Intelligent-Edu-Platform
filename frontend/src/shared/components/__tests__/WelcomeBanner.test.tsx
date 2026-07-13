import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WelcomeBanner from '../WelcomeBanner';

vi.mock('@/shared/i18n', () => ({
    useI18n: () => ({
        t: (key: string) => key,
    }),
}));

function setScrollY(value: number) {
    Object.defineProperty(window, 'scrollY', {
        configurable: true,
        value,
        writable: true,
    });
}

describe('WelcomeBanner', () => {
    beforeEach(() => {
        setScrollY(0);
    });

    it('renders workspace variant by default', () => {
        render(<WelcomeBanner title="Workspace Title" subtitle="Workspace Subtitle" />);

        const banner = screen.getByText('Workspace Title').closest('section');
        expect(banner).toHaveClass('page-header--workspace');
        expect(banner).toHaveAttribute('data-banner-variant', 'workspace');
    });

    it('renders the hero variant when requested', () => {
        render(<WelcomeBanner title="Hero Title" subtitle="Hero Subtitle" variant="hero" />);

        const banner = screen.getByText('Hero Title').closest('section');
        expect(banner).toHaveClass('page-header--hero');
    });

    it('renders the requested tag without intro or collapse classes', () => {
        render(<WelcomeBanner title="Header Title" subtitle="Header Subtitle" as="header" />);

        const banner = screen.getByText('Header Title').closest('header');
        expect(banner).not.toHaveClass('page-header--intro');
        expect(banner).not.toHaveClass('page-header--collapsible');
        expect(banner).not.toHaveClass('page-header--collapsed');
    });
});
