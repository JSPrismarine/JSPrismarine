import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BlockPalette, vanillaBlockPalette } from '@jsprismarine/blocks';
import { vanillaItemDefinitions } from '@jsprismarine/items';
import { Vector3 } from '@jsprismarine/math';
import { Difficulty } from '@jsprismarine/minecraft';
import { constantRandom } from '@jsprismarine/predicates';
import { beforeEach, describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { definitionOf, definitionsOf } from '../content/ContentOptions';
import { overlayPackPath } from '../content/packStack';
import { buildServerContent } from '../content/ServerContent';
import type { ServerContent } from '../content/ServerContent';
import { serverWorldSource } from '../content/world/serverSource';
import BlockUpdateScheduler from './BlockUpdateScheduler';
import Chunk from './chunk/Chunk';
import { Dimensions } from './Dimension';
import { createEngineWorld } from './EngineWorld';
import { contentRandomTickHandlers } from './randomTicks';
import { contentBlockTickHandlers } from './blockTicks';
import { contentRedstoneUpdateHandlers } from './redstoneUpdates';
import { World } from './World';
import { NULL_WORLD_CHANGE_SINK } from './WorldChangeSink';
import { WorldSystems } from './WorldSystems';
import { fakeLevel } from '../testing/level';

/**
 * A field in a loaded chunk, and the proof that a random tick reaches it.
 *
 * The engine drew and discarded every random tick until the handlers arrived, so the thing worth
 * testing is not that a crop's hook grows it - `content/world/serverSource.test.ts` pins that -
 * but that a world tick with nothing else driving it ends with the crop one step taller.
 */

/** The fixture's blocks, which are also the whole of its palette. */
const BLOCKS = [
    'minecraft:air',
    'minecraft:big_dripleaf',
    'minecraft:dirt',
    'minecraft:farmland',
    'minecraft:lit_redstone_lamp',
    'minecraft:observer',
    'minecraft:redstone_block',
    'minecraft:redstone_lamp',
    'minecraft:redstone_torch',
    'minecraft:unlit_redstone_torch',
    'minecraft:wheat'
] as const;

/** Blocks whose Java tick states use different words from Bedrock's palette. */
const MAPPED_STATE_BLOCKS = ['minecraft:bamboo', 'minecraft:pointed_dripstone'] as const;

/** The y the farmland sits at; the crop stands on top of it with the sky above. */
const SOIL_Y = 63;

/** One block definition, read from the overlay the server itself loads. */
const overlayBlock = (identifier: string) => {
    const file = join(overlayPackPath(), 'blocks', `${identifier.slice('minecraft:'.length)}.block.json`);
    return definitionOf('blocks', identifier, JSON.parse(readFileSync(file, 'utf8')));
};

const fixturePalette = (): BlockPalette =>
    new BlockPalette(BLOCKS.map((identifier) => [identifier, vanillaBlockPalette().entry(identifier)!.model]));

/** Writes a block straight into the chunk, which is the ground the behaviors then act on. */
const place = (chunk: Chunk, x: number, y: number, z: number, identifier: string, states = {}): void => {
    const runtimeId = BlockRuntimeIds.tryGetByState(identifier, states);
    if (runtimeId === null) throw new Error(`no ${identifier} in state ${JSON.stringify(states)}`);
    chunk.setBlockRuntimeId(x & 0xf, y, z & 0xf, runtimeId);
};

/** How many of the field's crops have grown past the state they were planted in. */
const grown = (world: World): number => {
    let count = 0;
    for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
            if (Number(world.loadedBlockAt(x, SOIL_Y + 1, z)?.states['growth'] ?? 0) > 0) count++;
        }
    }
    return count;
};

describe('contentRandomTickHandlers', () => {
    let world: World;
    let chunk: Chunk;
    let content: ServerContent;

    beforeEach(() => {
        chunk = new Chunk(0, 0);

        world = Object.assign(Object.create(World.prototype), {
            chunks: new Map([[Chunk.packXZ(0, 0), chunk]]),
            level: fakeLevel({ spawn: new Vector3(8, 64, 8) }),
            dimension: Dimensions.Overworld,
            blockUpdates: new BlockUpdateScheduler(),
            entities: new Map(),
            entityChunkIndices: new Map(),
            players: new Map(),
            server: {
                getConfig: () => ({ getDifficulty: () => Difficulty.NORMAL }),
                getContent: () => content,
                getLogger: () => ({ debug: () => {}, error: () => {}, verbose: () => {}, warn: () => {} })
            }
        });
        world.attachChangeSink(NULL_WORLD_CHANGE_SINK);

        let built: ServerContent | undefined;
        content = buildServerContent({
            load: () => ({
                definitions: definitionsOf({ blocks: new Map(BLOCKS.map((id) => [id, overlayBlock(id)])) }),
                diagnostics: []
            }),
            blockPalette: fixturePalette(),
            itemDefinitions: vanillaItemDefinitions().filter(
                ({ identifier }) => identifier === 'minecraft:wheat_seeds'
            ),
            seed: 1234n,
            world: serverWorldSource({
                worldFor: () => world,
                content: () => built!,
                seed: 1234n,
                difficulty: () => Difficulty.NORMAL,
                // Every chance comes up, so a growth step is a fact about the wiring rather
                // than about the draw.
                random: constantRandom(0)
            })
        });
        built = content;

        Object.assign(world, {
            systems: new WorldSystems({
                view: {
                    dimension: Dimensions.Overworld,
                    blockAt: (x: number, y: number, z: number) => world.loadedBlockAt(x, y, z),
                    loadedChunks: () => [{ x: 0, z: 0 }]
                },
                world: createEngineWorld(world),
                randomTickHandlers: contentRandomTickHandlers({
                    content,
                    world: () => world,
                    report: (identifier, error) => {
                        throw new Error(`${identifier} threw: ${String(error)}`);
                    }
                }),
                blockTickHandlers: contentBlockTickHandlers({
                    content,
                    world: () => world,
                    report: (identifier, error) => {
                        throw new Error(`${identifier} threw: ${String(error)}`);
                    }
                }),
                redstoneUpdateHandlers: contentRedstoneUpdateHandlers({
                    content,
                    world: () => world,
                    report: (identifier, error) => {
                        throw new Error(`${identifier} redstone update threw: ${String(error)}`);
                    }
                })
            })
        });
    });

    it('simulates nothing on an empty server, however much of the world is loaded', () => {
        // Java's `ServerLevel.tickChunks` visits only the chunks a player ticket holds, which is
        // why nobody's crops grow while they are logged off - and why an idle server is free.
        place(chunk, 0, SOIL_Y, 0, 'minecraft:farmland', { moisturized_amount: 7 });

        expect(world.getPlayers()).toEqual([]);
        expect(world.randomTickChunks()).toEqual([]);
    });

    it('draws only for the sections that hold anything', () => {
        place(chunk, 0, SOIL_Y, 0, 'minecraft:farmland', { moisturized_amount: 7 });
        // One player, standing on the chunk, so the ticket half of the rule is satisfied.
        Object.assign(world, {
            players: new Map([[1n, { isOnline: () => true, getPosition: () => new Vector3(8, 0, 8) }]])
        });

        // The Overworld is twenty-four sections tall and this chunk has one block in it.
        expect(world.randomTickChunks()).toEqual([{ x: 0, z: 0, sections: [SOIL_Y >> 4] }]);
    });

    it('names every block the content answers a random tick for, and nothing else', () => {
        const handlers = contentRandomTickHandlers({ content, world: () => world, report: () => {} });

        // The crop grows, the farmland dries out and the dirt spreads grass; air does nothing.
        expect(Object.keys(handlers).sort()).toEqual(['minecraft:dirt', 'minecraft:farmland', 'minecraft:wheat']);
    });

    it('runs a scheduled content hook through the world tick', () => {
        const at = { x: 2, y: SOIL_Y + 1, z: 2 };
        place(chunk, at.x, at.y, at.z, 'minecraft:big_dripleaf', { big_dripleaf_tilt: 'unstable' });
        world.getSystems().ticks.list('block').schedule(at, 'minecraft:big_dripleaf', 1);

        world.getSystems().tick(1);

        expect(world.loadedBlockAt(at.x, at.y, at.z)?.states['big_dripleaf_tilt']).toBe('partial_tilt');
        expect(world.getSystems().ticks.list('block').hasScheduledTick(at, 'minecraft:big_dripleaf')).toBe(true);
    });

    it('runs both halves of an observer pulse through the resolved block family', () => {
        const at = { x: 2, y: SOIL_Y + 1, z: 2 };
        place(chunk, at.x, at.y, at.z, 'minecraft:observer', {
            'minecraft:facing_direction': 'east',
            powered_bit: false
        });
        const handlers = contentBlockTickHandlers({ content, world: () => world, report: () => {} });
        expect(handlers['minecraft:observer']).toBeDefined();
        expect(handlers['minecraft:redstone_torch']).toBeDefined();
        expect(handlers['minecraft:unlit_redstone_torch']).toBeDefined();

        world.setTicks(1);
        world.getSystems().ticks.list('block').schedule(at, 'minecraft:observer', 1);
        world.getSystems().tick(1);

        expect(world.loadedBlockAt(at.x, at.y, at.z)?.states['powered_bit']).toBe(1);
        expect(world.getSystems().ticks.list('block').hasScheduledTick(at, 'minecraft:observer')).toBe(true);

        world.setTicks(3);
        world.getSystems().tick(3);

        expect(world.loadedBlockAt(at.x, at.y, at.z)?.states['powered_bit']).toBe(0);
    });

    it('dispatches changed redstone power through the resolved block family', () => {
        const lamp = { x: 2, y: SOIL_Y + 1, z: 2 };
        const source = { x: 3, y: SOIL_Y + 1, z: 2 };
        place(chunk, lamp.x, lamp.y, lamp.z, 'minecraft:redstone_lamp');
        const blocks = content.world.blockWorld.at(Dimensions.Overworld.name);

        blocks.setBlock(source, 'minecraft:redstone_block');

        expect(world.loadedBlockAt(lamp.x, lamp.y, lamp.z)?.name).toBe('minecraft:lit_redstone_lamp');

        blocks.setBlock(source, 'minecraft:air');

        expect(world.loadedBlockAt(lamp.x, lamp.y, lamp.z)?.name).toBe('minecraft:redstone_lamp');
    });

    it('dispatches random ticks for blocks whose Java state words differ from Bedrock', () => {
        let built: ServerContent | undefined;
        const mappedContent = buildServerContent({
            load: () => ({
                definitions: definitionsOf({
                    blocks: new Map(MAPPED_STATE_BLOCKS.map((identifier) => [identifier, overlayBlock(identifier)]))
                }),
                diagnostics: []
            }),
            blockPalette: new BlockPalette(
                MAPPED_STATE_BLOCKS.map((identifier) => [identifier, vanillaBlockPalette().entry(identifier)!.model])
            ),
            itemDefinitions: [],
            seed: 1234n,
            world: serverWorldSource({
                worldFor: () => world,
                content: () => built!,
                seed: 1234n,
                difficulty: () => Difficulty.NORMAL,
                random: constantRandom(0.99)
            })
        });
        built = mappedContent;

        const reported: string[] = [];
        const handlers = contentRandomTickHandlers({
            content: mappedContent,
            world: () => world,
            report: (identifier) => reported.push(identifier)
        });
        const bambooTick = handlers['minecraft:bamboo'];
        const dripstoneTick = handlers['minecraft:pointed_dripstone'];
        expect(bambooTick).toBeDefined();
        expect(dripstoneTick).toBeDefined();

        bambooTick?.(
            { x: 1, y: SOIL_Y + 1, z: 1 },
            {
                name: 'minecraft:bamboo',
                states: { age_bit: 0, bamboo_leaf_size: 'none', bamboo_stalk_thickness: 'thin' }
            }
        );
        dripstoneTick?.(
            { x: 2, y: SOIL_Y + 1, z: 2 },
            { name: 'minecraft:pointed_dripstone', states: { dripstone_thickness: 'tip_merge', hanging: 1 } }
        );

        expect(reported).toEqual([]);
    });

    it('grows a planted crop over the world tick, with nothing else driving it', () => {
        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                place(chunk, x, SOIL_Y, z, 'minecraft:farmland', { moisturized_amount: 7 });
                place(chunk, x, SOIL_Y + 1, z, 'minecraft:wheat', { growth: 0 });
            }
        }

        // The crop needs light 9 above it, and the light the rule reads is the engine's own.
        world.getSystems().onChunkLoaded(0, 0);
        world.getSystems().lighting.flush();

        expect(grown(world)).toBe(0);

        let ticked = 0;
        for (let tick = 1; tick <= 200; tick++) ticked += world.getSystems().tick(tick).randomTicked;

        expect(ticked).toBeGreaterThan(0);
        expect(grown(world)).toBeGreaterThan(0);
    });

    it('leaves the field alone when no handler is wired, which is content off', () => {
        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                place(chunk, x, SOIL_Y, z, 'minecraft:farmland', { moisturized_amount: 7 });
                place(chunk, x, SOIL_Y + 1, z, 'minecraft:wheat', { growth: 0 });
            }
        }

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
        world.getSystems().onChunkLoaded(0, 0);
        world.getSystems().lighting.flush();

        // The positions are still drawn, so the sequence does not shift when the handlers land.
        let ticked = 0;
        for (let tick = 1; tick <= 200; tick++) ticked += world.getSystems().tick(tick).randomTicked;

        expect(ticked).toBeGreaterThan(0);
        expect(grown(world)).toBe(0);
    });
});
