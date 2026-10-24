import { describe, expect, it } from 'vitest';
import SetScoreboardIdentityPacket, { ScoreboardIdentityPacketType } from './SetScoreboardIdentityPacket';

const ENCODED = Buffer.concat([
    Buffer.from([0x70]), // Header: id 112 as LEB128.
    Buffer.from([0x00]), // Scoreboard Identity Packet Type Update.
    Buffer.from([0x02]), // Scoreboard Identity Info, two entries.
    Buffer.from([0x02]), // Scoreboard Id 1 as a ZigZag varint64.
    Buffer.from([0x01, 0x0e]), // Player Unique Id present, 7.
    Buffer.from([0x01]), // Scoreboard Id -1 as a ZigZag varint64.
    Buffer.from([0x00]) // Player Unique Id absent.
]);

describe('SetScoreboardIdentityPacket', () => {
    it('encodes the action then a presence byte per entry', () => {
        const packet = Object.assign(new SetScoreboardIdentityPacket(), {
            type: ScoreboardIdentityPacketType.Update,
            entries: [{ scoreboardId: 1n, playerUniqueId: 7n }, { scoreboardId: -1n }]
        });
        packet.encode();

        expect(packet.getBuffer()).toEqual(ENCODED);
    });

    it('decodes both entries and consumes the whole buffer', () => {
        const packet = new SetScoreboardIdentityPacket(ENCODED);
        packet.decode();

        expect(packet.type).toBe(ScoreboardIdentityPacketType.Update);
        expect(packet.entries).toEqual([{ scoreboardId: 1n, playerUniqueId: 7n }, { scoreboardId: -1n }]);
        expect(packet.feof()).toBe(true);
    });
});
