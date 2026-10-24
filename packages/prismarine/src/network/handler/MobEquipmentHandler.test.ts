import { WindowIds } from '@jsprismarine/minecraft';
import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it, vi } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import ContainerEntry from '../../inventory/ContainerEntry';
import HumanInventory from '../../inventory/HumanInventory';
import { Item } from '../../item/Item';
import { stub } from '../../testing/stub.test.helper';
import type { World } from '../../world/World';
import type DataPacket from '../packet/DataPacket';
import MobEquipmentPacket from '../packet/MobEquipmentPacket';
import type PlayerSession from '../PlayerSession';
import MobEquipmentHandler from './MobEquipmentHandler';

/**
 * A world with the sender, a watcher that has the sender on screen, and a bystander that does
 * not. The sender holds a sword in hotbar slot 3 and nothing anywhere else.
 */
const fakeWorld = () => {
    const toSender: DataPacket[] = [];
    const toWatcher: DataPacket[] = [];
    const toBystander: DataPacket[] = [];
    const players: Player[] = [];
    const world = stub<World>({ getPlayers: () => players });

    const inventory = new HumanInventory();
    inventory.setItem(3, new ContainerEntry({ item: new Item({ id: 0, name: 'minecraft:diamond_sword' }), count: 1 }));

    const senderSession = stub<PlayerSession>({
        tracks: () => true,
        send: async (packet) => void toSender.push(packet),
        getPlayer: () => sender
    });
    const sender: Player = stub<Player>({
        getName: () => 'runner',
        getRuntimeId: () => 7n,
        getWorld: () => world,
        getInventory: () => inventory,
        getNetworkSession: () => senderSession
    });
    const watcher = stub<Player>({
        getRuntimeId: () => 8n,
        getWorld: () => world,
        getNetworkSession: () =>
            stub<PlayerSession>({
                tracks: () => true,
                send: async (packet) => void toWatcher.push(packet)
            })
    });
    const bystander = stub<Player>({
        getRuntimeId: () => 9n,
        getWorld: () => world,
        getNetworkSession: () =>
            stub<PlayerSession>({
                tracks: () => false,
                send: async (packet) => void toBystander.push(packet)
            })
    });
    players.push(sender, watcher, bystander);

    const debug = vi.fn();
    const server = stub<Server>({ getLogger: () => stub<Logger>({ debug }) });

    return { senderSession, inventory, server, debug, toSender, toWatcher, toBystander };
};

/** What a client sends when it selects a hotbar slot: both slot fields name it, container 0. */
const selected = (slot: number, overrides: Partial<MobEquipmentPacket> = {}): MobEquipmentPacket =>
    Object.assign(
        new MobEquipmentPacket(),
        {
            runtimeEntityId: 0n,
            item: Item.air(),
            inventorySlot: slot,
            hotbarSlot: slot,
            windowId: WindowIds.INVENTORY
        },
        overrides
    );

/** The one relay a watcher was sent, typed for the assertions that follow. */
const relayed = (sent: DataPacket[]): MobEquipmentPacket => {
    expect(sent).toHaveLength(1);
    const [packet] = sent;
    expect(packet).toBeInstanceOf(MobEquipmentPacket);
    if (!(packet instanceof MobEquipmentPacket)) throw new Error('unreachable');
    return packet;
};

describe('MobEquipmentHandler', () => {
    it('moves the hand to the selected hotbar slot', async () => {
        const { senderSession, inventory, server } = fakeWorld();

        await new MobEquipmentHandler().handle(selected(3), server, senderSession);

        expect(inventory.getHandSlotIndex()).toBe(3);
        expect(inventory.getItemInHand().getName()).toBe('minecraft:diamond_sword');
    });

    it('relays the server copy of the held item to the players that have the sender on screen', async () => {
        const { senderSession, server, toSender, toWatcher, toBystander } = fakeWorld();
        // The client claims to hold a block it was never given.
        const packet = selected(3, { item: new Item({ id: 0, name: 'minecraft:bedrock' }) });

        await new MobEquipmentHandler().handle(packet, server, senderSession);

        const relay = relayed(toWatcher);
        expect(relay).not.toBe(packet);
        expect(relay.runtimeEntityId).toBe(7n);
        expect(relay.item.getName()).toBe('minecraft:diamond_sword');
        expect(relay.inventorySlot).toBe(3);
        expect(relay.hotbarSlot).toBe(3);
        expect(relay.windowId).toBe(WindowIds.INVENTORY);

        expect(toSender).toHaveLength(0);
        expect(toBystander).toHaveLength(0);
    });

    it('relays air for an empty slot', async () => {
        const { senderSession, server, toWatcher } = fakeWorld();

        await new MobEquipmentHandler().handle(selected(0), server, senderSession);

        expect(relayed(toWatcher).item.getName()).toBe('minecraft:air');
    });

    it('accepts an offhand report without moving the hand or relaying it', async () => {
        const { senderSession, inventory, server, debug, toWatcher } = fakeWorld();
        inventory.setHandSlot(3);

        await new MobEquipmentHandler().handle(selected(0, { windowId: WindowIds.OFFHAND }), server, senderSession);

        expect(inventory.getHandSlotIndex()).toBe(3);
        expect(toWatcher).toHaveLength(0);
        expect(debug).not.toHaveBeenCalled();
    });

    it.each([WindowIds.ARMOR, WindowIds.PLAYER_ONLY_UI, 1, 255])(
        'drops a report for container %i',
        async (windowId) => {
            const { senderSession, inventory, server, debug, toWatcher } = fakeWorld();

            await new MobEquipmentHandler().handle(selected(2, { windowId }), server, senderSession);

            expect(inventory.getHandSlotIndex()).toBe(0);
            expect(toWatcher).toHaveLength(0);
            expect(debug).toHaveBeenCalledOnce();
        }
    );

    it.each([9, 35, 255])('drops a selected slot of %i, which is outside the hotbar', async (slot) => {
        const { senderSession, inventory, server, debug, toWatcher } = fakeWorld();

        await new MobEquipmentHandler().handle(selected(slot), server, senderSession);

        expect(inventory.getHandSlotIndex()).toBe(0);
        expect(toWatcher).toHaveLength(0);
        expect(debug).toHaveBeenCalledOnce();
    });

    it('drops a hotbar selection whose slot field is outside the hotbar', async () => {
        const { senderSession, inventory, server, debug, toWatcher } = fakeWorld();

        await new MobEquipmentHandler().handle(selected(2, { inventorySlot: 40 }), server, senderSession);

        expect(inventory.getHandSlotIndex()).toBe(0);
        expect(toWatcher).toHaveLength(0);
        expect(debug).toHaveBeenCalledOnce();
    });
});
