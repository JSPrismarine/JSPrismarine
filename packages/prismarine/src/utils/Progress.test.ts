import { describe, expect, it, vi } from 'vitest';

import Progress from './Progress';

/** Captures what would have been written to a terminal. */
const fakeStream = () => {
    const written: string[] = [];
    return { written, stream: { write: (chunk: string) => written.push(chunk) } as any };
};

describe('utils', () => {
    describe('Progress', () => {
        describe('without a terminal', () => {
            it('reports at ten percent boundaries rather than on every step', () => {
                const log = vi.fn();
                const progress = new Progress('Preparing', 100, log, undefined, false);

                for (let i = 0; i < 100; i++) progress.advance();

                // 0, 10, 20 ... 100 - not one line per unit.
                expect(log.mock.calls.length).toBeLessThanOrEqual(12);
                expect(log).toHaveBeenCalledWith('Preparing: 100% (100/100)');
            });

            it('writes nothing to the stream', () => {
                const { written, stream } = fakeStream();
                const progress = new Progress('Preparing', 10, vi.fn(), stream, false);
                for (let i = 0; i < 10; i++) progress.advance();

                expect(written).toEqual([]);
            });
        });

        describe('on a terminal', () => {
            it('redraws one line in place, clearing it first', () => {
                const { written, stream } = fakeStream();
                const progress = new Progress('Preparing', 4, vi.fn(), stream, true);

                progress.advance(4); // completion always draws, whatever the throttle

                expect(written.length).toBeGreaterThan(0);
                const last = written.at(-1)!;
                expect(last).toContain('[2K\r'); // clear line, return to column 0
                expect(last).not.toContain('\n'); // stays on the same line
                expect(last).toContain('100%');
            });

            it('throttles redraws instead of painting on every step', () => {
                const { written, stream } = fakeStream();
                const progress = new Progress('Preparing', 5000, vi.fn(), stream, true);

                for (let i = 0; i < 5000; i++) progress.advance();

                // Throttled to one redraw per 80ms, so a fast loop draws a handful of times.
                expect(written.length).toBeLessThan(50);
            });
        });

        it('reports completion and the elapsed time', () => {
            const log = vi.fn();
            const progress = new Progress('Preparing', 3, log, undefined, false);
            progress.advance(3);
            progress.finish();

            expect(progress.done).toBe(true);
            expect(progress.percent).toBe(100);
            expect(log).toHaveBeenCalledWith(expect.stringContaining('done, 3 in'));
        });

        it('never goes past the total, however much is reported', () => {
            const progress = new Progress('Preparing', 5, vi.fn(), undefined, false);
            progress.advance(99);
            expect(progress.percent).toBe(100);
        });

        it('treats an empty task as already finished', () => {
            const progress = new Progress('Preparing', 0, vi.fn(), undefined, false);
            expect(progress.percent).toBe(100);
            expect(progress.done).toBe(true);
        });
    });
});
