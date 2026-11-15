import { vanillaItemDefinitions } from '@jsprismarine/items';
import { describe, expect, it } from 'vitest';

import { entityFixture, FLOOR_Y, TestEntityWorld } from './testing';

const y = FLOOR_Y + 1;

describe('a blast in the store', () => {
    it('destroys a dropped stack in reach, as Java discards an item a blast hurts', () => {
        const { runtime } = entityFixture();
        const item = runtime.droppedItems.spawn({ x: 0.5, y, z: 1.5 }, { stack: { name: 'minecraft:dirt', count: 1 } });
        const source = runtime.spawn('minecraft:cow', { x: 0.5, y, z: 0.5 });
        if (item === undefined || source === undefined) throw new Error('the fixture declares no item or cow');

        runtime.explode(source.body);

        expect(item.removed).toBeDefined();
    });

    it('leaves a stack of an item that resists explosions', () => {
        // Every vanilla item, so the star's `minecraft:damage_resistant` is there to read.
        const { runtime } = entityFixture(new TestEntityWorld(), { itemDefinitions: vanillaItemDefinitions() });
        const star = runtime.droppedItems.spawn(
            { x: 0.5, y, z: 1.5 },
            { stack: { name: 'minecraft:nether_star', count: 1 } }
        );
        const source = runtime.spawn('minecraft:cow', { x: 0.5, y, z: 0.5 });
        if (star === undefined || source === undefined) throw new Error('the fixture declares no item or cow');

        runtime.explode(source.body);

        expect(star.removed).toBeUndefined();
    });
});
