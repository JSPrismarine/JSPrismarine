import { describe, expect, it } from 'vitest';

import {
    formatMemory,
    formatPlayers,
    formatTickMs,
    formatTps,
    formatUptime,
    layoutSegments,
    stateSegment
} from './segments';
import type { Segment } from './segments';

const segment = (id: string, text: string, priority: number): Segment => ({ id, text, tone: 'muted', priority });

describe('layoutSegments', () => {
    const segments = [
        segment('state', '● running', 100),
        segment('tps', 'TPS 20.00', 90),
        segment('tick', '4.1 ms', 50),
        segment('players', '2/20', 80),
        segment('memory', '212 MB', 60),
        segment('uptime', 'up 00:05:40', 40)
    ];

    it('keeps every segment in original order when they fit', () => {
        const text = '● running · TPS 20.00 · 4.1 ms · 2/20 · 212 MB · up 00:05:40';
        expect(layoutSegments(segments, text.length).map((s) => s.id)).toEqual([
            'state',
            'tps',
            'tick',
            'players',
            'memory',
            'uptime'
        ]);
    });

    it('drops the lowest priority segments first and keeps original order', () => {
        // "● running · TPS 20.00 · 2/20 · 212 MB" is 37 columns; adding "4.1 ms" would need 46.
        expect(layoutSegments(segments, 40).map((s) => s.id)).toEqual(['state', 'tps', 'players', 'memory']);
    });

    it('skips a segment that does not fit but keeps later ones that do', () => {
        const mixed = [segment('a', 'aaaa', 3), segment('b', 'bbbbbbbbbb', 2), segment('c', 'cc', 1)];
        expect(layoutSegments(mixed, 10).map((s) => s.id)).toEqual(['a', 'c']);
    });

    it('truncates the highest priority segment with an ellipsis when it alone does not fit', () => {
        expect(layoutSegments(segments, 5)).toEqual([{ ...segments[0], text: '● ru…' }]);
        expect(layoutSegments(segments, 1)).toEqual([{ ...segments[0], text: '…' }]);
    });

    it('returns nothing for an empty list or no width', () => {
        expect(layoutSegments([], 80)).toEqual([]);
        expect(layoutSegments(segments, 0)).toEqual([]);
    });

    it('honors a custom separator width', () => {
        const two = [segment('a', 'aaa', 2), segment('b', 'bbb', 1)];
        expect(layoutSegments(two, 7, ' ').map((s) => s.id)).toEqual(['a', 'b']);
        expect(layoutSegments(two, 7).map((s) => s.id)).toEqual(['a']);
    });
});

describe('formatters', () => {
    it('formats TPS with two decimals', () => {
        expect(formatTps(20)).toBe('TPS 20.00');
        expect(formatTps(19.456)).toBe('TPS 19.46');
    });

    it('formats tick time with one decimal', () => {
        expect(formatTickMs(4.12)).toBe('4.1 ms');
        expect(formatTickMs(50)).toBe('50.0 ms');
    });

    it('formats players as online over max', () => {
        expect(formatPlayers(2, 20)).toBe('2/20');
    });

    it('formats memory in MB without decimals and GB with one', () => {
        expect(formatMemory(212 * 1024 * 1024)).toBe('212 MB');
        expect(formatMemory(1.25 * 1024 * 1024 * 1024)).toBe('1.3 GB');
        expect(formatMemory(0)).toBe('0 MB');
    });

    it('formats uptime as hh:mm:ss with a day prefix past 24 hours', () => {
        expect(formatUptime(340_000)).toBe('00:05:40');
        expect(formatUptime(90_061_000)).toBe('1d 01:01:01');
        expect(formatUptime(0)).toBe('00:00:00');
    });
});

describe('stateSegment', () => {
    it('maps each server state to a bullet label and tone', () => {
        expect(stateSegment('running')).toMatchObject({ id: 'state', text: '● running', tone: 'ok' });
        expect(stateSegment('starting')).toMatchObject({ text: '● starting', tone: 'warning' });
        expect(stateSegment('stopping')).toMatchObject({ text: '● stopping', tone: 'warning' });
        expect(stateSegment('stopped')).toMatchObject({ text: '● stopped', tone: 'muted' });
        expect(stateSegment('crashed')).toMatchObject({ text: '● crashed', tone: 'danger' });
        expect(stateSegment('restarting')).toMatchObject({ text: '● restarting', tone: 'accent' });
        expect(stateSegment('waiting')).toMatchObject({ text: '● waiting', tone: 'muted' });
    });

    it('gives the state segment the highest priority', () => {
        const others = [segment('tps', 'TPS 20.00', 90)];
        expect(layoutSegments([...others, stateSegment('running')], 9).map((s) => s.id)).toEqual(['state']);
    });
});
