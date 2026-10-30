import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, ScorePacketEntryAction, setScorePacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import type { ScorePacketEntry } from '@jsprismarine/protocol';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. All five branches are in here: a `Remove` without an objective name and
 * one with, then each of the three change alternatives. The scoreboard ids and the scores are
 * negative where they can be, because both are signed and a plain varint or an unsigned int32
 * would get them wrong.
 */
const BYTES = Buffer.from(
    '05000672656d6f76650100000672656d6f76650401036f626a010c6368616e6765706c6179657206036f626a' +
        'f9ffffff11020c6368616e6765656e7469747908036f626a2c010000aab4de7503106368616e676566616b65' +
        '706c617965720a036f626afeffffff03626f62',
    'hex'
);

const entries: ScorePacketEntry[] = [
    { action: ScorePacketEntryAction.Remove, scoreboardId: -1n },
    { action: ScorePacketEntryAction.Remove, scoreboardId: 2n, objectiveName: 'obj' },
    {
        action: ScorePacketEntryAction.ChangePlayer,
        scoreboardId: 3n,
        objectiveName: 'obj',
        scoreValue: -7,
        playerUniqueId: -9n
    },
    {
        action: ScorePacketEntryAction.ChangeEntity,
        scoreboardId: 4n,
        objectiveName: 'obj',
        scoreValue: 300,
        actorId: 123456789n
    },
    {
        action: ScorePacketEntryAction.ChangeFakePlayer,
        scoreboardId: 5n,
        objectiveName: 'obj',
        scoreValue: -2,
        fakePlayerName: 'bob'
    }
];

describe('the declarative SetScore layout', () => {
    const layout = layoutAt(setScorePacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, { entries });

        expect(stream.getBuffer()).toEqual(BYTES);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(BYTES))).toEqual({ entries });
    });

    it('rejects a selector that names none of the four alternatives', () => {
        expect(() => layout.decode(new BinaryStream(Buffer.from('0107', 'hex')))).toThrow(
            /Unknown set score alternative 7/
        );
    });
});
