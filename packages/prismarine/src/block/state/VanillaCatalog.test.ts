import { describe, expect, it } from 'vitest';

import { reportProgress } from '../../../../../.test/reportProgress';

import { BlockRuntimeIds } from './BlockRuntimeIds';
import { BlockStateSchemas } from './BlockStateSchema';
import { blockSchemas as vanillaSchemas } from '@jsprismarine/minecraft';

/** Every state of every block JSPrismarine ships with. */
const allVanillaStates = () =>
    BlockStateSchemas.names()
        .filter((name) => name.startsWith('minecraft:'))
        .flatMap((name) => BlockStateSchemas.get(name)!.getAllStates());

describe('block', () => {
    describe('vanilla catalog', () => {
        it('describes every block and state the dump contained', () => {
            // The generator deduces each block's schema from the states it observed. That
            // deduction is only lossless if a block's states are the full product of its
            // properties - which this asserts, rather than assuming.
            const states = allVanillaStates();
            expect(vanillaSchemas.blockCount).toBeGreaterThan(0);
            expect(states.length).toBe(vanillaSchemas.stateCount);
            reportProgress(
                `Vanilla block catalog contains ${vanillaSchemas.blockCount} blocks and ${states.length} states.`
            );
        });

        it('gives every state a distinct runtime id', () => {
            // Vanilla identifies blocks by a 32 bit hash of ~17k states, so collisions are
            // not ruled out by arithmetic alone - at this size chance would give roughly a
            // 3% probability of one. If this ever fails, two blocks are indistinguishable
            // on the wire and the affected pair has to be reported, not worked around.
            const ids = new Map<number, string>();
            const collisions: string[] = [];

            const states = allVanillaStates();
            for (const state of states) {
                const id = BlockRuntimeIds.get(state);
                const previous = ids.get(id);
                if (previous) collisions.push(`${previous} and ${state.toString()} both hash to ${id}`);
                else ids.set(id, state.toString());
            }

            expect(collisions).toEqual([]);
            expect(ids.size).toBe(states.length);
        });

        it('keeps the ids of a sample of blocks stable across releases', () => {
            // A per-block digest, so a client update that changes a block's states shows up
            // as a diff naming that block instead of as a broken world.
            const digest = Object.fromEntries(
                ['minecraft:air', 'minecraft:stone', 'minecraft:oak_log', 'minecraft:stone_button'].map((name) => [
                    name,
                    BlockStateSchemas.get(name)!
                        .getAllStates()
                        .map((state) => `${state.toString()}=${BlockRuntimeIds.get(state)}`)
                ])
            );

            expect(digest).toMatchSnapshot();
        });

        it('agrees with the properties recorded for a hand-checked block', () => {
            // Verified against the capture directly: oak_log carries only pillar_axis, x/y/z,
            // defaulting to y.
            const schema = BlockStateSchemas.get('minecraft:oak_log')!;
            expect(Object.keys(schema.properties)).toEqual(['pillar_axis']);
            expect(schema.properties.pillar_axis!.type).toBe('string');
            // Sorted, because the order these arrive in is the order the source happened to
            // list them and nothing reads it: a runtime id is a hash of a name and a state, so
            // two catalogs listing the same values differently produce the same ids.
            expect([...schema.properties.pillar_axis!.values].sort()).toEqual(['x', 'y', 'z']);
            expect(schema.getDefaultState().get('pillar_axis')).toBe('y');
        });

        it('hands out one default state rather than building a new one per call', () => {
            // A read of a position no sub chunk covers answers with air's default state, and an
            // idle world's random tick pass makes tens of thousands of those a tick. Building a
            // state for each was most of that tick. The instance is frozen, so sharing it is
            // the same answer; this is what stops the allocation coming back.
            const schema = BlockStateSchemas.get('minecraft:air')!;
            expect(schema.getDefaultState()).toBe(schema.getDefaultState());
            expect(Object.isFrozen(schema.getDefaultState())).toBe(true);
        });

        it('rejects values a block does not accept', () => {
            const schema = BlockStateSchemas.get('minecraft:oak_log')!;
            expect(() => schema.createState({ pillar_axis: 'w' })).toThrow(/does not accept/);
            expect(() => schema.createState({ nonsense: 1 })).toThrow(/has no property/);
        });
    });
});
