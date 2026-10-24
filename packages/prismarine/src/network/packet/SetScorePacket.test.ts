import { describe, expect, it } from 'vitest';
import SetScorePacket, { ScorePacketEntryAction } from './SetScorePacket';

const REMOVE_WITHOUT_OBJECTIVE = Buffer.concat([
    Buffer.from([0x00]), // Selector 0, Remove.
    Buffer.from([0x06]),
    Buffer.from('remove', 'utf8'), // Action.
    Buffer.from([0x02]), // Scoreboard Id 1 as a ZigZag varint64.
    Buffer.from([0x00]) // Objective Name absent.
]);

const CHANGE_FAKE_PLAYER = Buffer.concat([
    Buffer.from([0x03]), // Selector 3, ChangeFakePlayer.
    Buffer.from([0x10]),
    Buffer.from('changefakeplayer', 'utf8'), // Action.
    Buffer.from([0x04]), // Scoreboard Id 2 as a ZigZag varint64.
    Buffer.from([0x03]),
    Buffer.from('obj', 'utf8'), // Objective Name.
    Buffer.from([0xfb, 0xff, 0xff, 0xff]), // Score Value -5 as an int32 LE.
    Buffer.from([0x01]),
    Buffer.from('x', 'utf8') // Fake Player Name.
]);

const ENCODED = Buffer.concat([
    Buffer.from([0x6c]), // Header: id 108 as LEB128.
    Buffer.from([0x02]), // Score Info, two entries.
    REMOVE_WITHOUT_OBJECTIVE,
    CHANGE_FAKE_PLAYER
]);

describe('SetScorePacket', () => {
    it('encodes each entry as a selector, an action name and the alternative', () => {
        const packet = Object.assign(new SetScorePacket(), {
            entries: [
                { action: ScorePacketEntryAction.Remove, scoreboardId: 1n },
                {
                    action: ScorePacketEntryAction.ChangeFakePlayer,
                    scoreboardId: 2n,
                    objectiveName: 'obj',
                    scoreValue: -5,
                    fakePlayerName: 'x'
                }
            ]
        });
        packet.encode();

        expect(packet.getBuffer()).toEqual(ENCODED);
    });

    it('decodes both alternatives and consumes the whole buffer', () => {
        const packet = new SetScorePacket(ENCODED);
        packet.decode();

        expect(packet.entries).toEqual([
            { action: ScorePacketEntryAction.Remove, scoreboardId: 1n },
            {
                action: ScorePacketEntryAction.ChangeFakePlayer,
                scoreboardId: 2n,
                objectiveName: 'obj',
                scoreValue: -5,
                fakePlayerName: 'x'
            }
        ]);
        expect(packet.feof()).toBe(true);
    });

    it('reads the optional objective name of a Remove entry', () => {
        const packet = new SetScorePacket(
            Buffer.concat([
                Buffer.from([0x6c, 0x01, 0x00, 0x06]),
                Buffer.from('remove', 'utf8'),
                Buffer.from([0x02]), // Scoreboard Id 1.
                Buffer.from([0x01, 0x03]),
                Buffer.from('obj', 'utf8') // Objective Name present.
            ])
        );
        packet.decode();

        expect(packet.entries).toEqual([
            { action: ScorePacketEntryAction.Remove, scoreboardId: 1n, objectiveName: 'obj' }
        ]);
        expect(packet.feof()).toBe(true);
    });

    it('reads ChangePlayer and ChangeEntity as an actor id after the score', () => {
        const packet = new SetScorePacket(
            Buffer.concat([
                Buffer.from([0x6c, 0x02]),
                Buffer.from([0x01, 0x0c]),
                Buffer.from('changeplayer', 'utf8'),
                Buffer.from([0x02, 0x03]),
                Buffer.from('obj', 'utf8'),
                Buffer.from([0x07, 0x00, 0x00, 0x00]), // Score Value 7.
                Buffer.from([0x0e]), // Player Unique Id 7.
                Buffer.from([0x02, 0x0c]),
                Buffer.from('changeentity', 'utf8'),
                Buffer.from([0x04, 0x03]),
                Buffer.from('obj', 'utf8'),
                Buffer.from([0x08, 0x00, 0x00, 0x00]), // Score Value 8.
                Buffer.from([0x10]) // Actor Id 8.
            ])
        );
        packet.decode();

        expect(packet.entries).toEqual([
            {
                action: ScorePacketEntryAction.ChangePlayer,
                scoreboardId: 1n,
                objectiveName: 'obj',
                scoreValue: 7,
                playerUniqueId: 7n
            },
            {
                action: ScorePacketEntryAction.ChangeEntity,
                scoreboardId: 2n,
                objectiveName: 'obj',
                scoreValue: 8,
                actorId: 8n
            }
        ]);
        expect(packet.feof()).toBe(true);
    });

    it('rejects a selector that names no alternative', () => {
        const packet = new SetScorePacket(Buffer.from([0x6c, 0x01, 0x04]));

        expect(() => packet.decode()).toThrow('Unknown set score alternative 4');
    });
});
