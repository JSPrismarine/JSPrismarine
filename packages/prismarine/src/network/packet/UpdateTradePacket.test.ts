import { describe, expect, it } from 'vitest';
import UpdateTradePacket from './UpdateTradePacket';

describe('UpdateTradePacket', () => {
    // An empty network NBT compound: TAG_Compound, an empty name, TAG_End.
    const offers = Buffer.from([0x0a, 0x00, 0x00]);

    // One Buffer per docs field, in wire order.
    const encoded = Buffer.concat([
        Buffer.from([0x50]), // Header, packet 80
        Buffer.from([0x01]), // Container Id
        Buffer.from([0x0f]), // Type: the trading window
        Buffer.from([0x04]), // Size: varint32 2 zigzags to 4
        Buffer.from([0x02]), // Trader Tier: varint32 1 zigzags to 2
        Buffer.from([0x0a]), // Entity Unique Id: varint64 5 zigzags to 10
        Buffer.from([0x0e]), // Last Trading Player: varint64 7 zigzags to 14
        Buffer.from([0x06]),
        Buffer.from('Farmer'), // Display Name
        Buffer.from([0x01]), // Use New Trade Screen
        Buffer.from([0x00]), // Using Economy Trade
        offers // Data
    ]);

    it('decodes every field and consumes the whole buffer', () => {
        const packet = new UpdateTradePacket(encoded);
        packet.decode();

        expect(packet.containerId).toBe(1);
        expect(packet.type).toBe(15);
        expect(packet.size).toBe(2);
        expect(packet.traderTier).toBe(1);
        expect(packet.entityUniqueId).toBe(5n);
        expect(packet.lastTradingPlayer).toBe(7n);
        expect(packet.displayName).toBe('Farmer');
        expect(packet.useNewTradeScreen).toBe(true);
        expect(packet.usingEconomyTrade).toBe(false);
        expect(packet.data).toEqual(offers);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes back', () => {
        const packet = new UpdateTradePacket();
        packet.containerId = 1;
        packet.type = 15;
        packet.size = 2;
        packet.traderTier = 1;
        packet.entityUniqueId = 5n;
        packet.lastTradingPlayer = 7n;
        packet.displayName = 'Farmer';
        packet.useNewTradeScreen = true;
        packet.data = offers;
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });
});
