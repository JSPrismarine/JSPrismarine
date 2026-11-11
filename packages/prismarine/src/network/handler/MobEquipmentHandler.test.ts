import { WindowIds } from '@jsprismarine/minecraft';
import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it, vi } from 'vitest';

import type Server from '../../Server';
import ContainerEntry from '../../inventory/ContainerEntry';
import HumanInventory from '../../inventory/HumanInventory';
import { Item } from '../../item/Item';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stubPlayerPort } from '../../testing/playerPort.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type { World } from '../../world/World';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import type { ProtocolContext } from '@jsprismarine/protocol';
import { MobEquipmentPacket } from '@jsprismarine/protocol';
import type { MobEquipmentPayload } from '@jsprismarine/protocol';
import type ClientConnection from '../ClientConnection';
import type { ProtocolCodec } from '@jsprismarine/protocol';
import type PlayerSession from '../PlayerSession';
import MobEquipmentHandler from './MobEquipmentHandler';
import { storePlayerPort } from './storePlayerPort.test.helper';

const protocolContext: ProtocolContext = { protocolVersion: 2193 };
const protocolCodec = stub<ProtocolCodec>({ protocolVersion: 2193, context: protocolContext });

/**
 * A world with the sender, a watcher that has the sender on screen, and a bystander that does
 * not. The sender holds a sword in hotbar slot 3 and nothing anywhere else.
 */
const fakeWorld = () => {
    const toSender: NetworkPacket[] = [];
    const toWatcher: NetworkPacket[] = [];
    const toBystander: NetworkPacket[] = [];
    const players: ReturnType<World['getPlayers']> = [];
    const world = stub<World>({ getPlayers: () => players });

    const inventory = new HumanInventory();
    inventory.setItem(
        3,
        new ContainerEntry({ item: new Item({ runtimeId: 0, name: 'minecraft:diamond_sword' }), count: 1 })
    );

    const connection = stub<ClientConnection>({ codec: protocolCodec });
    const senderSession = stub<PlayerSession>({
        runtimeId: 7n,
        identity: identityNamed('runner'),
        tracks: () => true,
        send: async (packet) => void toSender.push(packet),
        getPlayer: () => sender,
        getConnection: () => connection
    });
    const sender = storePlayerPort(
        { getInventory: () => inventory },
        {
            getName: () => 'runner',
            getRuntimeId: () => 7n,
            getWorld: () => world,
            getNetworkSession: () => senderSession
        }
    );
    const watcher = stubPlayerPort({
        getRuntimeId: () => 8n,
        getWorld: () => world,
        getNetworkSession: () =>
            stub<PlayerSession>({
                tracks: () => true,
                send: async (packet) => void toWatcher.push(packet),
                getConnection: () => connection
            })
    });
    const bystander = stubPlayerPort({
        getRuntimeId: () => 9n,
        getWorld: () => world,
        getNetworkSession: () =>
            stub<PlayerSession>({
                tracks: () => false,
                send: async (packet) => void toBystander.push(packet),
                getConnection: () => connection
            })
    });
    players.push(sender, watcher, bystander);

    const debug = vi.fn();
    const server = stub<Server>({ getLogger: () => stub<Logger>({ debug }) });

    return { senderSession, inventory, server, debug, toSender, toWatcher, toBystander };
};

/** What a client sends when it selects a hotbar slot: both slot fields name it, container 0. */
const selected = (slot: number, overrides: Partial<MobEquipmentPayload> = {}): MobEquipmentPacket =>
    new MobEquipmentPacket({
        runtimeEntityId: 0n,
        item: Item.air().toStackDescriptor(protocolContext),
        inventorySlot: slot,
        hotbarSlot: slot,
        windowId: WindowIds.INVENTORY,
        ...overrides
    });

describe('MobEquipmentHandler', () => {
    it('moves the hand to the selected hotbar slot', async () => {
        const { senderSession, inventory, server } = fakeWorld();

        await new MobEquipmentHandler().handle(selected(3), server, senderSession);

        expect(inventory.getHandSlotIndex()).toBe(3);
        expect(inventory.getItemInHand().getName()).toBe('minecraft:diamond_sword');
    });

    it('sends nothing itself: the players that see the sender are shown the hand by the sync', async () => {
        const { senderSession, server, toSender, toWatcher, toBystander } = fakeWorld();
        // The client claims to hold a block it was never given, which nobody is told about.
        const packet = selected(3, {
            item: new Item({ runtimeId: 0, name: 'minecraft:bedrock' }).toStackDescriptor(protocolContext)
        });

        await new MobEquipmentHandler().handle(packet, server, senderSession);

        expect(toSender).toHaveLength(0);
        expect(toWatcher).toHaveLength(0);
        expect(toBystander).toHaveLength(0);
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
