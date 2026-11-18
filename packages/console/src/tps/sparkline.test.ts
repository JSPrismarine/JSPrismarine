import { describe, expect, it } from 'vitest';

import { defaultTheme } from '../theme/theme';
import { sparkline, sparklineChunks } from './sparkline';

const options = { columns: 8, min: 10, max: 20 };
const levels = (values: readonly number[], columns = options.columns) =>
    sparkline(values, { ...options, columns }).map((cell) => cell.level);

describe('sparkline', () => {
    it('draws a healthy server as a line of full bars', () => {
        expect(levels([20, 20, 20, 20])).toEqual([7, 7, 7, 7]);
    });

    it('scales readings between the bounds and clamps the ones outside', () => {
        expect(levels([5, 10, 15, 20, 25])).toEqual([0, 0, 4, 7, 7]);
    });

    it('keeps the newest readings when there are more than columns', () => {
        expect(levels([10, 10, 10, 20, 20], 2)).toEqual([7, 7]);
    });

    it('colors each bar by the reading against the tick rate', () => {
        const tones = sparkline([20, 18, 12], options).map((cell) => cell.tone);
        expect(tones).toEqual(['ok', 'warning', 'danger']);
    });

    it('merges neighboring bars of one tone into one chunk, one column per reading', () => {
        const chunks = sparklineChunks(sparkline([20, 20, 18, 20], options), defaultTheme);
        expect(chunks.map((chunk) => [...chunk.text].length)).toEqual([2, 1, 1]);
    });
});
