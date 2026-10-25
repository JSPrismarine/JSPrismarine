import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BlockPalette, vanillaBlockPalette } from '@jsprismarine/blocks';
import { Vector3 } from '@jsprismarine/math';
import { Difficulty } from '@jsprismarine/minecraft';
import { vanillaItemDefinitions } from '@jsprismarine/items';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { definitionOf, definitionsOf } from '../content/ContentOptions';
import { overlayPackPath } from '../content/packStack';
import { buildServerContent } from '../content/ServerContent';
import { serverWorldSource } from '../content/world/serverSource';
import type { ContentPosition } from '../content/world/adapter';
import type { Entity } from '../entity/Entity';
import { explode } from '../entity/Explosion';
import { Item as ItemEntity } from '../entity/other/Item';
import type { ServerContent } from '../content/ServerContent';
import BlockUpdateScheduler from './BlockUpdateScheduler';
import Chunk from './chunk/Chunk';
import { Dimensions } from './Dimension';
import { createEngineWorld } from './EngineWorld';
import { World } from './World';
import { WorldSystems } from './WorldSystems';
import { NULL_WORLD_CHANGE_SINK } from './WorldChangeSink';

/**
 * Every path that destroys a block, over a world with the real content behind it.
 *
 * `blockBreak.test.ts` proves the player's break. This proves the five the world performs
 * on its own: a blast, a stream of water, fire, a piston and a falling block. The fixture is
 * the same shape as that file's, built on the real `World` prototype with a real `Chunk`,
 * real `WorldSystems` and the real overlay's block definitions, so what runs is the server's
 * own write path rather than a model of it.
 */

/** The blocks this fixture declares, which are also the whole of its palette. */
const BLOCKS = [
    'minecraft:air',
    'minecraft:stone',
    'minecraft:dirt',
    'minecraft:chest',
    'minecraft:torch',
    'minecraft:poppy',
    'minecraft:oak_planks',
    'minecraft:fire',
    'minecraft:water',
    'minecraft:flowing_water',
    'minecraft:piston',
    'minecraft:piston_arm_collision',
    'minecraft:lever'
] as const;

/** The items the destructions below yield. */
const ITEMS = [
    'minecraft:stone',
    'minecraft:cobblestone',
    'minecraft:dirt',
    'minecraft:chest',
    'minecraft:torch',
    'minecraft:poppy',
    'minecraft:oak_planks',
    'minecraft:stick'
];

const DIMENSION = 'minecraft:overworld';

/**
 * The Java loot tables this fixture rolls, copied from the 26.3 datapack.
 *
 * `survives_explosion` is the condition that matters here: it is what makes a blast lose
 * part of what it breaks, and it is Mojang's own rather than written for the test.
 */
const LOOT_TABLES: Readonly<Record<string, unknown>> = {
    'minecraft:blocks/chest': {
        type: 'minecraft:block',
        pools: [
            {
                condition: { type: 'minecraft:survives_explosion' },
                entries: [{ type: 'minecraft:item', name: 'minecraft:chest' }],
                rolls: 1
            }
        ],
        random_sequence: 'minecraft:blocks/chest'
    },
    'minecraft:blocks/torch': {
        type: 'minecraft:block',
        pools: [
            {
                condition: { type: 'minecraft:survives_explosion' },
                entries: [{ type: 'minecraft:item', name: 'minecraft:torch' }],
                rolls: 1
            }
        ],
        random_sequence: 'minecraft:blocks/torch'
    },
    'minecraft:blocks/poppy': {
        type: 'minecraft:block',
        pools: [
            {
                condition: { type: 'minecraft:survives_explosion' },
                entries: [{ type: 'minecraft:item', name: 'minecraft:poppy' }],
                rolls: 1
            }
        ],
        random_sequence: 'minecraft:blocks/poppy'
    },
    'minecraft:blocks/oak_planks': {
        type: 'minecraft:block',
        pools: [
            {
                condition: { type: 'minecraft:survives_explosion' },
                entries: [{ type: 'minecraft:item', name: 'minecraft:oak_planks' }],
                rolls: 1
            }
        ],
        random_sequence: 'minecraft:blocks/oak_planks'
    }
};

/** One block definition, read from the overlay the server itself loads. */
const overlayBlock = (identifier: string) => {
    const file = join(overlayPackPath(), 'blocks', `${identifier.slice('minecraft:'.length)}.block.json`);
    return definitionOf('blocks', identifier, JSON.parse(readFileSync(file, 'utf8')));
};

/** A palette of exactly the fixture's blocks, with each one's real Bedrock states. */
const fixturePalette = (): BlockPalette =>
    new BlockPalette(BLOCKS.map((identifier) => [identifier, vanillaBlockPalette().entry(identifier)!.model]));

/** A `World` reduced to what a destruction touches: no disk, no network, everything else real. */
const liveWorld = (content: () => ServerContent | undefined): { world: World; chunk: Chunk; spawned: Entity[] } => {
    const chunk = new Chunk(0, 0);
    const spawned: Entity[] = [];

    const world: World = Object.assign(Object.create(World.prototype), {
        chunks: new Map([[Chunk.packXZ(0, 0), chunk]]),
        currentTick: 0,
        spawn: new Vector3(8, 64, 8),
        dimension: Dimensions.Overworld,
        blockUpdates: new BlockUpdateScheduler(),
        entities: new Map(),
        entityChunkIndices: new Map(),
        players: new Map(),
        entityGrid: { near: () => [] },
        gameRuleManager: { getGameRule: () => [true, true] as const },
        getChunkAt: async () => chunk,
        getPlayers: () => [],
        sendWorldEvent: async () => {},
        sendActorSound: async () => {},
        playNamedSound: () => {},
        spawnNamedParticle: () => {},
        addEntity: async (entity: Entity) => void spawned.push(entity),
        server: {
            getConfig: () => ({ getDifficulty: () => Difficulty.NORMAL, getProximityBroadcast: () => true }),
            getLogger: () => ({ debug: () => {}, error: () => {}, verbose: () => {}, warn: () => {} }),
            getContent: content,
            getBlockManager: () => ({
                findBlock: () => null,
                getBlock: (name: string) => ({ getName: () => name, getStateName: () => name, getDrops: () => [] })
            }),
            getItemManager: () => ({
                getItem: (name: string) => ({ getId: () => 1, getName: () => name, getMeta: () => 0 })
            })
        }
    });

    world.attachChangeSink(NULL_WORLD_CHANGE_SINK);
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

    return { world, chunk, spawned };
};

/** Runs the world's scheduled ticks, which is what carries a fluid and fires a circuit. */
const runTicks = (world: World, count: number): void => {
    for (let tick = 1; tick <= count; tick += 1) {
        Object.assign(world, { currentTick: tick });
        world.getSystems().tick(tick);
    }
};

/** Writes a block straight into the chunk, which is the ground the destruction happens on. */
const place = (chunk: Chunk, at: ContentPosition, identifier: string, states: Record<string, unknown> = {}): void => {
    const runtimeId = BlockRuntimeIds.tryGetByState(identifier, states as Record<string, string | number | boolean>);
    if (runtimeId === null) throw new Error(`no ${identifier} in state ${JSON.stringify(states)}`);
    chunk.setBlockRuntimeId(at.x & 0xf, at.y, at.z & 0xf, runtimeId);
};

describe('a block the world destroyed', () => {
    let world: World;
    let chunk: Chunk;
    let spawned: Entity[];
    let content: ServerContent;

    beforeEach(() => {
        let built: ServerContent | undefined;
        ({ world, chunk, spawned } = liveWorld(() => built));

        content = buildServerContent({
            load: () => ({
                definitions: definitionsOf({
                    blocks: new Map(BLOCKS.map((id) => [id, overlayBlock(id)])),
                    lootTablesJava: new Map(
                        Object.entries(LOOT_TABLES).map(([id, table]) => [
                            id,
                            definitionOf('lootTablesJava', id, table)
                        ])
                    )
                }),
                diagnostics: []
            }),
            blockPalette: fixturePalette(),
            itemDefinitions: vanillaItemDefinitions().filter((definition) => ITEMS.includes(definition.identifier)),
            seed: 1234n,
            world: serverWorldSource({
                worldFor: () => world,
                content: () => built!,
                seed: 1234n,
                difficulty: () => Difficulty.NORMAL
            })
        });
        built = content;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    /** What went on the ground, as identifier and count, in drop order. */
    const drops = (): Array<{ identifier: string; count: number }> =>
        spawned
            .filter((entity): entity is ItemEntity => entity instanceof ItemEntity)
            .map((entity) => ({
                identifier: entity.getItem()!.getItem().getName(),
                count: entity.getItem()!.getCount()
            }));

    /** Puts a chest at a position through the adapter, so `onPlace` gives it its block entity. */
    const chestHolding = (at: ContentPosition, held: ReadonlyArray<{ identifier: string; count: number }>): void => {
        const blocks = content.world.blockWorld.at(DIMENSION);
        content.world.engineWorld.setBlock(at, { name: 'minecraft:chest', states: {} }, false);
        blocks.setBlockData(at, { ...blocks.getBlockData(at), items: [...held] });
    };

    describe('and the blocks around it', () => {
        it('hears about a write the content did not make', () => {
            place(chunk, { x: 8, y: 63, z: 8 }, 'minecraft:stone');
            place(chunk, { x: 8, y: 64, z: 8 }, 'minecraft:torch', { torch_facing_direction: 'top' });

            // A bare world write, the kind a command, a generator or an engine system makes.
            // Until the world raised `onNeighborChanged` itself, only a write through the
            // content adapter reached the torch, so it kept standing on nothing.
            world.setLoadedBlockState(8, 63, 8, { name: 'minecraft:air', states: {} }, true);

            expect(world.loadedBlockAt(8, 64, 8)?.name).toBe('minecraft:air');
            expect(drops()).toEqual([{ identifier: 'minecraft:torch', count: 1 }]);
        });

        it('is left alone by a write that asked for no notification', () => {
            place(chunk, { x: 8, y: 63, z: 8 }, 'minecraft:stone');
            place(chunk, { x: 8, y: 64, z: 8 }, 'minecraft:torch', { torch_facing_direction: 'top' });

            world.setLoadedBlockState(8, 63, 8, { name: 'minecraft:air', states: {} }, false);

            expect(world.loadedBlockAt(8, 64, 8)?.name).toBe('minecraft:torch');
        });
    });

    describe('by a blast', () => {
        it('spills what a chest held and rolls the chest through its own table', async () => {
            const at = { x: 8, y: 64, z: 8 };
            chestHolding(at, [{ identifier: 'minecraft:stick', count: 3 }]);

            await explode(world, new Vector3(8.5, 64.5, 8.5), { power: 4 });

            expect(world.loadedBlockAt(8, 64, 8)?.name).toBe('minecraft:air');
            // The sticks are the block entity's and survive the blast whole. The chest itself
            // goes through `survives_explosion`, which is the roll that may lose it.
            expect(drops()).toContainEqual({ identifier: 'minecraft:stick', count: 3 });
            expect(content.world.blockWorld.at(DIMENSION).getBlockData(at)).toBeUndefined();
        });

        it('yields nothing of a chest it did not reach', async () => {
            chestHolding({ x: 8, y: 64, z: 8 }, [{ identifier: 'minecraft:stick', count: 3 }]);

            await explode(world, new Vector3(8.5, 90.5, 8.5), { power: 1 });

            expect(world.loadedBlockAt(8, 64, 8)?.name).toBe('minecraft:chest');
            expect(drops()).toEqual([]);
        });
    });

    describe('by a stream of water', () => {
        it('drops the torch it washed away', () => {
            // A closed trough running east, with a wall west of the source, so the stream
            // has exactly one way to go and Java's slope search cannot prefer the other.
            for (let x = 6; x <= 12; x += 1) {
                place(chunk, { x, y: 63, z: 8 }, 'minecraft:stone');
                place(chunk, { x, y: 64, z: 7 }, 'minecraft:stone');
                place(chunk, { x, y: 64, z: 9 }, 'minecraft:stone');
            }
            place(chunk, { x: 7, y: 64, z: 8 }, 'minecraft:stone');
            place(chunk, { x: 9, y: 64, z: 8 }, 'minecraft:torch', { torch_facing_direction: 'top' });

            world.setLoadedBlockState(8, 64, 8, { name: 'minecraft:water', states: { liquid_depth: 0 } }, true);
            runTicks(world, 40);

            expect(world.loadedBlockAt(9, 64, 8)?.name).toBe('minecraft:flowing_water');
            expect(drops()).toEqual([{ identifier: 'minecraft:torch', count: 1 }]);
        });
    });

    describe('by fire', () => {
        it('leaves nothing of the plank it burned and tells the torch standing on it', () => {
            // Every draw returns its lowest value, so each roll that can succeed does and
            // the fire burns on its first tick rather than on an average of fifteen.
            vi.spyOn(Math, 'random').mockReturnValue(0);

            place(chunk, { x: 7, y: 63, z: 8 }, 'minecraft:stone');
            place(chunk, { x: 8, y: 63, z: 8 }, 'minecraft:stone');
            place(chunk, { x: 8, y: 64, z: 8 }, 'minecraft:oak_planks');
            place(chunk, { x: 8, y: 65, z: 8 }, 'minecraft:torch', { torch_facing_direction: 'top' });

            world.setLoadedBlockState(7, 64, 8, { name: 'minecraft:fire', states: { age: 0 } }, true);
            // `FireBlock.onPlace` schedules the first fire tick in Java and the engine's
            // `runPlacementUpdates` does not, so the test schedules it rather than waiting
            // for a tick that never comes. That gap is the engine's, not this path's.
            world.getSystems().ticks.list('block').schedule({ x: 7, y: 64, z: 8 }, 'minecraft:fire', 1);
            runTicks(world, 60);

            // Java's `removeBlock(pos, false)`: a burned plank yields nothing of itself.
            expect(world.loadedBlockAt(8, 64, 8)?.name).not.toBe('minecraft:oak_planks');
            expect(drops().some((drop) => drop.identifier === 'minecraft:oak_planks')).toBe(false);
            // The torch heard that what it stood on went, and popped.
            expect(world.loadedBlockAt(8, 65, 8)?.name).not.toBe('minecraft:torch');
            expect(drops()).toContainEqual({ identifier: 'minecraft:torch', count: 1 });
        });
    });

    describe('by a piston', () => {
        it('carries the chest it pushed, and what the chest held, to the new position', () => {
            place(chunk, { x: 8, y: 64, z: 8 }, 'minecraft:piston', { facing_direction: 4 });
            chestHolding({ x: 9, y: 64, z: 8 }, [{ identifier: 'minecraft:stick', count: 3 }]);
            place(chunk, { x: 8, y: 62, z: 8 }, 'minecraft:stone');

            // A lever standing on stone directly under the piston, thrown through the world
            // so the circuit runs and the piston hears about it.
            world.setLoadedBlockState(
                8,
                63,
                8,
                { name: 'minecraft:lever', states: { lever_direction: 'up_east_west', open_bit: true } },
                true
            );
            runTicks(world, 5);

            expect(world.loadedBlockAt(10, 64, 8)?.name).toBe('minecraft:chest');
            // The contents arrived with the block rather than being lost to the write.
            const carried = content.world.blockWorld.at(DIMENSION).getBlockData({ x: 10, y: 64, z: 8 })?.items ?? [];
            expect(carried.filter((slot) => slot !== undefined)).toEqual([{ identifier: 'minecraft:stick', count: 3 }]);
            expect(content.world.blockWorld.at(DIMENSION).getBlockData({ x: 9, y: 64, z: 8 })).toBeUndefined();
            expect(drops()).toEqual([]);
        });
    });
});
