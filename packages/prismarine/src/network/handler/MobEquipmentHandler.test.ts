import { WindowIds } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import { Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';
import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it, vi } from 'vitest';

import type { EntityRuntime } from '../../entity/data/EntityRuntime';
import { PlayerComponents } from '../../entity/playerComponents';
import ContainerEntry from '../../inventory/ContainerEntry';
import HumanInventory from '../../inventory/HumanInventory';
import { Item } from '../../item/Item';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stubPlayerPort } from '../../testing/playerPort.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type { BlockMining } from '../../world/BlockMining';
import { blockMiningOf, playerMiningOf } from '../../world/BlockMining';
import type { World } from '../../world/World';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import type { ProtocolContext } from '@jsprismarine/protocol';
import { MobEquipmentPacket } from '@jsprismarine/protocol';
import type { MobEquipmentPayload } from '@jsprismarine/protocol';
import type ClientConnection from '../ClientConnection';
import type { ProtocolCodec } from '@jsprismarine/protocol';
import type PlayerSession from '../PlayerSession';
import MobEquipmentHandler from './MobEquipmentHandler';

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
    const players: PlayerSession[] = [];
    /** Every crack restart the world was asked for. */
    const cracking: string[] = [];
    const world = stub<World>({
        getViewers: () => players,
        stopBlockCracking: () => void cracking.push('stop'),
        startBlockCracking: (position, face, tool, previous) => {
            cracking.push(`start ${tool?.getName() ?? 'hand'} (${previous === null ? 'fresh' : 'continued'})`);
            return { position, face, runtimeId: 1, progressPerTick: 100, breakTicks: 600, startedAt: 50 };
        }
    });

    const inventory = new HumanInventory();
    inventory.setItem(
        3,
        new ContainerEntry({ item: new Item({ runtimeId: 0, name: 'minecraft:diamond_sword' }), count: 1 })
    );

    const connection = stub<ClientConnection>({ codec: protocolCodec });
    /** What the sender is mining, which the store player keeps. */
    const components = new PlayerComponents(new Attributes(Attributes.getPlayerDefaults()), () => {});
    const sender = stubPlayerPort({ getInventory: () => inventory, getComponents: () => components });
    // The runtime's answer for a player in no store: the mining lands on the components.
    const inputs = stub<EntityRuntime>({
        setPlayerMining: (_player, mining) => components.set('mining.block', mining)
    });
    const senderSession = stub<PlayerSession>({
        runtimeId: 7n,
        identity: identityNamed('runner'),
        tracks: () => true,
        send: async (packet) => void toSender.push(packet),
        getPlayer: () => sender,
        getWorld: () => world,
        getConnection: () => connection,
        inputs: () => inputs
    });
    const watcher = stub<PlayerSession>({
        runtimeId: 8n,
        tracks: () => true,
        send: async (packet) => void toWatcher.push(packet),
        getConnection: () => connection
    });
    const bystander = stub<PlayerSession>({
        runtimeId: 9n,
        tracks: () => false,
        send: async (packet) => void toBystander.push(packet),
        getConnection: () => connection
    });
    players.push(senderSession, watcher, bystander);

    const debug = vi.fn();
    const { context, outputs } = inputContext(senderSession, { log: stub<Logger>({ debug }) });

    const state = {
        get mining(): BlockMining | null {
            return blockMiningOf(components.get('mining.block'));
        },
        set mining(mining: BlockMining | null) {
            components.set('mining.block', playerMiningOf(mining));
        }
    };

    return { context, outputs, inventory, debug, toSender, toWatcher, toBystander, state, cracking };
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
    /** Mining that began with whatever was in hand: 20 ticks, started at tick 10. */
    const mining = (): BlockMining => ({
        position: new Vector3(1, 64, 1),
        face: 1,
        runtimeId: 1,
        progressPerTick: 3276,
        breakTicks: 20,
        startedAt: 10
    });

    it('starts the mining over for the tool a switch puts in hand', () => {
        const { context, state, cracking } = fakeWorld();
        state.mining = mining();

        new MobEquipmentHandler().handle(selected(3), context);

        expect(cracking).toEqual(['stop', 'start minecraft:diamond_sword (fresh)']);
        expect(state.mining).toMatchObject({ breakTicks: 600, startedAt: 50 });
    });

    it('leaves the mining alone when the slot already held is reported again', () => {
        const { context, state, cracking } = fakeWorld();
        state.mining = mining();

        new MobEquipmentHandler().handle(selected(0), context);

        expect(cracking).toEqual([]);
        expect(state.mining).toMatchObject({ breakTicks: 20, startedAt: 10 });
    });

    it('moves the hand to the selected hotbar slot', () => {
        const { context, inventory } = fakeWorld();

        new MobEquipmentHandler().handle(selected(3), context);

        expect(inventory.getHandSlotIndex()).toBe(3);
        expect(inventory.getItemInHand().getName()).toBe('minecraft:diamond_sword');
    });

    it('sends nothing itself: the players that see the sender are shown the hand by the sync', () => {
        const { context, outputs, toSender, toWatcher, toBystander } = fakeWorld();
        // The client claims to hold a block it was never given, which nobody is told about.
        const packet = selected(3, {
            item: new Item({ runtimeId: 0, name: 'minecraft:bedrock' }).toStackDescriptor(protocolContext)
        });

        new MobEquipmentHandler().handle(packet, context);

        expect(toSender).toHaveLength(0);
        expect(toWatcher).toHaveLength(0);
        expect(toBystander).toHaveLength(0);
        expect(outputs).toHaveLength(0);
    });

    it('accepts an offhand report without moving the hand or relaying it', () => {
        const { context, inventory, debug, toWatcher } = fakeWorld();
        inventory.setHandSlot(3);

        new MobEquipmentHandler().handle(selected(0, { windowId: WindowIds.OFFHAND }), context);

        expect(inventory.getHandSlotIndex()).toBe(3);
        expect(toWatcher).toHaveLength(0);
        expect(debug).not.toHaveBeenCalled();
    });

    it.each([WindowIds.ARMOR, WindowIds.PLAYER_ONLY_UI, 1, 255])('drops a report for container %i', (windowId) => {
        const { context, inventory, debug, toWatcher } = fakeWorld();

        new MobEquipmentHandler().handle(selected(2, { windowId }), context);

        expect(inventory.getHandSlotIndex()).toBe(0);
        expect(toWatcher).toHaveLength(0);
        expect(debug).toHaveBeenCalledOnce();
    });

    it.each([9, 35, 255])('drops a selected slot of %i, which is outside the hotbar', (slot) => {
        const { context, inventory, debug, toWatcher } = fakeWorld();

        new MobEquipmentHandler().handle(selected(slot), context);

        expect(inventory.getHandSlotIndex()).toBe(0);
        expect(toWatcher).toHaveLength(0);
        expect(debug).toHaveBeenCalledOnce();
    });

    it('drops a hotbar selection whose slot field is outside the hotbar', () => {
        const { context, inventory, debug, toWatcher } = fakeWorld();

        new MobEquipmentHandler().handle(selected(2, { inventorySlot: 40 }), context);

        expect(inventory.getHandSlotIndex()).toBe(0);
        expect(toWatcher).toHaveLength(0);
        expect(debug).toHaveBeenCalledOnce();
    });
});
