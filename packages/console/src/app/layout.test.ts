import { describe, expect, it } from 'vitest';

import { SIDE_PANE_WIDTH, computeLayout } from './layout';

describe('computeLayout', () => {
    it('shows every region at 120x40 and leaves the log the width beside the side pane', () => {
        const layout = computeLayout(120, 40, {});

        expect(layout).toEqual({
            titleBar: true,
            sidePane: 'inline',
            sidePaneWidth: SIDE_PANE_WIDTH,
            logWidth: 120 - SIDE_PANE_WIDTH,
            logHeight: 37,
            levelWidth: 'full',
            showNamespace: true,
            compactStatus: false
        });
    });

    it('drops the title bar, side pane, and namespace column at 80x24', () => {
        const layout = computeLayout(80, 24, {});

        expect(layout.titleBar).toBe(false);
        expect(layout.sidePane).toBe('hidden');
        expect(layout.logWidth).toBe(80);
        expect(layout.logHeight).toBe(22);
        expect(layout.levelWidth).toBe('short');
        expect(layout.showNamespace).toBe(false);
        expect(layout.compactStatus).toBe(false);
    });

    it('treats 100 columns and 30 rows as the wide and tall thresholds', () => {
        expect(computeLayout(100, 30, {}).sidePane).toBe('inline');
        expect(computeLayout(100, 30, {}).titleBar).toBe(true);
        expect(computeLayout(99, 29, {}).sidePane).toBe('hidden');
        expect(computeLayout(99, 29, {}).titleBar).toBe(false);
    });

    it('turns the side pane into an overlay when asked for below 100 columns', () => {
        const layout = computeLayout(80, 24, { sidePaneVisible: true });

        expect(layout.sidePane).toBe('overlay');
        expect(layout.logWidth).toBe(80);
    });

    it('hides the side pane when asked to, even on a wide terminal', () => {
        const layout = computeLayout(120, 40, { sidePaneVisible: false });

        expect(layout.sidePane).toBe('hidden');
        expect(layout.logWidth).toBe(120);
    });

    it('keeps only the compact status segments below 60 columns', () => {
        expect(computeLayout(59, 24, {}).compactStatus).toBe(true);
        expect(computeLayout(60, 24, {}).compactStatus).toBe(false);
    });

    it('never reports a log pane shorter than one row', () => {
        expect(computeLayout(40, 2, {}).logHeight).toBe(1);
    });
});
