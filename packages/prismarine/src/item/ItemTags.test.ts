import { describe, expect, it } from 'vitest';

import { Item } from './Item';

describe('Bedrock item tags', () => {
    it('answers from the captured tag catalog without a content build', () => {
        const boat = new Item({ name: 'minecraft:oak_boat' });

        expect(boat.getTags()).toContain('minecraft:boats');
        expect(boat.hasTag('minecraft:boats')).toBe(true);
        expect(boat.hasTag('minecraft:is_pickaxe')).toBe(false);
    });
});
