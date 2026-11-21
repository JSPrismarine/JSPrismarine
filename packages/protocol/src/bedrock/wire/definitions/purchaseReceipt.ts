/**
 * `PurchaseReceiptPacket`: the store receipts a client reports to the server.
 *
 * The payload is one list of receipt strings: a varuint32 count, then that many
 * varuint32-length-prefixed UTF-8 strings.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/purchase-receipt-packet/
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';

import type { PayloadOf } from '../../../wire/define';

/** The fields a client sends after a purchase, or after login when its entitlements are verified. */
export const purchaseReceiptPacket = definePacket('PurchaseReceiptPacket', {
    /** `Purchase Receipts`: one string receipt for each purchase the client reports. */
    purchaseReceipts: t.list(t.string)
});

/** Payload carried by `PurchaseReceiptPacket`. */
export type PurchaseReceiptPayload = PayloadOf<typeof purchaseReceiptPacket>;
