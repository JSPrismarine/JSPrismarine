import { blockSchemas as blockSchemas2193 } from '@jsprismarine/minecraft/generated/v2193/block-schemas';
import { blockRuntimeId } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import { BlockStateSchemas } from '../../block/state/BlockStateSchema';
import { IDENTITY_BLOCK_TRANSLATION, MISSING_BLOCK_SUBSTITUTE, blockTranslationFor } from './blockTranslation';

/** Every runtime id a 1.26.51 client knows, hashed from its own catalog. */
const known2193 = (): Set<number> => {
    const ids = new Set<number>();
    for (const [name, schema] of Object.entries(blockSchemas2193.blocks)) {
        let states: Record<string, string | number | boolean>[] = [{}];
        for (const [property, { type, values }] of Object.entries(schema.properties)) {
            states = states.flatMap((state) =>
                values.map((value) => ({
                    ...state,
                    [property]: type === 'byte' ? value === true || value === 1 : value
                }))
            );
        }
        for (const state of states) ids.add(blockRuntimeId(name, state));
    }
    return ids;
};

describe('network/codec/blockTranslation', () => {
    const at2193 = blockTranslationFor(2193);

    it('sends a 1.26.51 session only ids its release knows, for every state the world can hold', () => {
        const known = known2193();
        const unknown: string[] = [];
        for (const name of BlockStateSchemas.names()) {
            // A pack's own blocks are not vanilla, and pass through as they are.
            if (!name.startsWith('minecraft:')) continue;
            for (const state of BlockStateSchemas.get(name)!.getAllStates()) {
                if (!known.has(at2193.toClient(BlockRuntimeIds.get(state)))) unknown.push(state.toString());
            }
        }
        expect(unknown).toEqual([]);
    });

    it('drops the connection states 1.26.60 gave fire, keeping its age', () => {
        const fire = BlockStateSchemas.get('minecraft:fire')!;
        const connected = fire.createState({ age: 7, 'minecraft:connection_up': true });

        expect(at2193.toClient(BlockRuntimeIds.get(connected))).toBe(blockRuntimeId('minecraft:fire', { age: 7 }));
    });

    it('sends info_update for a block 1.26.51 does not have', () => {
        expect(at2193.toClient(BlockRuntimeIds.getByName('minecraft:icicle'))).toBe(
            blockRuntimeId(MISSING_BLOCK_SUBSTITUTE)
        );
    });

    it('passes every block whose states did not change through unchanged', () => {
        const stone = BlockRuntimeIds.getByName('minecraft:stone');
        expect(at2193.toClient(stone)).toBe(stone);
    });

    it('translates nothing for the world release, a preview or a version with no capture', () => {
        expect(at2193.changes).toBe(true);
        expect(blockTranslationFor(2225)).toBe(IDENTITY_BLOCK_TRANSLATION);
        expect(blockTranslationFor(2259)).toBe(IDENTITY_BLOCK_TRANSLATION);
        expect(blockTranslationFor(2048)).toBe(IDENTITY_BLOCK_TRANSLATION);
    });
});
