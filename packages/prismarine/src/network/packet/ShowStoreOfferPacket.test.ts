import { describe, expect, it } from 'vitest';
import { netIdFor } from '@jsprismarine/protocol/wire/versions/v2193';
import * as Packets from '../Packets';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import ShowStoreOfferPacket, { ShowStoreOfferRedirectType } from './ShowStoreOfferPacket';

describe('ShowStoreOfferPacket', () => {
    // One Buffer per docs field, in wire order.
    const encoded = Buffer.concat([
        Buffer.from([0x5b]), // Header, packet 91
        // Offer Id: 00112233-4455-6677-8899-aabbccddeeff as two uint64 LE halves, most significant first.
        Buffer.from([0x77, 0x66, 0x55, 0x44, 0x33, 0x22, 0x11, 0x00, 0xff, 0xee, 0xdd, 0xcc, 0xbb, 0xaa, 0x99, 0x88]),
        Buffer.from([0x02]) // Redirect Type: ThirdPartyServerPage
    ]);

    it('decodes every field and consumes the whole buffer', () => {
        const packet = new ShowStoreOfferPacket(encoded);
        packet.decode();

        expect(packet.offerId.toString()).toBe('00112233-4455-6677-8899-aabbccddeeff');
        expect(packet.redirectType).toBe(ShowStoreOfferRedirectType.ThirdPartyServerPage);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes back', () => {
        const packet = new ShowStoreOfferPacket();
        packet.offerId = UUID.fromString('00112233-4455-6677-8899-aabbccddeeff');
        packet.redirectType = ShowStoreOfferRedirectType.ThirdPartyServerPage;
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });

    it('is registered for packet 0x5b', () => {
        expect(Packets.ShowStoreOfferPacket).toBe(ShowStoreOfferPacket);
        expect(netIdFor('ShowStoreOfferPacket')).toBe(0x5b);
    });
});
