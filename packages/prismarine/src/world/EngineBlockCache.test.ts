import { redstoneConductivity } from '@jsprismarine/blocks';
import { bedrockBlockPropertiesOf, javaBlockStates } from '@jsprismarine/mapping';

import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { BlockStateSchema, BlockStateSchemas } from '../block/state/BlockStateSchema';
import { testContent } from '../testing/entityServer';
import { createEngineBlockCache } from './EngineBlockCache';

describe('EngineBlockCache', () => {
    it('caches immutable block refs, content states, and Bedrock random-tick facts by runtime id', () => {
        const content = testContent();
        const cache = createEngineBlockCache(() => content);
        const states = [
            BlockStateSchemas.get('minecraft:stone')!.getDefaultState(),
            BlockStateSchemas.get('minecraft:wheat')!.createState({ growth: 3 }),
            BlockStateSchemas.get('minecraft:pitcher_crop')!.createState({ growth: 0, upper_block_bit: 0 }),
            BlockStateSchemas.get('minecraft:pitcher_crop')!.createState({ growth: 0, upper_block_bit: 1 })
        ];

        for (const state of states) {
            const runtimeId = BlockRuntimeIds.get(state);
            const first = cache.get(runtimeId);
            const second = cache.get(runtimeId);

            expect(second).toBe(first);
            expect(first.block.name).toBe(state.name);
            expect(first.block.states).toEqual(javaBlockStates(state.name, state.properties));
            expect(Object.isFrozen(first.block)).toBe(true);
            expect(Object.isFrozen(first.block.states)).toBe(true);
            expect(first.randomTicking).toBe(
                bedrockBlockPropertiesOf(state.name, state.properties)?.randomTick ?? false
            );
            expect(first.contentState).toBe(content.blocks.types.get(state.name)?.state(state.properties));
            expect(first.block.redstoneConductor).toBe(
                first.contentState?.content.params(redstoneConductivity)?.redstoneConductor
            );
        }
    });

    it('drops entries when the content build or block schema revision changes', () => {
        let content = testContent();
        const cache = createEngineBlockCache(() => content);
        const runtimeId = BlockRuntimeIds.getByName('minecraft:stone');
        const original = cache.get(runtimeId);

        content = { ...content };
        const afterContentBuild = cache.get(runtimeId);
        expect(afterContentBuild).not.toBe(original);

        const originalSchema = BlockStateSchemas.get('minecraft:stone');
        if (originalSchema === null) throw new Error('The stone schema is missing');

        try {
            BlockStateSchemas.register(new BlockStateSchema('minecraft:stone', { ...originalSchema.properties }));
            expect(cache.get(runtimeId)).not.toBe(afterContentBuild);
        } finally {
            BlockStateSchemas.reset();
            BlockRuntimeIds.reset();
        }
    });

    it('checks the content build once per random tick lookup, however many ids it answers', () => {
        const content = testContent();
        let contentReads = 0;
        const cache = createEngineBlockCache(() => {
            contentReads++;
            return content;
        });
        const runtimeIds = [
            BlockRuntimeIds.getByName('minecraft:stone'),
            BlockRuntimeIds.get(BlockStateSchemas.get('minecraft:wheat')!.createState({ growth: 3 })),
            BlockRuntimeIds.getByName('minecraft:grass_block')
        ];

        const ticks = cache.randomTickingLookup();
        const answers = Array.from({ length: 300 }, (_, draw) => ticks(runtimeIds[draw % runtimeIds.length]!));

        expect(contentReads).toBe(1);
        // The same answers `get` gives, read through the content check it makes on every call.
        expect(answers.slice(0, runtimeIds.length)).toEqual(runtimeIds.map((id) => cache.get(id).randomTicking));
    });

    it('answers a random tick lookup kept past a content reload from the new build', () => {
        let content = testContent();
        const cache = createEngineBlockCache(() => content);
        const wheat = BlockRuntimeIds.get(BlockStateSchemas.get('minecraft:wheat')!.createState({ growth: 3 }));
        const ticks = cache.randomTickingLookup();
        const before = ticks(wheat);

        content = { ...content };
        cache.get(wheat);

        expect(ticks(wheat)).toBe(before);
        expect(cache.randomTickingLookup()(wheat)).toBe(cache.get(wheat).randomTicking);
    });
});
