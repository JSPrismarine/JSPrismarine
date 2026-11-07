import { describe, expect, it } from 'vitest';

import { Dimensions } from './DimensionType';
import { World } from './World';

describe('World.getFormattedName', () => {
    it.each([
        [Dimensions.Overworld, 'minecraft:overworld'],
        [Dimensions.Nether, 'minecraft:the_nether'],
        [Dimensions.TheEnd, 'minecraft:the_end']
    ])('names the level and the dimension, not the generator, for %#', (dimension, id) => {
        const world: World = Object.assign(Object.create(World.prototype), { name: 'world', dimension });

        expect(world.getFormattedName()).toBe(`§b'world'/${id}§r`);
    });
});
