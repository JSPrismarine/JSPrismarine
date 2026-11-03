import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import Chunk from '../../world/chunk/Chunk';
import type { ContentBlock, ContentBlockAccess } from '../../content/world/adapter';

import { navigationViewOf } from './navigationView';
import { entityFixture } from './testing';

const contentBlocks = (
    get: ContentBlockAccess['get'],
    chunkAccess: Pick<ContentBlockAccess, 'blockChunkIdentityAt' | 'blockChunkRevisionAt' | 'runtimeIdAt'> = {}
) =>
    ({
        get,
        ...chunkAccess,
        set: () => undefined,
        notifyNeighbors: () => undefined,
        data: () => undefined,
        setData: () => undefined,
        light: () => 0,
        power: () => 0,
        isLoaded: () => true,
        surfaceY: () => undefined,
        biome: () => undefined,
        biomeTags: () => []
    }) satisfies ContentBlockAccess;

describe('navigationViewOf', () => {
    it('caches missing cells until the world invalidates block reads', () => {
        let block: ContentBlock | undefined;
        let reads = 0;
        const blocks = contentBlocks(() => {
            reads += 1;
            return block;
        });
        const cached = navigationViewOf(blocks, () => {
            throw new Error('block identifier reads should not resolve block content');
        });
        const at = { x: -1, y: -64, z: 17 };

        expect(cached.view.blockAt(at)).toBeUndefined();
        expect(cached.view.blockAt(at)).toBeUndefined();
        expect(reads).toBe(1);

        block = { identifier: 'minecraft:stone', states: {} };
        expect(cached.view.blockAt(at)).toBeUndefined();
        expect(reads).toBe(1);

        cached.invalidateBlockCache();
        expect(cached.view.blockAt(at)).toBe('minecraft:stone');
        expect(reads).toBe(2);
    });

    it('invalidates a cached media identifier after the block changes', () => {
        let block: ContentBlock = { identifier: 'minecraft:water', states: {} };
        const cached = navigationViewOf(
            contentBlocks(() => block),
            () => {
                throw new Error('media classification should not resolve block content');
            }
        );
        const at = { x: 1, y: 2, z: 3 };

        expect(cached.view.isLava(at)).toBe(false);
        block = { identifier: 'minecraft:lava', states: {} };
        cached.invalidateBlockCache();

        expect(cached.view.isWater(at)).toBe(false);
        expect(cached.view.isLava(at)).toBe(true);
    });

    it('keeps cached reads correct while moving between chunks', () => {
        let reads = 0;
        const blocks = contentBlocks((at) => {
            reads += 1;
            return { identifier: `test:${at.x},${at.z}`, states: {} };
        });
        const cached = navigationViewOf(blocks, () => {
            throw new Error('block identifier reads should not resolve block content');
        });
        const positions = [
            { x: -1, y: 0, z: 0 },
            { x: 0, y: 0, z: 0 },
            { x: 16, y: 0, z: 0 },
            { x: 0, y: 0, z: 0 },
            { x: -1, y: 0, z: 0 }
        ];

        for (const position of positions) {
            expect(cached.view.blockAt(position)).toBe(`test:${position.x},${position.z}`);
        }
        for (const position of positions) cached.view.blockAt(position);

        expect(reads).toBe(3);
    });

    it('retains a block between ticks until its chunk revision changes', () => {
        let block: ContentBlock = { identifier: 'minecraft:water', states: {} };
        let revision = 0;
        let identity: object = {};
        let reads = 0;
        const blocks = contentBlocks(
            () => {
                reads += 1;
                return block;
            },
            {
                blockChunkIdentityAt: () => identity,
                blockChunkRevisionAt: () => revision
            }
        );
        const cached = navigationViewOf(blocks, () => {
            throw new Error('block identifier reads should not resolve block content');
        });
        const at = { x: -1, y: -64, z: 17 };

        expect(cached.persistsAcrossTicks).toBe(true);
        expect(cached.view.isWater(at)).toBe(true);
        expect(cached.view.isWater(at)).toBe(true);
        expect(reads).toBe(1);

        block = { identifier: 'minecraft:lava', states: {} };
        revision += 1;
        expect(cached.view.isWater(at)).toBe(false);
        expect(cached.view.isLava(at)).toBe(true);
        expect(reads).toBe(2);

        block = { identifier: 'minecraft:fire', states: {} };
        identity = {};
        expect(cached.view.blockAt(at)).toBe('minecraft:fire');
        expect(cached.view.isDamaging?.(at)).toBe(true);
        expect(reads).toBe(3);
    });

    it('invalidates only the changed chunk and keeps least-recently-used chunks bounded', () => {
        const blocksByChunk = new Map<number, string>([
            [0, 'minecraft:stone'],
            [1, 'minecraft:water'],
            [2, 'minecraft:fire']
        ]);
        const identities = [{}, {}, {}];
        const revisions = new Map<number, number>([
            [0, 0],
            [1, 0],
            [2, 0]
        ]);
        let reads = 0;
        const blocks = contentBlocks(
            (at) => {
                reads += 1;
                return { identifier: blocksByChunk.get(Math.floor(at.x / 16)) ?? 'minecraft:air', states: {} };
            },
            {
                blockChunkIdentityAt: (at) => identities[Math.floor(at.x / 16)],
                blockChunkRevisionAt: (at) => revisions.get(Math.floor(at.x / 16))
            }
        );
        const cached = navigationViewOf(
            blocks,
            () => {
                throw new Error('block identifier reads should not resolve block content');
            },
            undefined,
            2
        );
        const inChunk = (chunkX: number) => ({ x: chunkX * 16, y: 0, z: 0 });

        expect(cached.view.blockAt(inChunk(0))).toBe('minecraft:stone');
        expect(cached.view.blockAt(inChunk(1))).toBe('minecraft:water');
        blocksByChunk.set(0, 'minecraft:ladder');
        revisions.set(0, (revisions.get(0) ?? 0) + 1);
        cached.invalidateBlockCache(0, 0);
        expect(cached.view.blockAt(inChunk(0))).toBe('minecraft:ladder');
        expect(cached.view.blockAt(inChunk(1))).toBe('minecraft:water');
        expect(reads).toBe(3);

        expect(cached.view.blockAt(inChunk(2))).toBe('minecraft:fire');
        expect(cached.view.blockAt(inChunk(0))).toBe('minecraft:ladder');
        expect(cached.view.blockAt(inChunk(2))).toBe('minecraft:fire');
        expect(reads).toBe(5);
    });

    it('uses runtime ids and their memoized facts for navigation cells', () => {
        const { content } = entityFixture();
        const chunk = new Chunk();
        const blockReads = { count: 0 };
        const runtimeId = (name: string) => BlockRuntimeIds.getByName(name);
        chunk.setBlockRuntimeId(0, 1, 0, runtimeId('minecraft:stone'));
        chunk.setBlockRuntimeId(1, 1, 0, runtimeId('minecraft:water'));
        chunk.setBlockRuntimeId(2, 1, 0, runtimeId('minecraft:ladder'));
        chunk.setBlockRuntimeId(3, 1, 0, runtimeId('minecraft:cactus'));
        chunk.setBlockRuntimeId(4, 1, 0, runtimeId('minecraft:air'));

        const blocks = contentBlocks(
            () => {
                throw new Error('runtime-id navigation must not construct a content block');
            },
            {
                blockChunkIdentityAt: () => chunk,
                blockChunkRevisionAt: () => chunk.getBlockRevision(),
                runtimeIdAt: (at) => {
                    blockReads.count += 1;
                    return chunk.getBlockRuntimeId(at.x, at.y, at.z);
                }
            }
        );
        const cached = navigationViewOf(blocks, () => content);
        const wall = { x: 0, y: 1, z: 0 };
        const water = { x: 1, y: 1, z: 0 };
        const ladder = { x: 2, y: 1, z: 0 };
        const cactus = { x: 3, y: 1, z: 0 };
        const air = { x: 4, y: 1, z: 0 };

        expect(cached.view.isSolid(wall)).toBe(true);
        expect(cached.view.isWater(water)).toBe(true);
        expect(cached.view.blockAt(water)).toBe('minecraft:water');
        expect(cached.view.isPassable(air)).toBe(true);
        expect(cached.view.isClimbable?.(ladder)).toBe(true);
        expect(cached.view.isDamaging?.(cactus)).toBe(true);
        expect(blockReads.count).toBe(5);

        chunk.setBlockRuntimeId(1, 1, 0, runtimeId('minecraft:lava'));
        expect(cached.view.isWater(water)).toBe(false);
        expect(cached.view.isLava(water)).toBe(true);
        expect(blockReads.count).toBe(6);
    });

    it('reads stateless block solidity from the content palette', () => {
        const { content } = entityFixture();
        const blocks = contentBlocks((at) => ({
            identifier: at.y === 0 ? 'minecraft:stone' : 'minecraft:air',
            states: {}
        }));
        const cached = navigationViewOf(blocks, () => content);

        expect(cached.view.isSolid({ x: 0, y: 0, z: 0 })).toBe(true);
        expect(cached.view.isPassable({ x: 0, y: 0, z: 0 })).toBe(false);
        expect(cached.view.isSolid({ x: 0, y: 1, z: 0 })).toBe(false);
        expect(cached.view.isPassable({ x: 0, y: 1, z: 0 })).toBe(true);
    });
});
