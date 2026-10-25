import {
    BuildPlatform,
    CommandPermissionLevel,
    ContainerUiId,
    Gametype,
    PlayerPermissionLevel,
    WindowIds
} from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type Player from '../Player';
import type Human from '../entity/Human';
import ContainerEntry from '../inventory/ContainerEntry';
import HumanInventory from '../inventory/HumanInventory';
import { Item } from '../item/Item';
import { stub } from '../testing/stub.test.helper';
import Device from '../utils/Device';
import UUID from '../utils/UUID';
import type { Position } from '../world/Position';
import type ClientConnection from './ClientConnection';
import type DataPacket from './packet/DataPacket';
import AddPlayerPacket from './packet/AddPlayerPacket';
import InventoryContentPacket from './packet/InventoryContentPacket';
import MobArmorEquipmentPacket from './packet/MobArmorEquipmentPacket';
import MobEquipmentPacket from './packet/MobEquipmentPacket';
import PlayerSession from './PlayerSession';

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

/**
 * What another client is told about a player: what they wear, what they hold in the off hand,
 * and who they are when they first come into view.
 */

/** A session whose connection records what goes out, speaking for `player`. */
const sessionFor = (player: Player) => {
    const sent: DataPacket[] = [];
    const connection = stub<ClientConnection>({
        sendDataPacket: async (packet) => void sent.push(packet)
    });

    const session: PlayerSession = Object.assign(Object.create(PlayerSession.prototype), { connection, player });

    return { session, sent };
};

/** A human wearing a chestplate and holding a shield in the off hand. */
const equippedHuman = () => {
    const inventory = new HumanInventory();
    const chestplate = new Item({ id: 0, name: 'minecraft:diamond_chestplate' });
    const shield = new Item({ id: 0, name: 'minecraft:shield' });
    inventory.getArmor().setItem(1, new ContainerEntry({ item: chestplate, count: 1 }));
    inventory.getOffhand().setItem(0, new ContainerEntry({ item: shield, count: 1 }));

    return stub<Human>({ getRuntimeId: () => 7n, getInventory: () => inventory });
};

const position = () => stub<Position>({ getX: () => 1, getY: () => 64, getZ: () => 2 });

/** The player being shown, with the pieces `sendSpawn` reads. */
const shownPlayer = ({ op = false, device = null }: { op?: boolean; device?: Device | null } = {}) =>
    stub<Player>({
        getUUID: () => UUID.fromRandom(),
        getRuntimeId: () => 7n,
        getName: () => 'Shown',
        getPosition: position,
        pitch: 0,
        yaw: 0,
        headYaw: 0,
        gamemode: Gametype.SURVIVAL,
        getInventory: () => new HumanInventory(),
        device,
        platformChatId: '',
        isOp: () => op
    });

/** The player being shown to, recording the packets its session was asked to send. */
const viewer = () => {
    const sent: DataPacket[] = [];
    const session = stub<PlayerSession>({
        send: async (packet) => void sent.push(packet),
        sendAbilities: async () => {},
        sendArmorFor: async () => {}
    });

    return { player: stub<Player>({ getNetworkSession: () => session }), sent };
};

describe('network', () => {
    describe('PlayerSession', () => {
        describe('sendInventory', () => {
            /** The player's own session, holding `equippedHuman`'s inventory. */
            const ownSession = () => {
                const inventory = equippedHuman().getInventory();
                return sessionFor(stub<Player>({ getRuntimeId: () => 7n, getInventory: () => inventory }));
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
                expect(armor.items.map((entry) => entry.getItem().getName())).toContain('minecraft:diamond_chestplate');
            });

            it('sends the held item as equipment in the inventory window', async () => {
                const { session, sent } = ownSession();
                const inventory = session.getPlayer().getInventory();
                const sword = new Item({ id: 0, name: 'minecraft:diamond_sword' });
                inventory.setItem(inventory.getHandSlotIndex(), new ContainerEntry({ item: sword, count: 1 }));

                await session.sendInventory();

                // The off hand goes out through `sendArmorFor` afterwards; the hand comes first.
                const hand = nth(
                    sent.filter((packet) => packet instanceof MobEquipmentPacket),
                    0,
                    'MobEquipmentPacket'
                );
                expect(hand.runtimeEntityId).toBe(7n);
                expect(hand.item.getName()).toBe('minecraft:diamond_sword');
                expect(hand.windowId).toBe(WindowIds.INVENTORY);
                expect(hand.inventorySlot).toBe(inventory.getHandSlotIndex());
                expect(hand.hotbarSlot).toBe(inventory.getHandSlotIndex());
            });
        });

        describe('sendArmorFor', () => {
            it('sends the off hand as equipment for the offhand container, not as body armor', async () => {
                // `Body` is the body armor slot. Putting the shield there dressed the player in
                // it; the client reads off-hand changes from `MobEquipment` with container 119.
                const { session, sent } = sessionFor(stub<Player>());

                await session.sendArmorFor(equippedHuman());

                expect(sent).toHaveLength(2);
                const [armor, offhand] = sent;

                expect(armor).toBeInstanceOf(MobArmorEquipmentPacket);
                if (!(armor instanceof MobArmorEquipmentPacket)) return;
                expect(armor.runtimeEntityId).toBe(7n);
                expect(armor.chest.getName()).toBe('minecraft:diamond_chestplate');
                expect(armor.body.getName()).toBe('minecraft:air');

                expect(offhand).toBeInstanceOf(MobEquipmentPacket);
                if (!(offhand instanceof MobEquipmentPacket)) return;
                expect(offhand.runtimeEntityId).toBe(7n);
                expect(offhand.item.getName()).toBe('minecraft:shield');
                expect(offhand.windowId).toBe(WindowIds.OFFHAND);
                expect(offhand.inventorySlot).toBe(0);
                expect(offhand.hotbarSlot).toBe(0);
            });
        });

        describe('sendSpawn', () => {
            const spawn = async (shown: Player) => {
                const other = viewer();
                const { session } = sessionFor(shown);

                await session.sendSpawn(other.player);

                const [packet] = other.sent;
                expect(packet).toBeInstanceOf(AddPlayerPacket);
                return packet instanceof AddPlayerPacket ? packet : new AddPlayerPacket();
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

                expect(packet.playerPermission).toBe(PlayerPermissionLevel.MEMBER);
                expect(packet.commandPermission).toBe(CommandPermissionLevel.ANY);
            });

            it('shows an operator with game director permission for an op', async () => {
                const packet = await spawn(shownPlayer({ op: true }));

                expect(packet.playerPermission).toBe(PlayerPermissionLevel.OPERATOR);
                expect(packet.commandPermission).toBe(CommandPermissionLevel.GAME_DIRECTORS);
            });
        });
    });
});
