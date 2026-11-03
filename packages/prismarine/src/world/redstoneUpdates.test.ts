import { HookTable } from '@jsprismarine/content';
import type { BlockFlags, BlockHooks } from '@jsprismarine/blocks';
import type { BlockState, BlockType } from '@jsprismarine/blocks';
import type { Type } from '@jsprismarine/content';
import { describe, expect, it } from 'vitest';

import type { ServerContent, ServerContentBlocks } from '../content/ServerContent';
import { stub } from '../testing/stub.test.helper';
import { Dimensions } from './Dimension';
import { contentRedstoneUpdateHandlers } from './redstoneUpdates';
import type { World } from './World';

describe('redstone cache coordinate keys', () => {
    it('invalidates only the changed position, then clears the chunk on unload', () => {
        const powers: { readonly position: string; readonly power: number }[] = [];
        const hooks = new HookTable<BlockHooks>([
            {
                source: 'test',
                handlers: {
                    onRedstoneUpdate: ({ block, power }) =>
                        powers.push({
                            position: `${block.position.x},${block.position.y},${block.position.z}`,
                            power
                        })
                }
            }
        ]);
        const state = stub<BlockState>({
            content: stub<Type<BlockHooks, keyof BlockFlags>>({ hooks }),
            values: {}
        });
        const blockType = stub<BlockType>({ state: () => state });
        const blocks = stub<ServerContentBlocks>({ types: new Map([['test:block', blockType]]) });
        const content = stub<ServerContent>({ blocks });
        const world = stub<World>({
            loadedBlockAt: () => ({ name: 'test:block', states: {} }),
            getDimension: () => Dimensions.Overworld
        });
        const handlers = contentRedstoneUpdateHandlers({
            content,
            world: () => world,
            report: () => {}
        });
        const block = { name: 'test:block', states: {} };
        const first = { x: -1, y: 64, z: -1 };
        const second = { x: -2, y: 64, z: -1 };

        handlers.dispatch(first, block, 15);
        handlers.dispatch(second, block, 15);
        handlers.dispatch(first, block, 15);
        expect(powers).toHaveLength(2);

        handlers.forgetPosition(first);
        handlers.dispatch(second, block, 15);
        handlers.dispatch(first, block, 15);
        expect(powers).toHaveLength(3);
        expect(powers[2]).toEqual({ position: '-1,64,-1', power: 15 });

        handlers.forgetChunk(-1, -1);
        handlers.dispatch(first, block, 15);
        handlers.dispatch(second, block, 15);
        expect(powers.slice(3)).toEqual([
            { position: '-1,64,-1', power: 15 },
            { position: '-2,64,-1', power: 15 }
        ]);

        const outsidePackedRange = { x: 536_870_912, y: 10_000, z: 536_870_912 };
        handlers.dispatch(outsidePackedRange, block, 15);
        handlers.dispatch(outsidePackedRange, block, 15);
        expect(powers).toHaveLength(6);
        handlers.forgetPosition(outsidePackedRange);
        handlers.dispatch(outsidePackedRange, block, 15);
        expect(powers).toHaveLength(7);
        handlers.forgetChunk(33_554_432, 33_554_432);
        handlers.dispatch(outsidePackedRange, block, 15);
        expect(powers).toHaveLength(8);
    });
});
