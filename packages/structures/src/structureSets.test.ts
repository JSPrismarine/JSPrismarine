import { describe, expect, it } from 'vitest';

import { createLegacyRandom } from './random';
import type { ConcentricRingsPlacement, RandomSpreadPlacement } from './structureSets';
import {
    STRUCTURE_PLACEMENT_TYPES,
    concentricRingChunks,
    isStructureChunk,
    parseStructurePlacement,
    parseStructureSet,
    pickStructure,
    potentialStructureChunk,
    structureSetCandidates
} from './structureSets';
import { StructureFormatError } from './types';

/**
 * The expected chunk positions come from Java Edition 26.3 itself: a short
 * program built the real `RandomSpreadStructurePlacement` with each vanilla
 * set's fields and printed `getPotentialStructureChunk` and the placement
 * check for world seed 1234567890.
 */
const SEED = 1234567890n;

const spread = (overrides: Partial<RandomSpreadPlacement>): RandomSpreadPlacement => ({
    type: 'minecraft:random_spread',
    salt: 0,
    frequency: 1,
    frequencyReductionMethod: 'default',
    locateOffset: [0, 0, 0],
    spacing: 34,
    separation: 8,
    spreadType: 'linear',
    ...overrides
});

/** The placement of each vanilla set the oracle was run for. */
const VILLAGES = spread({ salt: 10387312, spacing: 34, separation: 8, spreadType: 'linear' });
const TRAIL_RUINS = spread({ salt: 83469867, spacing: 34, separation: 8, spreadType: 'linear' });
const OCEAN_MONUMENTS = spread({ salt: 10387313, spacing: 32, separation: 5, spreadType: 'triangular' });
const PILLAGER_OUTPOSTS = spread({
    salt: 165745296,
    spacing: 32,
    separation: 8,
    spreadType: 'linear',
    frequency: 0.2
});

/** The region grid the oracle walked: one chunk from each region from -3 to 3. */
const regionGrid = (placement: RandomSpreadPlacement): string[] => {
    const positions: string[] = [];
    for (let x = -3; x <= 3; x++) {
        for (let z = -3; z <= 3; z++) {
            const chunk = potentialStructureChunk(placement, SEED, x * placement.spacing, z * placement.spacing);
            positions.push(`${chunk.x},${chunk.z}`);
        }
    }
    return positions;
};

const candidates = (placement: RandomSpreadPlacement): string[] =>
    structureSetCandidates(placement, SEED, {
        minChunkX: -40,
        minChunkZ: -40,
        maxChunkX: 40,
        maxChunkZ: 40
    }).map((chunk) => `${chunk.x},${chunk.z}`);

describe('potentialStructureChunk', () => {
    it('matches Java for a linear spread', () => {
        expect(regionGrid(VILLAGES).join(' ')).toBe(
            '-95,-91 -90,-67 -84,-16 -88,20 -98,38 -86,76 -89,123 -61,-86 -53,-62 -63,-29 -47,2 -44,39 -49,86 ' +
                '-49,127 -24,-98 -26,-58 -10,-32 -31,8 -18,47 -33,84 -30,120 5,-84 13,-60 5,-9 16,4 1,41 21,88 ' +
                '18,124 45,-96 46,-62 47,-12 48,5 55,49 48,78 59,110 68,-102 73,-45 78,-14 87,4 88,40 92,73 81,126 ' +
                '102,-82 123,-45 127,-9 111,9 110,57 110,83 126,113'
        );
    });

    it('matches Java for a triangular spread, which draws twice per axis', () => {
        expect(regionGrid(OCEAN_MONUMENTS).join(' ')).toBe(
            '-83,-85 -91,-46 -77,-13 -81,17 -87,52 -83,76 -80,113 -61,-87 -52,-51 -45,-19 -56,13 -43,55 -49,79 ' +
                '-45,107 -22,-74 -20,-42 -25,-21 -10,13 -26,53 -18,74 -22,119 7,-86 13,-59 6,-12 8,11 16,44 11,68 ' +
                '5,100 47,-77 43,-49 47,-29 44,13 48,40 41,78 50,113 78,-84 73,-50 77,-29 73,14 83,44 74,82 89,114 ' +
                '105,-79 100,-55 107,-15 117,16 106,41 118,80 109,108'
        );
    });

    it('gives every chunk of a region the same answer', () => {
        const first = potentialStructureChunk(VILLAGES, SEED, 0, 0);

        for (let chunk = 0; chunk < VILLAGES.spacing; chunk++) {
            expect(potentialStructureChunk(VILLAGES, SEED, chunk, chunk)).toEqual(first);
        }
    });
});

describe('isStructureChunk', () => {
    it('finds the chunks Java finds in an 81 by 81 chunk window', () => {
        expect(candidates(VILLAGES)).toEqual(['-31,8', '-10,-32', '5,-9', '16,4']);
        expect(candidates(TRAIL_RUINS)).toEqual(['-28,22', '-26,-22', '18,15', '20,-26', '39,39']);
        expect(candidates(OCEAN_MONUMENTS)).toEqual(['-25,-21', '-10,13', '6,-12', '8,11']);
    });

    it('thins a set whose frequency is below one, matching Java', () => {
        expect(candidates(PILLAGER_OUTPOSTS)).toEqual(['-27,11', '-18,-31', '12,17']);
    });

    it('is deterministic for a seed and different for another', () => {
        expect(candidates(VILLAGES)).toEqual(candidates(VILLAGES));
        expect(
            structureSetCandidates(VILLAGES, 99n, { minChunkX: -40, minChunkZ: -40, maxChunkX: 40, maxChunkZ: 40 })
        ).not.toEqual(
            structureSetCandidates(VILLAGES, SEED, {
                minChunkX: -40,
                minChunkZ: -40,
                maxChunkX: 40,
                maxChunkZ: 40
            })
        );
    });

    it('puts a dimension origin placement in the origin chunk only', () => {
        const placement = parseStructurePlacement({ type: 'minecraft:dimension_origin', salt: 0 });

        expect(isStructureChunk(placement, SEED, 0, 0)).toBe(true);
        expect(isStructureChunk(placement, SEED, 1, 0)).toBe(false);
    });
});

describe('concentricRingChunks', () => {
    const strongholds: ConcentricRingsPlacement = {
        type: 'minecraft:concentric_rings',
        salt: 0,
        frequency: 1,
        frequencyReductionMethod: 'default',
        locateOffset: [0, 0, 0],
        distance: 32,
        spread: 3,
        count: 128,
        preferredBiomes: '#minecraft:stronghold_biased_to'
    };

    it('produces exactly the configured count', () => {
        expect(concentricRingChunks(strongholds, SEED)).toHaveLength(128);
    });

    it('puts the first ring at roughly four times the ring distance', () => {
        const [first] = concentricRingChunks(strongholds, SEED);
        const radius = Math.hypot(first?.x ?? 0, first?.z ?? 0);

        expect(radius).toBeGreaterThan(4 * 32 - 32 * 1.25);
        expect(radius).toBeLessThan(4 * 32 + 32 * 1.25);
    });

    it('is deterministic for a seed and different for another', () => {
        expect(concentricRingChunks(strongholds, SEED)).toEqual(concentricRingChunks(strongholds, SEED));
        expect(concentricRingChunks(strongholds, SEED)).not.toEqual(concentricRingChunks(strongholds, 99n));
    });
});

describe('parseStructureSet', () => {
    it('reads a vanilla random spread set', () => {
        const set = parseStructureSet({
            placement: { type: 'minecraft:random_spread', salt: 10387312, separation: 8, spacing: 34 },
            structures: [
                { structure: 'minecraft:village_plains', weight: 1 },
                { structure: 'minecraft:village_desert', weight: 1 }
            ]
        });

        expect(set.placement).toEqual(VILLAGES);
        expect(set.structures).toHaveLength(2);
    });

    it('reads the exclusion zone without applying it', () => {
        const placement = parseStructurePlacement({
            type: 'minecraft:concentric_rings',
            salt: 0,
            distance: 32,
            spread: 3,
            count: 128,
            preferred_biomes: '#minecraft:stronghold_biased_to',
            exclusion_zone: { other_set: 'minecraft:villages', chunk_count: 8 }
        });

        expect(placement.exclusionZone).toEqual({ otherSet: 'minecraft:villages', chunkCount: 8 });
    });

    it('names the three placement types Java registers', () => {
        expect(STRUCTURE_PLACEMENT_TYPES).toHaveLength(3);
    });

    it('rejects a set with no structures and a placement with an unknown type', () => {
        expect(() => parseStructureSet({ placement: {} })).toThrow(StructureFormatError);
        expect(() => parseStructurePlacement({ type: 'minecraft:spiral' })).toThrow(/unknown type/);
    });
});

describe('pickStructure', () => {
    it('picks by weight', () => {
        const set = parseStructureSet({
            placement: { type: 'minecraft:random_spread', salt: 1, spacing: 2, separation: 1 },
            structures: [
                { structure: 'minecraft:common', weight: 9 },
                { structure: 'minecraft:rare', weight: 1 }
            ]
        });
        const random = createLegacyRandom(4);
        const counts = new Map<string, number>();
        for (let draw = 0; draw < 1000; draw++) {
            const chosen = pickStructure(set, random) ?? '';
            counts.set(chosen, (counts.get(chosen) ?? 0) + 1);
        }

        expect(counts.get('minecraft:rare')).toBeGreaterThan(60);
        expect(counts.get('minecraft:rare')).toBeLessThan(145);
    });

    it('returns nothing for a set with no weight', () => {
        const set = parseStructureSet({
            placement: { type: 'minecraft:dimension_origin', salt: 0 },
            structures: []
        });

        expect(pickStructure(set, createLegacyRandom(1))).toBeUndefined();
    });
});
