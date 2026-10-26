import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BlockPalette, vanillaBlockPalette } from '@jsprismarine/blocks';
import { Vector3 } from '@jsprismarine/math';
import { Difficulty, Gametype } from '@jsprismarine/minecraft';
import { vanillaItemDefinitions } from '@jsprismarine/items';
import { beforeEach, describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import type { Entity } from '../entity/Entity';
import { Item as ItemEntity } from '../entity/other/Item';
import ContainerEntry from '../inventory/ContainerEntry';
import HumanInventory from '../inventory/HumanInventory';
import Player from '../Player';
import { definitionOf, definitionsOf } from '../content/ContentOptions';
import { overlayPackPath } from '../content/packStack';
import { buildServerContent } from '../content/ServerContent';
import type { ContentPosition } from '../content/world/adapter';
import { serverWorldSource } from '../content/world/serverSource';
import type { ServerContent } from '../content/ServerContent';
import { Item } from '../item/Item';
import BlockUpdateScheduler from './BlockUpdateScheduler';
import Chunk from './chunk/Chunk';
import { Dimensions } from './Dimension';
import { createEngineWorld } from './EngineWorld';
import { World } from './World';
import { WorldSystems } from './WorldSystems';
import { NULL_WORLD_CHANGE_SINK } from './WorldChangeSink';

/** The blocks this fixture declares, which are also the whole of its palette. */
const BLOCKS = [
    'minecraft:air',
    'minecraft:stone',
    'minecraft:cobblestone',
    'minecraft:short_grass',
    'minecraft:dirt',
    'minecraft:farmland',
    'minecraft:wheat',
    'minecraft:diamond_ore',
    'minecraft:chest'
] as const;

/** The items the breaks below yield, plus the tools that do the breaking. */
const ITEMS = [
    'minecraft:stone',
    'minecraft:cobblestone',
    'minecraft:dirt',
    'minecraft:wheat',
    'minecraft:wheat_seeds',
    'minecraft:diamond',
    'minecraft:diamond_ore',
    'minecraft:diamond_pickaxe',
    'minecraft:wooden_pickaxe',
    'minecraft:wooden_sword',
    'minecraft:chest',
    'minecraft:stick'
];

const DIMENSION = 'minecraft:overworld';

/**
 * The Java loot tables this fixture rolls, copied from the 26.3 datapack.
 *
 * Mojang's own files rather than tables written for the test, because what is under test is
 * that a break reads the real ones: the silk touch branch, the fortune curve and the crop's
 * two pools are all theirs.
 */
const LOOT_TABLES: Readonly<Record<string, unknown>> = {
    'minecraft:blocks/stone': {
        type: 'minecraft:block',
        pools: [
            {
                entries: [
                    {
                        type: 'minecraft:alternatives',
                        children: [
                            {
                                type: 'minecraft:item',
                                condition: 'minecraft:tool/can_silk_touch',
                                name: 'minecraft:stone'
                            },
                            {
                                type: 'minecraft:item',
                                condition: { type: 'minecraft:survives_explosion' },
                                name: 'minecraft:cobblestone'
                            }
                        ]
                    }
                ],
                rolls: 1
            }
        ],
        random_sequence: 'minecraft:blocks/stone'
    },
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
    'minecraft:blocks/diamond_ore': {
        type: 'minecraft:block',
        pools: [
            {
                entries: [
                    {
                        type: 'minecraft:alternatives',
                        children: [
                            {
                                type: 'minecraft:item',
                                condition: 'minecraft:tool/can_silk_touch',
                                name: 'minecraft:diamond_ore'
                            },
                            {
                                type: 'minecraft:item',
                                modifier: [
                                    {
                                        type: 'minecraft:apply_bonus',
                                        enchantment: 'minecraft:fortune',
                                        formula: 'minecraft:ore_drops'
                                    },
                                    { type: 'minecraft:explosion_decay' }
                                ],
                                name: 'minecraft:diamond'
                            }
                        ]
                    }
                ],
                rolls: 1
            }
        ],
        random_sequence: 'minecraft:blocks/diamond_ore'
    },
    'minecraft:blocks/wheat': {
        type: 'minecraft:block',
        modifier: { type: 'minecraft:explosion_decay' },
        pools: [
            {
                entries: [
                    {
                        type: 'minecraft:alternatives',
                        children: [
                            {
                                type: 'minecraft:item',
                                condition: {
                                    type: 'minecraft:match_block',
                                    blocks: 'minecraft:wheat',
                                    state: { age: '7' }
                                },
                                name: 'minecraft:wheat'
                            },
                            { type: 'minecraft:item', name: 'minecraft:wheat_seeds' }
                        ]
                    }
                ],
                rolls: 1
            }
        ],
        random_sequence: 'minecraft:blocks/wheat'
    }
};

/** Java's own `tool/can_silk_touch`, which the tables above name rather than inline. */
const CAN_SILK_TOUCH = {
    type: 'minecraft:match_tool',
    predicate: {
        predicates: {
            'minecraft:enchantments': [{ enchantments: 'minecraft:silk_touch', levels: { min: 1 } }]
        }
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

/**
 * A `World` reduced to what a break touches.
 *
 * Built on the real prototype with a real `Chunk` and real `WorldSystems`, so the write, the
 * block entity and the drops are the server's own. Only the disk, the network and the server
 * around it are replaced.
 */
/**
 * The experience orb, as the vanilla behavior pack declares it.
 *
 * Declared because the server spawns one itself: an ore's family owes experience that no loot
 * table carries, and a spawn of an identifier no loaded pack declares is refused rather than
 * putting an unexplained body in the world.
 */
const XP_ORB = {
    format_version: '1.21.0',
    'minecraft:entity': {
        description: { identifier: 'minecraft:xp_orb', is_spawnable: false, is_summonable: false },
        components: { 'minecraft:collision_box': { width: 0.25, height: 0.25 } }
    }
};

const liveWorld = (
    content: () => ServerContent | undefined
): { world: World; chunk: Chunk; spawned: Entity[]; entities: Map<bigint, Entity> } => {
    const chunk = new Chunk(0, 0);
    const spawned: Entity[] = [];
    // Where the item actor port finds the breaking player, which is how a tool wears.
    const entities = new Map<bigint, Entity>();

    const world: World = Object.assign(Object.create(World.prototype), {
        chunks: new Map([[Chunk.packXZ(0, 0), chunk]]),
        currentTick: 0,
        spawn: new Vector3(8, 64, 8),
        dimension: Dimensions.Overworld,
        blockUpdates: new BlockUpdateScheduler(),
        entities,
        entityChunkIndices: new Map(),
        players: new Map(),
        getChunkAt: async () => chunk,
        getPlayers: () => [],
        sendWorldEvent: async () => {},
        addEntity: async (entity: Entity) => void spawned.push(entity),
        server: {
            getConfig: () => ({ getDifficulty: () => Difficulty.NORMAL, getProximityBroadcast: () => true }),
            getLogger: () => ({ debug: () => {}, error: () => {}, verbose: () => {}, warn: () => {} }),
            getContent: content,
            getBlockManager: () => ({
                findBlock: (name: string) => ({ getName: () => name, getStateName: () => name, getDrops: () => [] }),
                getBlock: (name: string) => ({ getName: () => name, getStateName: () => name, getDrops: () => [] })
            }),
            // What the content's `entities.drop` resolves a drop through before it makes one.
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

    return { world, chunk, spawned, entities };
};

/** Writes a block straight into the chunk, which is the ground the break then happens on. */
const place = (chunk: Chunk, at: ContentPosition, identifier: string, states: Record<string, unknown> = {}): void => {
    const runtimeId = BlockRuntimeIds.tryGetByState(identifier, states as Record<string, string | number | boolean>);
    if (runtimeId === null) throw new Error(`no ${identifier} in state ${JSON.stringify(states)}`);
    chunk.setBlockRuntimeId(at.x & 0xf, at.y, at.z & 0xf, runtimeId);
};

describe('breakBlockWithContent', () => {
    let world: World;
    let chunk: Chunk;
    let spawned: Entity[];
    let entities: Map<bigint, Entity>;
    let content: ServerContent;

    beforeEach(() => {
        // The content is built around the world and the world reads the content back, so both
        // sides reach for it through the same closure.
        let built: ServerContent | undefined;
        ({ world, chunk, spawned, entities } = liveWorld(() => built));

        content = buildServerContent({
            load: () => ({
                definitions: definitionsOf({
                    blocks: new Map(BLOCKS.map((id) => [id, overlayBlock(id)])),
                    entities: new Map([['minecraft:xp_orb', definitionOf('entities', 'minecraft:xp_orb', XP_ORB)]]),
                    lootTablesJava: new Map(
                        Object.entries(LOOT_TABLES).map(([id, table]) => [
                            id,
                            definitionOf('lootTablesJava', id, table)
                        ])
                    ),
                    predicates: new Map([
                        [
                            'minecraft:tool/can_silk_touch',
                            definitionOf('predicates', 'minecraft:tool/can_silk_touch', CAN_SILK_TOUCH)
                        ]
                    ])
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

    /** The runtime id the player below goes by. */
    const PLAYER_ID = 7n;

    /**
     * A player holding one item, standing beside the block they break.
     *
     * On the real prototype and in the world's entity map, because a tool wears through the
     * item actor port, which finds the player by runtime id and acts only on a `Player`. A real
     * one needs a network session before it exists at all, so only what the break and the port
     * read is filled in.
     */
    const player = (held: Item | null = null, gamemode = Gametype.SURVIVAL): Player => {
        const inventory = new HumanInventory();
        if (held !== null) inventory.setItemInHand(new ContainerEntry({ item: held, count: held.getAmount() }));

        const breaker: Player = Object.assign(Object.create(Player.prototype), {
            gamemode,
            getInventory: () => inventory,
            getPosition: () => new Vector3(3, 64, 3),
            getRuntimeId: () => PLAYER_ID,
            getServer: () => world.getServer(),
            getFallDistance: () => 0,
            getFood: () => 20,
            isOnGround: () => true
        });
        entities.set(PLAYER_ID, breaker);
        return breaker;
    };

    /**
     * What went on the ground, as identifier and count, in drop order.
     *
     * Item entities only: a family spawns what its block owes besides its drops, which for an
     * ore is the experience.
     */
    const drops = (): Array<{ identifier: string; count: number }> =>
        spawned
            .filter((entity): entity is ItemEntity => entity instanceof ItemEntity)
            .map((entity) => ({
                identifier: entity.getItem()!.getItem().getName(),
                count: entity.getItem()!.getCount()
            }));

    it('spills what a chest held and drops the chest itself', async () => {
        const at = { x: 4, y: 64, z: 4 };
        const blocks = content.world.blockWorld.at(DIMENSION);

        // Through the adapter, so `onPlace` gives the chest its block entity.
        content.world.engineWorld.setBlock(at, { name: 'minecraft:chest', states: {} }, false);
        blocks.setBlockData(at, { ...blocks.getBlockData(at), items: [{ identifier: 'minecraft:stick', count: 3 }] });

        expect(await world.breakBlock(new Vector3(4, 64, 4), player())).toBe(true);

        expect(drops()).toEqual([
            { identifier: 'minecraft:chest', count: 1 },
            { identifier: 'minecraft:stick', count: 3 }
        ]);
        expect(world.loadedBlockAt(4, 64, 4)?.name).toBe('minecraft:air');
        // The block entity went with the block rather than being left behind as an orphan.
        expect(chunk.getBlockEntity(4, 64, 4)).toBeNull();
        expect(blocks.getBlockData(at)).toBeUndefined();
    });

    it('spills a chest the chest held without losing the one the table drops', async () => {
        const at = { x: 4, y: 64, z: 6 };
        const blocks = content.world.blockWorld.at(DIMENSION);

        content.world.engineWorld.setBlock(at, { name: 'minecraft:chest', states: {} }, false);
        blocks.setBlockData(at, { ...blocks.getBlockData(at), items: [{ identifier: 'minecraft:chest', count: 1 }] });

        await world.breakBlock(new Vector3(4, 64, 6), player());

        // Two: the one the loot table yields and the one that was inside it.
        expect(drops()).toEqual([
            { identifier: 'minecraft:chest', count: 1 },
            { identifier: 'minecraft:chest', count: 1 }
        ]);
    });

    it('drops cobblestone for a pickaxe and the stone itself for silk touch', async () => {
        place(chunk, { x: 1, y: 64, z: 1 }, 'minecraft:stone');
        place(chunk, { x: 2, y: 64, z: 1 }, 'minecraft:stone');

        const pickaxe = new Item({ name: 'minecraft:diamond_pickaxe', content });
        await world.breakBlock(new Vector3(1, 64, 1), player(pickaxe));

        expect(drops()).toEqual([{ identifier: 'minecraft:cobblestone', count: 1 }]);

        spawned.length = 0;
        const silkTouch = new Item({
            name: 'minecraft:diamond_pickaxe',
            content,
            enchantments: { 'minecraft:silk_touch': 1 }
        });
        await world.breakBlock(new Vector3(2, 64, 1), player(silkTouch));

        expect(drops()).toEqual([{ identifier: 'minecraft:stone', count: 1 }]);
    });

    it('raises what an ore yields for a fortune pickaxe', async () => {
        /** Breaks a row of ore and totals the diamonds, which is how a curve is read back. */
        const mine = async (held: Item, z: number): Promise<number> => {
            spawned.length = 0;
            for (let x = 0; x < 16; x += 1) {
                place(chunk, { x, y: 60, z }, 'minecraft:diamond_ore');
                await world.breakBlock(new Vector3(x, 60, z), player(held));
            }

            return drops().reduce((total, drop) => total + drop.count, 0);
        };

        const plain = await mine(new Item({ name: 'minecraft:diamond_pickaxe', content }), 8);
        const fortune = await mine(
            new Item({ name: 'minecraft:diamond_pickaxe', content, enchantments: { 'minecraft:fortune': 3 } }),
            9
        );

        // One diamond per ore without the enchantment, and Java's `ore_drops` multiplier with
        // it. The stream is seeded from the world seed, so the totals are the same every run.
        expect(plain).toBe(16);
        expect(fortune).toBeGreaterThan(plain);

        // The hook ran for its own sake as well: the experience an ore owes is the family's,
        // and no loot table carries it.
        expect(spawned.some((entity) => entity.getType() === 'minecraft:xp_orb')).toBe(true);
    });

    it('drops the seeds of a crop that is not grown', async () => {
        place(chunk, { x: 6, y: 63, z: 6 }, 'minecraft:farmland', { moisturized_amount: 7 });
        place(chunk, { x: 6, y: 64, z: 6 }, 'minecraft:wheat', { growth: 0 });

        await world.breakBlock(new Vector3(6, 64, 6), player());

        // Once: the crop family drops seeds of its own for a host with no Java tables, and the
        // roll replaces that rather than landing beside it.
        expect(drops()).toEqual([{ identifier: 'minecraft:wheat_seeds', count: 1 }]);
    });

    it('takes a block away in creative and leaves nothing behind', async () => {
        const at = { x: 7, y: 64, z: 7 };
        const blocks = content.world.blockWorld.at(DIMENSION);

        content.world.engineWorld.setBlock(at, { name: 'minecraft:chest', states: {} }, false);
        blocks.setBlockData(at, { ...blocks.getBlockData(at), items: [{ identifier: 'minecraft:stick', count: 3 }] });

        await world.breakBlock(new Vector3(7, 64, 7), player(null, Gametype.CREATIVE));

        expect(drops()).toEqual([]);
        expect(world.loadedBlockAt(7, 64, 7)?.name).toBe('minecraft:air');
    });

    /**
     * What a break costs the tool, against a Bedrock Dedicated Server 1.26.52 recorded side by
     * side with this server through the proxy. Nothing raised `onMineBlock` before, so no tool
     * ever wore.
     */
    describe('tool wear', () => {
        /** Durability spent, which is what both servers write as `Damage`. */
        const damageOf = (item: Item): number => item.getMaxDurability() - item.getDurability();

        it.each([
            ['minecraft:wooden_pickaxe', 'minecraft:cobblestone', 1],
            ['minecraft:wooden_pickaxe', 'minecraft:dirt', 1],
            // Short grass breaks at once, and a block with no hardness costs nothing.
            ['minecraft:wooden_pickaxe', 'minecraft:short_grass', 0],
            // A sword is not made for digging: its `damage_per_block` is two.
            ['minecraft:wooden_sword', 'minecraft:dirt', 2]
        ])('wears a %s on %s by %i, as BDS did', async (tool, block, wear) => {
            place(chunk, { x: 5, y: 64, z: 5 }, block);
            const breaker = player(new Item({ name: tool, content }));

            await world.breakBlock(new Vector3(5, 64, 5), breaker);

            expect(damageOf(breaker.getInventory().getItemInHand())).toBe(wear);
        });

        it('wears a wooden pickaxe to Damage 3 over three cobblestone, as BDS did', async () => {
            const breaker = player(new Item({ name: 'minecraft:wooden_pickaxe', content }));

            for (const x of [1, 2, 3]) {
                place(chunk, { x, y: 64, z: 9 }, 'minecraft:cobblestone');
                await world.breakBlock(new Vector3(x, 64, 9), breaker);
            }

            expect(damageOf(breaker.getInventory().getItemInHand())).toBe(3);
        });

        it('empties the hand when the tool runs out', async () => {
            // The entry's count went to zero and the item's stayed at one, and the item's is
            // what the client is sent, so a broken pickaxe stayed in the hand.
            const worn = new Item({ name: 'minecraft:wooden_pickaxe', content });
            worn.durability = 1;
            const breaker = player(worn);
            place(chunk, { x: 5, y: 64, z: 7 }, 'minecraft:cobblestone');

            await world.breakBlock(new Vector3(5, 64, 7), breaker);

            expect(breaker.getInventory().getItemInHand().getName()).toBe('minecraft:air');
            expect(breaker.getInventory().getItems()).toHaveLength(0);
        });

        it('wears nothing in creative', async () => {
            place(chunk, { x: 5, y: 64, z: 5 }, 'minecraft:cobblestone');
            const breaker = player(new Item({ name: 'minecraft:wooden_pickaxe', content }), Gametype.CREATIVE);

            await world.breakBlock(new Vector3(5, 64, 5), breaker);

            expect(damageOf(breaker.getInventory().getItemInHand())).toBe(0);
        });
    });
});
