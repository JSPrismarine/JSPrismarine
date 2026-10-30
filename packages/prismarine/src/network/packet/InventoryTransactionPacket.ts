import { layoutAt } from '@jsprismarine/protocol';
import { inventoryTransactionPacket } from '@jsprismarine/protocol/wire/definitions/inventoryTransaction';
import {
    readInventoryAction,
    readUseItemData as readWireUseItemData,
    writeInventoryAction,
    writeUseItemData as writeWireUseItemData
} from '@jsprismarine/protocol/wire/structures/InventoryTransaction';
import type { LegacySlotChange, TransactionType } from '@jsprismarine/protocol/wire/structures/InventoryTransaction';
import { HandSlot } from '@jsprismarine/protocol/wire/structures/InventoryTransaction';
import { Item } from '../../item/Item';
import DataPacket from './DataPacket';

import type BinaryStream from '@jsprismarine/binaryutils';
import type {
    InventoryActionData,
    LegacyTransactionRequest,
    ReleaseItemData as WireReleaseItemData,
    TransactionData as WireTransactionData,
    TransactionPayload as WireTransactionPayload,
    UseItemData as WireUseItemData,
    UseItemOnEntityData as WireUseItemOnEntityData
} from '@jsprismarine/protocol/wire/structures/InventoryTransaction';

/**
 * Re-export: the transaction's enums, its legacy slot entry and its request rule are wire
 * code and live in `@jsprismarine/protocol`. These names stay so the server's importers and
 * its handlers keep working.
 */
export {
    hasLegacyRequest,
    HandSlot,
    InventorySourceType,
    LegacySlotChange,
    MAX_INVENTORY_ACTIONS,
    TransactionType
} from '@jsprismarine/protocol/wire/structures/InventoryTransaction';
export type { LegacyTransactionRequest } from '@jsprismarine/protocol/wire/structures/InventoryTransaction';

/** The docs' `ItemUseActionType`: what the client did with the item in hand. */
export enum ItemUseActionType {
    /** Clicked a block with the item. */
    PLACE,
    /** Clicked the air with the item. */
    USE,
    /** Broke a block. */
    DESTROY,
    /** A swing with the item at nothing in particular. */
    USE_AS_ATTACK = 3
}

/**
 * The docs' `ItemUseOnActorActionType`: what a client meant by clicking on an entity.
 *
 * A melee attack arrives here rather than in `InteractPacket`. That packet carries mounting,
 * dismounting and opening a villager's trades. Everything that comes out of swinging at
 * something comes through this transaction.
 */
export enum ItemUseOnActorActionType {
    /** Right-clicked the entity for its regular interaction. */
    INTERACT,
    /** Hit it. */
    ATTACK,
    /** Used the held item directly on the entity, as with spawn eggs. */
    ITEM_INTERACT
}

/**
 * The docs' `ItemReleaseActionType`: why a held item was let go of.
 */
export enum ItemReleaseActionType {
    /** The docs' Release: a bow fired, or a held item let go of. */
    RELEASE,
    /** The docs' Use: a crossbow finished charging. */
    USE
}

/**
 * One of the docs' Actions: a slot that changes, with the item it held before and after.
 *
 * The wire form, which carries each stack as a `NetworkItemStackDescriptor`, is
 * `InventoryActionData` in `@jsprismarine/protocol`. This is the server's form: the same six
 * fields with the stacks resolved to `Item`s, converted at the stream boundary.
 */
export class InventoryAction {
    /**
     * Creates an action.
     * @param sourceType - The docs' Source Type, as read. An `InventorySourceType` when the client sent a known one.
     * @param windowId - Container ID, or `null` when the action carries none.
     * @param sourceFlags - Bit Flags, or `null` when the action carries none.
     * @param targetSlot - Slot.
     * @param oldItem - From Item.
     * @param newItem - To Item.
     */
    public constructor(
        public sourceType: number,
        public windowId: number | null,
        public sourceFlags: number | null,
        public targetSlot: number,
        public oldItem: Item,
        public newItem: Item
    ) {}

    /**
     * Reads one action off the stream and resolves its two stacks.
     * @param stream - The stream positioned at the Source Type.
     * @returns The action.
     */
    public static fromNetwork(stream: BinaryStream): InventoryAction {
        return InventoryAction.fromWire(stream, readInventoryAction(stream));
    }

    /**
     * The action a wire record describes.
     * @param stream - The stream the record came off, which names the item numbering.
     * @param action - The six wire fields.
     * @returns The action, with its stacks resolved.
     */
    public static fromWire(stream: BinaryStream, action: InventoryActionData): InventoryAction {
        return new InventoryAction(
            action.sourceType,
            action.windowId,
            action.sourceFlags,
            action.targetSlot,
            Item.fromStackDescriptor(stream, action.oldItem),
            Item.fromStackDescriptor(stream, action.newItem)
        );
    }

    /**
     * The mirror of {@link InventoryAction.fromNetwork}.
     * @param stream - The stream to append to.
     */
    public toNetwork(stream: BinaryStream): void {
        writeInventoryAction(stream, this.toWire(stream));
    }

    /**
     * This action as the wire record, with both stacks as descriptors.
     * @param stream - The stream the action is bound for, which names the item numbering.
     * @returns The six wire fields.
     */
    public toWire(stream: BinaryStream): InventoryActionData {
        return {
            sourceType: this.sourceType,
            windowId: this.windowId,
            sourceFlags: this.sourceFlags,
            targetSlot: this.targetSlot,
            oldItem: this.oldItem.toStackDescriptor(stream),
            newItem: this.newItem.toStackDescriptor(stream)
        };
    }
}

/** Which transaction body a packet carries; the field every reader narrows on. */
export type TransactionKind = WireTransactionData['kind'];

/** The fields every transaction body shares, with the stack as an `Item`. */
export type TransactionData = WireTransactionData<Item>;

/** The docs' `ItemUseInventoryTransaction`, with the stack as an `Item`. */
export type UseItemData = WireUseItemData<Item>;

/** The docs' `ItemUseOnActorInventoryTransaction`, with the stack as an `Item`. */
export type UseItemOnEntityData = WireUseItemOnEntityData<Item>;

/** The docs' `ItemReleaseInventoryTransaction`, with the stack as an `Item`. */
export type ReleaseItemData = WireReleaseItemData<Item>;

/** The variant index, the actions and the selected body, with the stacks as `Item`s. */
export interface TransactionPayload extends Omit<WireTransactionPayload<Item>, 'inventoryActions'> {
    inventoryActions: InventoryAction[];
}

/**
 * Reads the body of a use-item transaction: everything after the Actions.
 *
 * Shared with `PlayerAuthInputPacket`, which carries the same transaction inside itself when
 * the client used an item in the same tick it moved. The layout is the protocol package's;
 * this resolves the stack it read into an `Item`.
 * @param stream - The stream positioned at the Action Type.
 * @returns The body, with its stack resolved.
 */
export const readUseItemData = (stream: BinaryStream): UseItemData => {
    const data = readWireUseItemData(stream);
    return { ...data, itemInHand: Item.fromStackDescriptor(stream, data.itemInHand) };
};

/**
 * The mirror of {@link readUseItemData}.
 * @param stream - The stream to append to.
 * @param data - The body to write.
 */
export const writeUseItemData = (stream: BinaryStream, data: UseItemData): void => {
    writeWireUseItemData(stream, { ...data, itemInHand: data.itemInHand.toStackDescriptor(stream) });
};

/**
 * Packet 30. The client's item use, attack, release or container move.
 *
 * Wire order at protocol 2193: Legacy Request ID (varint), Legacy Set Item Slots (presence
 * byte, then a varuint count and one {@link LegacySlotChange} each), the Transaction variant
 * index (varuint, {@link TransactionType}), Actions (varuint count and one
 * {@link InventoryAction} each), then the body the variant selects: {@link UseItemData},
 * {@link UseItemOnEntityData} or {@link ReleaseItemData}. Normal and Mismatch end after the
 * Actions. Protocol 2225 adds a `Hand` uint8 to the use-on-actor and release-item bodies.
 *
 * The wire layout lives in `inventoryTransaction.wire.ts`'s declarative definition, which
 * this class walks at the protocol version stamped on it. One class serves every version;
 * which body shape travels is the layout's decision, not this file's.
 *
 * A 2193 client sends the three bodied types. Container moves, drops and creative picks go
 * through `ItemStackRequestPacket`, so a Normal transaction is a legacy client's and a
 * Mismatch is the client saying its inventory disagrees with the server's.
 */
export default class InventoryTransactionPacket extends DataPacket {
    public legacyRequestId!: number;
    public legacySlotChanges!: LegacySlotChange[];

    /**
     * The variant index as read. A value no {@link TransactionType} member has is kept so the
     * handler can say which type it dropped.
     */
    public transactionType!: TransactionType;
    public inventoryActions!: InventoryAction[];

    /** The body the type selects. Null for Normal, Mismatch and a type the reader does not know. */
    public transactionData: UseItemData | UseItemOnEntityData | ReleaseItemData | null = null;

    /** Hand: which hand a use-on-actor or release transaction acted from, a {@link HandSlot} byte. */
    public hand: number = HandSlot.MAINHAND;

    /** The legacy request fields under the one key the layout carries them as. */
    public get legacyRequest(): LegacyTransactionRequest {
        return { legacyRequestId: this.legacyRequestId, legacySlotChanges: this.legacySlotChanges };
    }

    public set legacyRequest(value: LegacyTransactionRequest) {
        this.legacyRequestId = value.legacyRequestId;
        this.legacySlotChanges = value.legacySlotChanges;
    }

    /**
     * The transaction as the layout carries it: the stacks as descriptors, which is the form
     * the protocol package writes. Null never travels out.
     */
    public get transaction(): WireTransactionPayload {
        const data = this.transactionData;
        return {
            transactionType: this.transactionType,
            inventoryActions: this.inventoryActions.map((action) => action.toWire(this)),
            transactionData: data === null ? null : { ...data, itemInHand: data.itemInHand.toStackDescriptor(this) },
            hand: this.hand
        };
    }

    public set transaction(value: WireTransactionPayload | null) {
        if (value === null) return; // The fallback of the shape the stamped version left off.
        this.transactionType = value.transactionType;
        this.inventoryActions = value.inventoryActions.map((action) => InventoryAction.fromWire(this, action));
        this.transactionData =
            value.transactionData === null
                ? null
                : {
                      ...value.transactionData,
                      itemInHand: Item.fromStackDescriptor(this, value.transactionData.itemInHand)
                  };
        this.hand = value.hand;
    }

    /** The same fields as the hand-carrying 2225 body shape; the layout picks one of the two. */
    public get transactionWithHand(): WireTransactionPayload {
        return this.transaction;
    }

    public set transactionWithHand(value: WireTransactionPayload | null) {
        this.transaction = value;
    }

    /**
     * Writes the packet in the order the class comment gives, through the layout the stamped
     * protocol version resolves.
     * @throws {TypeError} When the type is not a {@link TransactionType} or the body does not match it.
     */
    public encodePayload(): void {
        layoutAt(inventoryTransactionPacket, this.codecProtocol).encode(this, this);
    }

    /**
     * Reads the packet back in the same order.
     *
     * Two things about the layout differ from protocol 748. The Legacy Set Item Slots have a
     * presence byte of their own, which the reader trusts over the request id. The presence
     * bytes that 1.26.30 put in front of the variant index and the Actions are gone again at
     * 2193 ("obsolete Cereal presence bytes", in Mojang's words). A reader still expecting
     * them takes the type for a flag and the flag for the type.
     *
     * A variant index this reader does not know has a body of unknown length, so reading
     * stops after the Actions and `transactionData` stays null. The handler drops the packet
     * at debug level; throwing here would log an error for every such packet instead.
     * @throws {RangeError} When the Actions list is longer than {@link MAX_INVENTORY_ACTIONS}.
     * @throws {Error} When a use-item body leaves bytes unread, which means the layout drifted.
     */
    public decodePayload(): void {
        Object.assign(this, layoutAt(inventoryTransactionPacket, this.codecProtocol).decode(this));
    }
}
