import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The store purchase receipts the client reports to the server. */
export interface PurchaseReceipt {
    /** One string receipt for each purchase the client reports. */
    purchaseReceipts: string[];
}

/**
 * Store receipts sent by a client after a purchase or after login when its entitlements are
 * verified. The protocol carries the receipts for the server's purchase handler to process.
 *
 * Protocol 2193 layout: `Purchase Receipts` as a varuint32 count followed by that many
 * varuint32-length-prefixed UTF-8 strings.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/purchase-receipt-packet/
 */
export default class PurchaseReceiptPacket extends NetworkPacket<PurchaseReceipt> {
    public get id(): number {
        return PacketIdentifier.PURCHASE_RECEIPT;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: PurchaseReceipt): void {
        stream.writeUnsignedVarInt(data.purchaseReceipts.length);
        for (const receipt of data.purchaseReceipts) {
            stream.writeString(receipt);
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): PurchaseReceipt {
        const count = stream.readUnsignedVarInt();
        const purchaseReceipts: string[] = [];
        for (let index = 0; index < count; index++) {
            purchaseReceipts.push(stream.readString());
        }

        return { purchaseReceipts };
    }
}
