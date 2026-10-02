import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from './BlockRuntimeIds';
import { BlockStateSchemas } from './BlockStateSchema';
import { blockSchemas as vanillaSchemas } from '@jsprismarine/minecraft';

/** Every state of every block JSPrismarine ships with. */
const allVanillaStates = () =>
    BlockStateSchemas.names()
        .filter((name) => name.startsWith('minecraft:'))
        .flatMap((name) => BlockStateSchemas.get(name)!.getAllStates());

describe('block', () => {
    describe('vanilla catalogue', () => {
        it('describes every block and state the dump contained', () => {
            // The counts are a fact about the captured version - 1.26.51, from a Bedrock
            // Dedicated Server - and are written out so that a catalogue that quietly shrinks
            // is a failure rather than a smaller world. 1.21.40 had 1219 blocks and 14196
            // states, 1.26.40 had 1379 and 17487; 1.26.50 added 98 blocks - the wool and
            // concrete stairs and slabs - and gave every stair a corner state and every fence,
            // pane and bar four connection states, which is where the other 4000 come from.
            expect(vanillaSchemas.blockCount).toBe(1477);
            expect(vanillaSchemas.stateCount).toBe(22079);

            // The generator deduces each block's schema from the states it observed. That
            // deduction is only lossless if a block's states are the full product of its
            // properties - which this asserts, rather than assuming.
            expect(allVanillaStates().length).toBe(vanillaSchemas.stateCount);
        });

        it('gives every state a distinct runtime id', () => {
            // Vanilla identifies blocks by a 32 bit hash of ~17k states, so collisions are
            // not ruled out by arithmetic alone - at this size chance would give roughly a
            // 3% probability of one. If this ever fails, two blocks are indistinguishable
            // on the wire and the affected pair has to be reported, not worked around.
            const ids = new Map<number, string>();
            const collisions: string[] = [];

            for (const state of allVanillaStates()) {
                const id = BlockRuntimeIds.get(state);
                const previous = ids.get(id);
                if (previous) collisions.push(`${previous} and ${state.toString()} both hash to ${id}`);
                else ids.set(id, state.toString());
            }

            expect(collisions).toEqual([]);
            expect(ids.size).toBe(vanillaSchemas.stateCount);
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
            // two catalogues listing the same values differently produce the same ids.
            expect([...schema.properties.pillar_axis!.values].sort()).toEqual(['x', 'y', 'z']);
            expect(schema.getDefaultState().get('pillar_axis')).toBe('y');
        });

        it('rejects values a block does not accept', () => {
            const schema = BlockStateSchemas.get('minecraft:oak_log')!;
            expect(() => schema.createState({ pillar_axis: 'w' })).toThrow(/does not accept/);
            expect(() => schema.createState({ nonsense: 1 })).toThrow(/has no property/);
        });
    });
});
