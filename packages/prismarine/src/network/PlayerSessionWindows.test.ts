import { Vector3 } from '@jsprismarine/math';
import { ContainerUiId, WindowIds, WindowTypes } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import ContainerEntry from '../inventory/ContainerEntry';
import type HumanInventory from '../inventory/HumanInventory';
import { Item } from '../item/Item';
import type Player from '../Player';
import { stub } from '../testing/stub.test.helper';
import type ClientConnection from './ClientConnection';
import type { ProtocolCodec } from '@jsprismarine/protocol';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import ContainerOpenPacket from '@jsprismarine/protocol/packet/ContainerOpenPacket';
import InventoryContentPacket from '@jsprismarine/protocol/packet/InventoryContentPacket';
import UpdateTradePacket from '@jsprismarine/protocol/packet/UpdateTradePacket';
import { Merchant, parseTradeTable } from '@jsprismarine/trading';
import { seededRandom } from '@jsprismarine/predicates';
import type { Entity } from '../entity/Entity';
import PlayerSession from './PlayerSession';

const protocolCodec = stub<ProtocolCodec>({ context: { protocolVersion: 2193 } });

/**
 * The windows a session has opened on the client, and which `ContainerClose` it accepts for them.
 */

/**
 * A session with the window state its constructor would give it, and a connection that records
 * sends. The player's inventory is recorded by window, with how many packets had gone before it.
 */
const sessionFor = () => {
    const sent: NetworkPacket[] = [];
    const inventories: Array<{ windowId: number; after: number }> = [];
    const connection = stub<ClientConnection>({
        codec: protocolCodec,
        sendDataPacket: async (packet) => void sent.push(packet)
    });
    // Ids as the player's own inventory hands them out: one per stack, none for air.
    let nextStackId = 1;
    const inventory = stub<HumanInventory>({
        assignStackNetworkId: (item) => {
            if (item.getName() === 'minecraft:air') return 0;
            if (item.stackNetworkId === 0) item.stackNetworkId = nextStackId++;
            return item.stackNetworkId;
        }
    });
    const player = stub<Player>({ getRuntimeId: () => 7n, getInventory: () => inventory });

    const session: PlayerSession = Object.assign(Object.create(PlayerSession.prototype), {
        connection,
        player,
        windowId: 0,
        openWindows: new Map<number, number>(),
        containerData: new Map<number, number>(),
        blockContainer: undefined,
        sendInventory: async (windowId: number = WindowIds.INVENTORY) =>
            void inventories.push({ windowId, after: sent.length })
    });

    return { session, sent, inventories };
};

describe('network', () => {
    describe('PlayerSession windows', () => {
        it('opens the inventory under a fresh window id and remembers it until the close', async () => {
            const { session, sent } = sessionFor();

            await session.openMainInventory();

            const [open] = sent;
            expect(open).toBeInstanceOf(ContainerOpenPacket);
            expect(open).toMatchObject({
                windowId: WindowIds.FIRST,
                containerType: WindowTypes.INVENTORY,
                containerEntityId: 7n
            });

            expect(session.closeWindow(WindowIds.FIRST)).toBe(true);
            expect(session.closeWindow(WindowIds.FIRST)).toBe(false);
        });

        it('opens a chest on the block it stands on, and sends what it holds', async () => {
            const { session, sent } = sessionFor();
            const stick = new ContainerEntry({ item: new Item({ name: 'minecraft:stick', count: 1 }), count: 3 });

            const opened = await session.openBlockContainer(new Vector3(4, 64, -7), 'minecraft:chest', [stick]);

            expect(opened).toMatchObject({ identifier: 'minecraft:chest', screen: WindowTypes.CONTAINER });
            expect(session.getOpenBlockContainer()).toBe(opened);

            const [open, contents] = sent;
            expect(open).toMatchObject({
                windowId: WindowIds.FIRST,
                containerType: WindowTypes.CONTAINER,
                containerPos: new Vector3(4, 64, -7),
                // A block is not an actor, which is what -1 means in this field.
                containerEntityId: -1n
            });
            expect(contents).toBeInstanceOf(InventoryContentPacket);
            if (!(contents instanceof InventoryContentPacket)) throw new Error('Inventory content was not sent');
            expect(contents.windowId).toBe(WindowIds.FIRST);
            expect(
                contents.items.map((item) => Item.fromStackDescriptor({ protocolVersion: 2193 }, item).getName())
            ).toEqual(['minecraft:stick']);
            expect(contents.items[0]?.stackSize).toBe(3);

            expect(session.closeWindow(WindowIds.FIRST)).toBe(true);
            expect(session.getOpenBlockContainer()).toBeUndefined();
        });

        it.each(['minecraft:furnace', 'minecraft:blast_furnace', 'minecraft:smoker'])(
            'sends %s contents as one complete primary inventory',
            async (identifier) => {
                const { session, sent } = sessionFor();
                const contents = [
                    new ContainerEntry({ item: new Item({ name: 'minecraft:iron_ore', count: 1 }), count: 1 }),
                    new ContainerEntry({ item: new Item({ name: 'minecraft:coal', count: 1 }), count: 8 }),
                    new ContainerEntry({ item: new Item({ name: 'minecraft:iron_ingot', count: 1 }), count: 1 })
                ];

                await session.openBlockContainer(new Vector3(0, 64, 0), identifier, contents);

                const packets = sent.filter(
                    (packet): packet is InventoryContentPacket => packet instanceof InventoryContentPacket
                );
                expect(packets).toHaveLength(1);
                expect(packets[0]).toMatchObject({
                    windowId: WindowIds.FIRST,
                    containerId: ContainerUiId.LEVEL_ENTITY_CONTAINER
                });
                expect(
                    packets[0]?.items.map((item) => Item.fromStackDescriptor({ protocolVersion: 2193 }, item).getName())
                ).toEqual(['minecraft:iron_ore', 'minecraft:coal', 'minecraft:iron_ingot']);
                expect(packets[0]?.items[1]?.stackSize).toBe(8);
            }
        );

        it('names every stack a furnace shows by an id, so the client can pick it up', async () => {
            const { session, sent } = sessionFor();
            const contents = [
                new ContainerEntry({ item: new Item({ name: 'minecraft:iron_ore', count: 1 }), count: 1 }),
                new ContainerEntry({ item: new Item({ name: 'minecraft:coal', count: 1 }), count: 8 }),
                new ContainerEntry({ item: Item.air() })
            ];

            await session.openBlockContainer(new Vector3(0, 64, 0), 'minecraft:furnace', contents);

            const content = sent.find((packet) => packet instanceof InventoryContentPacket);
            if (!(content instanceof InventoryContentPacket)) throw new Error('Inventory content was not sent');
            const [ore, coal, empty] = content.items.map((item) => item.stackNetId);
            expect(ore).toBeGreaterThan(0);
            expect(coal).toBeGreaterThan(0);
            expect(coal).not.toBe(ore);
            expect(empty ?? 0).toBe(0);
        });

        it('opens a workstation without a contents packet, since it stores nothing', async () => {
            const { session, sent, inventories } = sessionFor();

            const opened = await session.openBlockContainer(new Vector3(0, 64, 0), 'minecraft:enchanting_table');

            expect(opened).toMatchObject({ screen: WindowTypes.ENCHANTMENT, inputs: [null, null, null] });
            expect(sent).toHaveLength(1);
            // Not measured against BDS, unlike the crafting table, so nothing more is sent.
            expect(inventories).toEqual([]);
        });

        it("follows a crafting table's open with the player's inventory under window 0, as BDS did", async () => {
            const { session, sent, inventories } = sessionFor();

            await session.openBlockContainer(new Vector3(3, 64, 3), 'minecraft:crafting_table');

            expect(sent).toHaveLength(1);
            expect(sent[0]).toMatchObject({ containerType: WindowTypes.WORKBENCH, containerEntityId: -1n });
            expect(inventories).toEqual([{ windowId: WindowIds.INVENTORY, after: 1 }]);
        });

        it.each(['minecraft:anvil', 'minecraft:chipped_anvil', 'minecraft:damaged_anvil'])(
            'opens the anvil screen for %s, whatever state it has been knocked into',
            async (identifier) => {
                const { session } = sessionFor();

                const opened = await session.openBlockContainer(new Vector3(0, 64, 0), identifier);
                expect(opened).toMatchObject({ screen: WindowTypes.ANVIL });
            }
        );

        it.each([
            ['minecraft:chest', WindowTypes.CONTAINER],
            ['minecraft:barrel', WindowTypes.CONTAINER],
            ['minecraft:purple_shulker_box', WindowTypes.CONTAINER],
            ['minecraft:crafting_table', WindowTypes.WORKBENCH],
            ['minecraft:furnace', WindowTypes.FURNACE],
            ['minecraft:blast_furnace', WindowTypes.BLAST_FURNACE],
            ['minecraft:smoker', WindowTypes.SMOKER],
            ['minecraft:brewing_stand', WindowTypes.BREWING_STAND],
            ['minecraft:hopper', WindowTypes.HOPPER],
            ['minecraft:beacon', WindowTypes.BEACON],
            ['minecraft:lectern', WindowTypes.LECTERN],
            ['minecraft:crafter', WindowTypes.CRAFTER]
        ])('draws %s as its own screen', async (identifier, screen) => {
            const { session } = sessionFor();

            expect(await session.openBlockContainer(new Vector3(0, 64, 0), identifier)).toMatchObject({ screen });
        });

        it('opens nothing for a block with no screen', async () => {
            const { session, sent } = sessionFor();

            expect(await session.openBlockContainer(new Vector3(0, 64, 0), 'minecraft:stone')).toBeUndefined();
            expect(sent).toHaveLength(0);
        });

        it('refuses to close a window it never opened', () => {
            const { session } = sessionFor();

            expect(session.closeWindow(WindowIds.INVENTORY)).toBe(false);
            expect(session.closeWindow(42)).toBe(false);
        });

        describe('a trade screen', () => {
            const table = parseTradeTable(
                {
                    tiers: [
                        {
                            total_exp_required: 0,
                            groups: [
                                {
                                    num_to_select: -1,
                                    trades: [
                                        {
                                            wants: [{ item: 'minecraft:emerald', quantity: 1 }],
                                            gives: [{ item: 'minecraft:bread', quantity: 6 }],
                                            trader_exp: 2,
                                            max_uses: 12
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                },
                { pack: 'test' }
            )!;

            const trader = () =>
                stub<Entity>({
                    getRuntimeId: () => 42n,
                    getType: () => 'minecraft:villager_v2',
                    getName: () => 'Farmer',
                    getPosition: () => new Vector3(1, 64, 2)
                } as Partial<Entity>);

            it('opens on the trader and sends its offers', async () => {
                const { session, sent } = sessionFor();
                const released: string[] = [];
                const merchant = new Merchant({ table, random: seededRandom(1) });

                const opened = await session.openTradeWindow({
                    trader: trader(),
                    source: merchant,
                    context: () => ({}),
                    release: () => void released.push('released')
                });

                const [open, offers] = sent;
                expect(open).toBeInstanceOf(ContainerOpenPacket);
                expect(open).toMatchObject({
                    windowId: WindowIds.FIRST,
                    containerType: WindowTypes.TRADE,
                    containerEntityId: 42n
                });
                expect(offers).toBeInstanceOf(UpdateTradePacket);
                expect((offers as UpdateTradePacket).getPacketData()).toMatchObject({
                    containerId: WindowIds.FIRST,
                    size: 1,
                    traderTier: 0,
                    entityUniqueId: 42n,
                    displayName: 'Farmer'
                });
                expect(opened?.inputs).toEqual([null, null]);
                expect(released).toEqual([]);
            });

            it('releases the trader when the client closes the screen', async () => {
                const { session } = sessionFor();
                const released: string[] = [];
                await session.openTradeWindow({
                    trader: trader(),
                    source: new Merchant({ table, random: seededRandom(1) }),
                    context: () => ({}),
                    release: () => void released.push('released')
                });

                expect(session.closeWindow(WindowIds.FIRST)).toBe(true);

                expect(released).toEqual(['released']);
                expect(session.getOpenBlockContainer()).toBeUndefined();
            });

            it('does not open a second screen on the trader it already has open', async () => {
                const { session, sent } = sessionFor();
                const same = trader();
                const open = () =>
                    session.openTradeWindow({
                        trader: same,
                        source: new Merchant({ table, random: seededRandom(1) }),
                        context: () => ({}),
                        release: () => undefined
                    });
                await open();
                const before = sent.length;

                expect(await open()).toBeUndefined();
                expect(sent.length).toBe(before);
            });
        });
    });
});
