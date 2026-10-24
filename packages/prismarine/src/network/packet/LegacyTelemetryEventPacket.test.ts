import { describe, expect, it } from 'vitest';
import LegacyTelemetryEventPacket, {
    LegacyTelemetryEventDataOrdinal,
    LegacyTelemetryEventType
} from './LegacyTelemetryEventPacket';

// Header: id 65 is 0x41. Every vector below starts with actor id 1 (zigzag 0x02).
const HEADER = [0x41, 0x02];

const decode = (bytes: number[]): LegacyTelemetryEventPacket => {
    const packet = new LegacyTelemetryEventPacket(Buffer.from(bytes));
    packet.decode();
    return packet;
};

describe('LegacyTelemetryEventPacket', () => {
    it('decodes an achievement: event type, flag, ordinal, then the achievement byte', () => {
        const packet = decode([...HEADER, 0x00, 0x00, 0x00, 0x05]);

        expect(packet.targetActorId).toBe(1n);
        expect(packet.eventType).toBe(LegacyTelemetryEventType.Achievement);
        expect(packet.usePlayerId).toBe(false);
        expect(packet.eventData).toEqual({ ordinal: LegacyTelemetryEventDataOrdinal.Achievement, achievementId: 5 });
        expect(packet.feof()).toBe(true);
    });

    it('decodes a slash command, whose ordinal (8) differs from its event type (11)', () => {
        // Event type 11 zigzags to 0x16; ordinal 8; success count 1 zigzags to 0x02; error count 0;
        // "say"; an empty error list.
        const packet = decode([...HEADER, 0x16, 0x01, 0x08, 0x02, 0x00, 0x03, 0x73, 0x61, 0x79, 0x00]);

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

    it('decodes a cauldron use with fixed-width int16 fields after the varuint color', () => {
        // Event type 5 zigzags to 0x0a; ordinal 5; color 300 is 0xac 0x02; contents type -1 and
        // fill level 6 are int16 LE, not varints.
        const packet = decode([...HEADER, 0x0a, 0x00, 0x05, 0xac, 0x02, 0xff, 0xff, 0x06, 0x00]);

        expect(packet.eventData).toEqual({
            ordinal: LegacyTelemetryEventDataOrdinal.CauldronUsed,
            contentsColor: 300,
            contentsType: -1,
            fillLevel: 6
        });
        expect(packet.feof()).toBe(true);
    });

    it('decodes an item use with its fixed-width fields', () => {
        // Event type 31 zigzags to 0x3e; ordinal 20; item id 0x0102 as int16 LE; then three int32 LE.
        const packet = decode([
            ...HEADER,
            0x3e,
            0x00,
            0x14,
            0x02,
            0x01,
            0x01,
            0x00,
            0x00,
            0x00,
            0x02,
            0x00,
            0x00,
            0x00,
            0x03,
            0x00,
            0x00,
            0x00
        ]);

        expect(packet.eventData).toEqual({
            ordinal: LegacyTelemetryEventDataOrdinal.ItemUsed,
            itemId: 0x0102,
            itemAux: 1,
            useMethod: 2,
            count: 3
        });
        expect(packet.feof()).toBe(true);
    });

    it('decodes an event without data as the Empty alternative', () => {
        // HoneyHarvested is 22, zigzag 0x2c; Empty is ordinal 21.
        const packet = decode([...HEADER, 0x2c, 0x00, 0x15]);

        expect(packet.eventType).toBe(LegacyTelemetryEventType.HoneyHarvested);
        expect(packet.eventData).toEqual({ ordinal: LegacyTelemetryEventDataOrdinal.Empty });
        expect(packet.feof()).toBe(true);
    });

    it('rejects an ordinal it does not know', () => {
        expect(() => decode([...HEADER, 0x00, 0x00, 0x16])).toThrow(/alternative 22/);
    });

    it('encodes what it decodes', () => {
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

        expect(packet.getBuffer()).toEqual(
            Buffer.from([...HEADER, 0x16, 0x01, 0x08, 0x02, 0x00, 0x03, 0x73, 0x61, 0x79, 0x00])
        );
    });
});
