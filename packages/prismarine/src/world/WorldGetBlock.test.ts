import { describe, expect, it } from 'vitest';

import type { Block } from '../block/Block';
import { reportProgress } from '../../../../.test/reportProgress';
import { BlockState } from '../block/state/BlockState';
import { BlockStateSchemas } from '../block/state/BlockStateSchema';
import type { ServerContent } from '../content/ServerContent';
import { testWorld } from '../testing/level';
import { stub } from '../testing/stub.test.helper';
import type Chunk from './chunk/Chunk';
import type { World } from './World';

/**
 * A world that holds one state at every position.
 *
 * Every chunk it answers is a stub that holds `state`, because what is under test is the one
 * method and the registry behind it, and a provider and a generator would say nothing more.
 */
const worldHolding = (state: BlockState, content?: ServerContent): World =>
    Object.assign(testWorld(), {
        getChunkAt: async () => stub<Chunk>({ getBlock: () => state }),
        // Assigned over the built world rather than passed in: with no content a block resolves
        // from the shipped schemas, and `Server.getContent` is typed never to answer undefined.
        server: { getContent: () => content }
    });

describe('World.getBlock', () => {
    it('resolves every state in the palette', async () => {
        const failures: string[] = [];
        let states = 0;

        for (const name of BlockStateSchemas.names()) {
            for (const state of BlockStateSchemas.get(name)!.getAllStates()) {
                states++;

                let block: Block;
                try {
                    block = await worldHolding(state).getBlock(0, 0, 0);
                } catch (error) {
                    failures.push(`${state.toString()}: ${(error as Error).message}`);
                    continue;
                }

                if (block.name !== name) failures.push(`${state.toString()} came back as ${block.name}`);
            }
        }

        expect(failures, failures.slice(0, 10).join('\n')).toEqual([]);
        expect(states).toBeGreaterThan(0);
        reportProgress(`World.getBlock resolved ${states} generated block states.`);
    });

    it('carries the state the chunk holds, not the block default', async () => {
        // A log lying on its side. Reading one used to answer the upright default, so
        // anything deciding off the properties - a pillar's axis, a slab's half, a lamp's
        // lit bit - read the wrong block at the right position.
        const log = new BlockState('minecraft:oak_log', { pillar_axis: 'x' });

        const block = await worldHolding(log).getBlock(1, 2, 3);

        expect(block.name).toBe('minecraft:oak_log');
        expect(block.states).toEqual({ pillar_axis: 'x' });
    });

    it('throws for a name no registry knows instead of answering air', async () => {
        // Answering air is a silent loss: air is a position a caller may build in, so the
        // next write replaces a block the server merely failed to look up.
        const ghost = new BlockState('someplugin:ghost_block');

        await expect(worldHolding(ghost).getBlock(10, 64, -20)).rejects.toThrow(
            'No block named someplugin:ghost_block, held at 10 64 -20 in world test'
        );
    });
});
