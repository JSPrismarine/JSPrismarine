import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { assert, describe, expect, it } from 'vitest';

import { Item } from '../../item/Item';
import BlockPosition from '../../world/BlockPosition';
import InventoryTransactionPacket, {
    InventorySourceType,
    HandSlot,
    InventoryAction,
    LegacySlotChange,
    MAX_INVENTORY_ACTIONS,
    ItemReleaseActionType,
    TransactionType,
    ItemUseActionType,
    ItemUseOnActorActionType
} from './InventoryTransactionPacket';

/**
 * The eight zero bytes of an empty `NetworkItemStackDescriptor`: Id (int16), Stack size
 * (uint16), Aux value (varuint), no Net Id Variant (one byte), Block Runtime Id (varuint) and
 * an empty User Data Buffer (its varuint length).
 */
const AIR = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

/** A little-endian float, as the docs' `Vec3` components are written. */
const floatLE = (value: number): number[] => Array.from(new Uint8Array(new Float32Array([value]).buffer));

/**
 * A transaction as a client writes it, built from the layout rather than from the reader.
 *
 * Protocol 2193's, from gophertunnel's `packet/inventory_transaction.go` and
 * `protocol/inventory.go`. The two things worth writing down by hand are the ones that have
 * changed: there is exactly one presence byte before the legacy slot list and none before
 * the type or the actions, and each action carries its window id and its flags as optionals
 * with presence bytes of their own.
 */
const noLegacyRequest = (out: BinaryStream): void => {
    out.writeVarInt(0); // Legacy request id: zero, no request.
    out.writeBoolean(false); // So no legacy slot changes.
};

const transaction = (
    type: TransactionType,
    write: (out: BinaryStream) => void,
    writeLegacyRequest: (out: BinaryStream) => void = noLegacyRequest
): Buffer => {
    const out = new BinaryStream();
    out.writeUnsignedVarInt(0x1e); // Header.
    writeLegacyRequest(out);
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
                out.writeVarInt(ItemUseActionType.DESTROY);
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

        const data = packet.transactionData;
        assert(data?.kind === 'useItem');
        expect(packet.transactionType).toBe(TransactionType.USE_ITEM);
        expect(data.actionType).toBe(ItemUseActionType.DESTROY);
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
                out.writeUnsignedVarInt(InventorySourceType.CONTAINER);
                out.writeBoolean(true);
                out.writeSignedByte(-1);
                out.writeBoolean(false);
                out.writeUnsignedVarInt(3); // Slot.
                Item.air().networkSerialize(out);
                Item.air().networkSerialize(out);
                // Into the world: flags, no window id.
                out.writeUnsignedVarInt(InventorySourceType.WORLD);
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
            sourceType: InventorySourceType.CONTAINER,
            windowId: -1,
            sourceFlags: null,
            targetSlot: 3
        });
        expect(packet.inventoryActions[1]).toMatchObject({
            sourceType: InventorySourceType.WORLD,
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
                out.writeVarInt(ItemUseOnActorActionType.ATTACK);
                out.writeVarInt(0);
                Item.air().networkSerialize(out);
                for (let i = 0; i < 6; i++) out.writeFloatLE(i);
            })
        );

        const data = packet.transactionData;
        assert(data?.kind === 'useItemOnEntity');
        expect(data.entityRuntimeId).toBe(42n);
        expect(data.actionType).toBe(ItemUseOnActorActionType.ATTACK);
        expect(data.clickPosition.getZ()).toBe(5);
        expect(packet.feof()).toBe(true);
    });

    it('reads a release: the item, then the player position the docs call From Position', () => {
        const packet = decode(
            transaction(TransactionType.RELEASE_ITEM, (out) => {
                out.writeUnsignedVarInt(0); // No actions.
                out.writeVarInt(0); // Action type: release.
                out.writeVarInt(3); // Hotbar slot.
                Item.air().networkSerialize(out);
                out.writeFloatLE(1.5); // From position.
                out.writeFloatLE(64);
                out.writeFloatLE(-2.25);
            })
        );

        const data = packet.transactionData;
        assert(data?.kind === 'releaseItem');
        expect(packet.transactionType).toBe(TransactionType.RELEASE_ITEM);
        expect(data.actionType).toBe(0);
        expect(data.hotbarSlot).toBe(3);
        expect(data.playerPosition.getX()).toBe(1.5);
        expect(data.playerPosition.getY()).toBe(64);
        expect(data.playerPosition.getZ()).toBe(-2.25);
        expect(packet.feof()).toBe(true);
    });

    it('reads the legacy set item slots that a valid request id carries', () => {
        const packet = decode(
            transaction(
                TransactionType.NORMAL,
                (out) => out.writeUnsignedVarInt(0), // No actions.
                (out) => {
                    out.writeVarInt(-2); // Legacy request id: negative and even, so valid.
                    out.writeBoolean(true);
                    out.writeUnsignedVarInt(1); // One legacy set slot.
                    out.writeByte(12); // Container enum: CombinedHotbarAndInventoryContainer.
                    out.writeUnsignedVarInt(2); // Two slots.
                    out.writeByte(0);
                    out.writeByte(9);
                }
            )
        );

        expect(packet.legacyRequestId).toBe(-2);
        expect(packet.legacySlotChanges).toEqual([new LegacySlotChange(12, [0, 9])]);
        expect(packet.inventoryActions).toHaveLength(0);
        expect(packet.feof()).toBe(true);
    });

    it('writes the legacy slot list presence from the request id, not from the list', () => {
        const encode = (legacyRequestId: number): number[] => {
            const packet = new InventoryTransactionPacket();
            packet.legacyRequestId = legacyRequestId;
            packet.legacySlotChanges = [];
            packet.transactionType = TransactionType.NORMAL;
            packet.inventoryActions = [];
            packet.encode();
            return Array.from(packet.getBuffer());
        };

        // Header, -2 as ZigZag 3, presence 0x01, an empty slot list, Normal, no actions.
        expect(encode(-2)).toEqual([0x1e, 0x03, 0x01, 0x00, 0x00, 0x00]);
        // Zero is no request: presence 0x00 and no list.
        expect(encode(0)).toEqual([0x1e, 0x00, 0x00, 0x00, 0x00]);
        // Odd negatives are not valid either; -1 is ZigZag 1.
        expect(encode(-1)).toEqual([0x1e, 0x01, 0x00, 0x00, 0x00]);
    });

    it('writes a release the way it reads one', () => {
        const packet = new InventoryTransactionPacket();
        packet.legacyRequestId = 0;
        packet.legacySlotChanges = [];
        packet.transactionType = TransactionType.RELEASE_ITEM;
        packet.inventoryActions = [];
        packet.transactionData = {
            kind: 'releaseItem',
            actionType: 0,
            hotbarSlot: 4,
            itemInHand: Item.air(),
            playerPosition: new Vector3(3, 70, -5)
        };
        packet.encode();

        const read = decode(packet.getBuffer());
        const data = read.transactionData;
        assert(data?.kind === 'releaseItem');

        expect(data.hotbarSlot).toBe(4);
        expect(data.playerPosition.getY()).toBe(70);
        expect(data.playerPosition.getZ()).toBe(-5);
        expect(read.feof()).toBe(true);
    });

    it('writes what it reads', () => {
        const packet = new InventoryTransactionPacket();
        packet.legacyRequestId = 0;
        packet.legacySlotChanges = [];
        packet.transactionType = TransactionType.USE_ITEM;
        packet.inventoryActions = [new InventoryAction(InventorySourceType.WORLD, null, 0, 0, Item.air(), Item.air())];
        packet.transactionData = {
            kind: 'useItem',
            actionType: ItemUseActionType.PLACE,
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
        const data = read.transactionData;
        assert(data?.kind === 'useItem');

        expect(read.inventoryActions).toHaveLength(1);
        expect(read.inventoryActions[0]).toMatchObject({ sourceFlags: 0 });
        expect(data.blockPosition.getY()).toBe(-64);
        expect(data.hand).toBe(HandSlot.OFFHAND);
        expect(data.hotbarSlot).toBe(8);
        expect(read.feof()).toBe(true);
    });

    it('refuses an item use with bytes left over, rather than acting on a guess', () => {
        const buffer = transaction(TransactionType.USE_ITEM, (out) => {
            out.writeUnsignedVarInt(0);
            out.writeVarInt(ItemUseActionType.DESTROY);
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

    it('reads an attack from bytes written by hand, in the docs order', () => {
        // Header 30; Legacy Request ID 0; no Legacy Set Item Slots; variant 3 (ItemUseOnActor);
        // no Actions; Runtime Id 42 (varuint64); Action Type Attack (1, ZigZag 2); Slot 4
        // (ZigZag 8); the Item; From Position (1, 64, -2); Hit Position (0, 1.5, 0).
        const packet = decode(
            Buffer.from([
                0x1e,
                0x00,
                0x00,
                0x03,
                0x00,
                0x2a,
                0x02,
                0x08,
                ...AIR,
                ...floatLE(1),
                ...floatLE(64),
                ...floatLE(-2),
                ...floatLE(0),
                ...floatLE(1.5),
                ...floatLE(0)
            ])
        );

        const data = packet.transactionData;
        assert(data?.kind === 'useItemOnEntity');
        expect(packet.transactionType).toBe(TransactionType.USE_ITEM_ON_ENTITY);
        expect(data.entityRuntimeId).toBe(42n);
        expect(data.actionType).toBe(ItemUseOnActorActionType.ATTACK);
        expect(data.hotbarSlot).toBe(4);
        expect(data.itemInHand.getName()).toBe('minecraft:air');
        expect(data.playerPosition).toEqual(new Vector3(1, 64, -2));
        expect(data.clickPosition).toEqual(new Vector3(0, 1.5, 0));
        expect(packet.feof()).toBe(true);
    });

    it('writes a release byte for byte as the docs lay it out', () => {
        const packet = new InventoryTransactionPacket();
        packet.legacyRequestId = 0;
        packet.legacySlotChanges = [];
        packet.transactionType = TransactionType.RELEASE_ITEM;
        packet.inventoryActions = [];
        packet.transactionData = {
            kind: 'releaseItem',
            actionType: ItemReleaseActionType.USE,
            hotbarSlot: 3,
            itemInHand: Item.air(),
            playerPosition: new Vector3(0.5, 70, -0.5)
        };
        packet.encode();

        // Header; request id 0; no slots; variant 4; no actions; Use (1, ZigZag 2); slot 3
        // (ZigZag 6); the Item; From Position.
        expect(Array.from(packet.getBuffer())).toEqual([
            0x1e,
            0x00,
            0x00,
            0x04,
            0x00,
            0x02,
            0x06,
            ...AIR,
            ...floatLE(0.5),
            ...floatLE(70),
            ...floatLE(-0.5)
        ]);
    });

    it('keeps a variant index it does not know, and stops reading after the actions', () => {
        const packet = decode(
            transaction(7, (out) => {
                out.writeUnsignedVarInt(0); // No actions.
                out.write(Buffer.from([0xde, 0xad, 0xbe, 0xef])); // A body of a shape nobody knows.
            })
        );

        expect(packet.transactionType).toBe(7);
        expect(packet.transactionData).toBeNull();
        expect(packet.inventoryActions).toEqual([]);
    });

    it('refuses to write a variant index it does not know', () => {
        const packet = new InventoryTransactionPacket();
        packet.legacyRequestId = 0;
        packet.legacySlotChanges = [];
        packet.transactionType = 7;
        packet.inventoryActions = [];

        expect(() => packet.encode()).toThrow(TypeError);
    });

    it('refuses more actions than the docs allow, rather than allocating for them', () => {
        const buffer = transaction(TransactionType.NORMAL, (out) => {
            out.writeUnsignedVarInt(MAX_INVENTORY_ACTIONS + 1);
        });

        expect(() => decode(buffer)).toThrow(RangeError);
        expect(() => decode(buffer)).toThrow(/101 actions/);
    });
});
