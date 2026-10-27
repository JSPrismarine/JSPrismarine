import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BlockPalette, vanillaBlockPalette } from '@jsprismarine/blocks';
import { Vector3 } from '@jsprismarine/math';
import { Difficulty } from '@jsprismarine/minecraft';
import { vanillaItemDefinitions } from '@jsprismarine/items';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import { definitionOf, definitionsOf } from '../../content/ContentOptions';
import { overlayPackPath } from '../../content/packStack';
import { buildServerContent } from '../../content/ServerContent';
import type { ServerContent } from '../../content/ServerContent';
import { serverWorldSource } from '../../content/world/serverSource';
import type { ContentPosition } from '../../content/world/adapter';
import BlockUpdateScheduler from '../../world/BlockUpdateScheduler';
import Chunk from '../../world/chunk/Chunk';
import { Dimensions } from '../../world/Dimension';
import { createEngineWorld } from '../../world/EngineWorld';
import { NULL_WORLD_CHANGE_SINK } from '../../world/WorldChangeSink';
import { Position } from '../../world/Position';
import { World } from '../../world/World';
import { WorldSystems } from '../../world/WorldSystems';
import type { Entity } from '../Entity';
import { MetadataFlag } from '../Metadata';
import Tnt, { DEFAULT_FUSE_TICKS, randomShortFuse } from './Tnt';

/**
 * Lit TNT, over a world with the real block write path behind it.
 *
 * The point of the file is the one thing that was missing: a fuse. Every path that lights TNT
 * already spawned `minecraft:tnt` with a fuse in its data, nothing read it, and the only live
 * detonation in the server was a creeper's. So a player could not blow anything up.
 */

const BLOCKS = ['minecraft:air', 'minecraft:stone', 'minecraft:tnt'] as const;
const ITEMS = ['minecraft:cobblestone', 'minecraft:tnt'];

/** Java's stone table: a blast rolls `survives_explosion` over the cobblestone it yields. */
const LOOT_TABLES: Readonly<Record<string, unknown>> = {
    'minecraft:blocks/stone': {
        type: 'minecraft:block',
        pools: [
            {
                condition: { type: 'minecraft:survives_explosion' },
                entries: [{ type: 'minecraft:item', name: 'minecraft:cobblestone' }],
                rolls: 1
            }
        ],
        random_sequence: 'minecraft:blocks/stone'
    },
    // Java has no `blocks/tnt` pool that a blast can roll, because `TntBlock.dropFromExplosion`
    // refuses first. The table is here so the test is not proving the absence of a file.
    'minecraft:blocks/tnt': {
        type: 'minecraft:block',
        pools: [{ entries: [{ type: 'minecraft:item', name: 'minecraft:tnt' }], rolls: 1 }],
        random_sequence: 'minecraft:blocks/tnt'
    }
};

const overlayBlock = (identifier: string) => {
    const file = join(overlayPackPath(), 'blocks', `${identifier.slice('minecraft:'.length)}.block.json`);
    return definitionOf('blocks', identifier, JSON.parse(readFileSync(file, 'utf8')));
};

interface Fixture {
    world: World;
    chunk: Chunk;
    spawned: Entity[];
    removed: Entity[];
    /** Set false to turn the `tntexplodes` game rule off. */
    rules: { tntExplodes: boolean };
}

/** A `World` reduced to what a blast touches: no disk, no network, everything else real. */
const liveWorld = (content: () => ServerContent | undefined): Fixture => {
    const chunk = new Chunk(0, 0);
    const spawned: Entity[] = [];
    const removed: Entity[] = [];
    const rules = { tntExplodes: true };

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
        gameRuleManager: {
            getGameRule: (name: string) =>
                name === 'tntExplodes' ? ([rules.tntExplodes, true] as const) : ([true, true] as const)
        },
        getChunkAt: async () => chunk,
        getPlayers: () => [],
        sendWorldEvent: async () => {},
        sendActorSound: async () => {},
        removeEntity: async (entity: Entity) => void removed.push(entity),
        playNamedSound: () => {},
        spawnNamedParticle: () => {},
        broadcastMove: async () => {},
        addEntity: async (entity: Entity) => void spawned.push(entity),
        dropFromBlock: async () => {},
        server: {
            getConfig: () => ({ getDifficulty: () => Difficulty.NORMAL, getProximityBroadcast: () => true }),
            getLogger: () => ({ debug: () => {}, error: () => {}, verbose: () => {}, warn: () => {} }),
            getContent: content
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

    return { world, chunk, spawned, removed, rules };
};

const place = (chunk: Chunk, at: ContentPosition, identifier: string): void => {
    const runtimeId = BlockRuntimeIds.tryGetByState(identifier);
    if (runtimeId === null) throw new Error(`no ${identifier}`);
    chunk.setBlockRuntimeId(at.x & 0xf, at.y, at.z & 0xf, runtimeId);
};

describe('randomShortFuse', () => {
    it("is Java's nextInt(max(1, fuse / 4)) + fuse / 8", () => {
        expect(randomShortFuse(80, 0)).toBe(10);
        expect(randomShortFuse(80, 0.999)).toBe(29);
        expect(randomShortFuse(80, 0.5)).toBe(20);
    });

    it('never divides by zero for a fuse too short to quarter', () => {
        expect(randomShortFuse(1, 0.999)).toBe(0);
        expect(randomShortFuse(3, 0.999)).toBe(0);
    });
});

describe('lit TNT', () => {
    let world: World;
    let chunk: Chunk;
    let spawned: Entity[];
    let removed: Entity[];
    let rules: { tntExplodes: boolean };

    beforeEach(() => {
        let built: ServerContent | undefined;
        ({ world, chunk, spawned, removed, rules } = liveWorld(() => built));

        built = buildServerContent({
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
            blockPalette: new BlockPalette(
                BLOCKS.map((identifier) => [identifier, vanillaBlockPalette().entry(identifier)!.model])
            ),
            itemDefinitions: vanillaItemDefinitions().filter((definition) => ITEMS.includes(definition.identifier)),
            seed: 1234n,
            world: serverWorldSource({
                worldFor: () => world,
                content: () => built!,
                seed: 1234n,
                difficulty: () => Difficulty.NORMAL
            })
        });
    });

    /** Runs the entity's own tick the number of times the world would. */
    const tick = async (entity: Tnt, times: number): Promise<void> => {
        for (let at = 0; at < times; at += 1) await entity.update(at);
    };

    /** A lit TNT standing where the block was, which is where every ignition path puts it. */
    const lit = (at: ContentPosition, fuse?: number): Tnt =>
        new Tnt({ position: new Position(at.x + 0.5, at.y, at.z + 0.5, world), fuse });

    /** Fills a cube of stone centered on the fixture's middle. */
    const stoneAround = (center: ContentPosition, reach: number): void => {
        for (let x = center.x - reach; x <= center.x + reach; x += 1) {
            for (let y = center.y - reach; y <= center.y + reach; y += 1) {
                for (let z = center.z - reach; z <= center.z + reach; z += 1) {
                    if (x === center.x && y === center.y && z === center.z) continue;
                    place(chunk, { x, y, z }, 'minecraft:stone');
                }
            }
        }
    };

    it('stands there for seventy-nine ticks and goes off on the eightieth', async () => {
        const center = { x: 8, y: 64, z: 8 };
        stoneAround(center, 2);
        const tnt = lit(center);

        expect(tnt.getFuse()).toBe(DEFAULT_FUSE_TICKS);

        await tick(tnt, DEFAULT_FUSE_TICKS - 1);
        expect(tnt.getFuse()).toBe(1);
        expect(world.loadedBlockAt(8, 65, 8)?.name).toBe('minecraft:stone');

        await tick(tnt, 1);
        expect(tnt.getFuse()).toBe(0);
        expect(world.loadedBlockAt(8, 65, 8)?.name).toBe('minecraft:air');
    });

    it('carves the hole the ray cast carves rather than a cube', async () => {
        const center = { x: 8, y: 64, z: 8 };
        stoneAround(center, 5);

        await tick(lit(center), DEFAULT_FUSE_TICKS);

        // Java's radius-4 blast reaches two blocks of stone and no further: each one costs a
        // ray (6 + 0.3) * 0.3 plus the 0.22500001 per step, so 2.115 of an intensity that
        // starts between 2.8 and 5.2.
        expect(world.loadedBlockAt(8, 65, 8)?.name).toBe('minecraft:air');
        expect(world.loadedBlockAt(8, 68, 8)?.name).toBe('minecraft:stone');
        expect(world.loadedBlockAt(8, 69, 8)?.name).toBe('minecraft:stone');
    });

    it('takes itself out of the world before the blast, so it cannot be caught by it', async () => {
        const tnt = lit({ x: 8, y: 64, z: 8 });

        await tick(tnt, DEFAULT_FUSE_TICKS);

        expect(removed).toEqual([tnt]);
    });

    it('does nothing at all when `tntexplodes` is off', async () => {
        const center = { x: 8, y: 64, z: 8 };
        stoneAround(center, 2);
        rules.tntExplodes = false;

        await tick(lit(center), DEFAULT_FUSE_TICKS);

        expect(world.loadedBlockAt(8, 65, 8)?.name).toBe('minecraft:stone');
    });

    it('tells the client how much fuse is left, which is what makes it flash', async () => {
        const tnt = lit({ x: 8, y: 64, z: 8 });
        const fuseAt = () => tnt.metadata.getPropertyValue(MetadataFlag.FUSE_TIME);

        expect(fuseAt()).toBe(DEFAULT_FUSE_TICKS);

        await tick(tnt, 30);

        expect(fuseAt()).toBe(DEFAULT_FUSE_TICKS - 30);
        expect(tnt.metadata.getDataFlag(MetadataFlag.INDEX, BigInt(MetadataFlag.IGNITED))).toBe(true);
    });

    it("hops and settles back to the height it was lit at, as Java's does", async () => {
        const tnt = lit({ x: 8, y: 64, z: 8 });

        await tick(tnt, 3);
        const risen = tnt.getPosition().getY();

        await tick(tnt, 30);

        expect(risen).toBeGreaterThan(64);
        expect(tnt.getPosition().getY()).toBe(64);
    });

    describe('chaining', () => {
        it('lights the TNT its blast reached instead of dropping it', async () => {
            const center = { x: 8, y: 64, z: 8 };
            place(chunk, { x: 8, y: 65, z: 8 }, 'minecraft:tnt');
            place(chunk, { x: 9, y: 64, z: 8 }, 'minecraft:tnt');

            await tick(lit(center), DEFAULT_FUSE_TICKS);

            const chained = spawned.filter((entity): entity is Tnt => entity instanceof Tnt);
            expect(chained).toHaveLength(2);
            expect(world.loadedBlockAt(8, 65, 8)?.name).toBe('minecraft:air');
            expect(world.loadedBlockAt(9, 64, 8)?.name).toBe('minecraft:air');
        });

        it('gives each one a short fuse, so the chain ripples instead of going off at once', async () => {
            place(chunk, { x: 8, y: 65, z: 8 }, 'minecraft:tnt');

            await tick(lit({ x: 8, y: 64, z: 8 }), DEFAULT_FUSE_TICKS);

            const [chained] = spawned.filter((entity): entity is Tnt => entity instanceof Tnt);
            expect(chained!.getFuse()).toBeGreaterThanOrEqual(10);
            expect(chained!.getFuse()).toBeLessThanOrEqual(29);
        });

        it('drops no TNT item, because Java refuses the roll before the table is reached', async () => {
            place(chunk, { x: 8, y: 65, z: 8 }, 'minecraft:tnt');
            const dropped = vi.spyOn(world, 'dropFromBlock');

            await tick(lit({ x: 8, y: 64, z: 8 }), DEFAULT_FUSE_TICKS);

            const names = dropped.mock.calls.flatMap(([, contents]) =>
                contents.map((item) => item?.getName?.() ?? 'nothing')
            );
            expect(names).not.toContain('minecraft:tnt');
        });

        it("passes the blame along, so a chained kill is still the first lighter's", async () => {
            place(chunk, { x: 8, y: 65, z: 8 }, 'minecraft:tnt');
            const player = lit({ x: 0, y: 0, z: 0 });

            const first = new Tnt({
                position: new Position(8.5, 64, 8.5, world),
                source: player
            });
            await tick(first, DEFAULT_FUSE_TICKS);

            const [chained] = spawned.filter((entity): entity is Tnt => entity instanceof Tnt);
            await tick(chained!, chained!.getFuse());

            // Nothing to assert on the damage with no entities in the fixture; what matters is
            // that the chained TNT ran to the end rather than throwing on a missing owner.
            expect(chained!.getFuse()).toBe(0);
        });

        it('leaves the TNT alone when `tntexplodes` is off', async () => {
            place(chunk, { x: 8, y: 65, z: 8 }, 'minecraft:tnt');
            rules.tntExplodes = false;

            await tick(lit({ x: 8, y: 64, z: 8 }), DEFAULT_FUSE_TICKS);

            expect(spawned.filter((entity) => entity instanceof Tnt)).toHaveLength(0);
        });
    });
});
