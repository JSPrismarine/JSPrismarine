import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BlockPalette, vanillaBlockPalette } from '@jsprismarine/blocks';
import { Vector3 } from '@jsprismarine/math';
import { Difficulty, Gametype } from '@jsprismarine/minecraft';
import { constantRandom } from '@jsprismarine/predicates';
import { vanillaItemDefinitions } from '@jsprismarine/items';
import { beforeEach, describe, expect, it } from 'vitest';

import { advancementsOf } from '../advancement/progress';
import { Attributes } from '../entity/Attribute';
import ContainerEntry from '../inventory/ContainerEntry';
import HumanInventory from '../inventory/HumanInventory';
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
import { createBlockEntity } from '../world/generators/datadriven/javaGeneratedContent';
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

/** The part of a session's open-window state the block interaction reads. */
interface OpenWindow {
    readonly identifier: string;
    readonly position: Vector3;
}

/** The blocks the fixture declares, which are also the whole of its palette. */
const BLOCKS = [
    'minecraft:air',
    'minecraft:stone',
    'minecraft:dirt',
    'minecraft:farmland',
    'minecraft:wheat',
    'minecraft:wooden_door',
    'minecraft:chest',
    'minecraft:black_shulker_box',
    'minecraft:oak_stairs',
    'minecraft:crafting_table',
    'minecraft:leaf_litter',
    'minecraft:snow_layer'
] as const;

/** The items the fixture declares, which is one of each family the tests reach. */
const ITEMS = [
    'minecraft:bone_meal',
    'minecraft:bread',
    'minecraft:chest',
    'minecraft:stick',
    'minecraft:black_shulker_box',
    'minecraft:diamond_pickaxe',
    'minecraft:oak_stairs',
    'minecraft:crafting_table'
];

const DIMENSION = 'minecraft:overworld';

/**
 * Four advancements, one per block trigger the click path raises.
 *
 * Trigger only and no conditions: `location_check` resolves the block out of the live world
 * through the level rather than out of the event, and what is under test here is that the call
 * site raises the trigger at all.
 */
const blockUseAdvancements = () =>
    new Map([
        [
            'test:any_use',
            definitionOf('advancements', 'test:any_use', {
                criteria: { used: { trigger: 'minecraft:any_block_use' } },
                requirements: [['used']]
            })
        ],
        [
            'test:default_use',
            definitionOf('advancements', 'test:default_use', {
                criteria: { used: { trigger: 'minecraft:default_block_use' } },
                requirements: [['used']]
            })
        ],
        [
            'test:item_used',
            definitionOf('advancements', 'test:item_used', {
                criteria: { used: { trigger: 'minecraft:item_used_on_block' } },
                requirements: [['used']]
            })
        ],
        [
            'test:placed',
            definitionOf('advancements', 'test:placed', {
                criteria: { placed: { trigger: 'minecraft:placed_block' } },
                requirements: [['placed']]
            })
        ]
    ]);

/**
 * Java's `#minecraft:replaceable`, cut down to what the fixture holds. Java names the snow layer
 * `snow`, which is what the block's own answer has to translate `minecraft:snow_layer` to.
 */
const replaceableTag = () =>
    new Map([
        [
            'block/minecraft:replaceable',
            definitionOf('tags', 'block/minecraft:replaceable', {
                values: ['minecraft:air', 'minecraft:leaf_litter', 'minecraft:snow']
            })
        ]
    ]);

/** One block definition, read from the overlay the server itself loads. */
const overlayBlock = (identifier: string) => {
    const file = join(overlayPackPath(), 'blocks', `${identifier.slice('minecraft:'.length)}.block.json`);
    return definitionOf('blocks', identifier, JSON.parse(readFileSync(file, 'utf8')));
};

/** A `World` reduced to what the interaction path touches, on a real chunk and real systems. */
const liveWorld = (
    content: () => ServerContent
): { world: World; chunk: Chunk; sounds: string[]; changed: string[] } => {
    const chunk = new Chunk(0, 0);
    const sounds: string[] = [];
    const changed: string[] = [];

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
            // The advancement engine, so the triggers `useItemOnBlock` raises have somewhere
            // to land. Read late, because the content is built over this world.
            getContent: () => content(),
            getLogger: () => ({ debug: () => {}, error: () => {}, verbose: () => {}, warn: () => {} })
        }
    });

    world.attachChangeSink({
        ...NULL_WORLD_CHANGE_SINK,
        namedSound: (_at, name) => void sounds.push(name),
        blockChanged: (at, runtimeId) =>
            void changed.push(`${at.getX()},${at.getY()},${at.getZ()} ${BlockRuntimeIds.getState(runtimeId)?.name}`)
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

    return { world, chunk, sounds, changed };
};

/**
 * A player reduced to what {@link useItemOnBlock} reads off one.
 *
 * Built as the members the path calls rather than on the real prototype, because a `Player` is
 * a network session and this is a test about what a click does to the world. The inventory is a
 * real one with the stack in hotbar slot 0, because a placement takes from it.
 */
const playerHolding = (
    world: World,
    holding: string | Item,
    sneaking = false,
    gamemode: Gametype = Gametype.SURVIVAL,
    rotation: { pitch: number; yaw: number } = { pitch: 0, yaw: 0 }
): Player => {
    const item = typeof holding === 'string' ? new Item({ runtimeId: 1, name: holding, meta: 0, count: 1 }) : holding;
    const inventory = new HumanInventory();
    inventory.setItem(0, new ContainerEntry({ item, count: item.count }));
    inventory.setHandSlot(0);
    let openWindow: OpenWindow | undefined;
    const session = {
        opened: [] as { identifier: string; at: Vector3; contents: ContainerEntry[] }[],
        inventoriesSent: 0,
        sendInventory: async () => void session.inventoriesSent++,
        getOpenBlockContainer: () => openWindow,
        openBlockContainer: async (at: Vector3, blockIdentifier: string, contents: ContainerEntry[] = []) => {
            const current = openWindow;
            if (
                current?.identifier === blockIdentifier &&
                current.position.getX() === at.getX() &&
                current.position.getY() === at.getY() &&
                current.position.getZ() === at.getZ()
            ) {
                return current;
            }

            const opened: OpenWindow = { identifier: blockIdentifier, position: at };
            session.opened.push({ identifier: blockIdentifier, at, contents });
            openWindow = opened;
            return openWindow;
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
        pitch: rotation.pitch,
        yaw: rotation.yaw,
        headYaw: rotation.yaw,
        getName: () => 'tester',
        getType: () => 'minecraft:player',
        getEquipment: () => ({}),
        attributes: new Attributes(Attributes.getPlayerDefaults()),
        metadata: { sprinting: false },
        isFlying: () => false,
        getSaturation: () => 5,
        getFallDistance: () => 0,
        getFood: () => 20,
        isOnGround: () => true,
        isSneaking: () => sneaking,
        gamemode
    } as unknown as Player;
};

/** The inventory sends {@link playerHolding}'s session counted, which the double alone carries. */
const sessionOf = (player: Player) => player.getNetworkSession() as unknown as { inventoriesSent: number };

/** Writes a block straight into the chunk, which is the ground the click then acts on. */
const place = (chunk: Chunk, at: ContentPosition, identifier: string, states: Record<string, unknown> = {}): void => {
    const runtimeId = BlockRuntimeIds.tryGetByState(identifier, states as Record<string, string | number | boolean>);
    if (runtimeId === null) throw new Error(`no ${identifier} in state ${JSON.stringify(states)}`);
    chunk.setBlockRuntimeId(at.x & 0xf, at.y, at.z & 0xf, runtimeId);
};

/** The table a generated chest names, and the three bread it rolls. */
const IGLOO_TABLE = 'minecraft:chests/igloo_chest';
const IGLOO_LOOT = {
    type: 'minecraft:chest',
    pools: [
        {
            rolls: 1,
            entries: [
                {
                    type: 'minecraft:item',
                    name: 'minecraft:bread',
                    modifier: [{ type: 'minecraft:set_count', count: 3 }]
                }
            ]
        }
    ]
};

describe('useItemOnBlock', () => {
    let world: World;
    let chunk: Chunk;
    let sounds: string[];
    let changed: string[];
    let content: ServerContent;
    let handle: ServerWorldHandle;

    beforeEach(() => {
        let built: ServerContent | undefined;
        ({ world, chunk, sounds, changed } = liveWorld(() => built!));

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
                definitions: definitionsOf({
                    blocks: new Map(BLOCKS.map((id) => [id, overlayBlock(id)])),
                    advancements: blockUseAdvancements(),
                    tags: replaceableTag(),
                    lootTablesJava: new Map([[IGLOO_TABLE, definitionOf('lootTablesJava', IGLOO_TABLE, IGLOO_LOOT)]])
                }),
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
    const click = (player: Player, at: ContentPosition, face = 1, rotation?: { pitch: number; yaw: number }) =>
        useItemOnBlock({
            content,
            actors: handle.actorsAt(DIMENSION),
            player,
            position: at,
            face,
            faceLocation: { x: 0.5, y: 1, z: 0.5 },
            ...(rotation === undefined ? {} : { rotation })
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

    it('puts a shulker box back down holding what it was carrying', () => {
        place(chunk, { x: 8, y: 63, z: 8 }, 'minecraft:stone');

        const pickaxe = new Item({ name: 'minecraft:diamond_pickaxe', count: 1, content }).withEnchantments({
            'minecraft:fortune': 3
        });
        const box = new Item({ name: 'minecraft:black_shulker_box', count: 1, content }).withContents([pickaxe]);

        expect(click(playerHolding(world, box), { x: 8, y: 63, z: 8 })).toBe('handled');

        const data = content.world.blockWorld.at(DIMENSION).getBlockData({ x: 8, y: 64, z: 8 });
        expect(data?.capacity).toBe(27);
        expect(data?.items?.[0]).toEqual({
            identifier: 'minecraft:diamond_pickaxe',
            count: 1,
            enchantments: { 'minecraft:fortune': 3 }
        });
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

    it('rolls a generated chest on the open that first shows it', async () => {
        // The block entity is the one `javaGeneratedContent` writes for a structure's chest:
        // a loot table, a seed, and nothing in it. Before the open hook, the player saw the
        // 27 empty slots that tag stands for.
        place(chunk, { x: 6, y: 64, z: 6 }, 'minecraft:chest', { 'minecraft:cardinal_direction': 'north' });
        chunk.setBlockEntity(
            createBlockEntity({ request: { id: 'minecraft:chest', lootTable: IGLOO_TABLE }, x: 6, y: 64, z: 6 }, 1234n)!
        );

        const player = playerHolding(world, 'minecraft:stick');
        expect(click(player, { x: 6, y: 64, z: 6 })).toBe('handled');
        await Promise.resolve();

        const session = player.getNetworkSession() as unknown as { opened: OpenedContainer[] };
        const shown = session.opened[0]!.contents.filter((entry) => entry.toItemStack().getName() !== 'minecraft:air');
        // Three bread, over as many slots as Java's own split put them in: a chest with 27
        // free slots and one stack of more than one gets the stack spread rather than piled.
        expect(shown.every((entry) => entry.toItemStack().getName() === 'minecraft:bread')).toBe(true);
        expect(shown.reduce((total, entry) => total + entry.getCount(), 0)).toBe(3);

        // And the chest keeps it: the tag is gone and the items are in the block entity, so
        // the next player to open it is shown the same chest rather than a fresh roll.
        const stored = content.world.blockWorld.at(DIMENSION).getBlockData({ x: 6, y: 64, z: 6 });
        expect(stored?.items?.filter((item) => item !== undefined)).toEqual(
            shown.map((entry) => ({ identifier: 'minecraft:bread', count: entry.getCount() }))
        );
        expect(chunk.getBlockEntity(6, 64, 6)!.toNBT().has('LootTable')).toBe(false);
    });

    /** Whether a player earned one of the fixture's advancements. */
    const earned = (player: Player, id: string): boolean => {
        const advancement = content.advancements.get(id);
        return advancement !== undefined && advancementsOf(player).isDone(advancement);
    };

    it('raises the block-use triggers when the block took the click', () => {
        place(chunk, { x: 2, y: 63, z: 2 }, 'minecraft:stone');
        place(chunk, { x: 2, y: 64, z: 2 }, 'minecraft:wooden_door', { upper_block_bit: false, open_bit: false });
        place(chunk, { x: 2, y: 65, z: 2 }, 'minecraft:wooden_door', { upper_block_bit: true, open_bit: false });

        const player = playerHolding(world, 'minecraft:stick');
        click(player, { x: 2, y: 64, z: 2 });

        expect(earned(player, 'test:any_use')).toBe(true);
        expect(earned(player, 'test:default_use')).toBe(true);
        expect(earned(player, 'test:item_used')).toBe(false);
    });

    it('raises item_used_on_block when the item took the click', () => {
        place(chunk, { x: 6, y: 63, z: 6 }, 'minecraft:farmland', { moisturized_amount: 7 });
        place(chunk, { x: 6, y: 64, z: 6 }, 'minecraft:wheat', { growth: 0 });
        world.getSystems().onChunkLoaded(0, 0);
        world.getSystems().lighting.flush();

        const player = playerHolding(world, 'minecraft:bone_meal');
        click(player, { x: 6, y: 64, z: 6 });

        expect(earned(player, 'test:item_used')).toBe(true);
        expect(earned(player, 'test:any_use')).toBe(true);
        expect(earned(player, 'test:default_use')).toBe(false);
    });

    it('opens nothing for a block that has no screen', async () => {
        place(chunk, { x: 8, y: 64, z: 8 }, 'minecraft:stone');

        const player = playerHolding(world, 'minecraft:stick');
        click(player, { x: 8, y: 64, z: 8 });
        await Promise.resolve();

        expect((player.getNetworkSession() as unknown as { opened: OpenedContainer[] }).opened).toHaveLength(0);
    });

    it('declines a click nothing wants with an item that places no block, and sends nothing', () => {
        place(chunk, { x: 8, y: 64, z: 8 }, 'minecraft:stone');
        const player = playerHolding(world, 'minecraft:stick');

        expect(click(player, { x: 8, y: 64, z: 8 })).toBe('declined');
        expect(world.loadedBlockAt(8, 65, 8)?.name).toBe('minecraft:air');
        expect(changed).toEqual([]);
        expect(sessionOf(player).inventoriesSent).toBe(0);
    });

    it('does not open a door for a sneaking player holding a block', () => {
        place(chunk, { x: 2, y: 63, z: 2 }, 'minecraft:stone');
        place(chunk, { x: 2, y: 64, z: 2 }, 'minecraft:wooden_door', { upper_block_bit: false, open_bit: false });
        place(chunk, { x: 2, y: 65, z: 2 }, 'minecraft:wooden_door', { upper_block_bit: true, open_bit: false });

        // Vanilla's rule, which is what lets a player build against a block that would
        // otherwise take the click. The upper half is where the chest would go and it is
        // occupied, so nothing is placed either, and the client is told so.
        expect(click(playerHolding(world, 'minecraft:chest', true), { x: 2, y: 64, z: 2 })).toBe('handled');
        expect(world.loadedBlockAt(2, 64, 2)?.states['open_bit']).toBe(0);
        expect(world.loadedBlockAt(2, 65, 2)?.name).toBe('minecraft:wooden_door');
    });

    describe('placing', () => {
        /** A survival player holding `count` crafting tables, the stack the client knows as id 1. */
        const holdingTables = (count: number, gamemode: Gametype = Gametype.SURVIVAL) => {
            const tables = new Item({ name: 'minecraft:crafting_table', count, content });
            tables.stackNetworkId = 1;
            return playerHolding(world, tables, false, gamemode);
        };

        it('puts the block against the clicked face of one that cannot be built over', () => {
            place(chunk, { x: 4, y: 63, z: 4 }, 'minecraft:stone');

            expect(click(holdingTables(3), { x: 4, y: 63, z: 4 })).toBe('handled');

            expect(world.loadedBlockAt(4, 63, 4)?.name).toBe('minecraft:stone');
            expect(world.loadedBlockAt(4, 64, 4)?.name).toBe('minecraft:crafting_table');
            expect(sounds).toContain('place');
        });

        it('orients stairs from the interaction rotation and click face', () => {
            place(chunk, { x: 4, y: 63, z: 4 }, 'minecraft:stone');
            const player = playerHolding(world, 'minecraft:oak_stairs', false, Gametype.SURVIVAL, {
                pitch: 0,
                yaw: 0
            });

            click(player, { x: 4, y: 63, z: 4 }, 1, { pitch: 0, yaw: 90 });

            expect(world.loadedBlockAt(4, 64, 4)?.states['weirdo_direction']).toBe(1);
            expect(world.loadedBlockAt(4, 64, 4)?.states['upside_down_bit']).toBe(0);
        });

        it('replaces leaf litter rather than building on top of it', () => {
            // A Bedrock Dedicated Server 1.26.52 put a crafting table clicked onto leaf litter
            // where the litter was, which is also where the client drew it.
            place(chunk, { x: 5, y: 62, z: 5 }, 'minecraft:stone');
            place(chunk, { x: 5, y: 63, z: 5 }, 'minecraft:leaf_litter');

            expect(click(holdingTables(3), { x: 5, y: 63, z: 5 })).toBe('handled');

            expect(world.loadedBlockAt(5, 63, 5)?.name).toBe('minecraft:crafting_table');
            expect(world.loadedBlockAt(5, 64, 5)?.name).toBe('minecraft:air');
        });

        it('replaces a snow layer, which Java names snow', () => {
            place(chunk, { x: 6, y: 62, z: 6 }, 'minecraft:stone');
            place(chunk, { x: 6, y: 63, z: 6 }, 'minecraft:snow_layer');

            click(holdingTables(3), { x: 6, y: 63, z: 6 });

            expect(world.loadedBlockAt(6, 63, 6)?.name).toBe('minecraft:crafting_table');
        });

        it('takes the block from a survival hand, keeping the stack id, and resends the inventory', () => {
            place(chunk, { x: 4, y: 63, z: 4 }, 'minecraft:stone');
            const player = holdingTables(3);

            click(player, { x: 4, y: 63, z: 4 });

            const held = player.getInventory().getEntry(0);
            expect(held?.getCount()).toBe(2);
            expect(held?.getItem().getAmount()).toBe(2);
            expect(held?.getItem().stackNetworkId).toBe(1);
            expect(sessionOf(player).inventoriesSent).toBe(1);
        });

        it('empties the hand with the last block', () => {
            place(chunk, { x: 4, y: 63, z: 4 }, 'minecraft:stone');
            const player = holdingTables(1);

            click(player, { x: 4, y: 63, z: 4 });

            expect(player.getInventory().getItemInHand().getName()).toBe('minecraft:air');
        });

        it('leaves a creative hand as it was, and still resends the inventory', () => {
            place(chunk, { x: 4, y: 63, z: 4 }, 'minecraft:stone');
            const player = holdingTables(3, Gametype.CREATIVE);

            click(player, { x: 4, y: 63, z: 4 });

            expect(player.getInventory().getEntry(0)?.getCount()).toBe(3);
            expect(sessionOf(player).inventoriesSent).toBe(1);
        });

        it('raises placed_block for the block that went down', () => {
            place(chunk, { x: 4, y: 63, z: 4 }, 'minecraft:stone');
            const player = holdingTables(3);

            click(player, { x: 4, y: 63, z: 4 });

            expect(earned(player, 'test:placed')).toBe(true);
        });

        it('refuses a face that is taken, and sends back what is really there', () => {
            // Stone on the face: nothing is overwritten, and the client is told the blocks and
            // the stack it really has, rather than keeping the table it predicted.
            place(chunk, { x: 7, y: 63, z: 7 }, 'minecraft:stone');
            place(chunk, { x: 7, y: 64, z: 7 }, 'minecraft:stone');
            const player = holdingTables(3);

            expect(click(player, { x: 7, y: 63, z: 7 })).toBe('handled');

            expect(world.loadedBlockAt(7, 64, 7)?.name).toBe('minecraft:stone');
            expect(changed).toEqual(['7,63,7 minecraft:stone', '7,64,7 minecraft:stone']);
            expect(player.getInventory().getEntry(0)?.getCount()).toBe(3);
            expect(sessionOf(player).inventoriesSent).toBe(1);
            expect(earned(player, 'test:placed')).toBe(false);
        });

        it('refuses a placement above the top of the world', () => {
            const top = Dimensions.Overworld.minY + Dimensions.Overworld.height - 1;
            place(chunk, { x: 9, y: top, z: 9 }, 'minecraft:stone');
            const player = holdingTables(3);

            expect(click(player, { x: 9, y: top, z: 9 })).toBe('handled');

            expect(changed).toEqual([`9,${top},9 minecraft:stone`]);
            expect(player.getInventory().getEntry(0)?.getCount()).toBe(3);
        });
    });
});
