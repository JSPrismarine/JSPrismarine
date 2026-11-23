import { describe, expect, it } from 'vitest';

import { Dimensions } from './DimensionType';
import { testWorld } from '../testing/level';

describe('World.getFormattedName', () => {
    it.each([
        [Dimensions.Overworld, 'minecraft:overworld'],
        [Dimensions.Nether, 'minecraft:the_nether'],
        [Dimensions.TheEnd, 'minecraft:the_end']
    ])('names the level and the dimension, not the generator, for %#', (dimension, id) => {
        const world = testWorld({ name: 'world', dimension });

        expect(world.getFormattedName()).toBe(`§b'world'/${id}§r`);
    });
});
