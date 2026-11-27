import { describe, expect, it } from 'vitest';

import { EXPLORER_MAP_DATA, createJavaItemMapping, javaItemToBedrock } from './itemMapping';
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
        expect(createJavaItemMapping(itemsTable)('minecraft:black_bed')).toEqual({
            kind: 'mapped',
            bedrock: { identifier: 'minecraft:bed', data: 15 }
        });
    });

    it('drops the aux a flattened item had on the merged item it came from', () => {
        for (const javaId of ['minecraft:birch_log', 'minecraft:spruce_log', 'minecraft:birch_leaves']) {
            expect(javaItemToBedrock(javaId)).toEqual({ kind: 'mapped', bedrock: { identifier: javaId } });
        }
    });

    it('gives each structure locator map its own aux value on a filled map', () => {
        const auxValues = Object.entries(EXPLORER_MAP_DATA).map(([javaId, data]) => {
            const mapped = javaItemToBedrock(javaId);
            expect(mapped.kind === 'mapped' || mapped.kind === 'loss' ? mapped.bedrock : undefined).toEqual({
                identifier: 'minecraft:filled_map',
                data
            });
            return data;
        });

        // Every Java item that maps onto a filled map other than the plain one is listed, and no
        // two share an aux value, so the client names each one apart.
        const locators = Object.entries(itemsTable.items)
            .filter(
                ([javaId, entry]) =>
                    entry.bedrockIdentifier === 'minecraft:filled_map' && javaId !== 'minecraft:filled_map'
            )
            .map(([javaId]) => javaId);
        expect(Object.keys(EXPLORER_MAP_DATA).sort()).toEqual(locators.sort());
        expect(new Set(auxValues).size).toBe(auxValues.length);
        expect(javaItemToBedrock('minecraft:filled_map')).toEqual({
            kind: 'mapped',
            bedrock: { identifier: 'minecraft:filled_map' }
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
