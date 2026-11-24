import { describe, expect, it } from 'vitest';

import { itemStackFromNbt, itemStackToNbt } from './itemNbt';

describe('a filled map in a save', () => {
    it("keeps which map it shows under Bedrock's map_uuid", () => {
        const entry = itemStackToNbt({ name: 'minecraft:filled_map', count: 1, meta: 3, mapId: 7 });

        expect(entry.getCompound('tag', false)?.getLong('map_uuid', -1n)).toBe(7n);
        expect(itemStackFromNbt(entry)).toEqual({ name: 'minecraft:filled_map', count: 1, meta: 3, mapId: 7 });
    });

    it('reads a stack without one as no map', () => {
        expect(itemStackFromNbt(itemStackToNbt({ name: 'minecraft:filled_map', count: 1 }))?.mapId).toBeUndefined();
    });
});
