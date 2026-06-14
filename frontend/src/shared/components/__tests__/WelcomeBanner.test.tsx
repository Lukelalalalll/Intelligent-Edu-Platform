import { act, render, screen, waitFor } from '@testing-library/react';
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
        expect(banner).toHaveAttribute('data-banner-collapsible', 'false');
        expect(banner).toHaveAttribute('data-banner-collapsed', 'false');
    });

    it('renders the hero variant when requested', () => {
        render(<WelcomeBanner title="Hero Title" subtitle="Hero Subtitle" variant="hero" />);

        const banner = screen.getByText('Hero Title').closest('section');
        expect(banner).toHaveClass('page-header--hero');
    });

    it('collapses on scroll with hysteresis thresholds', async () => {
        render(
            <WelcomeBanner
                title="Collapsible Title"
                subtitle="Collapsible Subtitle"
                collapseOnScroll
            />,
        );

        const banner = screen.getByText('Collapsible Title').closest('section');
        expect(banner).toHaveAttribute('data-banner-collapsible', 'true');
        expect(banner).toHaveAttribute('data-banner-collapsed', 'false');

        act(() => {
            setScrollY(80);
            window.dispatchEvent(new Event('scroll'));
        });

        await waitFor(() => {
            expect(banner).toHaveAttribute('data-banner-collapsed', 'true');
        });

        act(() => {
            setScrollY(48);
            window.dispatchEvent(new Event('scroll'));
        });

        await waitFor(() => {
            expect(banner).toHaveAttribute('data-banner-collapsed', 'true');
        });

        act(() => {
            setScrollY(20);
            window.dispatchEvent(new Event('scroll'));
        });

        await waitFor(() => {
            expect(banner).toHaveAttribute('data-banner-collapsed', 'false');
        });
    });
});
