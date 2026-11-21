import { describe, expect, it } from 'vitest';

import { ENTITY_TYPES, ITEMS } from './registries';

describe('the 26.3 static registries', () => {
    it('name entries by network id both ways', () => {
        const player = ENTITY_TYPES.idOf('minecraft:player')!;

        expect(ENTITY_TYPES.nameOf(player)).toBe('minecraft:player');
        expect(ITEMS.nameOf(ITEMS.idOf('minecraft:stone')!)).toBe('minecraft:stone');
        expect(ITEMS.idOf('minecraft:air')).toBe(0);
        expect(ENTITY_TYPES.idOf('minecraft:not_an_entity')).toBeUndefined();
    });
});
