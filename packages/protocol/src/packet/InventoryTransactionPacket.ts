import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { inventoryTransactionPacket } from '../wire/definitions/inventoryTransaction';
import { layoutAt } from '../wire/WireLayout';
import { SINCE_2225 } from '../wire/wireGates';

import type { ProtocolContext } from '../ProtocolContext';
import type NetworkBinaryStream from '../NetworkBinaryStream';
import type {
    InventoryActionData,
    LegacyTransactionRequest,
    TransactionPayload
} from '../wire/structures/InventoryTransaction';

/** The normalized data carried by an inventory transaction at every protocol version. */
export interface InventoryTransaction {
    /** Legacy request id and the optional slot list it controls. */
    legacyRequest: LegacyTransactionRequest;
    /** The variant index; unknown values are preserved so the server can reject them. */
    transactionType: number;
    /** Slot changes the client associates with this transaction. */
    inventoryActions: InventoryActionData[];
    /** The body selected by {@link transactionType}, or null when the variant has no known body. */
    transactionData: TransactionPayload['transactionData'];
    /** `Hand` added to two transaction bodies at protocol 2225. */
    hand: number;
}

/**
 * Packet 30: an item use, attack, release, or legacy inventory transaction from the client.
 *
 * The payload uses `NetworkItemStackDescriptor` values for every item. The server supplies its
 * versioned item table separately through {@link ProtocolContext}; the packet codec does not
 * import or resolve a server's game item class.
 *
 * The transaction body follows its variant index. Normal and Mismatch have no body. Protocol
 * 2225 adds a `Hand` field to use-on-actor and release-item transaction bodies. The packet data
 * presented to callers is normalized across that layout change.
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/inventory-transaction-packet/
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/inventory-transaction-packet/
 */
export default class InventoryTransactionPacket extends NetworkPacket<InventoryTransaction> {
    /** Returns the wire identifier for Inventory Transaction. */
    public get id(): number {
        return PacketIdentifier.INVENTORY_TRANSACTION;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: InventoryTransaction): void {
        const transaction: TransactionPayload = {
            transactionType: data.transactionType,
            inventoryActions: data.inventoryActions,
            transactionData: data.transactionData,
            hand: data.hand
        };
        const carriesPacketHand = SINCE_2225.includedAt(this.codecProtocol);

        layoutAt(inventoryTransactionPacket, this.codecProtocol).encode(stream, {
            legacyRequest: data.legacyRequest,
            transaction: carriesPacketHand ? null : transaction,
            transactionWithHand: carriesPacketHand ? transaction : null
        });
    }

    protected deserializePayload(stream: NetworkBinaryStream): InventoryTransaction {
        const decoded = layoutAt(inventoryTransactionPacket, this.codecProtocol).decode(stream);
        const transaction = decoded.transactionWithHand ?? decoded.transaction;
        if (transaction === null) throw new Error('Inventory Transaction has no versioned transaction body');

        return { legacyRequest: decoded.legacyRequest, ...transaction };
    }
}
