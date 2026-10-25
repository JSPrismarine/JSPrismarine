import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BlockPalette, vanillaBlockPalette } from '@jsprismarine/blocks';
import type { HookBlock } from '@jsprismarine/blocks';
import { Vector3 } from '@jsprismarine/math';
import { Difficulty } from '@jsprismarine/minecraft';
import { constantRandom } from '@jsprismarine/predicates';
import { vanillaItemDefinitions } from '@jsprismarine/items';
import { beforeEach, describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import BlockUpdateScheduler from '../../world/BlockUpdateScheduler';
import Chunk from '../../world/chunk/Chunk';
import { Dimensions } from '../../world/Dimension';
import { createEngineWorld } from '../../world/EngineWorld';
import { World } from '../../world/World';
import { WorldSystems } from '../../world/WorldSystems';
import { NULL_WORLD_CHANGE_SINK } from '../../world/WorldChangeSink';
import { definitionOf, definitionsOf } from '../ContentOptions';
import { overlayPackPath } from '../packStack';
import { buildServerContent } from '../ServerContent';
import type { ServerContent } from '../ServerContent';
import type { ContentPosition } from './adapter';
import { NotWiredError } from './notWired';
import { serverWorldSource } from './serverSource';

/**
 * The blocks this fixture declares, which are also the whole of its palette.
 *
 * Four behavior families between them: the door, the container, the crop and the farmland
 * the crop stands on.
 */
const BLOCKS = [
    'minecraft:air',
    'minecraft:stone',
    'minecraft:dirt',
    'minecraft:farmland',
    'minecraft:wheat',
    'minecraft:wooden_door',
    'minecraft:chest'
] as const;

const DIMENSION = 'minecraft:overworld';

/** One block definition, read from the overlay the server itself loads. */
const overlayBlock = (identifier: string) => {
    const file = join(overlayPackPath(), 'blocks', `${identifier.slice('minecraft:'.length)}.block.json`);
    return definitionOf('blocks', identifier, JSON.parse(readFileSync(file, 'utf8')));
};

/** A palette of exactly the fixture's blocks, with each one's real Bedrock states. */
const fixturePalette = (): BlockPalette =>
    new BlockPalette(BLOCKS.map((identifier) => [identifier, vanillaBlockPalette().entry(identifier)!.model]));

/** What a live world reports to anything watching it, for a test to read back. */
interface Broadcasts {
    readonly sounds: string[];
    readonly particles: string[];
}

/**
 * A `World` reduced to what the content adapter touches.
 *
 * Built on the real prototype with a real `Chunk` and real `WorldSystems`, so the block
 * writes, the light and the tick lists are the server's own rather than a stand-in. Only the
 * disk, the network and the server around it are replaced.
 */
const liveWorld = (): { world: World; chunk: Chunk; broadcasts: Broadcasts } => {
    const chunk = new Chunk(0, 0);
    const broadcasts: Broadcasts = { sounds: [], particles: [] };

    const world: World = Object.assign(Object.create(World.prototype), {
        chunks: new Map([[Chunk.packXZ(0, 0), chunk]]),
        currentTick: 0,
        spawn: new Vector3(8, 64, 8),
        dimension: Dimensions.Overworld,
        blockUpdates: new BlockUpdateScheduler(),
        entities: new Map(),
        players: new Map(),
        server: {
            getConfig: () => ({ getDifficulty: () => Difficulty.NORMAL }),
            getLogger: () => ({ debug: () => {}, error: () => {}, verbose: () => {}, warn: () => {} })
        }
    });

    world.attachChangeSink({
        ...NULL_WORLD_CHANGE_SINK,
        namedSound: (_position, name) => void broadcasts.sounds.push(name),
        namedParticle: (_position, name) => void broadcasts.particles.push(name)
    });

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

    return { world, chunk, broadcasts };
};

/** Writes a block straight into the chunk, which is the ground the behaviors then act on. */
const place = (chunk: Chunk, at: ContentPosition, identifier: string, states: Record<string, unknown> = {}): void => {
    const runtimeId = BlockRuntimeIds.tryGetByState(identifier, states as Record<string, string | number | boolean>);
    if (runtimeId === null) throw new Error(`no ${identifier} in state ${JSON.stringify(states)}`);
    chunk.setBlockRuntimeId(at.x & 0xf, at.y, at.z & 0xf, runtimeId);
};

/** The block at a position as a hook receives one. */
const hookBlockAt = (world: World, at: ContentPosition): HookBlock => {
    const block = world.loadedBlockAt(at.x, at.y, at.z);
    if (block === undefined) throw new Error(`nothing is loaded at ${at.x},${at.y},${at.z}`);
    return { identifier: block.name, position: at, dimension: DIMENSION, states: block.states };
};

describe('serverWorldSource', () => {
    let world: World;
    let chunk: Chunk;
    let broadcasts: Broadcasts;
    let content: ServerContent;

    beforeEach(() => {
        ({ world, chunk, broadcasts } = liveWorld());

        let built: ServerContent | undefined;
        content = buildServerContent({
            load: () => ({
                definitions: definitionsOf({ blocks: new Map(BLOCKS.map((id) => [id, overlayBlock(id)])) }),
                diagnostics: []
            }),
            blockPalette: fixturePalette(),
            itemDefinitions: vanillaItemDefinitions().filter(
                (definition) => definition.identifier === 'minecraft:stick'
            ),
            seed: 1234n,
            world: serverWorldSource({
                worldFor: () => world,
                content: () => built!,
                seed: 1234n,
                difficulty: () => Difficulty.NORMAL,
                // Every chance comes up, so a growth step is a fact about the rule rather
                // than about the draw.
                random: constantRandom(0)
            })
        });
        built = content;
    });

    /** The hook table of whatever stands at a position, resolved through the built content. */
    const hooksAt = (at: ContentPosition) => {
        const block = hookBlockAt(world, at);
        const type = content.blocks.types.get(block.identifier);
        if (!type) throw new Error(`the content has no ${block.identifier}`);
        return { block, hooks: type.state(block.states).content.hooks };
    };

    it('reads the live chunk and the live clock', () => {
        place(chunk, { x: 1, y: 64, z: 1 }, 'minecraft:stone');
        const adapter = content.world.blockWorld.at(DIMENSION);

        expect(adapter.getBlock({ x: 1, y: 64, z: 1 })?.identifier).toBe('minecraft:stone');
        expect(adapter.getBlock({ x: 1, y: 70, z: 1 })?.identifier).toBe('minecraft:air');
        // Outside the one loaded chunk, so there is nothing to answer with.
        expect(adapter.getBlock({ x: 64, y: 64, z: 64 })).toBeUndefined();
    });

    it('opens a door, and the live world holds both halves open', () => {
        place(chunk, { x: 2, y: 63, z: 2 }, 'minecraft:stone');
        place(chunk, { x: 2, y: 64, z: 2 }, 'minecraft:wooden_door', { upper_block_bit: false, open_bit: false });
        place(chunk, { x: 2, y: 65, z: 2 }, 'minecraft:wooden_door', { upper_block_bit: true, open_bit: false });

        const { block, hooks } = hooksAt({ x: 2, y: 64, z: 2 });
        hooks.dispatch('onPlayerInteract', {
            block,
            player: { identifier: 'minecraft:player', position: { x: 3, y: 64, z: 2 } },
            face: undefined,
            faceLocation: undefined,
            itemStack: undefined
        });

        // 1 rather than true: the behavior writes a boolean and the chunk stores Bedrock's
        // byte, which is the round trip this wiring is for.
        expect(world.loadedBlockAt(2, 64, 2)?.states['open_bit']).toBe(1);
        expect(world.loadedBlockAt(2, 65, 2)?.states['open_bit']).toBe(1);
        expect(broadcasts.sounds).toContain('open.door');

        hooks.dispatch('onPlayerInteract', {
            block: hookBlockAt(world, { x: 2, y: 64, z: 2 }),
            player: { identifier: 'minecraft:player', position: { x: 3, y: 64, z: 2 } },
            face: undefined,
            faceLocation: undefined,
            itemStack: undefined
        });

        expect(world.loadedBlockAt(2, 64, 2)?.states['open_bit']).toBe(0);
        expect(world.loadedBlockAt(2, 65, 2)?.states['open_bit']).toBe(0);
        expect(broadcasts.sounds).toContain('close.door');
    });

    it('places a chest through the adapter and keeps what it is given', () => {
        const at = { x: 4, y: 64, z: 4 };
        const adapter = content.world.blockWorld.at(DIMENSION);
        const blocks = content.world.engineWorld;

        // The write goes through the adapter's own `set`, which commits the block and then
        // raises `onPlace` - the hook that gives a container its block entity.
        blocks.setBlock(at, { name: 'minecraft:chest', states: {} }, false);

        expect(world.loadedBlockAt(4, 64, 4)?.name).toBe('minecraft:chest');
        expect(adapter.getBlockData(at)?.capacity).toBe(27);

        adapter.setBlockData(at, { ...adapter.getBlockData(at), items: [{ identifier: 'minecraft:stick', count: 3 }] });

        // A second chest beside it pairs with the first, which rewrites the first chest's
        // record. Its contents have to survive that.
        blocks.setBlock({ x: 5, y: 64, z: 4 }, { name: 'minecraft:chest', states: {} }, false);

        expect(adapter.getBlockData(at)?.items).toEqual([{ identifier: 'minecraft:stick', count: 3 }]);
        expect(adapter.getBlockData(at)?.['pairedWith']).toEqual({ x: 5, y: 64, z: 4 });
    });

    it('grows wheat on a random tick, reading the live light and writing the live chunk', () => {
        place(chunk, { x: 6, y: 63, z: 6 }, 'minecraft:farmland', { moisturized_amount: 7 });
        place(chunk, { x: 6, y: 64, z: 6 }, 'minecraft:wheat', { growth: 0 });

        // The crop needs light 9 above it, and the light the rule reads is the engine's own.
        world.getSystems().onChunkLoaded(0, 0);
        world.getSystems().lighting.flush();
        expect(content.world.blockWorld.at(DIMENSION).lightLevel({ x: 6, y: 65, z: 6 })).toBeGreaterThanOrEqual(9);

        const { block, hooks } = hooksAt({ x: 6, y: 64, z: 6 });
        hooks.dispatch('onRandomTick', { block, tick: 0 });

        expect(world.loadedBlockAt(6, 64, 6)?.states['growth']).toBe(1);
    });

    it('schedules a tick into the world own tick lists', () => {
        place(chunk, { x: 7, y: 64, z: 7 }, 'minecraft:stone');
        content.world.blockWorld.at(DIMENSION).scheduleTick({ x: 7, y: 64, z: 7 }, 4);

        expect(world.getSystems().ticks.list('block').hasScheduledTick({ x: 7, y: 64, z: 7 }, 'minecraft:stone')).toBe(
            true
        );
    });

    it('reports the dimension the live world is, and its clock', () => {
        Object.assign(world, { currentTick: 25_000 });
        const engine = content.world.engineWorld;

        expect(engine.getDimension()).toBe('overworld');
        expect(engine.getGameTime()).toBe(25_000);
        expect(engine.getMinY()).toBe(-64);
        expect(engine.getMaxY()).toBe(320);
        expect(engine.getDifficulty()).toBe('normal');
    });

    it('still refuses the members no subsystem has supplied', () => {
        const adapter = serverWorldSource({
            worldFor: () => world,
            content: () => content,
            seed: 0n,
            difficulty: () => Difficulty.NORMAL
        }).at(DIMENSION);

        expect(() => adapter.blocks.biomeTags({ x: 0, y: 64, z: 0 })).toThrow(NotWiredError);
        expect(() => adapter.entities.spawn('minecraft:cow', { x: 0, y: 64, z: 0 })).toThrow(NotWiredError);
        expect(adapter.spawning).toBeUndefined();
        expect(adapter.ai).toBeUndefined();
        expect(adapter.generation).toBeUndefined();
    });
});
