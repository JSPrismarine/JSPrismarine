import { describe, expect, it } from 'vitest';

import { placedEntityOf } from './placement';

describe('placedEntityOf', () => {
    it('places a boat, chest boat or minecart as its base entity carrying the wood', () => {
        expect(placedEntityOf('minecraft:acacia_boat')).toEqual({ entity: 'minecraft:boat', variant: 'acacia' });
        expect(placedEntityOf('minecraft:oak_chest_boat')).toEqual({ entity: 'minecraft:chest_boat', variant: 'oak' });
        expect(placedEntityOf('minecraft:minecart')).toEqual({ entity: 'minecraft:minecart' });
    });

    it('places a raft as a bamboo boat, since Bedrock has no raft entity', () => {
        expect(placedEntityOf('minecraft:bamboo_raft')).toEqual({ entity: 'minecraft:boat', variant: 'bamboo' });
        expect(placedEntityOf('minecraft:bamboo_chest_raft')).toEqual({
            entity: 'minecraft:chest_boat',
            variant: 'bamboo'
        });
    });
});
