import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BlockPalette, vanillaBlockPalette } from '@jsprismarine/blocks';
import { Vector3 } from '@jsprismarine/math';
import { Difficulty, Gametype } from '@jsprismarine/minecraft';
import { constantRandom } from '@jsprismarine/predicates';
import { vanillaItemDefinitions } from '@jsprismarine/items';
import { beforeEach, describe, expect, it } from 'vitest';

import BlockManager from '../block/BlockManager';
import type ContainerEntry from '../inventory/ContainerEntry';
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { definitionOf, definitionsOf } from '../content/ContentOptions';
import { overlayPackPath } from '../content/packStack';
import { buildServerContent } from '../content/ServerContent';
import type { ServerContent } from '../content/ServerContent';
import type { ContentPosition } from '../content/world/adapter';
import { serverWorldSource } from '../content/world/serverSource';
import type { ServerWorldHandle } from '../content/world/serverSource';
import { Item } from './Item';
import { useItemOnBlock } from './interaction';
import BlockUpdateScheduler from '../world/BlockUpdateScheduler';
import Chunk from '../world/chunk/Chunk';
import { Dimensions } from '../world/Dimension';
import { createEngineWorld } from '../world/EngineWorld';
import { World } from '../world/World';
import { WorldSystems } from '../world/WorldSystems';
import { NULL_WORLD_CHANGE_SINK } from '../world/WorldChangeSink';
import type Player from '../Player';

/** One call to the session's container opener, as the harness records it. */
interface OpenedContainer {
    readonly identifier: string;
    readonly at: Vector3;
    readonly contents: ContainerEntry[];
}

/** The blocks the fixture declares, which are also the whole of its palette. */
const BLOCKS = [
    'minecraft:air',
    'minecraft:stone',
    'minecraft:dirt',
    'minecraft:farmland',
    'minecraft:wheat',
    'minecraft:wooden_door',
    'minecraft:chest'
] as const;

/** The items the fixture declares, which is one of each family the tests reach. */
const ITEMS = ['minecraft:bone_meal', 'minecraft:chest', 'minecraft:stick'];

const DIMENSION = 'minecraft:overworld';

/** One block definition, read from the overlay the server itself loads. */
const overlayBlock = (identifier: string) => {
    const file = join(overlayPackPath(), 'blocks', `${identifier.slice('minecraft:'.length)}.block.json`);
    return definitionOf('blocks', identifier, JSON.parse(readFileSync(file, 'utf8')));
};

/** A `World` reduced to what the interaction path touches, on a real chunk and real systems. */
const liveWorld = (blockManager: BlockManager): { world: World; chunk: Chunk; sounds: string[] } => {
    const chunk = new Chunk(0, 0);
    const sounds: string[] = [];

    const world: World = Object.assign(Object.create(World.prototype), {
        chunks: new Map([[Chunk.packXZ(0, 0), chunk]]),
        currentTick: 0,
        spawn: new Vector3(8, 64, 8),
        dimension: Dimensions.Overworld,
        blockUpdates: new BlockUpdateScheduler(),
        entities: new Map(),
        entityChunkIndices: new Map(),
        players: new Map(),
        server: {
            getBlockManager: () => blockManager,
            getConfig: () => ({ getDifficulty: () => Difficulty.NORMAL }),
            getItemManager: () => ({ getItem: () => null }),
            getLogger: () => ({ debug: () => {}, error: () => {}, verbose: () => {}, warn: () => {} })
        }
    });

    world.attachChangeSink({ ...NULL_WORLD_CHANGE_SINK, namedSound: (_at, name) => void sounds.push(name) });
    Object.assign(world, {
        systems: new WorldSystems({
            view: {
                dimension: Dimensions.Overworld,
                blockAt: (x: number, y: number, z: number) => world.loadedBlockAt(x, y, z),
                loadedChunks: () => [{ x: 0, z: 0 }]
            },
            world: createEngineWorld(world)
        })
    });

    return { world, chunk, sounds };
};

/**
 * A player reduced to what {@link useItemOnBlock} reads off one.
 *
 * Built as the members the path calls rather than on the real prototype, because a `Player` is
 * a network session and this is a test about what a click does to the world.
 */
const playerHolding = (world: World, identifier: string, sneaking = false): Player => {
    const item = new Item({ id: 1, name: identifier, meta: 0, count: 1 });
    const inventory = { getItemInHand: () => item };
    const session = {
        opened: [] as { identifier: string; at: Vector3; contents: ContainerEntry[] }[],
        openBlockContainer: async (at: Vector3, blockIdentifier: string, contents: ContainerEntry[] = []) => {
            session.opened.push({ identifier: blockIdentifier, at, contents });
            return undefined;
        },
        send: async () => {}
    };

    return {
        getWorld: () => world,
        getServer: () => world.getServer(),
        getInventory: () => inventory,
        getNetworkSession: () => session,
        getRuntimeId: () => 7n,
        getPosition: () => new Vector3(1.5, 65, 1.5),
        getFallDistance: () => 0,
        getFood: () => 20,
        isOnGround: () => true,
        isSneaking: () => sneaking,
        gamemode: Gametype.SURVIVAL
    } as unknown as Player;
};

/** Writes a block straight into the chunk, which is the ground the click then acts on. */
const place = (chunk: Chunk, at: ContentPosition, identifier: string, states: Record<string, unknown> = {}): void => {
    const runtimeId = BlockRuntimeIds.tryGetByState(identifier, states as Record<string, string | number | boolean>);
    if (runtimeId === null) throw new Error(`no ${identifier} in state ${JSON.stringify(states)}`);
    chunk.setBlockRuntimeId(at.x & 0xf, at.y, at.z & 0xf, runtimeId);
};

describe('useItemOnBlock', () => {
    let world: World;
    let chunk: Chunk;
    let sounds: string[];
    let content: ServerContent;
    let handle: ServerWorldHandle;

    beforeEach(() => {
        const blockManager = new BlockManager({ getLogger: () => ({ verbose: () => {} }) } as never);
        ({ world, chunk, sounds } = liveWorld(blockManager));

        let built: ServerContent | undefined;
        handle = serverWorldSource({
            worldFor: () => world,
            content: () => built!,
            seed: 1234n,
            difficulty: () => Difficulty.NORMAL,
            // Every chance comes up, so a growth step is a fact about the rule.
            random: constantRandom(0)
        });

        content = buildServerContent({
            load: () => ({
                definitions: definitionsOf({ blocks: new Map(BLOCKS.map((id) => [id, overlayBlock(id)])) }),
                diagnostics: []
            }),
            blockPalette: new BlockPalette(
                BLOCKS.map((identifier) => [identifier, vanillaBlockPalette().entry(identifier)!.model])
            ),
            itemDefinitions: vanillaItemDefinitions().filter((definition) => ITEMS.includes(definition.identifier)),
            seed: 1234n,
            world: handle
        });
        built = content;
    });

    /** The click, as the path takes it. */
    const click = (player: Player, at: ContentPosition, face = 1) =>
        useItemOnBlock({
            content,
            actors: handle.actorsAt(DIMENSION),
            player,
            position: at,
            face,
            faceLocation: { x: 0.5, y: 1, z: 0.5 }
        });

    it('runs the block family, so a door opens for a player', () => {
        place(chunk, { x: 2, y: 63, z: 2 }, 'minecraft:stone');
        place(chunk, { x: 2, y: 64, z: 2 }, 'minecraft:wooden_door', { upper_block_bit: false, open_bit: false });
        place(chunk, { x: 2, y: 65, z: 2 }, 'minecraft:wooden_door', { upper_block_bit: true, open_bit: false });

        expect(click(playerHolding(world, 'minecraft:stick'), { x: 2, y: 64, z: 2 })).toBe('handled');

        expect(world.loadedBlockAt(2, 64, 2)?.states['open_bit']).toBe(1);
        expect(world.loadedBlockAt(2, 65, 2)?.states['open_bit']).toBe(1);
        expect(sounds).toContain('open.door');
    });

    it('runs the item family, so bone meal grows the crop it is used on', () => {
        place(chunk, { x: 6, y: 63, z: 6 }, 'minecraft:farmland', { moisturized_amount: 7 });
        place(chunk, { x: 6, y: 64, z: 6 }, 'minecraft:wheat', { growth: 0 });
        world.getSystems().onChunkLoaded(0, 0);
        world.getSystems().lighting.flush();

        expect(click(playerHolding(world, 'minecraft:bone_meal'), { x: 6, y: 64, z: 6 })).toBe('handled');

        expect(world.loadedBlockAt(6, 64, 6)?.states['growth']).toBe(1);
    });

    it('places a chest through the content, so it gets its block entity', () => {
        place(chunk, { x: 4, y: 63, z: 4 }, 'minecraft:stone');

        expect(click(playerHolding(world, 'minecraft:chest'), { x: 4, y: 63, z: 4 })).toBe('handled');

        expect(world.loadedBlockAt(4, 64, 4)?.name).toBe('minecraft:chest');
        expect(content.world.blockWorld.at(DIMENSION).getBlockData({ x: 4, y: 64, z: 4 })?.capacity).toBe(27);
    });

    it('opens a chest, with what the chest is holding', async () => {
        place(chunk, { x: 4, y: 63, z: 4 }, 'minecraft:stone');
        click(playerHolding(world, 'minecraft:chest'), { x: 4, y: 63, z: 4 });
        content.world.blockWorld
            .at(DIMENSION)
            .setBlockData(
                { x: 4, y: 64, z: 4 },
                { capacity: 27, items: [{ identifier: 'minecraft:stick', count: 5 }] }
            );

        const player = playerHolding(world, 'minecraft:stick');
        expect(click(player, { x: 4, y: 64, z: 4 })).toBe('handled');

        // The open is sent rather than awaited, so the click can be answered now.
        await Promise.resolve();

        const session = player.getNetworkSession() as unknown as { opened: OpenedContainer[] };
        expect(session.opened).toHaveLength(1);
        expect(session.opened[0]!.identifier).toBe('minecraft:chest');
        expect(session.opened[0]!.at).toEqual(new Vector3(4, 64, 4));
        expect(session.opened[0]!.contents).toHaveLength(27);
        expect(session.opened[0]!.contents[0]!.toItemStack().getName()).toBe('minecraft:stick');
        expect(session.opened[0]!.contents[0]!.getCount()).toBe(5);
        expect(session.opened[0]!.contents[1]!.toItemStack().getName()).toBe('minecraft:air');
        expect(sounds).toContain('random.chestopen');
    });

    it('opens nothing for a block that has no screen', async () => {
        place(chunk, { x: 8, y: 64, z: 8 }, 'minecraft:stone');

        const player = playerHolding(world, 'minecraft:stick');
        click(player, { x: 8, y: 64, z: 8 });
        await Promise.resolve();

        expect((player.getNetworkSession() as unknown as { opened: OpenedContainer[] }).opened).toHaveLength(0);
    });

    it('leaves the click to the legacy path when nothing in the content wants it', () => {
        place(chunk, { x: 8, y: 64, z: 8 }, 'minecraft:stone');

        expect(click(playerHolding(world, 'minecraft:stick'), { x: 8, y: 64, z: 8 })).toBe('declined');
        expect(world.loadedBlockAt(8, 65, 8)?.name).toBe('minecraft:air');
    });

    it('does not open a door for a sneaking player holding a block', () => {
        place(chunk, { x: 2, y: 63, z: 2 }, 'minecraft:stone');
        place(chunk, { x: 2, y: 64, z: 2 }, 'minecraft:wooden_door', { upper_block_bit: false, open_bit: false });
        place(chunk, { x: 2, y: 65, z: 2 }, 'minecraft:wooden_door', { upper_block_bit: true, open_bit: false });

        // Vanilla's rule, which is what lets a player build against a block that would
        // otherwise take the click. The upper half is where the chest would go and it is
        // occupied, so nothing is placed either.
        expect(click(playerHolding(world, 'minecraft:chest', true), { x: 2, y: 64, z: 2 })).toBe('declined');
        expect(world.loadedBlockAt(2, 64, 2)?.states['open_bit']).toBe(0);
    });
});
