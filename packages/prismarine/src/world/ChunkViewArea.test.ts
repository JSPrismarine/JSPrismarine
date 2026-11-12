import { describe, expect, it } from 'vitest';

import { chunkViewArea, circularViewArea, offsetsIn } from './ChunkViewArea';

describe('ChunkViewArea', () => {
    it('holds the chunks within the radius of a circle, and none in its corners', () => {
        const area = circularViewArea(2);

        expect(area.contains(0, 0)).toBe(true);
        expect(area.contains(2, 0)).toBe(true);
        expect(area.contains(1, 1)).toBe(true);
        // Two chunks off on each axis: inside a square of that size, outside the circle.
        expect(area.contains(2, 2)).toBe(false);
        expect(area.contains(3, 0)).toBe(false);
    });

    it('lists exactly the offsets it contains', () => {
        const area = circularViewArea(2);
        const offsets = offsetsIn(area);

        expect(offsets).toHaveLength(13);
        expect(offsets.every(([dx, dz]) => area.contains(dx, dz))).toBe(true);
        expect(offsets).toContainEqual([-2, 0]);
        expect(offsets).not.toContainEqual([2, 2]);
    });

    it('gives a player the circle a Bedrock client keeps for its view distance', () => {
        expect(offsetsIn(chunkViewArea(4))).toStrictEqual(offsetsIn(circularViewArea(4)));
    });
});
