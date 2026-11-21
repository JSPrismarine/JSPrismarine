import { describe, expect, it } from 'vitest';

import { closestBlocks } from './closestBlocks';

/** Every block of a box, in no particular order. */
const box = (from: [number, number, number], to: [number, number, number]) => {
    const blocks = [];
    for (let x = from[0]; x <= to[0]; x++)
        for (let y = from[1]; y <= to[1]; y++) for (let z = from[2]; z <= to[2]; z++) blocks.push({ x, y, z });
    return blocks.reverse();
};

const names = (blocks: readonly { x: number; y: number; z: number }[]) =>
    blocks.map(({ x, y, z }) => `${x} ${y} ${z}`).sort();

describe('closestBlocks, as the pinned BDS picks them in dimension-volumes', () => {
    it('picks 2 21 0 over 2 20 1, both √2 away (#3317)', () => {
        expect(names(closestBlocks(box([0, 20, 0], [2, 21, 1]), { x: 3, y: 20, z: 0 }, 2))).toEqual([
            '2 20 0',
            '2 21 0'
        ]);
    });

    it('takes the face neighbors of an empty location in x, then z, then y order', () => {
        const faces = [
            { x: 6, y: 44, z: 5 },
            { x: 5, y: 44, z: 6 },
            { x: 5, y: 45, z: 5 },
            { x: 5, y: 43, z: 5 },
            { x: 5, y: 44, z: 4 },
            { x: 4, y: 44, z: 5 }
        ];
        const center = { x: 5, y: 44, z: 5 };

        expect(names(closestBlocks(faces, center, 2))).toEqual(['4 44 5', '5 44 4']);
        expect(names(closestBlocks(faces, center, 5))).toEqual(['4 44 5', '5 43 5', '5 44 4', '5 44 6', '5 45 5']);
    });

    it('keeps the tie the heap left in place, where a sort by distance would pick another', () => {
        // The block itself and one of its six faces: the heap keeps z-1, a sort keeps x-1.
        expect(names(closestBlocks(box([4, 30, 4], [6, 32, 6]), { x: 5, y: 31, z: 5 }, 2))).toEqual([
            '5 31 4',
            '5 31 5'
        ]);
    });
});
