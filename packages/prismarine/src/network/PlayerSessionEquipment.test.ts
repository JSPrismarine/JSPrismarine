import {
    BuildPlatform,
    CommandPermissionLevel,
    ContainerUiId,
    Gametype,
    PlayerPermissionLevel,
    WindowIds
} from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type { SessionPlayer } from './sessionPlayers';
import type { StorePlayerActor } from '../entity/data/storePlayers';
import ContainerEntry from '../inventory/ContainerEntry';
import HumanInventory from '../inventory/HumanInventory';
import { Item } from '../item/Item';
import { stub } from '../testing/stub.test.helper';
import { stubPlayerPort } from '../testing/playerPort.test.helper';
import Device from '../utils/Device';
import { AddPlayerPacket, MobArmorEquipmentPacket, MobEquipmentPacket } from '@jsprismarine/protocol';
import type { AddPlayerPayload } from '@jsprismarine/protocol';
import type { ProtocolContext } from '@jsprismarine/protocol';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import { Metadata } from '@jsprismarine/protocol/wire/structures/Metadata';
import { SyncedProperties } from '@jsprismarine/protocol/wire/structures/SyncedProperties';
import { firstSightPackets } from './replica/firstSight';
import type { FirstSight } from './replica/firstSight';
import type ClientConnection from './ClientConnection';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import InventoryContentPacket from '@jsprismarine/protocol/packet/InventoryContentPacket';
import type { ProtocolCodec } from '@jsprismarine/protocol';
import PlayerSession from './PlayerSession';
import { sessionPlayerFields } from '../testing/playerSession.test.helper';

/**
 * The packet at a position among the ones that went out, or a failure naming what was missing.
 *
 * Reading a position off an array answers `T | undefined`, and threading that through a dozen
 * assertions hides which one actually failed. An absent packet is the interesting failure, so
 * it is reported as itself.
 */
const nth = <T>(packets: readonly T[], index: number, what: string): T => {
    const packet = packets[index];
    if (packet === undefined) throw new Error(`no ${what} at ${index}: ${packets.length} went out`);
    return packet;
};

const protocolContext: ProtocolContext = { protocolVersion: 2193 };
const protocolCodec = stub<ProtocolCodec>({ protocolVersion: 2193, context: protocolContext });

const packetData = <T>(packet: NetworkPacket<T>): T => {
    const data = packet.getPacketData();
    if (data === null) throw new Error(`${packet.getName()} has no payload`);
    return data;
};

const itemName = (descriptor: Parameters<typeof Item.fromStackDescriptor>[1]): string =>
    Item.fromStackDescriptor(protocolContext, descriptor).getName();

/**
 * What another client is told about a player: what they wear, what they hold in the off hand,
 * and who they are when they first come into view.
 */

/** A session whose connection records what goes out, speaking for `player`. */
const sessionFor = (player: SessionPlayer) => {
    const sent: NetworkPacket[] = [];
    const connection = stub<ClientConnection>({
        codec: protocolCodec,
        sendDataPacket: async (packet) => void sent.push(packet)
    });

    const session: PlayerSession = Object.assign(Object.create(PlayerSession.prototype), {
        connection,
        ...sessionPlayerFields(player, player.getRuntimeId())
    });

    return { session, sent };
};

/** A player's actor wearing a chestplate and holding a shield in the off hand, and its inventory. */
const equippedHuman = () => {
    const inventory = new HumanInventory();
    const chestplate = new Item({ runtimeId: 0, name: 'minecraft:diamond_chestplate' });
    const shield = new Item({ runtimeId: 0, name: 'minecraft:shield' });
    inventory.getArmor().setItem(1, new ContainerEntry({ item: chestplate, count: 1 }));
    inventory.getOffhand().setItem(0, new ContainerEntry({ item: shield, count: 1 }));

    return Object.assign(
        stub<StorePlayerActor>({
            getRuntimeId: () => 7n,
            // What `HumanInventory.getEquipment` reads off those slots.
            getEquipment: () => ({ chest: chestplate, offhand: shield })
        }),
        { getInventory: () => inventory }
    );
};

/** The player being shown, with the pieces `sendAddPlayer` reads. */
/** A player's first sight, as replication builds it from the replica and the player's session. */
const shownPlayer = ({ op = false, device = null }: { op?: boolean; device?: Device | null } = {}): FirstSight => ({
    kind: 'player',
    runtimeId: 7n,
    view: {
        identifier: 'minecraft:player',
        pose: { x: 0, y: 64, z: 0, yaw: 0, pitch: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        onGround: true,
        metadata: { flags: [], properties: [] },
        health: { current: 20, max: 20 },
        properties: new SyncedProperties(),
        statusEffects: [],
        equipment: {}
    },
    metadata: new Metadata(),
    player: {
        headYaw: 0,
        handSlot: 0,
        sprinting: false,
        gamemode: Gametype.SURVIVAL,
        flying: false,
        air: 300,
        breathing: true
    },
    identity: { uuid: UUID.fromRandom(), name: 'Shown', platformChatId: '', device, op },
    equipment: {}
});

describe('network', () => {
    describe('PlayerSession', () => {
        describe('sendInventory', () => {
            /** The player's own session, holding `equippedHuman`'s inventory. */
            const ownSession = () => {
                const human = equippedHuman();
                return sessionFor(
                    stubPlayerPort({
                        id: 7,
                        getRuntimeId: () => 7n,
                        getInventory: () => human.getInventory(),
                        getEquipment: () => human.getEquipment()
                    })
                );
            };

            it('names the armor container in the armor window, not the hotbar and inventory', async () => {
                // Window 120 is the armor; its `Full Container Name` said container 12, the
                // combined hotbar and inventory, which is the packet's default.
                const { session, sent } = ownSession();

                await session.sendInventory();

                const contents = sent.filter((packet) => packet instanceof InventoryContentPacket);
                expect(contents).toHaveLength(2);
                const inventory = nth(contents, 0, 'InventoryContentPacket');
                const armor = nth(contents, 1, 'InventoryContentPacket');

                expect(inventory.windowId).toBe(WindowIds.INVENTORY);
                expect(inventory.containerId).toBe(ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY);

                expect(armor.windowId).toBe(WindowIds.ARMOR);
                expect(armor.containerId).toBe(ContainerUiId.ARMOR_CONTAINER);
                expect(armor.items.map(itemName)).toContain('minecraft:diamond_chestplate');
            });

            it('sends every stack with a stack network id of its own', async () => {
                // The client names stacks by these ids in its requests, and BDS sends one with
                // every stack it lists.
                const { session, sent } = ownSession();
                const inventory = session.getPlayer().getInventory();
                inventory.setItem(
                    3,
                    new ContainerEntry({ item: new Item({ name: 'minecraft:stone', count: 1 }), count: 9 })
                );

                await session.sendInventory();

                const packet = nth(
                    sent.filter((candidate) => candidate instanceof InventoryContentPacket),
                    0,
                    'InventoryContentPacket'
                );
                expect(packet.items[3]?.stackSize).toBe(9);

                const ids = sent
                    .filter((packet) => packet instanceof InventoryContentPacket)
                    .flatMap((packet) => packet.items.map((item) => item.stackNetId))
                    .filter((id): id is number => id !== null);
                // The stone, and the chestplate in the armor window.
                expect(ids).toHaveLength(2);
                expect(ids.every((id) => id > 0)).toBe(true);
                expect(new Set(ids).size).toBe(ids.length);
            });

            it('sends the held item as equipment in the inventory window', async () => {
                const { session, sent } = ownSession();
                const inventory = session.getPlayer().getInventory();
                const sword = new Item({ runtimeId: 0, name: 'minecraft:diamond_sword' });
                inventory.setItem(inventory.getHandSlotIndex(), new ContainerEntry({ item: sword, count: 1 }));

                await session.sendInventory();

                // The off hand goes out through `sendArmorFor` afterwards; the hand comes first.
                const hand = nth(
                    sent.filter((packet) => packet instanceof MobEquipmentPacket),
                    0,
                    'MobEquipmentPacket'
                );
                const data = packetData(hand);
                expect(data.runtimeEntityId).toBe(7n);
                expect(itemName(data.item)).toBe('minecraft:diamond_sword');
                expect(data.windowId).toBe(WindowIds.INVENTORY);
                expect(data.inventorySlot).toBe(inventory.getHandSlotIndex());
                expect(data.hotbarSlot).toBe(inventory.getHandSlotIndex());
            });
        });

        describe('sendArmorFor', () => {
            it('sends the off hand as equipment for the offhand container, not as body armor', async () => {
                // `Body` is the body armor slot. Putting the shield there dressed the player in
                // it; the client reads off-hand changes from `MobEquipment` with container 119.
                const { session, sent } = sessionFor(stubPlayerPort({ getRuntimeId: () => 1n }));

                await session.sendArmorFor(equippedHuman());

                expect(sent).toHaveLength(2);
                const [armor, offhand] = sent;

                expect(armor).toBeInstanceOf(MobArmorEquipmentPacket);
                if (!(armor instanceof MobArmorEquipmentPacket)) return;
                const armorData = packetData(armor);
                expect(armorData.runtimeEntityId).toBe(7n);
                expect(itemName(armorData.chest)).toBe('minecraft:diamond_chestplate');
                expect(itemName(armorData.body)).toBe('minecraft:air');

                expect(offhand).toBeInstanceOf(MobEquipmentPacket);
                if (!(offhand instanceof MobEquipmentPacket)) return;
                const offhandData = packetData(offhand);
                expect(offhandData.runtimeEntityId).toBe(7n);
                expect(itemName(offhandData.item)).toBe('minecraft:shield');
                expect(offhandData.windowId).toBe(WindowIds.OFFHAND);
                expect(offhandData.inventorySlot).toBe(0);
                expect(offhandData.hotbarSlot).toBe(0);
            });
        });

        describe("a player's first sight", () => {
            const spawn = async (shown: FirstSight): Promise<AddPlayerPayload> => {
                const [packet] = firstSightPackets(shown, { protocolVersion: 2193 });
                expect(packet).toBeInstanceOf(AddPlayerPacket);
                if (!(packet instanceof AddPlayerPacket)) throw new Error('AddPlayerPacket was not sent first');
                const data = packet.getPacketData();
                if (data === null) throw new Error('AddPlayerPacket has no payload');
                return data;
            };

            it('names the platform the player logged in from', async () => {
                const device = new Device({
                    id: 'abc',
                    model: 'Pixel',
                    os: BuildPlatform.GOOGLE,
                    inputMode: 1,
                    guiScale: 0
                });

                const packet = await spawn(shownPlayer({ device }));

                expect(packet.buildPlatform).toBe(BuildPlatform.GOOGLE);
                expect(packet.deviceId).toBe('abc');
                expect(packet.platformChatId).toBe('');
            });

            it('falls back to an unknown platform without a device', async () => {
                const packet = await spawn(shownPlayer());

                expect(packet.buildPlatform).toBe(BuildPlatform.UNKNOWN);
                expect(packet.deviceId).toBe('');
            });

            it('shows a member with no command permission for an ordinary player', async () => {
                const packet = await spawn(shownPlayer());

                expect(packet.abilities.playerPermission).toBe(PlayerPermissionLevel.MEMBER);
                expect(packet.abilities.commandPermission).toBe(CommandPermissionLevel.ANY);
            });

            it('shows an operator with game director permission for an op', async () => {
                const packet = await spawn(shownPlayer({ op: true }));

                expect(packet.abilities.playerPermission).toBe(PlayerPermissionLevel.OPERATOR);
                expect(packet.abilities.commandPermission).toBe(CommandPermissionLevel.GAME_DIRECTORS);
            });
        });
    });
});
