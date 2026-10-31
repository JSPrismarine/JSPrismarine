import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BlockPalette, vanillaBlockPalette } from '@jsprismarine/blocks';
import { bedrockBlockStates, javaBlockStates } from '@jsprismarine/mapping';
import { Vector3 } from '@jsprismarine/math';
import { Difficulty, Gametype } from '@jsprismarine/minecraft';
import { constantRandom } from '@jsprismarine/predicates';
import { vanillaItemDefinitions } from '@jsprismarine/items';
import { beforeEach, describe, expect, it } from 'vitest';

import { advancementsOf } from '../advancement/progress';
import { Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';
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
import { EyeOfEnderSignal } from '../entity/other/EyeOfEnderSignal';
import { Item } from './Item';
import { useItemInAir, useItemOnBlock } from './interaction';
import { createBlockEntity } from '../world/generators/datadriven/javaGeneratedContent';
import BlockUpdateScheduler from '../world/BlockUpdateScheduler';
import Chunk from '../world/chunk/Chunk';
import { Dimensions } from '../world/Dimension';
import { createEngineWorld } from '../world/EngineWorld';
import { World } from '../world/World';
import { WorldSystems } from '../world/WorldSystems';
import { NULL_WORLD_CHANGE_SINK } from '../world/WorldChangeSink';
import { contentRedstoneUpdateHandlers } from '../world/redstoneUpdates';
import Player from '../Player';
import { fakeLevel } from '../testing/level';

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
    'minecraft:oak_planks',
    'minecraft:fire',
    'minecraft:wheat',
    'minecraft:wooden_door',
    'minecraft:chest',
    'minecraft:black_shulker_box',
    'minecraft:end_portal',
    'minecraft:end_portal_frame',
    'minecraft:oak_stairs',
    'minecraft:crafting_table',
    'minecraft:leaf_litter',
    'minecraft:snow_layer',
    'minecraft:piston',
    'minecraft:redstone_wire',
    'minecraft:torch',
    'minecraft:redstone_torch',
    'minecraft:unpowered_repeater',
    'minecraft:unpowered_comparator'
] as const;

/** The items the fixture declares, which is one of each family the tests reach. */
const ITEMS = [
    'minecraft:bone_meal',
    'minecraft:bread',
    'minecraft:chest',
    'minecraft:stick',
    'minecraft:black_shulker_box',
    'minecraft:diamond_pickaxe',
    'minecraft:end_portal_frame',
    'minecraft:ender_eye',
    'minecraft:oak_stairs',
    'minecraft:crafting_table',
    'minecraft:piston',
    'minecraft:redstone',
    'minecraft:torch',
    'minecraft:redstone_torch',
    'minecraft:repeater',
    'minecraft:comparator',
    'minecraft:flint_and_steel',
    'minecraft:ender_eye',
    'minecraft:empty_map',
    'minecraft:snowball'
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
): {
    world: World;
    chunk: Chunk;
    sounds: string[];
    changed: string[];
    redstoneUpdates: { position: ContentPosition; identifier: string; power: number }[];
} => {
    const chunk = new Chunk(0, 0);
    const sounds: string[] = [];
    const changed: string[] = [];
    const redstoneUpdates: { position: ContentPosition; identifier: string; power: number }[] = [];

    const world: World = Object.assign(Object.create(World.prototype), {
        chunks: new Map([[Chunk.packXZ(0, 0), chunk]]),
        level: fakeLevel({ spawn: new Vector3(8, 64, 8) }),
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
            getLogger: () => ({ debug: () => {}, error: () => {}, verbose: () => {}, warn: () => {} }),
            // Rolled by an eye of ender for its shatter; this one always survives.
            getRandom: () => () => 0.5
        }
    });

    world.attachChangeSink({
        ...NULL_WORLD_CHANGE_SINK,
        namedSound: (_at, name) => void sounds.push(name),
        worldChanged: (change) => {
            if (change.kind !== 'block-set') return;
            const { position: at, blockRuntimeId } = change;
            changed.push(`${at.getX()},${at.getY()},${at.getZ()} ${BlockRuntimeIds.getState(blockRuntimeId)?.name}`);
        }
    });
    return { world, chunk, sounds, changed, redstoneUpdates };
};

/** Connects content redstone hooks the way {@link WorldManager} does in the running server. */
const installWorldSystems = (
    world: World,
    content: ServerContent,
    redstoneUpdates: { position: ContentPosition; identifier: string; power: number }[]
): void => {
    const handlers = contentRedstoneUpdateHandlers({
        content,
        world: () => world,
        report: (identifier, error) => {
            throw new Error(`${identifier} redstone update failed: ${String(error)}`);
        }
    });
    Object.assign(world, {
        systems: new WorldSystems({
            view: {
                dimension: Dimensions.Overworld,
                blockAt: (x: number, y: number, z: number) => world.loadedBlockAt(x, y, z),
                loadedChunks: () => [{ x: 0, z: 0 }]
            },
            world: createEngineWorld(world),
            redstoneUpdateHandlers: {
                ...handlers,
                dispatch: (at, block, power) => {
                    redstoneUpdates.push({ position: at, identifier: block.name, power });
                    handlers.dispatch(at, block, power);
                }
            }
        })
    });
};

/**
 * A player reduced to what {@link useItemOnBlock} and {@link useItemInAir} read off one.
 *
 * Built as the members the path calls over the real prototype rather than constructed, because
 * a `Player` is a network session and this is a test about what a click does to the world. The
 * prototype is there so the actor port's `instanceof Player` holds, which is what reads the
 * game mode off it. The inventory is a real one with the stack in hotbar slot 0, because a
 * placement takes from it.
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

    return Object.assign(Object.create(Player.prototype), {
        getWorld: () => world,
        getServer: () => world.getServer(),
        getInventory: () => inventory,
        getNetworkSession: () => session,
        getRuntimeId: () => 7n,
        getPosition: () => new Vector3(1.5, 65, 1.5),
        getFeetY: () => 65 - 1.62,
        getBox: () => ({ width: 0.6, height: 1.8 }),
        getStatusEffects: () => [],
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
    });
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
    let redstoneUpdates: { position: ContentPosition; identifier: string; power: number }[];
    let content: ServerContent;
    let handle: ServerWorldHandle;

    beforeEach(() => {
        let built: ServerContent | undefined;
        ({ world, chunk, sounds, changed, redstoneUpdates } = liveWorld(() => built!));

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
        installWorldSystems(world, content, redstoneUpdates);
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

    it('takes the bone meal a survival use spends out of the hand', () => {
        // `vanilla:bone_meal` answers `onUseOn` with the stack one shorter; the dispatch has
        // to put that answer back in the slot the way `useItemOnEntity` already does, or no
        // use-on-block interaction can ever cost an item.
        place(chunk, { x: 6, y: 63, z: 6 }, 'minecraft:farmland', { moisturized_amount: 7 });
        place(chunk, { x: 6, y: 64, z: 6 }, 'minecraft:wheat', { growth: 0 });
        world.getSystems().onChunkLoaded(0, 0);
        world.getSystems().lighting.flush();

        const meal = new Item({ name: 'minecraft:bone_meal', count: 2, content });
        const player = playerHolding(world, meal);

        expect(click(player, { x: 6, y: 64, z: 6 })).toBe('handled');

        expect(player.getInventory().getEntry(0)?.getCount()).toBe(1);
        expect(player.getInventory().getItemInHand().getAmount()).toBe(1);
    });

    it('ignites the air beside the clicked east face and reports that block change', () => {
        place(chunk, { x: 7, y: 64, z: 7 }, 'minecraft:oak_planks');
        const player = playerHolding(world, 'minecraft:flint_and_steel');

        expect(click(player, { x: 7, y: 64, z: 7 }, 5)).toBe('handled');

        expect(world.loadedBlockAt(8, 64, 7)?.name).toBe('minecraft:fire');
        expect(changed).toContain('8,64,7 minecraft:fire');
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

    describe('useItemInAir', () => {
        /** Where the world says the stronghold is, or nothing, which stands in for the generator. */
        const strongholdAt = (found: { x: number; y: number; z: number } | undefined) =>
            Object.assign(world, { locateStructure: () => found && { structure: 'minecraft:stronghold', ...found } });

        /** A player holding eyes, in the world's entity index, which is where the throw finds the thrower. */
        const eyes = (count: number, gamemode: Gametype = Gametype.SURVIVAL) => {
            const player = playerHolding(
                world,
                new Item({ name: 'minecraft:ender_eye', count, content }),
                false,
                gamemode
            );
            Object.assign(world, { entities: new Map([[player.getRuntimeId(), player]]) });
            return player;
        };

        /** The eyes in flight, once the throw's asynchronous add has settled. */
        const thrown = async () => {
            await new Promise((resolve) => setImmediate(resolve));
            return world.getEntities().filter((entity) => entity instanceof EyeOfEnderSignal);
        };

        it('throws an eye of ender toward the stronghold and spends one', async () => {
            strongholdAt({ x: 400, y: 0, z: -96 });
            const player = eyes(2);

            expect(useItemInAir({ content, actors: handle.actorsAt(DIMENSION), player })).toBe('handled');

            const [eye] = await thrown();
            expect(eye).toBeInstanceOf(EyeOfEnderSignal);
            expect(eye?.getPosition().getY()).toBeCloseTo(65 - 1.62 + 0.9);
            expect(player.getInventory().getItemInHand().getAmount()).toBe(1);
            expect(sessionOf(player).inventoriesSent).toBe(1);
        });

        it('keeps the eye in a creative hand', async () => {
            strongholdAt({ x: 400, y: 0, z: -96 });
            const player = eyes(2, Gametype.CREATIVE);

            expect(useItemInAir({ content, actors: handle.actorsAt(DIMENSION), player })).toBe('handled');

            expect(await thrown()).toHaveLength(1);
            expect(player.getInventory().getItemInHand().getAmount()).toBe(2);
        });

        it('throws nothing and spends nothing when no stronghold is in range, and tells the client', async () => {
            strongholdAt(undefined);
            const player = eyes(2);

            expect(useItemInAir({ content, actors: handle.actorsAt(DIMENSION), player })).toBe('handled');

            expect(await thrown()).toHaveLength(0);
            expect(player.getInventory().getItemInHand().getAmount()).toBe(2);
            // The client took one out of its own hand the moment it clicked.
            expect(sessionOf(player).inventoriesSent).toBe(1);
        });

        it('keeps an empty map, since this server draws no maps, and tells the client', () => {
            // The behavior asks `supports('map')` before it spends the map. The client took one
            // out of its own hand the moment it clicked, so the inventory goes back as it is.
            const player = playerHolding(world, new Item({ name: 'minecraft:empty_map', count: 2, content }));

            expect(useItemInAir({ content, actors: handle.actorsAt(DIMENSION), player })).toBe('handled');

            expect(player.getInventory().getItemInHand().getAmount()).toBe(2);
            expect(sessionOf(player).inventoriesSent).toBe(1);
        });

        it('keeps a snowball while no projectile runtime is attached, and tells the client', () => {
            const player = playerHolding(world, new Item({ name: 'minecraft:snowball', count: 16, content }));

            expect(useItemInAir({ content, actors: handle.actorsAt(DIMENSION), player })).toBe('handled');

            expect(player.getInventory().getItemInHand().getAmount()).toBe(16);
            expect(sessionOf(player).inventoriesSent).toBe(1);
        });

        it('declines for an item no behavior wants in the air', () => {
            const player = playerHolding(world, 'minecraft:stick');

            expect(useItemInAir({ content, actors: handle.actorsAt(DIMENSION), player })).toBe('declined');
            expect(sessionOf(player).inventoriesSent).toBe(0);
        });
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

        it("faces a piston opposite the player's nearest look direction", () => {
            place(chunk, { x: 4, y: 63, z: 4 }, 'minecraft:stone');
            const player = playerHolding(world, 'minecraft:piston', false, Gametype.SURVIVAL, {
                pitch: 0,
                yaw: 90
            });

            click(player, { x: 4, y: 63, z: 4 });

            expect(world.loadedBlockAt(4, 64, 4)?.name).toBe('minecraft:piston');
            expect(world.loadedBlockAt(4, 64, 4)?.states['facing_direction']).toBe(
                bedrockBlockStates('minecraft:piston', { facing_direction: 'east' }).facing_direction
            );
            expect(javaBlockStates('minecraft:piston', world.loadedBlockAt(4, 64, 4)!.states)).toMatchObject({
                facing_direction: 'east'
            });
        });

        it('faces a piston up when the player looks down', () => {
            place(chunk, { x: 4, y: 63, z: 4 }, 'minecraft:stone');
            const player = playerHolding(world, 'minecraft:piston', false, Gametype.SURVIVAL, {
                pitch: 90,
                yaw: 0
            });

            click(player, { x: 4, y: 63, z: 4 });

            const piston = world.loadedBlockAt(4, 64, 4)!;
            expect(javaBlockStates('minecraft:piston', piston.states)).toMatchObject({ facing_direction: 'up' });
        });

        it('places a redstone torch on the clicked wall face without losing it under an overhead block', () => {
            place(chunk, { x: 6, y: 63, z: 6 }, 'minecraft:stone');
            place(chunk, { x: 7, y: 64, z: 6 }, 'minecraft:stone');
            expect(click(playerHolding(world, 'minecraft:redstone_torch'), { x: 6, y: 63, z: 6 }, 5)).toBe('handled');

            const torch = world.loadedBlockAt(7, 63, 6);
            expect(torch?.name).toBe('minecraft:redstone_torch');
            expect(torch?.states['torch_facing_direction']).toBe(
                bedrockBlockStates('minecraft:redstone_torch', { torch_facing_direction: 'east' })
                    .torch_facing_direction
            );
        });

        it('places a regular torch on the clicked wall face under an overhead block', () => {
            place(chunk, { x: 6, y: 63, z: 6 }, 'minecraft:stone');
            place(chunk, { x: 7, y: 64, z: 6 }, 'minecraft:stone');

            expect(click(playerHolding(world, 'minecraft:torch'), { x: 6, y: 63, z: 6 }, 5)).toBe('handled');

            const torch = world.loadedBlockAt(7, 63, 6);
            expect(torch?.name).toBe('minecraft:torch');
            expect(torch?.states['torch_facing_direction']).toBe(
                bedrockBlockStates('minecraft:torch', { torch_facing_direction: 'east' }).torch_facing_direction
            );
        });

        it('places redstone dust as redstone wire', () => {
            place(chunk, { x: 6, y: 63, z: 6 }, 'minecraft:stone');
            const player = playerHolding(world, 'minecraft:redstone');

            expect(click(player, { x: 6, y: 63, z: 6 })).toBe('handled');

            expect(world.loadedBlockAt(6, 64, 6)?.name).toBe('minecraft:redstone_wire');
            expect(player.getInventory().getItemInHand().getName()).toBe('minecraft:air');
        });

        it.each([
            ['minecraft:repeater', 'minecraft:unpowered_repeater'],
            ['minecraft:comparator', 'minecraft:unpowered_comparator']
        ])('places the %s item as %s', (item, block) => {
            place(chunk, { x: 6, y: 63, z: 6 }, 'minecraft:stone');

            expect(click(playerHolding(world, item), { x: 6, y: 63, z: 6 })).toBe('handled');

            expect(world.loadedBlockAt(6, 64, 6)?.name).toBe(block);
        });

        it('powers existing redstone wire when a torch is placed beside it', () => {
            place(chunk, { x: 6, y: 63, z: 6 }, 'minecraft:stone');
            place(chunk, { x: 6, y: 63, z: 7 }, 'minecraft:stone');
            click(playerHolding(world, 'minecraft:redstone'), { x: 6, y: 63, z: 7 });

            expect(click(playerHolding(world, 'minecraft:redstone_torch'), { x: 6, y: 63, z: 6 })).toBe('handled');

            expect(world.loadedBlockAt(6, 64, 6)?.name).toBe('minecraft:redstone_torch');
            expect(world.loadedBlockAt(6, 64, 7)?.states['redstone_signal']).toBe(15);
        });

        it('extends toward the Java-mapped facing when a torch is placed', () => {
            place(chunk, { x: 6, y: 63, z: 6 }, 'minecraft:stone');
            place(chunk, { x: 6, y: 63, z: 7 }, 'minecraft:stone');
            click(playerHolding(world, 'minecraft:piston', false, Gametype.SURVIVAL, { pitch: 0, yaw: 90 }), {
                x: 6,
                y: 63,
                z: 7
            });
            place(chunk, { x: 7, y: 64, z: 7 }, 'minecraft:stone');

            expect(click(playerHolding(world, 'minecraft:redstone_torch'), { x: 6, y: 63, z: 6 })).toBe('handled');

            expect(world.loadedBlockAt(6, 64, 6)?.name).toBe('minecraft:redstone_torch');
            expect(content.world.blockWorld.at(DIMENSION).redstonePower({ x: 6, y: 64, z: 7 })).toBe(15);
            expect(redstoneUpdates).toContainEqual({
                position: { x: 6, y: 64, z: 7 },
                identifier: 'minecraft:piston',
                power: 15
            });
            expect(world.loadedBlockAt(6, 64, 7)?.name).toBe('minecraft:piston');
            expect(world.loadedBlockAt(6, 64, 7)?.states['facing_direction']).toBe(4);
            expect(javaBlockStates('minecraft:piston', { facing_direction: 4 }).facing_direction).toBe('east');
            expect(sounds).toContain('minecraft:piston.out');
            expect(world.loadedBlockAt(7, 64, 7)?.name).toBe('minecraft:piston_arm_collision');
            expect(
                javaBlockStates('minecraft:piston_arm_collision', world.loadedBlockAt(7, 64, 7)!.states)
            ).toMatchObject({
                facing_direction: 'east'
            });
            expect(world.loadedBlockAt(8, 64, 7)?.name).toBe('minecraft:stone');
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

        it('builds an end portal: frames placed facing inward activate when the eyes go in', () => {
            // Vanilla's ring: the player stands inside the 3 by 3 and looks outward at each
            // placement, and the frame faces opposite the look direction, toward the center.
            // Before the portal family set the facing, every frame kept the default `south`
            // and the ring could never complete.
            const center = { x: 7, y: 64, z: 7 };
            const ring: { at: ContentPosition; yaw: number }[] = [];
            for (let k = -1; k <= 1; k += 1) {
                ring.push({ at: { x: center.x + k, y: center.y, z: center.z - 2 }, yaw: 180 }); // looking north
                ring.push({ at: { x: center.x + k, y: center.y, z: center.z + 2 }, yaw: 0 }); // looking south
                ring.push({ at: { x: center.x - 2, y: center.y, z: center.z + k }, yaw: 90 }); // looking west
                ring.push({ at: { x: center.x + 2, y: center.y, z: center.z + k }, yaw: 270 }); // looking east
            }
            for (const frame of ring) place(chunk, { ...frame.at, y: 63 }, 'minecraft:stone');

            const builder = playerHolding(world, 'minecraft:end_portal_frame', false, Gametype.CREATIVE);
            for (const frame of ring) {
                expect(click(builder, { ...frame.at, y: 63 }, 1, { pitch: 0, yaw: frame.yaw })).toBe('handled');
                expect(world.loadedBlockAt(frame.at.x, frame.at.y, frame.at.z)?.name).toBe(
                    'minecraft:end_portal_frame'
                );
            }

            // One facing per side, each toward the center.
            expect(world.loadedBlockAt(7, 64, 5)?.states['minecraft:cardinal_direction']).toBe('south');
            expect(world.loadedBlockAt(7, 64, 9)?.states['minecraft:cardinal_direction']).toBe('north');
            expect(world.loadedBlockAt(5, 64, 7)?.states['minecraft:cardinal_direction']).toBe('east');
            expect(world.loadedBlockAt(9, 64, 7)?.states['minecraft:cardinal_direction']).toBe('west');

            // One held eye of ender per click, which is what lets the frame take it; the
            // portal family refuses a bare hand. Survival, so each fill costs its one eye.
            for (const frame of ring) {
                const filler = playerHolding(world, new Item({ name: 'minecraft:ender_eye', count: 1, content }));
                expect(click(filler, frame.at)).toBe('handled');
                expect(world.loadedBlockAt(frame.at.x, frame.at.y, frame.at.z)?.states['end_portal_eye_bit']).toBe(1);
                expect(filler.getInventory().getItemInHand().getName()).toBe('minecraft:air');
            }

            for (let dx = -1; dx <= 1; dx += 1) {
                for (let dz = -1; dz <= 1; dz += 1) {
                    expect(world.loadedBlockAt(center.x + dx, 64, center.z + dz)?.name).toBe('minecraft:end_portal');
                }
            }
            expect(sounds).toContain('block.end_portal.spawn');
        });

        it('spends one eye of ender on the frame it fills, in survival', () => {
            // Java's `EnderEyeItem.useOn` shrinks the stack by one after writing the eye. The
            // portal family reports that cost with its answer, and the dispatch charges it
            // here, where the inventory lives.
            place(chunk, { x: 3, y: 64, z: 3 }, 'minecraft:end_portal_frame', {
                end_portal_eye_bit: false,
                'minecraft:cardinal_direction': 'south'
            });

            const player = playerHolding(world, new Item({ name: 'minecraft:ender_eye', count: 2, content }));
            expect(click(player, { x: 3, y: 64, z: 3 })).toBe('handled');

            expect(world.loadedBlockAt(3, 64, 3)?.states['end_portal_eye_bit']).toBe(1);
            expect(player.getInventory().getEntry(0)?.getCount()).toBe(1);
            expect(sessionOf(player).inventoriesSent).toBe(1);
        });

        it('fills the frame without costing a creative player the eye', () => {
            place(chunk, { x: 3, y: 64, z: 3 }, 'minecraft:end_portal_frame', {
                end_portal_eye_bit: false,
                'minecraft:cardinal_direction': 'south'
            });

            const eyes = new Item({ name: 'minecraft:ender_eye', count: 2, content });
            const player = playerHolding(world, eyes, false, Gametype.CREATIVE);
            expect(click(player, { x: 3, y: 64, z: 3 })).toBe('handled');

            expect(world.loadedBlockAt(3, 64, 3)?.states['end_portal_eye_bit']).toBe(1);
            expect(player.getInventory().getEntry(0)?.getCount()).toBe(2);
        });

        it('leaves an end portal frame empty for a bare-hand click', () => {
            // Vanilla fills a frame only from a held eye of ender. The hand here holds air,
            // which the content has no item stack for, so the block hook sees a bare hand.
            place(chunk, { x: 3, y: 64, z: 3 }, 'minecraft:end_portal_frame', {
                end_portal_eye_bit: false,
                'minecraft:cardinal_direction': 'south'
            });

            const bare = playerHolding(world, 'minecraft:air');
            expect(click(bare, { x: 3, y: 64, z: 3 })).toBe('declined');
            expect(world.loadedBlockAt(3, 64, 3)?.states['end_portal_eye_bit']).toBe(0);
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
