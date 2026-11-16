import { describe, expect, it } from 'vitest';

import { blockIdentifiersOf } from './blockNames';

describe('block names from an entity file', () => {
    it('adds the namespace a bare name leaves out', () => {
        expect(blockIdentifiersOf('dirt')).toEqual(['minecraft:dirt']);
        expect(blockIdentifiersOf('minecraft:sand')).toEqual(['minecraft:sand']);
    });

    it('resolves the legacy grass names to the blocks they became', () => {
        expect(blockIdentifiersOf('grass')).toEqual(['minecraft:grass_block']);
        expect(blockIdentifiersOf('tallgrass')).toEqual(['minecraft:short_grass', 'minecraft:fern']);
    });
});
