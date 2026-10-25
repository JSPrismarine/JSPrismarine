import { SampleContext } from '@jsprismarine/worldgen';
import { describe, expect, it } from 'vitest';

import type { BeardPiece, TerrainAdaptation } from './javaStructureBeard';
import { BEARD_RADIUS, createBeardifier, terrainAdaptationOf } from './javaStructureBeard';

/** A ten by five by ten piece whose floor is at y 64, which is the shape a village house is. */
const pieceAt = (adaptation: TerrainAdaptation, groundLevelDelta = 1): BeardPiece => ({
    box: { minX: 0, minY: 64, minZ: 0, maxX: 9, maxY: 68, maxZ: 9 },
    groundLevelDelta,
    adaptation
});

const context = new SampleContext();

const densityAt = (pieces: readonly BeardPiece[], x: number, y: number, z: number): number =>
    createBeardifier(pieces)?.(context, x, y, z) ?? 0;

describe('createBeardifier', () => {
    it('answers nothing when no structure reaches the chunk', () => {
        expect(createBeardifier([])).toBeUndefined();
    });

    it('fills under a bearded piece and opens the space above it', () => {
        const pieces = [pieceAt('beard_thin')];

        // The ground layer of a pool piece is one above its floor, so 64 is still below it.
        expect(densityAt(pieces, 5, 62, 5)).toBeGreaterThan(0);
        expect(densityAt(pieces, 5, 68, 5)).toBeLessThan(0);
    });

    it('reaches no further than the kernel radius', () => {
        const pieces = [pieceAt('beard_thin')];

        // The horizontal distance is measured from the box edge, not from its middle.
        expect(densityAt(pieces, 5, 64 - BEARD_RADIUS - 1, 5)).toBe(0);
        expect(densityAt(pieces, 9 + BEARD_RADIUS + 1, 62, 5)).toBe(0);
    });

    it('weakens with distance rather than stopping at the piece edge', () => {
        const pieces = [pieceAt('beard_thin')];
        const under = densityAt(pieces, 5, 62, 5);
        const beside = densityAt(pieces, 14, 62, 5);

        expect(beside).toBeGreaterThan(0);
        expect(beside).toBeLessThan(under);
    });

    it('buries a piece with solid rock out to six blocks and no further', () => {
        const pieces = [pieceAt('bury')];

        expect(densityAt(pieces, 5, 65, 5)).toBe(1);
        expect(densityAt(pieces, 5, 65, 15)).toBe(0);
        expect(densityAt(pieces, 5, 65, 12)).toBeGreaterThan(0);
        expect(densityAt(pieces, 5, 65, 12)).toBeLessThan(1);
    });

    it('boxes a piece so the hollow follows its whole extent', () => {
        const thin = densityAt([pieceAt('beard_thin')], 5, 70, 5);
        const box = densityAt([pieceAt('beard_box')], 5, 70, 5);

        // A box measures from the piece's own top rather than from its ground layer, so the
        // same position two blocks above the roof is pushed differently.
        expect(box).not.toBe(thin);
    });

    it('adds the pieces of a village together', () => {
        const one = densityAt([pieceAt('beard_thin')], 5, 62, 5);
        const two = densityAt([pieceAt('beard_thin'), pieceAt('beard_thin')], 5, 62, 5);

        expect(two).toBeCloseTo(one * 2, 10);
    });

    it('answers what a scan over every piece answers, bit for bit', () => {
        // The sampler visits only the pieces its column index says can reach the position. A
        // sum of floats depends on its order and on every term, so the only acceptable
        // evidence is the same bits a scan over the whole list produces.
        const adaptations: readonly TerrainAdaptation[] = ['beard_thin', 'bury', 'beard_box', 'encapsulate', 'none'];
        const pieces: BeardPiece[] = [];
        for (let index = 0; index < 24; index++) {
            const offsetX = (index % 6) * 13 - 30;
            const offsetZ = Math.floor(index / 6) * 11 - 20;
            pieces.push({
                box: {
                    minX: offsetX,
                    minY: 56 + (index % 3) * 7,
                    minZ: offsetZ,
                    maxX: offsetX + 4 + (index % 5),
                    maxY: 60 + (index % 3) * 7,
                    maxZ: offsetZ + 4 + (index % 4)
                },
                groundLevelDelta: index % 3,
                adaptation: adaptations[index % adaptations.length]!
            });
        }

        const scan = (x: number, y: number, z: number): number => {
            let density = 0;
            for (const piece of pieces) density += createBeardifier([piece])!(context, x, y, z);
            return density;
        };

        const indexed = createBeardifier(pieces)!;
        for (let x = -48; x <= 48; x += 3) {
            for (let z = -40; z <= 40; z += 5) {
                for (let y = 40; y <= 90; y += 7) {
                    expect(indexed(context, x, y, z)).toBe(scan(x, y, z));
                }
            }
        }
    });
});

describe('terrainAdaptationOf', () => {
    it('reads the four adaptations Java registers and nothing else', () => {
        expect(terrainAdaptationOf('beard_thin')).toBe('beard_thin');
        expect(terrainAdaptationOf('bury')).toBe('bury');
        expect(terrainAdaptationOf('beard_box')).toBe('beard_box');
        expect(terrainAdaptationOf('encapsulate')).toBe('encapsulate');
        expect(terrainAdaptationOf('none')).toBe('none');
        expect(terrainAdaptationOf(undefined)).toBe('none');
        expect(terrainAdaptationOf('something_else')).toBe('none');
    });
});
