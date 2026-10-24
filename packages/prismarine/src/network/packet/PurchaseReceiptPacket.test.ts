import { describe, expect, it } from 'vitest';
import PurchaseReceiptPacket from './PurchaseReceiptPacket';

describe('PurchaseReceiptPacket', () => {
    // One Buffer per docs field, in wire order.
    const encoded = Buffer.concat([
        Buffer.from([0x5c]), // Header, packet 92
        Buffer.from([0x02]), // PurchaseReceipts: count
        Buffer.from([0x01]),
        Buffer.from('a'),
        Buffer.from([0x02]),
        Buffer.from('bc')
    ]);

    it('decodes the receipts and consumes the whole buffer', () => {
        const packet = new PurchaseReceiptPacket(encoded);
        packet.decode();

        expect(packet.purchaseReceipts).toEqual(['a', 'bc']);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes back', () => {
        const packet = new PurchaseReceiptPacket();
        packet.purchaseReceipts = ['a', 'bc'];
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });

    it('writes a zero count for a client that owns nothing', () => {
        const packet = new PurchaseReceiptPacket();
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([0x5c, 0x00]));
    });
});
