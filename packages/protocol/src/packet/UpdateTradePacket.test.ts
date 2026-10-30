import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import UpdateTradePacket from './UpdateTradePacket';

describe('UpdateTradePacket', () => {
    const offers = Buffer.from([0x0a, 0x00, 0x00]);
    const encoded = Buffer.concat([
        Buffer.from([0x50, 0x01, 0x0f, 0x04, 0x02, 0x0a, 0x0e, 0x06]),
        Buffer.from('Farmer'),
        Buffer.from([0x01, 0x00]),
        offers
    ]);
    const data = {
        containerId: 1,
        type: 15,
        size: 2,
        traderTier: 1,
        entityUniqueId: 5n,
        lastTradingPlayer: 7n,
        displayName: 'Farmer',
        useNewTradeScreen: true,
        usingEconomyTrade: false,
        data: offers
    };

    it('decodes every field and consumes the offer compound to the end', () => {
        const stream = new NetworkBinaryStream(encoded);

        expect(new UpdateTradePacket().deserialize(stream)).toEqual(data);
        expect(stream.feof()).toBe(true);
    });

    it('encodes the same bytes back', () => {
        expect(new UpdateTradePacket(data).serialize(new NetworkBinaryStream())).toEqual(encoded);
    });
});
