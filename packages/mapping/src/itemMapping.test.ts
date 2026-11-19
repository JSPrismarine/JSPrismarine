import { describe, expect, it } from 'vitest';

import { createJavaItemMapping } from './itemMapping';
import { itemsTable } from './tables';

describe('createJavaItemMapping', () => {
    it('maps through the table it is given', () => {
        const lookup = createJavaItemMapping({
            items: { 'minecraft:ice_ball': { bedrockIdentifier: 'minecraft:snowball' } }
        });
        expect(lookup('minecraft:ice_ball')).toEqual({ kind: 'mapped', bedrock: { identifier: 'minecraft:snowball' } });
        expect(lookup('minecraft:stone')).toEqual({ kind: 'unknown', javaId: 'minecraft:stone' });
    });

    it('carries the legacy damage value that selects a sub-item', () => {
        expect(createJavaItemMapping(itemsTable)('minecraft:acacia_planks')).toEqual({
            kind: 'mapped',
            bedrock: { identifier: 'minecraft:acacia_planks', data: 4 }
        });
    });

    it('reports a reviewed loss with its fallback', () => {
        expect(createJavaItemMapping(itemsTable)('minecraft:debug_stick')).toEqual({
            kind: 'loss',
            loss: expect.objectContaining({ javaId: 'minecraft:debug_stick', bedrockFallback: 'minecraft:stick' }),
            bedrock: { identifier: 'minecraft:stick' }
        });
    });
});
