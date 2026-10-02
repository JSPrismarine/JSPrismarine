import { describe, expect, it } from 'vitest';

import * as Blocks from '../../block/Blocks';
import type { Block } from '../../block/Block';
import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import { BlockStateSchema, BlockStateSchemas } from '../../block/state/BlockStateSchema';
import Chunk from './Chunk';

const blockOf = (name: string): Block =>
    Object.values(Blocks)
        .map((B) => new (B as any)())
        .find((block: Block) => block.getName() === name)!;

describe('world', () => {
    describe('chunk fast paths', () => {
        // These exist purely to make world generation cheaper. The only thing that matters
        // is that they place exactly the blocks the slow path placed - so every test here
        // compares the two rather than asserting what either one does.
        it('fillColumn writes the same blocks as one setBlock per level', () => {
            const stone = BlockRuntimeIds.getByName('minecraft:stone');

            const filled = new Chunk(0, 0);
            filled.fillColumn(3, 9, 5, 70, stone); // spans five sub chunks

            const placed = new Chunk(0, 0);
            for (let y = 5; y <= 70; y++) placed.setBlockRuntimeId(3, y, 9, stone);

            for (let y = 0; y < 80; y++) {
                expect(filled.getBlock(3, y, 9).name).toBe(placed.getBlock(3, y, 9).name);
            }
        });

        it('fillColumn covers exactly the requested range, inclusive', () => {
            const stone = BlockRuntimeIds.getByName('minecraft:stone');
            const chunk = new Chunk(0, 0);
            chunk.fillColumn(0, 0, 20, 34, stone);

            expect(chunk.getBlock(0, 19, 0).name).toBe('minecraft:air');
            expect(chunk.getBlock(0, 20, 0).name).toBe('minecraft:stone');
            expect(chunk.getBlock(0, 34, 0).name).toBe('minecraft:stone');
            expect(chunk.getBlock(0, 35, 0).name).toBe('minecraft:air');
        });

        it('fillColumn does nothing when the range is empty', () => {
            const chunk = new Chunk(0, 0);
            chunk.fillColumn(0, 0, 40, 39, BlockRuntimeIds.getByName('minecraft:stone'));
            expect(chunk.getBlock(0, 40, 0).name).toBe('minecraft:air');
            expect(chunk.getBlock(0, 39, 0).name).toBe('minecraft:air');
        });

        it('setBlockRuntimeId and setBlock agree', () => {
            const grass = blockOf('minecraft:grass_block');

            const viaBlock = new Chunk(0, 0);
            viaBlock.setBlock(7, 64, 7, grass);

            const viaId = new Chunk(0, 0);
            viaId.setBlockRuntimeId(7, 64, 7, BlockRuntimeIds.getByName(grass.getStateName()));

            expect(viaId.getBlock(7, 64, 7).name).toBe(viaBlock.getBlock(7, 64, 7).name);
        });

        it('keeps the palette in the order blocks were first seen', () => {
            // The palette is written to the wire in order, so the index a block gets must
            // still be the position of its first appearance.
            const chunk = new Chunk(0, 0);
            const stone = BlockRuntimeIds.getByName('minecraft:stone');
            const dirt = BlockRuntimeIds.getByName('minecraft:dirt');

            chunk.setBlockRuntimeId(0, 1, 0, stone);
            chunk.setBlockRuntimeId(0, 2, 0, dirt);
            chunk.setBlockRuntimeId(0, 3, 0, stone); // already known, must not be appended

            const palette = (chunk.getSubChunk(0) as any).getStorage(0).palette;
            expect(palette).toEqual([BlockRuntimeIds.getByName('minecraft:air'), stone, dirt]);
        });
    });

    describe('serialised chunk cache', () => {
        const stone = () => BlockRuntimeIds.getByName('minecraft:stone');

        it('reuses the bytes while nothing changes', () => {
            // The reason the cache exists: ten players in one area cost one serialisation.
            const chunk = new Chunk(0, 0);
            chunk.setBlockRuntimeId(1, 1, 1, stone());

            expect(chunk.networkSerialize()).toBe(chunk.networkSerialize());
        });

        it('notices a block written through a sub chunk', () => {
            // `getSubChunk` hands out the real thing and the cave carver writes through it,
            // so the cache cannot depend on the two methods on `Chunk` remembering to clear
            // it. Stale bytes here are terrain the client gets wrong with nothing to show it.
            const chunk = new Chunk(0, 0);
            chunk.setBlockRuntimeId(1, 1, 1, stone());
            const before = Buffer.from(chunk.networkSerialize());

            chunk.getSubChunk(0)!.setBlock(2, 2, 2, stone(), 0);

            expect(chunk.networkSerialize().equals(before)).toBe(false);
            // And what it now serialises agrees with what it reads back.
            expect(chunk.getBlockRuntimeId(2, 2, 2)).toBe(stone());
        });

        it('notices a block written through the sub chunk map', () => {
            const chunk = new Chunk(0, 0);
            chunk.setBlockRuntimeId(1, 1, 1, stone());
            const before = Buffer.from(chunk.networkSerialize());

            chunk.getSubChunks().get(0)!.setBlock(3, 3, 3, stone(), 0);

            expect(chunk.networkSerialize().equals(before)).toBe(false);
        });

        it('notices a whole new sub chunk', () => {
            const chunk = new Chunk(0, 0);
            chunk.setBlockRuntimeId(1, 1, 1, stone());
            const before = Buffer.from(chunk.networkSerialize());

            chunk.getOrCreateSubChunk(3).setBlock(0, 0, 0, stone(), 0);

            expect(chunk.networkSerialize().equals(before)).toBe(false);
        });

        it('still serialises the same bytes it did before the block came back', () => {
            // Placing and removing leaves a different mutation count but identical terrain,
            // and the bytes have to match - the count decides when to rebuild, never what.
            const air = BlockRuntimeIds.getByName('minecraft:air');

            const untouched = new Chunk(0, 0);
            untouched.setBlockRuntimeId(1, 1, 1, stone());

            const reverted = new Chunk(0, 0);
            reverted.setBlockRuntimeId(1, 1, 1, stone());
            reverted.setBlockRuntimeId(5, 5, 5, stone());
            reverted.networkSerialize(); // cache the wrong picture
            reverted.setBlockRuntimeId(5, 5, 5, air);

            expect(reverted.networkSerialize().equals(untouched.networkSerialize())).toBe(true);
        });
    });

    describe('runtime id name cache', () => {
        it('returns the same id memoised as it did computing it fresh', () => {
            const fresh = BlockRuntimeIds.get(BlockStateSchemas.get('minecraft:stone')!.getDefaultState());
            expect(BlockRuntimeIds.getByName('minecraft:stone')).toBe(fresh);
            expect(BlockRuntimeIds.getByName('minecraft:stone')).toBe(fresh); // now from cache
        });

        it('notices when a plugin redefines a block', () => {
            const before = BlockRuntimeIds.getByName('minecraft:stone');

            // Redefining stone with a property changes its default state, so its id changes.
            BlockStateSchemas.register(
                new BlockStateSchema('minecraft:stone', {
                    pillar_axis: { type: 'string', values: ['x', 'y', 'z'], default: 'y' }
                })
            );
            expect(BlockRuntimeIds.getByName('minecraft:stone')).not.toBe(before);

            BlockStateSchemas.reset();
            BlockRuntimeIds.reset();
            expect(BlockRuntimeIds.getByName('minecraft:stone')).toBe(before);
        });

        it('still refuses a block nobody registered', () => {
            expect(() => BlockRuntimeIds.getByName('myplugin:nope')).toThrow(/No block state schema/);
        });
    });
});
