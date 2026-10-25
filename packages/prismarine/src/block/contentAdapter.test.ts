import { afterEach, describe, expect, it, vi } from 'vitest';

import { HookTable } from '@jsprismarine/content';

import { buildServerContent } from '../content/ServerContent';
import { fixtureContentOptions } from '../content/testing';
import { singleDimension } from '../content/world/adapter';
import type { BlockEntityData, ContentBlock, ContentPosition, ServerWorldAdapter } from '../content/world/adapter';
import { unwiredWorld } from '../content/world/unwired';
import type { ServerContent } from '../content/ServerContent';
import { createContentBlockGroup } from './contentAdapter';
import type { BlockEntityStore, BlockStorageAccess } from './contentAdapter';

const key = (at: ContentPosition) => `${at.x},${at.y},${at.z}`;

const stone: ContentBlock = { identifier: 'minecraft:stone', states: {} };
const lamp: ContentBlock = { identifier: 'minecraft:redstone_lamp', states: { lit: false } };

/** A world of a handful of blocks, which is all the six adapter members read. */
const mapStorage = (initial: Record<string, ContentBlock> = {}) => {
    const blocks = new Map(Object.entries(initial));
    const written: string[] = [];
    const storage: BlockStorageAccess = {
        at: (position) => blocks.get(key(position)),
        write: (position, block) => {
            written.push(key(position));
            blocks.set(key(position), block);
        }
    };
    return { storage, written };
};

const mapBlockEntities = (): BlockEntityStore => {
    const records = new Map<string, BlockEntityData>();
    return { at: (position) => records.get(key(position)), put: (position, data) => records.set(key(position), data) };
};

/**
 * The group wired into a real content build, the way the composition root
 * wires it: the adapter carries the group, the content is built around the
 * adapter, and the group reads the content back.
 */
const harness = (initial: Record<string, ContentBlock> = {}) => {
    const { storage, written } = mapStorage(initial);
    let content: ServerContent | undefined;

    const blocks = createContentBlockGroup({
        storage,
        blockEntities: mapBlockEntities(),
        content: () => content!
    });

    const unwired = unwiredWorld();
    const adapter: ServerWorldAdapter = { ...unwired, blocks: { ...unwired.blocks, ...blocks } };
    content = buildServerContent(fixtureContentOptions({ world: singleDimension(adapter) }));

    return { blocks, written, content };
};

/** Every `onNeighborChanged` dispatch, as `<position> <face>`. */
const watchNeighborHooks = () => {
    const seen: string[] = [];
    vi.spyOn(HookTable.prototype, 'dispatch').mockImplementation(function (hook, ...args) {
        if (hook !== 'onNeighborChanged') return;
        // The spy erases the hook's own argument type; the name narrows it.
        const event = args[0] as { block: { position: ContentPosition }; face: string };
        seen.push(`${key(event.block.position)} ${event.face}`);
    });
    return seen;
};

/** Every dispatch of the named hooks, by hook name, in the order they ran. */
const watchHooks = (names: readonly string[]) => {
    const seen: string[] = [];
    vi.spyOn(HookTable.prototype, 'dispatch').mockImplementation(function (hook) {
        if (names.includes(hook)) seen.push(hook);
    });
    return seen;
};

describe('block', () => {
    describe('content block group', () => {
        afterEach(() => vi.restoreAllMocks());

        it('reads a block back through the storage it was given', () => {
            const { blocks } = harness({ '0,0,0': stone });

            expect(blocks.get({ x: 0, y: 0, z: 0 })).toEqual(stone);
        });

        it('answers undefined for a position the storage does not hold', () => {
            const { blocks } = harness();

            expect(blocks.get({ x: 4, y: 4, z: 4 })).toBeUndefined();
        });

        it('commits a write before anything can read it back', () => {
            const { blocks, written } = harness();

            blocks.set({ x: 1, y: 2, z: 3 }, lamp, false);

            expect(blocks.get({ x: 1, y: 2, z: 3 })).toEqual(lamp);
            expect(written).toEqual(['1,2,3']);
        });

        it('tells each loaded neighbor which of its own faces the change was on', () => {
            const { blocks } = harness({ '0,0,0': stone, '0,1,0': lamp, '0,-1,0': lamp, '5,5,5': lamp });
            const seen = watchNeighborHooks();

            blocks.notifyNeighbors({ x: 0, y: 0, z: 0 });

            // The block below hears it on its `up` face and the one above on
            // its `down` face; the four unloaded neighbors and the distant
            // block hear nothing.
            expect(seen.sort()).toEqual(['0,-1,0 up', '0,1,0 down']);
        });

        it('handles long chains of nested neighbor updates without recursion', () => {
            const maxUpdates = 2_000;
            const initial: Record<string, ContentBlock> = { '0,0,0': stone };
            for (let x = 1; x <= maxUpdates; x++) initial[`${x},0,0`] = lamp;
            const { blocks } = harness(initial);
            const seen: string[] = [];

            vi.spyOn(HookTable.prototype, 'has').mockReturnValue(true);
            vi.spyOn(HookTable.prototype, 'dispatch').mockImplementation(function (hook, ...args) {
                if (hook !== 'onNeighborChanged') return;
                const event = args[0] as { block: { position: ContentPosition }; face: string };
                if (event.face !== 'west') return;
                seen.push(key(event.block.position));
                blocks.notifyNeighbors(event.block.position);
            });

            blocks.notifyNeighbors({ x: 0, y: 0, z: 0 });

            expect(seen).toEqual(Array.from({ length: maxUpdates }, (_, index) => `${index + 1},0,0`));
        });

        it('finishes a nested notification before the current notification continues', () => {
            const { blocks } = harness({
                '0,0,0': stone,
                '0,1,0': lamp,
                '1,0,0': lamp,
                '1,1,0': lamp
            });
            const seen: string[] = [];

            vi.spyOn(HookTable.prototype, 'has').mockReturnValue(true);
            vi.spyOn(HookTable.prototype, 'dispatch').mockImplementation(function (hook, ...args) {
                if (hook !== 'onNeighborChanged') return;
                const event = args[0] as { block: { position: ContentPosition }; face: string };
                seen.push(key(event.block.position));
                if (key(event.block.position) === '0,1,0' && event.face === 'down') {
                    blocks.notifyNeighbors(event.block.position);
                }
            });

            blocks.notifyNeighbors({ x: 0, y: 0, z: 0 });

            expect(seen).toEqual(['0,1,0', '0,0,0', '1,1,0', '1,0,0']);
        });

        it('says nothing to a neighbor whose families react to nothing', () => {
            // Every block write in the world now raises this, so the dispatch is skipped
            // for a block that could not react to it. Stone is most of a world.
            const { blocks } = harness({ '0,0,0': lamp, '0,1,0': stone, '0,-1,0': lamp });
            const seen = watchNeighborHooks();

            blocks.notifyNeighbors({ x: 0, y: 0, z: 0 });

            expect(seen).toEqual(['0,-1,0 up']);
        });

        it('says nothing about a position whose own chunk is not loaded', () => {
            const { blocks } = harness({ '0,1,0': stone });
            const seen = watchNeighborHooks();

            blocks.notifyNeighbors({ x: 0, y: 0, z: 0 });

            expect(seen).toEqual([]);
        });

        it('notifies the neighbors only when the write asks for it', () => {
            const { blocks } = harness({ '0,1,0': lamp });
            const seen = watchNeighborHooks();

            blocks.set({ x: 0, y: 0, z: 0 }, stone, false);
            expect(seen).toEqual([]);

            blocks.set({ x: 0, y: 0, z: 0 }, stone, true);
            expect(seen).toEqual(['0,1,0 down']);
        });

        it('keeps a block entity record whole across a write and a read', () => {
            const { blocks } = harness();

            expect(blocks.data({ x: 2, y: 2, z: 2 })).toBeUndefined();
            blocks.setData({ x: 2, y: 2, z: 2 }, { comparatorOutput: 7 });
            expect(blocks.data({ x: 2, y: 2, z: 2 })).toEqual({ comparatorOutput: 7 });
        });

        it('reports no redstone power in a world with no redstone in it', () => {
            const { blocks } = harness({ '0,0,0': stone, '0,1,0': stone, '1,0,0': stone });

            expect(blocks.power({ x: 0, y: 0, z: 0 })).toBe(0);
        });

        it('calls a new block a placement and the same block in a new state a state change', () => {
            const { blocks } = harness({ '0,0,0': stone });
            const seen = watchHooks(['onPlace', 'onBlockStateChange']);

            blocks.set({ x: 0, y: 0, z: 0 }, { identifier: 'minecraft:redstone_lamp', states: { lit: false } }, false);
            expect(seen).toEqual(['onPlace']);

            seen.length = 0;
            blocks.set({ x: 0, y: 0, z: 0 }, { identifier: 'minecraft:redstone_lamp', states: { lit: true } }, false);

            // `onPlace` here would be the hook calling the family that is writing it, which
            // is how every family that rewrites its own state - a door, a crop - recurses.
            expect(seen).toEqual(['onBlockStateChange']);
        });

        it('says nothing about a state value a rewrite left where it was', () => {
            const { blocks } = harness({ '0,0,0': lamp });
            const seen = watchHooks(['onBlockStateChange']);

            blocks.set({ x: 0, y: 0, z: 0 }, lamp, false);

            expect(seen).toEqual([]);
        });
    });
});
