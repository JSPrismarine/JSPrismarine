import type { Definition } from '@jsprismarine/content';
import { BehaviorRegistry, FlattenError, } from '@jsprismarine/content';
import { describe, expect, it } from 'vitest';

import { EXPLOSION_PROOF_RESISTANCE, UNBREAKABLE_HARDNESS, flattenBlockStates } from './flatten';
import type { BlockHooks } from './hooks';
import { BlockPalette } from './state';
import { resolveBlocks } from './types';

const definition = (identifier: string, components: Record<string, unknown>): Definition => ({
    identifier,
    registry: 'blocks',
    pack: 'test',
    path: `blocks/${identifier.replace(/^[^:]*:/, '')}.block.json`,
    data: {
        format_version: '1.26.50',
        'minecraft:block': { description: { identifier }, components }
    }
});

const flattenOf = (...definitions: Definition[]) => {
    const resolved = resolveBlocks(definitions, { statePalette: new BlockPalette([]) });
    return { resolved, table: flattenBlockStates(resolved) };
};

describe('flattening block states', () => {
    it('writes one slot per state, in runtime id order', () => {
        const { resolved, table } = flattenOf(
            definition('test:a', { 'minecraft:light_emission': 7 }),
            definition('test:b', { 'minecraft:light_emission': 12 })
        );

        expect(table.lightEmission).toHaveLength(2);
        expect(table.lightEmission[resolved.types.get('test:a')!.state().runtimeId]).toBe(7);
        expect(table.lightEmission[resolved.types.get('test:b')!.state().runtimeId]).toBe(12);
    });

    it('gives each column the typed array its kind declares', () => {
        const { table } = flattenOf(definition('test:a', {}));

        expect(table.lightEmission).toBeInstanceOf(Uint8Array);
        expect(table.friction).toBeInstanceOf(Float32Array);
        expect(table.solid).toBeInstanceOf(Uint8Array);
    });

    it('falls back to the engine default where a block declares nothing', () => {
        const { table } = flattenOf(definition('test:a', {}));

        expect(table.lightEmission[0]).toBe(0);
        expect(table.lightFilter[0]).toBe(15);
        expect(table.friction[0]).toBeCloseTo(0.6, 5);
        expect(table.hardness[0]).toBe(0);
    });

    it('stores a Java-sized value for a block no mining or explosion breaks', () => {
        const { table } = flattenOf(
            definition('test:bedrock', {
                'minecraft:destructible_by_mining': false,
                'minecraft:destructible_by_explosion': false
            })
        );

        expect(table.hardness[0]).toBe(UNBREAKABLE_HARDNESS);
        expect(table.blastResistance[0]).toBe(EXPLOSION_PROOF_RESISTANCE);
    });

    it('prefers the Java friction over the capped Bedrock component', () => {
        const { table } = flattenOf(
            definition('test:blue_ice', {
                'minecraft:friction': 0.9,
                'jsprismarine:block_properties': { friction: 0.989 }
            })
        );

        expect(table.friction[0]).toBeCloseTo(0.989, 5);
    });

    it('marks a random ticking block from the overlay component', () => {
        const { resolved, table } = flattenOf(
            definition('test:wheat', { 'jsprismarine:block_properties': { random_tick: true } }),
            definition('test:stone', {})
        );

        const tickingOf = (identifier: string) => table.randomTick[resolved.types.get(identifier)!.state().runtimeId];
        expect(tickingOf('test:wheat')).toBe(1);
        expect(tickingOf('test:stone')).toBe(0);
    });

    it('marks a random ticking block from a behavior that implements the hook', () => {
        const behaviors = new BehaviorRegistry<BlockHooks>();
        behaviors.register({
            name: 'jsprismarine:crop',
            hooks: ['onRandomTick'],
            create: () => ({ onRandomTick: () => {} })
        });
        behaviors.attach('jsprismarine:crop', 'test:carrots');

        const resolved = resolveBlocks([definition('test:carrots', {})], {
            behaviors,
            statePalette: new BlockPalette([])
        });

        expect(flattenBlockStates(resolved).randomTick[0]).toBe(1);
    });

    it('reads solidity off the collision box', () => {
        const { resolved, table } = flattenOf(
            definition('test:ghost', { 'minecraft:collision_box': false }),
            definition('test:slab', { 'minecraft:collision_box': { origin: [-8, 0, -8], size: [16, 8, 16] } }),
            definition('test:solid', {})
        );

        const solidityOf = (identifier: string) => table.solid[resolved.types.get(identifier)!.state().runtimeId];
        expect(solidityOf('test:ghost')).toBe(0);
        expect(solidityOf('test:slab')).toBe(1);
        expect(solidityOf('test:solid')).toBe(1);
    });

    it('fails on a reviewed exception that matched nothing', () => {
        const resolved = resolveBlocks([definition('test:a', {})], { statePalette: new BlockPalette([]) });

        expect(() =>
            flattenBlockStates(resolved, [{ id: 0, column: 'friction', value: 0.6, reason: 'stale row' }])
        ).toThrow(FlattenError);
    });
});
