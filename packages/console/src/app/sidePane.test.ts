import { describe, expect, it } from 'vitest';

import { INITIAL_DEV_STATE } from './devState';
import type { SidePaneModel } from './sidePane';
import { bootStepLabel, graphCells, sidePaneRows } from './sidePane';

const model = (overrides: Partial<SidePaneModel> = {}): SidePaneModel => ({
    state: 'running',
    tpsHistory: [],
    dev: INITIAL_DEV_STATE,
    ...overrides
});

const sections = (rows: ReturnType<typeof sidePaneRows>) =>
    rows.flatMap((row) => (row.kind === 'header' ? [row.key] : []));

describe('sidePaneRows', () => {
    it('lists each online player, up to five, and a note for the rest', () => {
        const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
        const rows = sidePaneRows(model({ players: { online: 7, max: 20 }, playerNames: names }));

        expect(rows.filter((row) => row.kind === 'player')).toHaveLength(5);
        expect(rows.filter((row) => row.kind === 'note')).toHaveLength(1);
    });

    it('notes an empty server instead of listing players', () => {
        const rows = sidePaneRows(model({ players: { online: 0, max: 20 } }));

        expect(rows.filter((row) => row.kind === 'player')).toHaveLength(0);
        expect(rows.filter((row) => row.kind === 'note')).toHaveLength(1);
    });

    it('leaves the state to the title bar', () => {
        const rows = sidePaneRows(model());
        expect(rows.some((row) => row.kind === 'value' && row.value === 'running')).toBe(false);
    });

    it('adds the dev section only once the watcher has restarted the server', () => {
        const watching = {
            ...INITIAL_DEV_STATE,
            watchRoot: 'packages',
            badge: { text: 'watching', tone: 'muted' as const }
        };

        expect(sections(sidePaneRows(model({ dev: watching })))).not.toContain('dev');
        expect(sections(sidePaneRows(model({ dev: { ...watching, restarts: 1, lastRestartAt: 0 } })))).toContain('dev');
    });
});

describe('the boot section', () => {
    const boot = [
        { id: 'prismarine:content', startedAt: 0, finishedAt: 3480 },
        { id: 'prismarine:worlds', startedAt: 3480 }
    ];

    it('lists each step while the server starts, the running one in the warning tone', () => {
        const rows = sidePaneRows(model({ state: 'starting', boot }));
        const steps = rows.flatMap((row) => (row.kind === 'value' && /^[✓●] /.test(row.label) ? [row] : []));

        expect(sections(rows)[1]).toBe('boot');
        expect(steps.map((row) => row.tone)).toEqual(['muted', 'warning']);
    });

    it('counts the seconds the running step has taken', () => {
        const value = (now: number) =>
            sidePaneRows(model({ state: 'starting', boot, now })).find(
                (row) => row.kind === 'value' && row.label === '● worlds'
            );
        expect(value(3480 + 500)).toMatchObject({ value: 'now' });
        expect(value(3480 + 12_400)).toMatchObject({ value: '12 s' });
        expect(value(3480 + 125_000)).toMatchObject({ value: '2 min 5 s' });
    });

    it('goes once the server runs', () => {
        expect(sections(sidePaneRows(model({ state: 'running', boot })))).not.toContain('boot');
    });

    it('names a step by the last part of its id', () => {
        expect(bootStepLabel('prismarine:load-functions')).toBe('load functions');
        expect(bootStepLabel('plain')).toBe('plain');
    });
});

describe('graphCells', () => {
    it('measures readings against the server tick rate', () => {
        // 30 is half way up a graph that tops out at 40, and over the top of one that tops out at 20.
        expect(graphCells([30], 40, 10).map((cell) => cell.level)).toEqual([4]);
        expect(graphCells([30], 20, 10).map((cell) => cell.level)).toEqual([7]);
    });

    it('defaults to a rate of 20', () => {
        expect(graphCells([20], undefined, 10)).toEqual(graphCells([20], 20, 10));
    });
});
