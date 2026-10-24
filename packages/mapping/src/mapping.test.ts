import { describe, expect, expectTypeOf, it } from 'vitest';

import { javaBlockStateToBedrock } from './blockMapping';
import { javaEntityTypeToBedrock } from './entityMapping';
import { javaItemToBedrock } from './itemMapping';
import type { MappedRegistry } from './registryMapping';
import { MAPPED_REGISTRIES, javaIdentifierToBedrock } from './registryMapping';

describe('javaBlockStateToBedrock', () => {
    it('maps a stateless block to the identically named Bedrock state', () => {
        expect(javaBlockStateToBedrock('minecraft:stone')).toEqual({
            kind: 'mapped',
            bedrock: { name: 'minecraft:stone', states: {} }
        });
    });

    it('maps a block state through its Bedrock property names', () => {
        expect(javaBlockStateToBedrock('minecraft:oak_log', { axis: 'x' })).toEqual({
            kind: 'mapped',
            bedrock: { name: 'minecraft:oak_log', states: { pillar_axis: 'x' } }
        });
    });

    it('maps a renamed block', () => {
        const result = javaBlockStateToBedrock('minecraft:cobweb');
        expect(result.kind).toBe('mapped');
        if (result.kind === 'mapped') expect(result.bedrock.name).toBe('minecraft:web');
    });

    it('fills omitted properties from the Java default state', () => {
        const defaulted = javaBlockStateToBedrock('minecraft:chest');
        const explicit = javaBlockStateToBedrock('minecraft:chest', {
            facing: 'north',
            type: 'single',
            waterlogged: 'false'
        });
        expect(defaulted).toEqual(explicit);
        expect(defaulted.kind).toBe('mapped');
    });

    it('reports the test blocks as a reviewed loss onto minecraft:unknown', () => {
        const result = javaBlockStateToBedrock('minecraft:test_block');
        expect(result.kind).toBe('loss');
        if (result.kind === 'loss') {
            expect(result.bedrock.name).toBe('minecraft:unknown');
            expect(result.loss.reason).not.toBe('');
        }
    });

    it('returns unknown for identifiers, properties and values Java 26.3 does not have', () => {
        expect(javaBlockStateToBedrock('minecraft:not_a_block')).toEqual({
            kind: 'unknown',
            javaId: 'minecraft:not_a_block'
        });
        expect(javaBlockStateToBedrock('minecraft:oak_log', { axis: 'diagonal' }).kind).toBe('unknown');
        expect(javaBlockStateToBedrock('minecraft:oak_log', { waterlogged: 'true' }).kind).toBe('unknown');
    });

    it('passes non-minecraft identifiers through untouched', () => {
        expect(javaBlockStateToBedrock('myaddon:ruby_block', { facing: 'north' })).toEqual({
            kind: 'passthrough',
            bedrock: { name: 'myaddon:ruby_block', states: { facing: 'north' } }
        });
    });
});

describe('javaItemToBedrock', () => {
    it('maps a renamed item', () => {
        expect(javaItemToBedrock('minecraft:jack_o_lantern')).toEqual({
            kind: 'mapped',
            bedrock: { identifier: 'minecraft:lit_pumpkin' }
        });
    });

    it('reports the lossy merges with their fallback', () => {
        const result = javaItemToBedrock('minecraft:debug_stick');
        expect(result.kind).toBe('loss');
        if (result.kind === 'loss') {
            expect(result.bedrock.identifier).toBe('minecraft:stick');
            expect(result.loss.bedrockFallback).toBe('minecraft:stick');
        }
    });

    it('returns unknown for identifiers Java 26.3 does not have', () => {
        expect(javaItemToBedrock('minecraft:not_an_item')).toEqual({
            kind: 'unknown',
            javaId: 'minecraft:not_an_item'
        });
    });

    it('passes non-minecraft identifiers through untouched', () => {
        expect(javaItemToBedrock('myaddon:ruby')).toEqual({
            kind: 'passthrough',
            bedrock: { identifier: 'myaddon:ruby' }
        });
    });
});

describe('javaEntityTypeToBedrock', () => {
    it('maps exact matches and documented renames', () => {
        expect(javaEntityTypeToBedrock('minecraft:creeper')).toEqual({ kind: 'mapped', bedrock: 'minecraft:creeper' });
        expect(javaEntityTypeToBedrock('minecraft:zombified_piglin')).toEqual({
            kind: 'mapped',
            bedrock: 'minecraft:zombie_pigman'
        });
        expect(javaEntityTypeToBedrock('minecraft:oak_boat')).toEqual({ kind: 'mapped', bedrock: 'minecraft:boat' });
    });

    it('reports re-renders with the substitute entity', () => {
        const result = javaEntityTypeToBedrock('minecraft:text_display');
        expect(result.kind).toBe('loss');
        if (result.kind === 'loss') {
            expect(result.loss.kind).toBe('rerender');
            expect(result.loss.bedrockFallback).toBe('minecraft:armor_stand');
        }
    });

    it('reports the unrepresentable types without a fallback', () => {
        const result = javaEntityTypeToBedrock('minecraft:block_display');
        expect(result.kind).toBe('loss');
        if (result.kind === 'loss') {
            expect(result.loss.kind).toBe('unrepresentable');
            expect(result.loss.bedrockFallback).toBeUndefined();
        }
    });

    it('reports item frames as blocks on Bedrock', () => {
        const result = javaEntityTypeToBedrock('minecraft:item_frame');
        expect(result.kind).toBe('loss');
        if (result.kind === 'loss') {
            expect(result.loss.kind).toBe('block');
            expect(result.loss.bedrockFallback).toBe('minecraft:frame');
        }
    });

    it('returns unknown for identifiers Java 26.3 does not have, and passes custom namespaces through', () => {
        expect(javaEntityTypeToBedrock('minecraft:not_an_entity').kind).toBe('unknown');
        expect(javaEntityTypeToBedrock('myaddon:dragon')).toEqual({ kind: 'passthrough', bedrock: 'myaddon:dragon' });
    });
});

describe('javaIdentifierToBedrock', () => {
    it('exposes the mapped registries as literal types', () => {
        expectTypeOf<MappedRegistry>().toEqualTypeOf<'biome' | 'enchantment'>();
        expect(MAPPED_REGISTRIES).toEqual(['biome', 'enchantment']);
        // @ts-expect-error entity types have their own function
        void ((): unknown => javaIdentifierToBedrock('entity_type', 'minecraft:cow'));
    });

    it('maps biomes onto the Bedrock biome names', () => {
        expect(javaIdentifierToBedrock('biome', 'minecraft:badlands')).toEqual({
            kind: 'mapped',
            bedrock: 'minecraft:mesa'
        });
    });

    it('reports the merged biomes as losses with the shared fallback', () => {
        const result = javaIdentifierToBedrock('biome', 'minecraft:the_void');
        expect(result.kind).toBe('loss');
        if (result.kind === 'loss') expect(result.loss.bedrockFallback).toBe('minecraft:river');
    });

    it('maps enchantments, including the three renames', () => {
        expect(javaIdentifierToBedrock('enchantment', 'minecraft:sharpness')).toEqual({
            kind: 'mapped',
            bedrock: 'minecraft:sharpness'
        });
        expect(javaIdentifierToBedrock('enchantment', 'minecraft:infinity')).toEqual({
            kind: 'mapped',
            bedrock: 'minecraft:bow_infinity'
        });
    });

    it('reports sweeping_edge as the one vanilla enchantment loss', () => {
        const result = javaIdentifierToBedrock('enchantment', 'minecraft:sweeping_edge');
        expect(result.kind).toBe('loss');
        if (result.kind === 'loss') expect(result.loss.bedrockFallback).toBeUndefined();
    });

    it('returns unknown for unlisted entries, and passes custom namespaces through', () => {
        expect(javaIdentifierToBedrock('biome', 'minecraft:not_a_biome').kind).toBe('unknown');
        expect(javaIdentifierToBedrock('enchantment', 'myaddon:lightning')).toEqual({
            kind: 'passthrough',
            bedrock: 'myaddon:lightning'
        });
    });
});
