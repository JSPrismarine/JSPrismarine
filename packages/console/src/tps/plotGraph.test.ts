import { describe, expect, it } from 'vitest';

import { plotGraph, tickTone, tpsTone } from './plotGraph';

const options = { columns: 4, rows: 2, min: 10, max: 20 };

describe('tpsTone', () => {
    it('is ok from 19, warning from 15, and danger below', () => {
        expect([20, 19, 18.99, 15, 14.99, 0].map(tpsTone)).toEqual([
            'ok',
            'ok',
            'warning',
            'warning',
            'danger',
            'danger'
        ]);
    });
});

describe('tickTone', () => {
    it('stays quiet while a tick leaves headroom and warns near the 50 ms budget', () => {
        expect([12, 39.9, 40, 49.9, 50, 80].map(tickTone)).toEqual([
            undefined,
            undefined,
            'warning',
            'warning',
            'danger',
            'danger'
        ]);
    });
});

describe('plotGraph', () => {
    it('returns the requested rows of the requested width', () => {
        const rows = plotGraph([20, 15, 10], options);

        expect(rows).toHaveLength(2);
        for (const row of rows) {
            expect([...row.cells]).toHaveLength(4);
            expect(row.tones).toHaveLength(4);
        }
    });

    it('leaves a plot without readings blank', () => {
        const rows = plotGraph([], options);

        expect(rows.map((row) => row.cells)).toEqual(['⠀'.repeat(4), '⠀'.repeat(4)]);
        expect(rows.flatMap((row) => row.tones).every((tone) => tone === undefined)).toBe(true);
    });

    it('puts a full-speed reading in the top row and a stalled one in the bottom row', () => {
        const [top, bottom] = plotGraph([20, 20, 10, 10], options);

        expect(top?.cells.slice(0, 2)).not.toBe('⠀⠀');
        expect(top?.cells.slice(2)).toBe('⠀⠀');
        expect(bottom?.cells.slice(0, 2)).toBe('⠀⠀');
        expect(bottom?.cells.slice(2)).not.toBe('⠀⠀');
    });

    it('colors each column by its worst reading, including the slope that joins two readings', () => {
        const [top, bottom] = plotGraph([20, 20, 10, 10], options);

        expect(top?.tones).toEqual(['ok', 'warning', undefined, undefined]);
        expect(bottom?.tones).toEqual([undefined, undefined, 'danger', 'danger']);
    });

    it('clamps readings outside the range to the nearest edge', () => {
        const above = plotGraph([99, 99, 99, 99], options);
        const below = plotGraph([-5, -5, -5, -5], options);

        expect(above[0]?.cells).not.toBe('⠀'.repeat(4));
        expect(above[1]?.cells).toBe('⠀'.repeat(4));
        expect(below[0]?.cells).toBe('⠀'.repeat(4));
        expect(below[1]?.cells).not.toBe('⠀'.repeat(4));
    });

    it('breaks the line at a gap instead of drawing across it', () => {
        const joined = plotGraph([20, 10], { ...options, columns: 8 });
        const broken = plotGraph([20, undefined, 10], { ...options, columns: 8 });

        const dots = (rows: ReturnType<typeof plotGraph>) =>
            rows.reduce((sum, row) => sum + [...row.cells].filter((cell) => cell !== '⠀').length, 0);
        expect(dots(broken)).toBeLessThan(dots(joined));
        // The gap column itself stays empty.
        expect(broken.map((row) => [...row.cells][4])).toEqual(['⠀', '⠀']);
    });

    it('keeps only the newest readings that fit', () => {
        const old = Array.from({ length: 8 }, () => 10);
        const rows = plotGraph([...old, 20, 20, 20, 20, 20, 20, 20, 20], { ...options, columns: 4 });

        expect(rows[1]?.cells).toBe('⠀'.repeat(4));
    });
});
