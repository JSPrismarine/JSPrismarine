import { describe, expect, it } from 'vitest';
import LegacyTelemetryEventPacket, {
    LegacyTelemetryEventDataOrdinal,
    LegacyTelemetryEventType
} from './LegacyTelemetryEventPacket';

describe('LegacyTelemetryEventPacket', () => {
    // Header 0x41. Actor 5 zigzags to 10, the event type MobKilled (4) to 8, Use Player ID
    // is clear, and the data ordinal is 4. The payload is the unique ids 7 and 9, the child
    // actor type 1 and damage source 2 zigzagged, the trade tier -1 zigzagged to 1, and an
    // empty trader name.
    const mobKilled = Buffer.from([0x41, 0x0a, 0x08, 0x00, 0x04, 0x0e, 0x12, 0x02, 0x04, 0x01, 0x00]);

    // The same header fields with the event type ItemUsed (31, zigzagged to 62) and the data
    // ordinal 20. The payload is fixed width: item 300 as a little-endian int16, then the
    // aux -1, the use method 2 and the count 3 as little-endian int32.
    const itemUsed = Buffer.from([
        0x41, 0x02, 0x3e, 0x01, 0x14, 0x2c, 0x01, 0xff, 0xff, 0xff, 0xff, 0x02, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00
    ]);

    // Actor 1, the event type SlashCommand (11, zigzagged to 0x16), Use Player ID set, and the
    // data ordinal 8, which is not the event type: the obsolete types before it have no
    // alternative of their own. The payload is success count 1 zigzagged, error count 0,
    // "say", and an empty error list.
    const slashCommand = Buffer.from([0x41, 0x02, 0x16, 0x01, 0x08, 0x02, 0x00, 0x03, 0x73, 0x61, 0x79, 0x00]);

    it('decodes a MobKilled payload, consuming the whole buffer', () => {
        const packet = new LegacyTelemetryEventPacket(mobKilled);
        packet.decode();

        expect(packet.targetActorId).toBe(5n);
        expect(packet.eventType).toBe(LegacyTelemetryEventType.MobKilled);
        expect(packet.usePlayerId).toBe(false);
        expect(packet.eventData).toEqual({
            ordinal: LegacyTelemetryEventDataOrdinal.MobKilled,
            instigatorActorId: 7n,
            targetActorId: 9n,
            instigatorChildActorType: 1,
            damageSource: 2,
            tradeTier: -1,
            traderName: ''
        });
        expect(packet.feof()).toBe(true);
    });

    it('encodes a MobKilled payload back to the same bytes', () => {
        const packet = new LegacyTelemetryEventPacket();
        packet.targetActorId = 5n;
        packet.eventType = LegacyTelemetryEventType.MobKilled;
        packet.eventData = {
            ordinal: LegacyTelemetryEventDataOrdinal.MobKilled,
            instigatorActorId: 7n,
            targetActorId: 9n,
            instigatorChildActorType: 1,
            damageSource: 2,
            tradeTier: -1,
            traderName: ''
        };
        packet.encode();

        expect(packet.getBuffer()).toEqual(mobKilled);
    });

    it('decodes an ItemUsed payload, whose fields are fixed width', () => {
        const packet = new LegacyTelemetryEventPacket(itemUsed);
        packet.decode();

        expect(packet.targetActorId).toBe(1n);
        expect(packet.eventType).toBe(LegacyTelemetryEventType.ItemUsed);
        expect(packet.usePlayerId).toBe(true);
        expect(packet.eventData).toEqual({
            ordinal: LegacyTelemetryEventDataOrdinal.ItemUsed,
            itemId: 300,
            itemAux: -1,
            useMethod: 2,
            count: 3
        });
        expect(packet.feof()).toBe(true);
    });

    it('encodes an ItemUsed payload back to the same bytes', () => {
        const packet = new LegacyTelemetryEventPacket();
        packet.targetActorId = 1n;
        packet.eventType = LegacyTelemetryEventType.ItemUsed;
        packet.usePlayerId = true;
        packet.eventData = {
            ordinal: LegacyTelemetryEventDataOrdinal.ItemUsed,
            itemId: 300,
            itemAux: -1,
            useMethod: 2,
            count: 3
        };
        packet.encode();

        expect(packet.getBuffer()).toEqual(itemUsed);
    });

    it('decodes a SlashCommand payload, whose ordinal (8) differs from its event type (11)', () => {
        const packet = new LegacyTelemetryEventPacket(slashCommand);
        packet.decode();

        expect(packet.eventType).toBe(LegacyTelemetryEventType.SlashCommand);
        expect(packet.usePlayerId).toBe(true);
        expect(packet.eventData).toEqual({
            ordinal: LegacyTelemetryEventDataOrdinal.SlashCommand,
            successCount: 1,
            errorCount: 0,
            commandName: 'say',
            errorList: ''
        });
        expect(packet.feof()).toBe(true);
    });

    it('encodes a SlashCommand payload back to the same bytes', () => {
        const packet = new LegacyTelemetryEventPacket();
        packet.targetActorId = 1n;
        packet.eventType = LegacyTelemetryEventType.SlashCommand;
        packet.usePlayerId = true;
        packet.eventData = {
            ordinal: LegacyTelemetryEventDataOrdinal.SlashCommand,
            successCount: 1,
            errorCount: 0,
            commandName: 'say',
            errorList: ''
        };
        packet.encode();

        expect(packet.getBuffer()).toEqual(slashCommand);
    });

    it('decodes a CauldronUsed payload with int16 fields left fixed width after the varuint color', () => {
        // Event type 5 zigzags to 0x0a and the ordinal is 5. The color 300 is the varuint
        // 0xac 0x02; the contents type -1 and fill level 6 are little-endian int16, because the
        // docs define Compression as covering 32- and 64-bit integers only.
        const packet = new LegacyTelemetryEventPacket(
            Buffer.from([0x41, 0x02, 0x0a, 0x00, 0x05, 0xac, 0x02, 0xff, 0xff, 0x06, 0x00])
        );
        packet.decode();

        expect(packet.eventData).toEqual({
            ordinal: LegacyTelemetryEventDataOrdinal.CauldronUsed,
            contentsColor: 300,
            contentsType: -1,
            fillLevel: 6
        });
        expect(packet.feof()).toBe(true);
    });

    it('decodes an event type that carries the empty alternative', () => {
        // CarefulRestoration is event type 30, which zigzags to 60, and its data ordinal is 21.
        const packet = new LegacyTelemetryEventPacket(Buffer.from([0x41, 0x02, 0x3c, 0x00, 0x15]));
        packet.decode();

        expect(packet.eventType).toBe(LegacyTelemetryEventType.CarefulRestoration);
        expect(packet.eventData).toEqual({ ordinal: LegacyTelemetryEventDataOrdinal.Empty });
        expect(packet.feof()).toBe(true);
    });

    it('rejects a data alternative the protocol does not define', () => {
        const packet = new LegacyTelemetryEventPacket(Buffer.from([0x41, 0x02, 0x3c, 0x00, 0x16]));

        expect(() => packet.decode()).toThrow(/alternative 22/);
    });
});
