import { describe, expect, it } from 'vitest';

import { bodyIntersectsMedia } from './collision';

describe('bodyIntersectsMedia', () => {
    it('finds water and lava before ending the shared scan', () => {
        const waterVisits: string[] = [];
        const lavaVisits: string[] = [];

        const media = bodyIntersectsMedia(
            { x: 1.5, y: 0, z: 0.5 },
            { width: 3, height: 1 },
            ({ x, y, z }) => {
                waterVisits.push(`${x},${y},${z}`);
                return x === 0 && y === 0 && z === -1;
            },
            ({ x, y, z }) => {
                lavaVisits.push(`${x},${y},${z}`);
                return x === 0 && y === 0 && z === 0;
            }
        );

        expect(media).toEqual([true, true]);
        expect(waterVisits).toEqual(['0,0,-1']);
        expect(lavaVisits).toEqual(['0,0,-1', '0,0,0']);
    });

    it('keeps searching for the missing medium after finding the other', () => {
        const waterVisits: string[] = [];
        const lavaVisits: string[] = [];

        const media = bodyIntersectsMedia(
            { x: 1.5, y: 0, z: 0.5 },
            { width: 3, height: 1 },
            ({ x, y, z }) => {
                waterVisits.push(`${x},${y},${z}`);
                return x === 0 && y === 0 && z === -1;
            },
            ({ x, y, z }) => {
                lavaVisits.push(`${x},${y},${z}`);
                return false;
            }
        );

        expect(media).toEqual([true, false]);
        expect(waterVisits).toEqual(['0,0,-1']);
        expect(lavaVisits).toHaveLength(9);
    });
});
