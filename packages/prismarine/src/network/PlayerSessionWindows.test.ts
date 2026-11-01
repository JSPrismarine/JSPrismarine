import { Vector3 } from '@jsprismarine/math';
import { WindowIds, WindowTypes } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import ContainerEntry from '../inventory/ContainerEntry';
import { Item } from '../item/Item';
import type Player from '../Player';
import { stub } from '../testing/stub.test.helper';
import type ClientConnection from './ClientConnection';
import type { ProtocolCodec } from '@jsprismarine/protocol';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import ContainerOpenPacket from '@jsprismarine/protocol/packet/ContainerOpenPacket';
import InventoryContentPacket from '@jsprismarine/protocol/packet/InventoryContentPacket';
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
    const player = stub<Player>({ getRuntimeId: () => 7n });

    const session: PlayerSession = Object.assign(Object.create(PlayerSession.prototype), {
        connection,
        player,
        windowId: 0,
        openWindows: new Map<number, number>(),
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
            const stick = new ContainerEntry({ item: new Item({ name: 'minecraft:stick', count: 3 }), count: 3 });

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
    });
});
