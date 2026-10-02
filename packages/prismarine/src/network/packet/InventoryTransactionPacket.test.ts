import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import { Item } from '../../item/Item';
import BlockPosition from '../../world/BlockPosition';
import InventoryTransactionPacket, {
    ActionSource,
    HandSlot,
    InventoryAction,
    TransactionType,
    UseItemAction,
    UseItemOnEntityAction
} from './InventoryTransactionPacket';

import type { UseItemData, UseItemOnEntityData } from './InventoryTransactionPacket';

/**
 * A transaction as a client writes it, built from the layout rather than from the reader.
 *
 * Protocol 2193's, from gophertunnel's `packet/inventory_transaction.go` and
 * `protocol/inventory.go`. The two things worth writing down by hand are the ones that have
 * changed: there is exactly one presence byte before the legacy slot list and none before
 * the type or the actions, and each action carries its window id and its flags as optionals
 * with presence bytes of their own.
 */
const transaction = (type: TransactionType, write: (out: BinaryStream) => void): Buffer => {
    const out = new BinaryStream();
    out.writeUnsignedVarInt(0x1e); // Header.
    out.writeVarInt(0); // Legacy request id.
    out.writeBoolean(false); // No legacy slot changes.
    out.writeUnsignedVarInt(type);
    write(out);
    return out.getBuffer();
};

const decode = (buffer: Buffer): InventoryTransactionPacket => {
    const packet = new InventoryTransactionPacket(buffer);
    packet.decode();
    return packet;
};

describe('InventoryTransactionPacket', () => {
    it('reads a block being broken: an item use with the hand 2193 added', () => {
        const packet = decode(
            transaction(TransactionType.USE_ITEM, (out) => {
                out.writeUnsignedVarInt(0); // No actions.
                out.writeVarInt(UseItemAction.BREAK_BLOCK);
                out.writeByte(1); // Trigger: player input.
                out.writeVarInt(10); // Block position, signed.
                out.writeVarInt(-30);
                out.writeVarInt(7);
                out.writeByte(4); // Face.
                out.writeVarInt(2); // Hotbar slot.
                out.writeByte(HandSlot.MAINHAND);
                Item.air().networkSerialize(out);
                out.writeFloatLE(10.5); // Player position.
                out.writeFloatLE(-28.4);
                out.writeFloatLE(7.5);
                out.writeFloatLE(0.5); // Click position.
                out.writeFloatLE(0.5);
                out.writeFloatLE(1);
                out.writeUnsignedVarInt(123456); // Block runtime id.
                out.writeByte(1); // Prediction: success.
                out.writeByte(0); // Cooldown: off.
            })
        );

        const data = packet.transactionData as UseItemData;
        expect(packet.transactionType).toBe(TransactionType.USE_ITEM);
        expect(data.actionType).toBe(UseItemAction.BREAK_BLOCK);
        expect(data.blockPosition.getY()).toBe(-30);
        expect(data.blockFace).toBe(4);
        expect(data.hand).toBe(HandSlot.MAINHAND);
        expect(data.blockRuntimeId).toBe(123456);
        expect(data.clientCooldownState).toBe(0);
        expect(packet.feof()).toBe(true);
    });

    it('reads an action with its window id and flags as optionals', () => {
        const packet = decode(
            transaction(TransactionType.NORMAL, (out) => {
                out.writeUnsignedVarInt(2);
                // From a container: a window id, no flags.
                out.writeUnsignedVarInt(ActionSource.CONTAINER);
                out.writeBoolean(true);
                out.writeSignedByte(-1);
                out.writeBoolean(false);
                out.writeUnsignedVarInt(3); // Slot.
                Item.air().networkSerialize(out);
                Item.air().networkSerialize(out);
                // Into the world: flags, no window id.
                out.writeUnsignedVarInt(ActionSource.WORLD);
                out.writeBoolean(false);
                out.writeBoolean(true);
                out.writeUnsignedVarInt(0);
                out.writeUnsignedVarInt(0);
                Item.air().networkSerialize(out);
                Item.air().networkSerialize(out);
            })
        );

        expect(packet.inventoryActions).toHaveLength(2);
        expect(packet.inventoryActions[0]).toMatchObject({
            sourceType: ActionSource.CONTAINER,
            windowId: -1,
            sourceFlags: null,
            targetSlot: 3
        });
        expect(packet.inventoryActions[1]).toMatchObject({
            sourceType: ActionSource.WORLD,
            windowId: null,
            sourceFlags: 0
        });
        expect(packet.feof()).toBe(true);
    });

    it('reads an attack', () => {
        const packet = decode(
            transaction(TransactionType.USE_ITEM_ON_ENTITY, (out) => {
                out.writeUnsignedVarInt(0);
                out.writeUnsignedVarLong(42n);
                out.writeVarInt(UseItemOnEntityAction.ATTACK);
                out.writeVarInt(0);
                Item.air().networkSerialize(out);
                for (let i = 0; i < 6; i++) out.writeFloatLE(i);
            })
        );

        const data = packet.transactionData as UseItemOnEntityData;
        expect(data.entityRuntimeId).toBe(42n);
        expect(data.actionType).toBe(UseItemOnEntityAction.ATTACK);
        expect(data.clickPosition.getZ()).toBe(5);
        expect(packet.feof()).toBe(true);
    });

    it('writes what it reads', () => {
        const packet = new InventoryTransactionPacket();
        packet.legacyRequestId = 0;
        packet.legacySlotChanges = [];
        packet.transactionType = TransactionType.USE_ITEM;
        packet.inventoryActions = [new InventoryAction(ActionSource.WORLD, null, 0, 0, Item.air(), Item.air())];
        packet.transactionData = <UseItemData>{
            actionType: UseItemAction.CLICK_BLOCK,
            triggerType: 1,
            blockPosition: new BlockPosition(-1, -64, 1),
            blockFace: 1,
            hotbarSlot: 8,
            hand: HandSlot.OFFHAND,
            itemInHand: Item.air(),
            playerPosition: new Vector3(0, 1, 2),
            clickPosition: new Vector3(0.5, 1, 0.5),
            blockRuntimeId: 7,
            clientInteractPrediction: 1,
            clientCooldownState: 0
        };
        packet.encode();

        const read = decode(packet.getBuffer());
        const data = read.transactionData as UseItemData;

        expect(read.inventoryActions).toHaveLength(1);
        expect(read.inventoryActions[0]!.sourceFlags).toBe(0);
        expect(data.blockPosition.getY()).toBe(-64);
        expect(data.hand).toBe(HandSlot.OFFHAND);
        expect(data.hotbarSlot).toBe(8);
        expect(read.feof()).toBe(true);
    });

    it('refuses an item use with bytes left over, rather than acting on a guess', () => {
        const buffer = transaction(TransactionType.USE_ITEM, (out) => {
            out.writeUnsignedVarInt(0);
            out.writeVarInt(UseItemAction.BREAK_BLOCK);
            out.writeByte(1);
            out.writeVarInt(0);
            out.writeVarInt(0);
            out.writeVarInt(0);
            out.writeByte(0);
            out.writeVarInt(0);
            out.writeByte(0);
            Item.air().networkSerialize(out);
            for (let i = 0; i < 6; i++) out.writeFloatLE(0);
            out.writeUnsignedVarInt(0);
            out.writeByte(0);
            out.writeByte(0);
            out.writeByte(0); // One byte too many.
        });

        expect(() => decode(buffer)).toThrow(/1 bytes unread/);
    });
});
