import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { purchaseReceiptPacket } from '../wire/definitions/purchaseReceipt';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { PurchaseReceiptPayload } from '../wire/definitions/purchaseReceipt';

/** The store purchase receipts the client reports to the server. */
export type PurchaseReceipt = PurchaseReceiptPayload;

/**
 * Store receipts sent by a client after a purchase or after login when its entitlements are
 * verified. The protocol carries the receipts for the server's purchase handler to process.
 *
 * Protocol 2193 layout: `Purchase Receipts` as a varuint32 count followed by that many
 * varuint32-length-prefixed UTF-8 strings.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/purchase-receipt-packet/
 */
export default class PurchaseReceiptPacket extends NetworkPacket<PurchaseReceipt> {
    public get id(): number {
        return PacketIdentifier.PURCHASE_RECEIPT;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: PurchaseReceipt): void {
        layoutAt(purchaseReceiptPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PurchaseReceipt {
        return layoutAt(purchaseReceiptPacket, this.codecProtocol).decode(stream);
    }
}
