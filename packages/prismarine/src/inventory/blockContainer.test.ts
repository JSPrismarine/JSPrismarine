/**
 * A player filling and emptying a chest, through the real handler and a real world.
 *
 * The screens were already opening before this file: a chest showed its contents and a furnace
 * drew its three slots. Nothing could move a stack through any of them, because
 * `ItemStackRequestHandler` owned the player's own containers and the two slots the enchanting
 * table keeps, and a chest's 27 were neither.
 *
 * So the whole chain is driven here rather than mocked: the content build places the block
 * through its own family, `ItemStackRequestHandler.handle` applies the `ItemStackRequest` a
 * client sends for a drag, and the result is read back out of the chunk's own block entity. The
 * provider is a real LevelDB, because what has to survive a logout is the NBT and not a
 * JavaScript object.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { BlockPalette, BlockStateModel } from '@jsprismarine/blocks';
import type { BlockStateDefinition } from '@jsprismarine/blocks';
import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { ContainerUiId, WindowTypes } from '@jsprismarine/minecraft';
import { InetAddress } from '@jsprismarine/raknet';
import type { RakNetSession } from '@jsprismarine/raknet';
import { vanillaItemDefinitions } from '@jsprismarine/items';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Config } from '../config/Config';
import type Console from '../Console';
import { definitionOf, definitionsOf } from '../content/ContentOptions';
import { buildServerContent } from '../content/ServerContent';
import type { ServerContent } from '../content/ServerContent';
import { serverWorldSource } from '../content/world/serverSource';
import { Item } from '../item/Item';
import { Item as ItemEntity } from '../entity/other/Item';
import type ClientConnection from '../network/ClientConnection';
import { createConnectedPlayer } from '../network/createConnectedPlayer';
import ItemStackRequestHandler from '../network/handler/ItemStackRequestHandler';
import ItemStackRequestPacket from '../network/packet/ItemStackRequestPacket';
import type { ItemStackRequest } from '../network/type/ItemStackRequest';
import { ItemStackRequestActionType } from '../network/type/ItemStackRequest';
import type { PermissionManager } from '../permission/PermissionManager';
import Player from '../Player';
import type Server from '../Server';
import { stub } from '../testing/stub.test.helper';
import UUID from '../utils/UUID';
import type { ChunkScheduler } from '../world/ChunkScheduler';
import Chunk from '../world/chunk/Chunk';
import { Dimensions } from '../world/Dimension';
import type { Generator } from '../world/Generator';
import { Position } from '../world/Position';
import LevelDB from '../world/providers/leveldb/LevelDB';
import { World } from '../world/World';
import ContainerEntry from './ContainerEntry';
import { openContainerContents } from './containerStore';
import { inertEntityRuntime } from '../testing/entityServer';

/** Where the chest stands, and the slot of the player's inventory the diamonds start in. */
const CHEST = { x: 4, y: 64, z: 4 };
const CHEST_PARTNER = { x: 5, y: 64, z: 4 };
const FURNACE = { x: 8, y: 64, z: 8 };
const HELD_SLOT = 0;

/** The three blocks this file places, which the fixture content has to declare. */
const BLOCKS = ['minecraft:chest', 'minecraft:furnace', 'minecraft:black_shulker_box', 'minecraft:stone'] as const;

/** The items it moves between them. */
const ITEMS = [
    'minecraft:diamond',
    'minecraft:coal',
    'minecraft:chest',
    'minecraft:black_shulker_box',
    'minecraft:stone',
    'minecraft:diamond_pickaxe',
    'minecraft:diamond_sword'
] as const;

/**
 * The states each block carries, which have to match the server's own catalog.
 *
 * `blockFromContent` encodes the state a chunk holds against the content's model, and this
 * server writes a chest with the `minecraft:cardinal_direction` its real palette gives one, so a
 * fixture that declared the chest stateless made every read of a placed chest throw.
 */
const STATES_OF: Readonly<Record<string, readonly BlockStateDefinition[]>> = {
    'minecraft:chest': [
        {
            name: 'minecraft:cardinal_direction',
            type: 'string',
            values: ['north', 'south', 'east', 'west'],
            defaultValue: 'north'
        }
    ],
    'minecraft:furnace': [
        {
            name: 'minecraft:cardinal_direction',
            type: 'string',
            values: ['north', 'south', 'east', 'west'],
            defaultValue: 'north'
        }
    ]
};

/** One block file in the shape the `jsprismarine_vanilla` overlay writes. */
const blockFile = (identifier: string): unknown => ({
    format_version: '1.26.20',
    'minecraft:block': {
        description: { identifier },
        components: {
            'minecraft:destructible_by_mining': { seconds_to_destroy: 2.5 },
            'minecraft:destructible_by_explosion': { explosion_resistance: 2.5 },
            'minecraft:light_emission': 0,
            'minecraft:light_dampening': 15,
            'minecraft:friction': 0.6,
            'jsprismarine:block_properties': {
                friction: 0.6,
                random_tick: false,
                requires_correct_tool: false,
                push_reaction: 'push_pull',
                source: 'java'
            }
        }
    }
});

let scratch: string;
let previousDirectory: string | undefined;

/** Empty chunks: every block this file reads is one it wrote. */
const generator = (): Generator => ({
    generateChunk: async (cx: number, cz: number) => new Chunk(cx, cz, new Map(), Dimensions.Overworld)
});

/** A server whose content is built over the live world, which is what the container path needs. */
const buildScene = async (name: string) => {
    const folder = path.join(scratch, 'worlds', name);
    let world: World | undefined;
    let content: ServerContent | undefined;

    const server: Server = stub<Server>({
        on: () => server,
        post: () => 0,
        emit: async () => {},
        getTick: () => 0,
        getRandom: () => () => 0.5,
        getConsole: () => stub<Console>({ getFormattedUsername: () => 'Console' }),
        getLogger: () =>
            stub<Logger>({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, verbose: () => {} }),
        getChunkScheduler: () => stub<ChunkScheduler>({ add: () => {}, remove: () => {} }),
        getPermissionManager: () => stub<PermissionManager>({ getPermissions: async () => [] }),
        getContent: () => {
            if (content === undefined) throw new Error('the content was read before it was built');
            return content;
        },
        getEntityRuntime: () => inertEntityRuntime(),
        getConfig: () =>
            stub<Config>({
                getGamemode: () => 'survival',
                getPreloadRadius: () => 0,
                getProximityBroadcast: () => false,
                getEntityTrackingHysteresis: () => 2,
                getEntityTrackingInterval: () => 4,
                getDifficulty: () => 2
            })
    });

    const provider = new LevelDB(folder, server);
    world = new World({ name, path: folder, server, provider, seed: 1234n, generator: generator() });
    provider.setWorld(world);
    await provider.enable();

    const contentWorld = serverWorldSource({
        worldFor: () => world,
        content: () => {
            if (content === undefined) throw new Error('the content world was read before the content was built');
            return content;
        },
        seed: 1234n,
        difficulty: () => 2
    });

    content = buildServerContent({
        world: contentWorld,
        load: () => ({
            definitions: definitionsOf({
                blocks: new Map(BLOCKS.map((id) => [id, definitionOf('blocks', id, blockFile(id))]))
            }),
            diagnostics: []
        }),
        blockPalette: new BlockPalette(BLOCKS.map((id) => [id, new BlockStateModel(STATES_OF[id] ?? [])])),
        itemDefinitions: vanillaItemDefinitions().filter((definition) =>
            (ITEMS as readonly string[]).includes(definition.identifier)
        )
    });

    // Loaded before anything writes into them: both the block storage and the block entity
    // store drop a write whose chunk is not in memory.
    await world.getChunk(0, 0);

    return { server, world, provider, content, blocks: content.world.blockWorld.at('minecraft:overworld') };
};

/** A player standing beside the chest, wired to a session that sends nowhere. */
const buildPlayer = (world: World, server: Server, name: string): Player => {
    const player = new Player({
        position: new Position(CHEST.x + 0.5, CHEST.y, CHEST.z + 2.5, world),
        address: new InetAddress('127.0.0.1', 19132),
        identity: {
            uuid: UUID.fromRandom(),
            name,
            xuid: '',
            randomId: 0,
            locale: 'en_US',
            skin: null,
            device: null
        }
    });

    const connection = stub<ClientConnection>({
        getRakNetSession: () => stub<RakNetSession>({ getAddress: () => new InetAddress('127.0.0.1', 19132) }),
        sendDataPacket: async () => {},
        attachPlayerSession: () => {},
        closePlayerSession: async () => {},
        disconnect: async () => {}
    });

    createConnectedPlayer({ server, connection, player });
    return player;
};

/** One slot, as an `ItemStackRequest` names one. */
const at = (containerId: number, slotId: number) => ({
    container: { containerId, dynamicId: null },
    slotId,
    stackNetId: 0
});

/** One request moving a stack between two slots, which is what a drag sends. */
const move = (
    from: ReturnType<typeof at>,
    to: ReturnType<typeof at>,
    count: number,
    type = ItemStackRequestActionType.PLACE
): ItemStackRequest => ({
    requestId: -1,
    actions: [{ type, count, source: from, destination: to }],
    filterStrings: [],
    filterStringCause: 0
});

/** Runs requests through the real handler and answers with the result of the first one. */
const apply = async (server: Server, player: Player, requests: ItemStackRequest[]) => {
    await new ItemStackRequestHandler().handle(
        Object.assign(new ItemStackRequestPacket(), { requests }),
        server,
        player.getNetworkSession()
    );
};

/** What the chunk's own block entity says is in a container, by slot. */
const storedItems = (blocks: ReturnType<ServerContent['world']['blockWorld']['at']>, position: typeof CHEST) =>
    blocks.getBlockData(position)?.items ?? [];

describe('a block container a player can put things in', () => {
    beforeAll(() => {
        previousDirectory = process.env.JSP_DIR;
        scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-container-'));
        process.env.JSP_DIR = scratch;
    });

    afterAll(() => {
        if (previousDirectory === undefined) delete process.env.JSP_DIR;
        else process.env.JSP_DIR = previousDirectory;

        fs.rmSync(scratch, { recursive: true, force: true });
    });

    it('takes a stack into a chest, gives it back, and keeps it across a reopen', async () => {
        const scene = await buildScene('round-trip');
        const { server, world, provider, blocks } = scene;
        const player = buildPlayer(world, server, 'Filler');

        blocks.setBlock(CHEST, 'minecraft:chest');
        expect(blocks.getBlockData(CHEST)?.capacity).toBe(27);

        player
            .getInventory()
            .setItem(HELD_SLOT, new ContainerEntry({ item: new Item({ name: 'minecraft:diamond', count: 12 }) }));

        const opened = await player
            .getNetworkSession()
            .openBlockContainer(
                new Vector3(CHEST.x, CHEST.y, CHEST.z),
                'minecraft:chest',
                openContainerContents(player, CHEST, 'minecraft:chest')
            );
        expect(opened?.screen).toBe(WindowTypes.CONTAINER);

        await apply(server, player, [
            move(
                at(ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY, HELD_SLOT),
                at(ContainerUiId.LEVEL_ENTITY_CONTAINER, 5),
                12
            )
        ]);

        expect(storedItems(blocks, CHEST)[5]).toEqual({ identifier: 'minecraft:diamond', count: 12 });
        expect(player.getInventory().getItem(HELD_SLOT).getName()).toBe('minecraft:air');

        // Out again, into a different inventory slot, which is the other half of the gesture.
        await apply(server, player, [
            move(at(ContainerUiId.LEVEL_ENTITY_CONTAINER, 5), at(ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY, 9), 12)
        ]);

        expect(storedItems(blocks, CHEST)[5]).toBeUndefined();
        expect(player.getInventory().getItem(9).getName()).toBe('minecraft:diamond');
        expect(player.getInventory().getItem(9).getAmount()).toBe(12);

        // Back in, then through a save and a fresh world over the same database: what a chest
        // holds has to be in the chunk's NBT and not in anything this process is keeping.
        await apply(server, player, [
            move(at(ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY, 9), at(ContainerUiId.LEVEL_ENTITY_CONTAINER, 5), 12)
        ]);
        await world.save();
        await provider.disable();

        const reopened = await buildScene('round-trip');
        expect(storedItems(reopened.blocks, CHEST)[5]).toEqual({ identifier: 'minecraft:diamond', count: 12 });
        await reopened.provider.disable();
    }, 120_000);

    it('refuses a stack dropped onto a furnace output and takes one out of it', async () => {
        const scene = await buildScene('furnace');
        const { server, world, provider, blocks } = scene;
        const player = buildPlayer(world, server, 'Smelter');

        blocks.setBlock(FURNACE, 'minecraft:furnace');
        blocks.setBlockData(FURNACE, {
            items: [undefined, undefined, { identifier: 'minecraft:stone', count: 1 }],
            capacity: 3
        });

        player
            .getInventory()
            .setItem(HELD_SLOT, new ContainerEntry({ item: new Item({ name: 'minecraft:coal', count: 8 }) }));

        await player
            .getNetworkSession()
            .openBlockContainer(
                new Vector3(FURNACE.x, FURNACE.y, FURNACE.z),
                'minecraft:furnace',
                openContainerContents(player, FURNACE, 'minecraft:furnace')
            );

        // The output slot is what the smelt produced, so vanilla refuses anything put on it.
        await apply(server, player, [
            move(
                at(ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY, HELD_SLOT),
                at(ContainerUiId.FURNACE_RESULT_CONTAINER, 0),
                8
            )
        ]);
        expect(player.getInventory().getItem(HELD_SLOT).getAmount()).toBe(8);
        expect(storedItems(blocks, FURNACE)[2]).toEqual({ identifier: 'minecraft:stone', count: 1 });

        // The fuel slot takes it, because that is what a player puts coal in.
        await apply(server, player, [
            move(
                at(ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY, HELD_SLOT),
                at(ContainerUiId.FURNACE_FUEL_CONTAINER, 0),
                8
            )
        ]);
        expect(storedItems(blocks, FURNACE)[1]).toEqual({ identifier: 'minecraft:coal', count: 8 });

        // And the output still comes out, which is the only way to empty a furnace.
        await apply(server, player, [
            move(at(ContainerUiId.FURNACE_RESULT_CONTAINER, 0), at(ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY, 3), 1)
        ]);
        expect(player.getInventory().getItem(3).getName()).toBe('minecraft:stone');

        await provider.disable();
    }, 120_000);

    it('addresses both halves of a double chest as one run of 54 slots', async () => {
        const scene = await buildScene('double');
        const { server, world, provider, blocks } = scene;
        const player = buildPlayer(world, server, 'Hoarder');

        blocks.setBlock(CHEST, 'minecraft:chest');
        blocks.setBlock(CHEST_PARTNER, 'minecraft:chest');
        expect(blocks.getBlockData(CHEST_PARTNER)?.['pairedWith']).toEqual(CHEST);

        player
            .getInventory()
            .setItem(HELD_SLOT, new ContainerEntry({ item: new Item({ name: 'minecraft:diamond', count: 3 }) }));

        const contents = openContainerContents(player, CHEST_PARTNER, 'minecraft:chest');
        expect(contents).toHaveLength(54);

        await player
            .getNetworkSession()
            .openBlockContainer(
                new Vector3(CHEST_PARTNER.x, CHEST_PARTNER.y, CHEST_PARTNER.z),
                'minecraft:chest',
                contents
            );

        // Slot 30 is the seventh slot of the second half, which is the chest with the higher x.
        await apply(server, player, [
            move(
                at(ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY, HELD_SLOT),
                at(ContainerUiId.LEVEL_ENTITY_CONTAINER, 30),
                3
            )
        ]);

        expect(storedItems(blocks, CHEST)[3]).toBeUndefined();
        expect(storedItems(blocks, CHEST_PARTNER)[3]).toEqual({ identifier: 'minecraft:diamond', count: 3 });

        await provider.disable();
    }, 120_000);

    it('spills what a chest holds when the chest is broken', async () => {
        const scene = await buildScene('break');
        const { server, world, provider, blocks } = scene;
        const player = buildPlayer(world, server, 'Breaker');

        blocks.setBlock(CHEST, 'minecraft:chest');
        player
            .getInventory()
            .setItem(HELD_SLOT, new ContainerEntry({ item: new Item({ name: 'minecraft:diamond', count: 7 }) }));

        await player
            .getNetworkSession()
            .openBlockContainer(
                new Vector3(CHEST.x, CHEST.y, CHEST.z),
                'minecraft:chest',
                openContainerContents(player, CHEST, 'minecraft:chest')
            );
        await apply(server, player, [
            move(
                at(ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY, HELD_SLOT),
                at(ContainerUiId.LEVEL_ENTITY_CONTAINER, 0),
                7
            )
        ]);
        expect(storedItems(blocks, CHEST)[0]).toEqual({ identifier: 'minecraft:diamond', count: 7 });

        await world.breakBlock(new Vector3(CHEST.x, CHEST.y, CHEST.z));

        // The diamonds among what fell, which is the half of the break the block entity owns:
        // the chest itself comes from the loot roll and the family's stand-in for it.
        const dropped = world
            .getEntities()
            .filter((entity): entity is ItemEntity => entity instanceof ItemEntity)
            .map((entity) => entity.getItem()?.getItem());

        expect(dropped.map((item) => item?.getName())).toContain('minecraft:diamond');
        expect(dropped.find((item) => item?.getName() === 'minecraft:diamond')?.getAmount()).toBe(7);
        expect(blocks.getBlock(CHEST)?.identifier).toBe('minecraft:air');

        await provider.disable();
    }, 120_000);

    it('gives each player their own ender chest from the same block', async () => {
        const scene = await buildScene('ender');
        const { server, world, provider } = scene;
        const first = buildPlayer(world, server, 'First');
        const second = buildPlayer(world, server, 'Second');

        first
            .getInventory()
            .setItem(HELD_SLOT, new ContainerEntry({ item: new Item({ name: 'minecraft:diamond', count: 5 }) }));

        for (const player of [first, second]) {
            await player
                .getNetworkSession()
                .openBlockContainer(
                    new Vector3(CHEST.x, CHEST.y, CHEST.z),
                    'minecraft:ender_chest',
                    openContainerContents(player, CHEST, 'minecraft:ender_chest')
                );
        }

        await apply(server, first, [
            move(
                at(ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY, HELD_SLOT),
                at(ContainerUiId.LEVEL_ENTITY_CONTAINER, 2),
                5
            )
        ]);

        // The first player's own 27 slots, and nothing of the second player's: an ender chest
        // is the one container the block does not hold.
        expect(first.getInventory().getEnderChest().getItem(2).getName()).toBe('minecraft:diamond');
        expect(second.getInventory().getEnderChest().getItem(2).getName()).toBe('minecraft:air');

        await provider.disable();
    }, 120_000);

    it('lets a broken shulker box leave with what is in it, enchantments and all', async () => {
        const scene = await buildScene('shulker');
        const { server, world, blocks, content } = scene;
        const player = buildPlayer(world, server, 'Packer');

        blocks.setBlock(CHEST, 'minecraft:black_shulker_box');

        const pickaxe = new Item({ name: 'minecraft:diamond_pickaxe', count: 1, content }).withEnchantments({
            'minecraft:fortune': 3
        });
        player.getInventory().setItem(HELD_SLOT, new ContainerEntry({ item: pickaxe, count: 1 }));

        await player
            .getNetworkSession()
            .openBlockContainer(
                new Vector3(CHEST.x, CHEST.y, CHEST.z),
                'minecraft:black_shulker_box',
                openContainerContents(player, CHEST, 'minecraft:black_shulker_box')
            );
        await apply(server, player, [
            move(
                at(ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY, HELD_SLOT),
                at(ContainerUiId.LEVEL_ENTITY_CONTAINER, 0),
                1
            )
        ]);
        expect(storedItems(blocks, CHEST)[0]?.enchantments).toEqual({ 'minecraft:fortune': 3 });

        await world.breakBlock(new Vector3(CHEST.x, CHEST.y, CHEST.z));

        const dropped = world
            .getEntities()
            .filter((entity): entity is ItemEntity => entity instanceof ItemEntity)
            .map((entity) => entity.getItem()?.getItem());

        // Nothing spilled, and the box on the ground is carrying the enchanted pickaxe.
        expect(dropped.map((item) => item?.getName())).not.toContain('minecraft:diamond_pickaxe');

        const box = dropped.find((item) => item?.getName() === 'minecraft:black_shulker_box');
        const held = box?.getContents()[0];
        expect(held?.getName()).toBe('minecraft:diamond_pickaxe');
        expect(held?.getEnchantmentLevel('minecraft:fortune')).toBe(3);
    }, 120_000);

    it('gives back the enchantments, durability, name and lore a stack went in with', async () => {
        const scene = await buildScene('metadata');
        const { server, world, provider, blocks, content } = scene;
        const player = buildPlayer(world, server, 'Enchanter');

        blocks.setBlock(CHEST, 'minecraft:chest');

        const pickaxe = new Item({ name: 'minecraft:diamond_pickaxe', count: 1, content })
            .withEnchantments({ 'minecraft:fortune': 3, 'minecraft:unbreaking': 2 })
            .withDisplay('Rockbreaker', ['Mined a million blocks']);
        pickaxe.durability = pickaxe.getMaxDurability() - 57;
        player.getInventory().setItem(HELD_SLOT, new ContainerEntry({ item: pickaxe, count: 1 }));

        await player
            .getNetworkSession()
            .openBlockContainer(
                new Vector3(CHEST.x, CHEST.y, CHEST.z),
                'minecraft:chest',
                openContainerContents(player, CHEST, 'minecraft:chest')
            );
        await apply(server, player, [
            move(
                at(ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY, HELD_SLOT),
                at(ContainerUiId.LEVEL_ENTITY_CONTAINER, 5),
                1
            )
        ]);

        expect(storedItems(blocks, CHEST)[5]).toEqual({
            identifier: 'minecraft:diamond_pickaxe',
            count: 1,
            damage: 57,
            customName: 'Rockbreaker',
            lore: ['Mined a million blocks'],
            enchantments: { 'minecraft:fortune': 3, 'minecraft:unbreaking': 2 }
        });

        // Bedrock's own compound, so a vanilla tool reading this chest sees an item and not a
        // blob of this server's JSON: the name, the count and the slot at the top level, and
        // the client's own `ench` numbers under `tag`.
        const chunk = await world.getChunk(0, 0);
        const stored = chunk.getBlockEntity(CHEST.x, CHEST.y, CHEST.z)?.toNBT();
        const entries = [...(stored?.getList('Items', false) ?? [])];
        expect(entries).toHaveLength(1);
        expect(entries[0].getString('Name', '')).toBe('minecraft:diamond_pickaxe');
        expect(entries[0].getByte('Count', 0)).toBe(1);
        expect(entries[0].getByte('Slot', -1)).toBe(5);
        expect([...entries[0].getCompound('tag', false)!.getList('ench', false)!]).toHaveLength(2);

        await world.save();
        await provider.disable();

        // Out of a fresh world over the same database, and back into a player's hand, which is
        // the only reading of the record that proves nothing was lost on the way.
        const reopened = await buildScene('metadata');
        const second = buildPlayer(reopened.world, reopened.server, 'Enchanter');
        await second
            .getNetworkSession()
            .openBlockContainer(
                new Vector3(CHEST.x, CHEST.y, CHEST.z),
                'minecraft:chest',
                openContainerContents(second, CHEST, 'minecraft:chest')
            );
        await apply(reopened.server, second, [
            move(at(ContainerUiId.LEVEL_ENTITY_CONTAINER, 5), at(ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY, 2), 1)
        ]);

        const back = second.getInventory().getItem(2);
        expect(back.getName()).toBe('minecraft:diamond_pickaxe');
        expect(back.getEnchantmentLevel('minecraft:fortune')).toBe(3);
        expect(back.getEnchantmentLevel('minecraft:unbreaking')).toBe(2);
        expect(back.getMaxDurability() - back.getDurability()).toBe(57);
        expect(back.getCustomName()).toBe('Rockbreaker');
        expect(back.getLore()).toEqual(['Mined a million blocks']);

        await reopened.provider.disable();
    }, 120_000);

    it('keeps an enchantment no Bedrock number names, such as sweeping edge', async () => {
        const scene = await buildScene('sweeping');
        const { server, world, provider, blocks, content } = scene;
        const player = buildPlayer(world, server, 'Swordsman');

        blocks.setBlock(CHEST, 'minecraft:chest');

        const sword = new Item({ name: 'minecraft:diamond_sword', count: 1, content }).withEnchantments({
            'minecraft:sweeping_edge': 3
        });
        player.getInventory().setItem(HELD_SLOT, new ContainerEntry({ item: sword, count: 1 }));

        await player
            .getNetworkSession()
            .openBlockContainer(
                new Vector3(CHEST.x, CHEST.y, CHEST.z),
                'minecraft:chest',
                openContainerContents(player, CHEST, 'minecraft:chest')
            );
        await apply(server, player, [
            move(
                at(ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY, HELD_SLOT),
                at(ContainerUiId.LEVEL_ENTITY_CONTAINER, 0),
                1
            )
        ]);

        // `ench` cannot carry it - the client has no number for sweeping edge - so the Java id
        // beside it is the whole of the round trip.
        const chunk = await world.getChunk(0, 0);
        const entry = [...(chunk.getBlockEntity(CHEST.x, CHEST.y, CHEST.z)?.toNBT().getList('Items', false) ?? [])][0];
        expect(entry.getCompound('tag', false)?.getList('ench', false)).toBeNull();

        await world.save();
        await provider.disable();

        const reopened = await buildScene('sweeping');
        expect(storedItems(reopened.blocks, CHEST)[0]?.enchantments).toEqual({ 'minecraft:sweeping_edge': 3 });
        await reopened.provider.disable();
    }, 120_000);

    it('keeps two players at one chest looking at the same slots', async () => {
        const scene = await buildScene('viewers');
        const { server, world, provider, blocks } = scene;
        const first = buildPlayer(world, server, 'First');
        const second = buildPlayer(world, server, 'Second');
        await world.addEntity(first);
        await world.addEntity(second);

        blocks.setBlock(CHEST, 'minecraft:chest');
        first
            .getInventory()
            .setItem(HELD_SLOT, new ContainerEntry({ item: new Item({ name: 'minecraft:diamond', count: 2 }) }));

        for (const player of [first, second]) {
            await player
                .getNetworkSession()
                .openBlockContainer(
                    new Vector3(CHEST.x, CHEST.y, CHEST.z),
                    'minecraft:chest',
                    openContainerContents(player, CHEST, 'minecraft:chest')
                );
        }

        await apply(server, first, [
            move(
                at(ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY, HELD_SLOT),
                at(ContainerUiId.LEVEL_ENTITY_CONTAINER, 1),
                2
            )
        ]);

        // The second player's own request reads the block rather than anything their window
        // kept, so what the first player put in is there to be taken.
        await apply(server, second, [
            move(at(ContainerUiId.LEVEL_ENTITY_CONTAINER, 1), at(ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY, 4), 2)
        ]);

        expect(second.getInventory().getItem(4).getName()).toBe('minecraft:diamond');
        expect(storedItems(blocks, CHEST)[1]).toBeUndefined();

        await provider.disable();
    }, 120_000);
});
