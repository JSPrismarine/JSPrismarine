import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import PurchaseReceiptPacket from './PurchaseReceiptPacket';

import type { PurchaseReceipt } from './PurchaseReceiptPacket';

const DATA: PurchaseReceipt = { purchaseReceipts: ['a', 'bc'] };

/** Packet 92 with a two-receipt list: count, then two length-prefixed UTF-8 strings. */
const BYTES = Buffer.from([0x5c, 0x02, 0x01, 0x61, 0x02, 0x62, 0x63]);

describe('PurchaseReceiptPacket', () => {
    it('writes the receipt count and strings in wire order', () => {
        const buffer = new PurchaseReceiptPacket(DATA).serialize(new NetworkBinaryStream());

        expect(buffer).toEqual(BYTES);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new PurchaseReceiptPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('writes a zero count when the client has no receipts', () => {
        const buffer = new PurchaseReceiptPacket({ purchaseReceipts: [] }).serialize(new NetworkBinaryStream());

        expect(buffer).toEqual(Buffer.from([0x5c, 0x00]));
    });
});
