import { Item } from '../item/Item';

import type { ProtocolContext } from '@jsprismarine/protocol';
import type { InventoryTransaction as ProtocolInventoryTransaction } from '@jsprismarine/protocol';
import {
    readInventoryAction,
    readUseItemData as readWireUseItemData,
    writeInventoryAction,
    writeUseItemData as writeWireUseItemData
} from '@jsprismarine/protocol/wire/structures/InventoryTransaction';

import type BinaryStream from '@jsprismarine/binaryutils';
import type {
    InventoryActionData as WireInventoryActionData,
    LegacyTransactionRequest,
    ReleaseItemData as WireReleaseItemData,
    TransactionPayload as WireTransactionPayload,
    UseItemData as WireUseItemData,
    UseItemOnEntityData as WireUseItemOnEntityData
} from '@jsprismarine/protocol/wire/structures/InventoryTransaction';

/**
 * One action in the server's inventory model, with both stacks resolved to game `Item`s.
 * The Protocol packet keeps the corresponding {@link WireInventoryActionData} descriptors.
 */
export class InventoryAction {
    /**
     * Creates an action.
     * @param sourceType - The protocol's Source Type value.
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

    /** Resolves both wire stack descriptors using the connection's negotiated item table. */
    public static fromWire(source: BinaryStream | ProtocolContext, action: WireInventoryActionData): InventoryAction {
        return new InventoryAction(
            action.sourceType,
            action.windowId,
            action.sourceFlags,
            action.targetSlot,
            Item.fromStackDescriptor(source, action.oldItem),
            Item.fromStackDescriptor(source, action.newItem)
        );
    }

    /** Converts this action into the descriptors Protocol writes on the connection. */
    public toWire(source: BinaryStream | ProtocolContext): WireInventoryActionData {
        return {
            sourceType: this.sourceType,
            windowId: this.windowId,
            sourceFlags: this.sourceFlags,
            targetSlot: this.targetSlot,
            oldItem: this.oldItem.toStackDescriptor(source),
            newItem: this.newItem.toStackDescriptor(source)
        };
    }

    /** Reads one action from a legacy mutable Prismarine packet. */
    public static fromNetwork(stream: BinaryStream): InventoryAction {
        return InventoryAction.fromWire(stream, readInventoryAction(stream));
    }

    /** Writes one action through a legacy mutable Prismarine packet. */
    public toNetwork(stream: BinaryStream): void {
        writeInventoryAction(stream, this.toWire(stream));
    }
}

/** The server's `useItem` body with its held descriptor resolved to an `Item`. */
export type UseItemData = WireUseItemData<Item>;
/** The server's `useItemOnEntity` body with its held descriptor resolved to an `Item`. */
export type UseItemOnEntityData = WireUseItemOnEntityData<Item>;
/** The server's `releaseItem` body with its held descriptor resolved to an `Item`. */
export type ReleaseItemData = WireReleaseItemData<Item>;

/** A transaction body and its actions after the server resolves their stack descriptors. */
export interface ServerInventoryTransaction extends Omit<WireTransactionPayload<Item>, 'inventoryActions'> {
    /** The legacy request id and slots, if the client sent a valid request id. */
    legacyRequest: LegacyTransactionRequest;
    inventoryActions: InventoryAction[];
}

/**
 * Resolves the Protocol packet's stack descriptors into the server's game item model.
 *
 * This adapter runs after packet decoding, at the boundary where a server handler needs to
 * compare client claims with its own inventory. Protocol retains the opaque wire descriptors.
 */
export const inventoryTransactionFromProtocol = (
    transaction: ProtocolInventoryTransaction,
    context: ProtocolContext
): ServerInventoryTransaction => ({
    legacyRequest: transaction.legacyRequest,
    transactionType: transaction.transactionType,
    inventoryActions: transaction.inventoryActions.map((action) => InventoryAction.fromWire(context, action)),
    transactionData: transactionDataFromProtocol(transaction.transactionData, context),
    hand: transaction.hand
});

/** Converts a server transaction back into wire descriptors for a Protocol packet. */
export const inventoryTransactionToProtocol = (
    transaction: ServerInventoryTransaction,
    context: ProtocolContext
): ProtocolInventoryTransaction => ({
    legacyRequest: transaction.legacyRequest,
    transactionType: transaction.transactionType,
    inventoryActions: transaction.inventoryActions.map((action) => action.toWire(context)),
    transactionData: transactionDataToProtocol(transaction.transactionData, context),
    hand: transaction.hand
});

/** Reads a use-item body from a legacy mutable Prismarine packet during migration. */
export const readUseItemData = (stream: BinaryStream): UseItemData => {
    const data = readWireUseItemData(stream);
    return { ...data, itemInHand: Item.fromStackDescriptor(stream, data.itemInHand) };
};

/** Writes a server use-item body through the legacy mutable Prismarine packet. */
export const writeUseItemData = (stream: BinaryStream, data: UseItemData): void => {
    writeWireUseItemData(stream, { ...data, itemInHand: data.itemInHand.toStackDescriptor(stream) });
};

const transactionDataFromProtocol = (
    data: WireTransactionPayload['transactionData'],
    context: ProtocolContext
): UseItemData | UseItemOnEntityData | ReleaseItemData | null => {
    if (data === null) return null;

    return { ...data, itemInHand: Item.fromStackDescriptor(context, data.itemInHand) };
};

const transactionDataToProtocol = (
    data: UseItemData | UseItemOnEntityData | ReleaseItemData | null,
    context: ProtocolContext
): WireTransactionPayload['transactionData'] => {
    if (data === null) return null;

    return { ...data, itemInHand: data.itemInHand.toStackDescriptor(context) };
};
