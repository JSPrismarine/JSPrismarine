import { describe, expect, it } from 'vitest';

import type { FloorBlock } from './belowZeroRetrogen';
import { missingBedrockOf, retrogenBiomes } from './belowZeroRetrogen';

describe('the below-zero upgrade test', () => {
    const floor =
        (open: ReadonlySet<number>, rest: FloorBlock = 'bedrock') =>
        (x: number, z: number): FloorBlock =>
            open.has(z * 16 + x) ? 'air' : rest;

    it('upgrades a chunk with bedrock at y = 0 and records the columns dug through it', () => {
        expect(missingBedrockOf(floor(new Set([0, 17])))).toEqual(new Set([0, 17]));
        expect(missingBedrockOf(floor(new Set()))).toEqual(new Set());
    });

    it('leaves a chunk without bedrock, or with nothing but air, at y = 0 alone', () => {
        expect(missingBedrockOf(floor(new Set(), 'other'))).toBeUndefined();
        expect(missingBedrockOf(floor(new Set(Array.from({ length: 256 }, (_, i) => i))))).toBeUndefined();
    });
});

describe('the below-zero upgrade biomes', () => {
    it('keeps the cave biomes and takes the old y = 0 biome everywhere else', () => {
        const resolve = (quartX: number): string => (quartX === 0 ? 'minecraft:lush_caves' : 'minecraft:plains');
        const biomes = retrogenBiomes(resolve, () => 'minecraft:taiga');
        expect(biomes(0, -4, 0)).toBe('minecraft:lush_caves');
        expect(biomes(1, -4, 0)).toBe('minecraft:taiga');
    });
});
