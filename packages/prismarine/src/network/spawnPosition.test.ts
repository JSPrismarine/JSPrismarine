import { describe, expect, it } from 'vitest';

import { fakeLevel } from '../testing/level';
import { Dimensions, dimensionTypeOf, FIRST_CUSTOM_DIMENSION_ID } from '../world/Dimension';
import { spawnDimensionIdOf } from './spawnPosition';

describe('spawnDimensionIdOf', () => {
    const sky = dimensionTypeOf(Dimensions.Overworld.java, 'mypack:sky', FIRST_CUSTOM_DIMENSION_ID);
    const level = fakeLevel({
        dimensionTypes: new Map([
            [Dimensions.Overworld.id, Dimensions.Overworld],
            [sky.id, sky]
        ])
    });

    it('answers the id the level chose for a custom type', () => {
        expect(spawnDimensionIdOf(level, 'mypack:sky', 0)).toBe(FIRST_CUSTOM_DIMENSION_ID);
    });

    it('answers a vanilla dimension by either spelling, even one the level has no type for', () => {
        expect(spawnDimensionIdOf(level, 'minecraft:nether', 0)).toBe(1);
        expect(spawnDimensionIdOf(level, 'minecraft:the_nether', 0)).toBe(1);
        expect(spawnDimensionIdOf(level, 'minecraft:the_end', 0)).toBe(2);
    });

    it('falls back for a name no dimension has', () => {
        expect(spawnDimensionIdOf(level, 'mypack:gone', 7)).toBe(7);
    });
});
