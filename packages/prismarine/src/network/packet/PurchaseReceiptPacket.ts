import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * The receipts for everything the player has bought from a server's store offers.
 *
 * The client sends it after a purchase, and again at login once its entitlements are checked.
 *
 * Wire order at protocol 2193: `PurchaseReceipts` as a varuint32 count followed by that many
 * strings.
 *
 * **Bound To:** Server
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/purchase-receipt-packet/
 */
export default class PurchaseReceiptPacket extends DataPacket {
    public static NetID = Identifiers.PurchaseReceiptPacket;

    /** One proof of purchase per offer the player owns. */
    public purchaseReceipts: string[] = [];

    /** Reads the receipt list. */
    public decodePayload(): void {
        this.purchaseReceipts = [];

        let count = this.readUnsignedVarInt();
        while (count-- > 0) {
            this.purchaseReceipts.push(NetworkUtil.readString(this));
        }
    }

    /** Writes the receipt list. */
    public encodePayload(): void {
        this.writeUnsignedVarInt(this.purchaseReceipts.length);
        for (const receipt of this.purchaseReceipts) {
            NetworkUtil.writeString(this, receipt);
        }
    }
}
