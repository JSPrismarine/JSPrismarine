import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import BinaryStream from '@jsprismarine/binaryutils';
import { BlockPalette, vanillaBlockPalette } from '@jsprismarine/blocks';
import type { HookBlock } from '@jsprismarine/blocks';
import { Vector3 } from '@jsprismarine/math';
import { Difficulty } from '@jsprismarine/minecraft';
import { ByteOrder, NBTReader, NBTWriter } from '@jsprismarine/nbt';
import { constantRandom } from '@jsprismarine/predicates';
import { vanillaItemDefinitions } from '@jsprismarine/items';
import { beforeEach, describe, expect, it } from 'vitest';

import { BlockEntityRegistry } from '../../blockentity/BlockEntityRegistry';
import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import { dataEntityRecordIn } from '../../entity/data/persistence';
import { EntityRuntimes } from '../../entity/data/live';
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

/**
 * An entity no class covers, which is what a pack's own mob is.
 *
 * Declared here rather than taken from the vanilla stack, because the point of it is that the
 * only thing the server knows about this identifier is that a loaded pack declares it.
 */
const ROBOT = definitionOf('entities', 'fixture:robot', {
    format_version: '1.26.0',
    'minecraft:entity': {
        description: { identifier: 'fixture:robot' },
        components: { 'minecraft:health': { value: 10 } }
    }
});

const FUSE_ENTITY = definitionOf('entities', 'fixture:fuse_entity', {
    format_version: '1.26.0',
    'minecraft:entity': {
        description: { identifier: 'fixture:fuse_entity' },
        components: {
            'minecraft:health': { value: 10 },
            'minecraft:explode': { fuse_lit: true, fuse_length: { range_min: 4, range_max: 4 }, power: 2 }
        }
    }
});

const BLOCK_ENTITY = definitionOf('entities', 'fixture:block_entity', {
    format_version: '1.26.0',
    'minecraft:entity': {
        description: { identifier: 'fixture:block_entity' },
        components: {
            'minecraft:health': { value: 10 },
            'jsprismarine:falling_block': {}
        }
    }
});

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
const liveWorld = (content: () => ServerContent): { world: World; chunk: Chunk; broadcasts: Broadcasts } => {
    const chunk = new Chunk(0, 0);
    const broadcasts: Broadcasts = { sounds: [], particles: [] };

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
            getConfig: () => ({ getDifficulty: () => Difficulty.NORMAL }),
            getLogger: () => ({ debug: () => {}, error: () => {}, verbose: () => {}, warn: () => {} }),
            // An entity reads its hitbox off the built content, and a spawn is what half of
            // these tests are about, so the double answers the same build the world does.
            getContent: content
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

/**
 * Two biome definitions, with the `minecraft:tags` Mojang's own files carry.
 *
 * The plains is what a fresh chunk fills with; the mesa is the one whose Bedrock name differs
 * from its Java one, so a test that gets `minecraft:mesa` back proves the chunk's numeric id went
 * through the mapping inverse rather than through a name the server already had.
 */
const BIOME_TAGS: Readonly<Record<string, readonly string[]>> = {
    'minecraft:plains': ['animal', 'monster', 'overworld', 'plains', 'bee_habitat'],
    'minecraft:mesa': ['mesa', 'monster', 'overworld', 'warm', 'dry']
};

const BIOMES = new Map(
    Object.entries(BIOME_TAGS).map(([identifier, tags]) => [
        identifier,
        definitionOf('biomes', identifier, {
            format_version: '1.26.0',
            'minecraft:biome': {
                description: { identifier },
                components: { 'minecraft:tags': { tags } }
            }
        })
    ])
);

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
    let entityRuntimes: EntityRuntimes;

    beforeEach(() => {
        let built: ServerContent | undefined;
        entityRuntimes = new EntityRuntimes();
        ({ world, chunk, broadcasts } = liveWorld(() => built!));

        content = buildServerContent({
            load: () => ({
                definitions: definitionsOf({
                    blocks: new Map(BLOCKS.map((id) => [id, overlayBlock(id)])),
                    entities: new Map([
                        ['fixture:robot', ROBOT],
                        ['fixture:fuse_entity', FUSE_ENTITY],
                        ['fixture:block_entity', BLOCK_ENTITY]
                    ]),
                    biomes: BIOMES
                }),
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
                entityRuntimes,
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

        // Sparse to the chest's 27 slots, because the record is the chunk's block entity now
        // and a container's slots are addressed by index.
        expect(adapter.getBlockData(at)?.items?.[0]).toEqual({ identifier: 'minecraft:stick', count: 3 });
        expect(adapter.getBlockData(at)?.items).toHaveLength(27);
        expect(adapter.getBlockData(at)?.['pairedWith']).toEqual({ x: 5, y: 64, z: 4 });
    });

    it('keeps a chest full of sticks across a save and a reload', () => {
        const at = { x: 4, y: 64, z: 4 };
        const adapter = content.world.blockWorld.at(DIMENSION);

        content.world.engineWorld.setBlock(at, { name: 'minecraft:chest', states: {} }, false);
        adapter.setBlockData(at, { ...adapter.getBlockData(at), items: [{ identifier: 'minecraft:stick', count: 3 }] });

        // The provider's own codec, both ways, with no database in the middle: the block
        // entities of a chunk are NBT compounds one after another.
        const stream = new BinaryStream();
        const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
        writer.setUseVarint(false);
        for (const blockEntity of chunk.getBlockEntities()) writer.writeCompound(blockEntity.toNBT());

        const reloaded = new Chunk(0, 0);
        const reader = new NBTReader(new BinaryStream(stream.getBuffer()), ByteOrder.LITTLE_ENDIAN);
        reader.setUseVarint(false);
        reloaded.setBlockEntity(BlockEntityRegistry.fromNBT(reader.parse()));
        Object.assign(world, { chunks: new Map([[Chunk.packXZ(0, 0), reloaded]]) });

        expect(adapter.getBlockData(at)?.items?.[0]).toEqual({ identifier: 'minecraft:stick', count: 3 });
        expect(adapter.getBlockData(at)?.capacity).toBe(27);
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

    it('spawns a declared data entity into the live world, carrying its fuse data', () => {
        const id = content.world.blockWorld.at(DIMENSION).spawnEntity({ x: 3, y: 64, z: 3 }, 'fixture:fuse_entity', {
            fuse: 80
        });

        const runtime = entityRuntimes.at(DIMENSION);
        const spawned = runtime?.runtime.byId(id);
        const body = runtime?.bodies.bodyOf(id);
        expect(spawned?.identifier).toBe('fixture:fuse_entity');
        expect(spawned?.spawnData).toEqual({ fuse: 80 });
        expect(spawned?.body.fuseTicks).toBe(80);
        expect(body?.getType()).toBe('fixture:fuse_entity');
        expect(body?.getPosition().getY()).toBe(64);
        expect(world.getEntities()).toContain(body);

        if (runtime !== undefined) runtime.bodies.persist(runtime.runtime);
        const saved =
            body?.persistentNbt === null || body?.persistentNbt === undefined
                ? undefined
                : dataEntityRecordIn(body.persistentNbt);
        expect(saved?.spawnData).toEqual({ fuse: 80 });
    });

    it('spawns a declared data entity with its source block payload', () => {
        const id = content.world.blockWorld
            .at(DIMENSION)
            .spawnEntity({ x: 3, y: 70, z: 3 }, 'fixture:block_entity', { block: 'minecraft:stone' });

        const runtime = entityRuntimes.at(DIMENSION);
        const spawned = runtime?.runtime.byId(id);
        const body = runtime?.bodies.bodyOf(id);
        expect(spawned?.identifier).toBe('fixture:block_entity');
        expect(spawned?.spawnData).toEqual({ block: 'minecraft:stone' });
        expect(body?.getType()).toBe('fixture:block_entity');
        expect(world.getEntities()).toContain(body);
    });

    it('spawns an identifier only a pack declares, with no class behind it', () => {
        const adapter = content.world.blockWorld.at(DIMENSION);
        const id = adapter.spawnEntity({ x: 3, y: 64, z: 5 }, 'fixture:robot');

        expect(adapter.entitiesAt({ x: 3, y: 64, z: 5 })).toContainEqual(
            expect.objectContaining({ id, identifier: 'fixture:robot' })
        );
    });

    it('spawns nothing for an identifier no pack declares', () => {
        const id = content.world.blockWorld.at(DIMENSION).spawnEntity({ x: 3, y: 64, z: 7 }, 'fixture:nowhere');

        expect(id).toBe(0);
        expect(world.getEntities()).toHaveLength(0);
    });

    it('names the biome the live chunk stores, and its tags', () => {
        const adapter = serverWorldSource({
            worldFor: () => world,
            content: () => content,
            seed: 0n,
            difficulty: () => Difficulty.NORMAL
        }).at(DIMENSION);

        const at = { x: 5, y: 64, z: 5 };
        // A fresh column is plains, which is the id 1 a chunk starts filled with.
        expect(adapter.blocks.biome(at)).toBe('minecraft:plains');
        expect(adapter.blocks.biomeTags(at)).toEqual(BIOME_TAGS['minecraft:plains']);

        // Java calls it the badlands and Bedrock calls it the mesa; the chunk holds 37.
        chunk.getBiomes().fillColumn(5, 5, 37);
        expect(adapter.blocks.biome(at)).toBe('minecraft:mesa');
        expect(adapter.blocks.biomeTags(at)).toEqual(BIOME_TAGS['minecraft:mesa']);

        // Outside the one loaded chunk there is no biome, so no tags either.
        expect(adapter.blocks.biome({ x: 64, y: 64, z: 64 })).toBeUndefined();
        expect(adapter.blocks.biomeTags({ x: 64, y: 64, z: 64 })).toEqual([]);
    });

    it('drops game events when no listener is installed', () => {
        const adapter = serverWorldSource({
            worldFor: () => world,
            content: () => content,
            seed: 0n,
            difficulty: () => Difficulty.NORMAL
        }).at(DIMENSION);

        expect(() => adapter.effects.emitGameEvent('step', { x: 0, y: 64, z: 0 })).not.toThrow();
    });

    it('still refuses groups no subsystem has supplied', () => {
        const adapter = serverWorldSource({
            worldFor: () => world,
            content: () => content,
            seed: 0n,
            difficulty: () => Difficulty.NORMAL
        }).at(DIMENSION);

        expect(adapter.spawning).toBeUndefined();
        expect(adapter.ai).toBeUndefined();
        expect(adapter.generation).toBeUndefined();
    });
});
