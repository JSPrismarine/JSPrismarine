/**
 * The parts of a `ComplexInventoryTransaction`, as the wire carries them.
 *
 * Everything here is the byte layout and nothing is the server's model of an item: a stack
 * travels as the `NetworkItemStackDescriptor` fields, and whichever item a number names is
 * resolved by whoever holds an item table. `PlayerAuthInputPacket` carries the use-item half
 * of this inside itself, which is why the reader and writer pair for that body is exported
 * on its own rather than being folded into the transaction body.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/inventory-transaction-packet/}
 */
import { Vector3 } from '@jsprismarine/math';

import { NetworkUtil } from '../networkUtil';
import { readItemStackDescriptor, writeItemStackDescriptor } from './ItemStackDescriptor';

import type BinaryStream from '@jsprismarine/binaryutils';
import type { ItemStackDescriptorData } from './ItemStackDescriptor';

/**
 * The Transaction variant index, the docs' `ComplexInventoryTransaction::Type`.
 *
 * It selects which body follows the Actions list. Normal and Mismatch have no body of
 * their own. A 2193 client moves items between slots through `ItemStackRequestPacket`, so
 * what it still sends here is `USE_ITEM`, `USE_ITEM_ON_ENTITY` and `RELEASE_ITEM`.
 */
export enum TransactionType {
    NORMAL,
    MISMATCH,
    USE_ITEM,
    USE_ITEM_ON_ENTITY,
    RELEASE_ITEM
}

/** Which hand an item was used from. The docs' `HandSlot`. */
export enum HandSlot {
    MAINHAND,
    OFFHAND
}

/** What the client did with the item in hand in `ItemUseInventoryTransaction`. */
export enum ItemUseActionType {
    /** Clicked a block with the item. */
    PLACE,
    /** Clicked the air with the item. */
    USE,
    /** Broke a block. */
    DESTROY,
    /** Swung at nothing in particular. */
    USE_AS_ATTACK = 3
}

/** What the client meant by clicking an entity in `ItemUseOnActorInventoryTransaction`. */
export enum ItemUseOnActorActionType {
    /** Right-clicked the entity for its regular interaction. */
    INTERACT,
    /** Hit the entity. */
    ATTACK,
    /** Used the held item directly on the entity, as with spawn eggs. */
    ITEM_INTERACT
}

/** Why the client let go of a held item in `ItemReleaseInventoryTransaction`. */
export enum ItemReleaseActionType {
    /** A bow fired, or a held item was let go of. */
    RELEASE,
    /** A crossbow finished charging. */
    USE
}

/**
 * The docs' `InventorySourceType`: which inventory an action's slot belongs to.
 *
 * The docs name five: Container Inventory, Global Inventory, World Interaction, Creative
 * Inventory and Non Implemented Feature TODO. Every member is a wire value; a source the
 * client sends that is not one of these stays on the action as the number it was.
 */
export enum InventorySourceType {
    /** Container Inventory. */
    CONTAINER,
    /** Global Inventory. */
    GLOBAL,
    /** World Interaction. */
    WORLD,
    /** Creative Inventory. */
    CREATIVE,
    /**
     * Non Implemented Feature TODO.
     *
     * The 2193 docs page lists this as 4 because the schema carries no values and the page
     * numbers such members in order. The 2207 page's changelog "changes" it to 99999, the
     * value gophertunnel and PocketMine have read and written at every protocol, and the one
     * the client sends.
     */
    NON_IMPLEMENTED_TODO = 99999
}

/**
 * The docs' runtime constraint on the Actions list: "Verify that the number of
 * InventoryActions does not exceed 100". The reader refuses a longer list before
 * allocating it.
 */
export const MAX_INVENTORY_ACTIONS = 100;

/**
 * The docs' validity rule for a Legacy Request ID: negative and even. Zero means no request,
 * and the Legacy Set Item Slots list is only on the wire when the id is valid.
 * @param legacyRequestId - The `Legacy Request ID` as read or as about to be written.
 * @returns Whether the slot list travels with it.
 */
export const hasLegacyRequest = (legacyRequestId: number): boolean =>
    legacyRequestId < -1 && (legacyRequestId & 1) === 0;

/**
 * One of the docs' Legacy Set Item Slots: a Container Enum (uint8) and its Slots
 * (varuint count, then one uint8 per slot).
 *
 * The client sends these alongside a valid Legacy Request ID to say which open containers and
 * slots the request touches.
 */
export class LegacySlotChange {
    /**
     * Creates one entry.
     * @param containerId - Container Enum.
     * @param slots - The Slots the request touches.
     */
    public constructor(
        public containerId: number,
        public slots: number[]
    ) {}

    /**
     * Reads one entry in the docs' order: Container Enum, then the Slots list.
     * @param stream - The stream positioned at the Container Enum.
     * @returns The entry.
     */
    public static fromNetwork(stream: BinaryStream): LegacySlotChange {
        const containerId = stream.readByte();
        const slotCount = stream.readUnsignedVarInt();
        const slots = Array.from(stream.read(slotCount));
        return new LegacySlotChange(containerId, slots);
    }

    /**
     * The mirror of {@link LegacySlotChange.fromNetwork}.
     * @param stream - The stream to append to.
     */
    public toNetwork(stream: BinaryStream): void {
        stream.writeByte(this.containerId);
        stream.writeUnsignedVarInt(this.slots.length);
        stream.write(Buffer.from(this.slots));
    }
}

/**
 * One of the docs' Actions: a slot that changes, with the stack it held before and after.
 *
 * Wire order is Source Type (varuint), Container ID (optional int8), Bit Flags (optional
 * varuint), Slot (varuint), From Item, To Item. The two optionals each carry their own
 * presence byte.
 */
export interface InventoryActionData {
    /** The docs' Source Type, as read. An {@link InventorySourceType} when the client sent a known one. */
    sourceType: number;
    /** Container ID, a single signed byte where it used to be a varint. */
    windowId: number | null;
    /** Bit Flags. */
    sourceFlags: number | null;
    /** Slot. */
    targetSlot: number;
    /** From Item. */
    oldItem: ItemStackDescriptorData;
    /** To Item. */
    newItem: ItemStackDescriptorData;
}

/**
 * Reads one action.
 *
 * The Container ID and the Bit Flags are each an optional with its own presence byte. Up
 * to protocol 748 the reader inferred their presence from the Source Type. The client still
 * sets each byte by that rule (a container has a Container ID, the world has Bit Flags),
 * but the byte is what is on the wire, and a reader that infers instead of reading is one
 * field off as soon as the two disagree.
 * @param stream - The stream positioned at the Source Type.
 * @returns The action's six fields.
 */
export const readInventoryAction = (stream: BinaryStream): InventoryActionData => ({
    sourceType: stream.readUnsignedVarInt(),
    windowId: stream.readBoolean() ? stream.readSignedByte() : null,
    sourceFlags: stream.readBoolean() ? stream.readUnsignedVarInt() : null,
    targetSlot: stream.readUnsignedVarInt(),
    oldItem: readItemStackDescriptor(stream),
    newItem: readItemStackDescriptor(stream)
});

/**
 * The mirror of {@link readInventoryAction}.
 * @param stream - The stream to append to.
 * @param action - The action to write.
 */
export const writeInventoryAction = (stream: BinaryStream, action: InventoryActionData): void => {
    stream.writeUnsignedVarInt(action.sourceType);
    stream.writeBoolean(action.windowId !== null);
    if (action.windowId !== null) stream.writeSignedByte(action.windowId);
    stream.writeBoolean(action.sourceFlags !== null);
    if (action.sourceFlags !== null) stream.writeUnsignedVarInt(action.sourceFlags);
    stream.writeUnsignedVarInt(action.targetSlot);
    writeItemStackDescriptor(stream, action.oldItem);
    writeItemStackDescriptor(stream, action.newItem);
};

/** Which transaction body a packet carries; the field every reader narrows on. */
export type TransactionKind = 'useItem' | 'useItemOnEntity' | 'releaseItem';

/** The fields every transaction body shares. The docs call them Action Type, Slot and Item. */
export interface TransactionData<TItem = ItemStackDescriptorData> {
    kind: TransactionKind;
    actionType: number;
    hotbarSlot: number;
    itemInHand: TItem;
}

/**
 * The docs' `ItemUseInventoryTransaction`: the item in hand used on a block or on nothing.
 *
 * Wire order is Action Type (varint), Trigger Type (uint8), Position (BlockPos), Face (uint8),
 * Slot (varint), Hand (uint8), Item, From Position (Vec3), Click Position (Vec3), Target Block
 * Id (varuint), Client Interact Prediction (uint8), Client Cooldown State (uint8).
 */
export interface UseItemData<TItem = ItemStackDescriptorData> extends TransactionData<TItem> {
    kind: 'useItem';
    /** The docs' Trigger Type: 1 for the player's own input, 2 for a held input replayed each tick. */
    triggerType: number;
    /** The docs' Position: the block that was clicked. */
    blockPosition: Vector3;
    /** The docs' Face. */
    blockFace: number;
    /** Which hand the item was in. Added at 2193. */
    hand: HandSlot;
    /** The docs' From Position: where the player stood when sending this. */
    playerPosition: Vector3;
    /** The docs' Click Position: where on the block face the click landed. */
    clickPosition: Vector3;
    /** The docs' Target Block Id: the runtime id of the clicked block's state. */
    blockRuntimeId: number;
    /** What the client has already drawn on its own screen, expecting the server to agree. */
    clientInteractPrediction: number;
    /** Whether the client thinks the item is on cooldown. */
    clientCooldownState: number;
}

/**
 * The docs' `ItemUseOnActorInventoryTransaction`: the item in hand used on an entity.
 *
 * Wire order is Runtime Id (varuint64), Action Type (varint), Slot (varint), Item, From
 * Position (Vec3), Hit Position (Vec3). Protocol 2225 inserts the packet-level Hand between
 * the slot and the item.
 */
export interface UseItemOnEntityData<TItem = ItemStackDescriptorData> extends TransactionData<TItem> {
    kind: 'useItemOnEntity';
    /** The docs' Runtime Id: the entity that was clicked. */
    entityRuntimeId: bigint;
    /** The docs' From Position: where the player stood when sending this. */
    playerPosition: Vector3;
    /** The docs' Hit Position: where on the entity the click landed. */
    clickPosition: Vector3;
}

/**
 * The docs' `ItemReleaseInventoryTransaction`: a held item let go of, such as a bow firing.
 *
 * Wire order is Action Type (varint), Slot (varint), Item, From Position (Vec3). Protocol
 * 2225 appends the packet-level Hand after the position.
 */
export interface ReleaseItemData<TItem = ItemStackDescriptorData> extends TransactionData<TItem> {
    kind: 'releaseItem';
    /** The docs' From Position: where the player stood when sending this. */
    playerPosition: Vector3;
}

/**
 * Reads the body of a use-item transaction: everything after the Actions.
 *
 * Shared with `PlayerAuthInputPacket`, which carries the same transaction inside itself when
 * the client used an item in the same tick it moved. The two packets differ only in what
 * surrounds this. Property order is read order, so these lines are the wire layout.
 * @param stream - The stream positioned at the Action Type.
 * @returns The body's twelve fields.
 */
export const readUseItemData = (stream: BinaryStream): UseItemData => ({
    kind: 'useItem',
    actionType: stream.readVarInt(),
    triggerType: stream.readByte(),
    blockPosition: NetworkUtil.readBlockPosition(stream),
    blockFace: stream.readByte(),
    hotbarSlot: stream.readVarInt(),
    hand: stream.readByte(),
    itemInHand: readItemStackDescriptor(stream),
    playerPosition: new Vector3(stream.readFloatLE(), stream.readFloatLE(), stream.readFloatLE()),
    clickPosition: new Vector3(stream.readFloatLE(), stream.readFloatLE(), stream.readFloatLE()),
    blockRuntimeId: stream.readUnsignedVarInt(),
    clientInteractPrediction: stream.readByte(),
    clientCooldownState: stream.readByte()
});

/**
 * The mirror of {@link readUseItemData}.
 * @param stream - The stream to append to.
 * @param data - The body to write.
 */
export const writeUseItemData = (stream: BinaryStream, data: UseItemData): void => {
    stream.writeVarInt(data.actionType);
    stream.writeByte(data.triggerType);
    NetworkUtil.writeBlockPosition(stream, data.blockPosition);
    stream.writeByte(data.blockFace);
    stream.writeVarInt(data.hotbarSlot);
    stream.writeByte(data.hand);
    writeItemStackDescriptor(stream, data.itemInHand);
    NetworkUtil.writeVector3(stream, data.playerPosition);
    NetworkUtil.writeVector3(stream, data.clickPosition);
    stream.writeUnsignedVarInt(data.blockRuntimeId);
    stream.writeByte(data.clientInteractPrediction);
    stream.writeByte(data.clientCooldownState);
};

/** The `Legacy Request ID` and the slot list whose presence its validity decides. */
export interface LegacyTransactionRequest {
    legacyRequestId: number;
    legacySlotChanges: LegacySlotChange[];
}

/** The variant index, the actions, and the body the variant selects, as one value. */
export interface TransactionPayload<TItem = ItemStackDescriptorData> {
    /** The variant index as read, a {@link TransactionType} when the client sent a known one. */
    transactionType: number;
    inventoryActions: InventoryActionData[];
    /** The body the type selects. Null for Normal, Mismatch and an unknown type. */
    transactionData: UseItemData<TItem> | UseItemOnEntityData<TItem> | ReleaseItemData<TItem> | null;
    /** The packet-level `Hand` the 2225 bodies carry; `HandSlot.MAINHAND` before that. */
    hand: number;
}
