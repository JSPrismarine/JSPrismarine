import { describe, expect, it } from 'vitest';

import { SampleContextPool } from './SampleContextPool';

describe('the terrain sample context pool', () => {
    it('resets interpolation state and chunk-specific hooks before reuse', () => {
        const pool = new SampleContextPool();
        const context = pool.acquire();
        context.interpolationBuffersEnabled = true;
        context.blendAlpha = () => 0.25;
        context.blendOffset = () => 4;
        context.blendDensity = (_x, _y, _z, density) => density + 1;
        context.beardifier = () => -0.5;
        // Compiled nodes leave sparse ids when only a subset of a density graph is sampled.
        context.cell(3);
        context.cornerCache(5);
        context.interpolationCell(3, -16, 40, 32);
        context.interpolationBuffer(3, 8).fill(7);
        context.markInterpolationBufferFilled(3, -16, 40, 32);

        pool.release(context);
        const reused = pool.acquire();

        expect(reused).toBe(context);
        expect(reused.interpolationBuffersEnabled).toBe(false);
        expect(reused.blendAlpha).toBeUndefined();
        expect(reused.blendOffset).toBeUndefined();
        expect(reused.blendDensity).toBeUndefined();
        expect(reused.beardifier).toBeUndefined();
        expect(reused.interpolationCell(3, -16, 40, 32)).toBe(false);
        expect(reused.interpolationBufferValue(3, -16, 40, 32, 0)).toBeUndefined();
    });

    it('retains no more than two idle contexts when tasks overlap', () => {
        const pool = new SampleContextPool();
        const first = pool.acquire();
        const second = pool.acquire();
        const third = pool.acquire();
        pool.release(first);
        pool.release(second);
        pool.release(third);

        const reused = [pool.acquire(), pool.acquire()];
        const extra = pool.acquire();
        expect(reused).toEqual([second, first]);
        expect(extra).not.toBe(first);
        expect(extra).not.toBe(second);
        expect(extra).not.toBe(third);
    });
});
