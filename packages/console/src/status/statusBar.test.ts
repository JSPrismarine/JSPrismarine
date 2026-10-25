import type { CliRenderer } from '@opentui/core';
import { createTestRenderer } from '@opentui/core/testing';
import { describe, expect, it } from 'vitest';

import { defaultTheme } from '../theme/theme';
import { formatMemory, formatPlayers, formatTickMs, formatTps, formatUptime, stateSegment } from './segments';
import { createStatusBar } from './statusBar';
import type { Segment } from './segments';

const ctx = (renderer: CliRenderer) => ({ renderer, theme: defaultTheme });

const left: Segment[] = [
    stateSegment('running'),
    { id: 'tps', text: formatTps(20), tone: 'ok', priority: 90 },
    { id: 'tick', text: formatTickMs(4.1), tone: 'muted', priority: 50 },
    { id: 'players', text: formatPlayers(2, 20), tone: 'accent', priority: 80 },
    { id: 'memory', text: formatMemory(212 * 1024 * 1024), tone: 'muted', priority: 60 },
    { id: 'uptime', text: `up ${formatUptime(340_000)}`, tone: 'muted', priority: 40 }
];

const right: Segment[] = [
    { id: 'filter', text: 'info · all', tone: 'muted', priority: 10 },
    { id: 'help', text: '? help', tone: 'muted', priority: 20 }
];

const firstLine = (frame: string) => frame.split('\n')[0] ?? '';

describe('createStatusBar', () => {
    it('renders every segment at 120 columns with the right side flush right', async () => {
        const setup = await createTestRenderer({ width: 120, height: 1 });
        try {
            const bar = createStatusBar(ctx(setup.renderer), { left, right });
            setup.renderer.root.add(bar.renderable);
            await setup.renderOnce();

            const leftText = '● running · TPS 20.00 · 4.1 ms · 2/20 · 212 MB · up 00:05:40';
            const rightText = 'info · all · ? help';
            const gap = 120 - 2 - [...leftText].length - [...rightText].length;
            expect(firstLine(setup.captureCharFrame())).toBe(` ${leftText}${' '.repeat(gap)}${rightText} `);
        } finally {
            await setup.dispose();
        }
    });

    it('drops low priority segments at 60 columns', async () => {
        const setup = await createTestRenderer({ width: 60, height: 1 });
        try {
            const bar = createStatusBar(ctx(setup.renderer), { left, right });
            setup.renderer.root.add(bar.renderable);
            await setup.renderOnce();

            const line = firstLine(setup.captureCharFrame());
            expect(line).toContain('● running · TPS 20.00 · 2/20 · 212 MB');
            expect(line).not.toContain('4.1 ms');
            expect(line).not.toContain('up 00:05:40');
            expect(line.trimEnd().endsWith('info · all · ? help')).toBe(true);
        } finally {
            await setup.dispose();
        }
    });

    it('re-lays out when the renderer resizes', async () => {
        const setup = await createTestRenderer({ width: 120, height: 1 });
        try {
            const bar = createStatusBar(ctx(setup.renderer), { left, right });
            setup.renderer.root.add(bar.renderable);
            await setup.renderOnce();
            expect(firstLine(setup.captureCharFrame())).toContain('up 00:05:40');

            setup.resize(60, 1);
            const frame = await setup.waitForFrame((line) => line.includes('● running · TPS 20.00 · 2/20 · 212 MB'));
            expect(frame).not.toContain('up 00:05:40');
        } finally {
            await setup.dispose();
        }
    });

    it('shows a hint instead of the left segments while one is set', async () => {
        const setup = await createTestRenderer({ width: 120, height: 1 });
        try {
            const bar = createStatusBar(ctx(setup.renderer), { left, right });
            setup.renderer.root.add(bar.renderable);

            bar.setHint('Press Ctrl+C again to stop the server');
            await setup.renderOnce();
            let line = firstLine(setup.captureCharFrame());
            expect(line).toContain('Press Ctrl+C again to stop the server');
            expect(line).not.toContain('● running');
            expect(line).toContain('? help');

            bar.setHint(undefined);
            await setup.renderOnce();
            line = firstLine(setup.captureCharFrame());
            expect(line).toContain('● running');
            expect(line).not.toContain('Ctrl+C');
        } finally {
            await setup.dispose();
        }
    });

    it('replaces the segment lists through setLeft and setRight', async () => {
        const setup = await createTestRenderer({ width: 120, height: 1 });
        try {
            const bar = createStatusBar(ctx(setup.renderer));
            setup.renderer.root.add(bar.renderable);
            await setup.renderOnce();
            expect(firstLine(setup.captureCharFrame()).trimEnd().endsWith('? help')).toBe(true);

            bar.setLeft([stateSegment('crashed')]);
            bar.setRight([{ id: 'help', text: '? keys', tone: 'muted', priority: 1 }]);
            await setup.renderOnce();
            const line = firstLine(setup.captureCharFrame());
            expect(line).toContain('● crashed');
            expect(line.trimEnd().endsWith('? keys')).toBe(true);
        } finally {
            await setup.dispose();
        }
    });

    it('removes the bar and ignores resizes after dispose', async () => {
        const setup = await createTestRenderer({ width: 120, height: 1 });
        try {
            const bar = createStatusBar(ctx(setup.renderer), { left, right });
            setup.renderer.root.add(bar.renderable);
            await setup.renderOnce();

            bar.dispose();
            expect(() => setup.resize(60, 1)).not.toThrow();
            await setup.renderOnce();
            expect(firstLine(setup.captureCharFrame()).trim()).toBe('');
        } finally {
            await setup.dispose();
        }
    });
});
