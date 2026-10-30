import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, stopSoundPacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. The two flags are set the opposite way round in the two cases, so a
 * layout that swapped them would pass neither.
 */
const CASES = [
    {
        branch: 'when only the legacy music stop is set',
        bytes: Buffer.from('0e7265636f72642e706967737465700001', 'hex'),
        payload: { soundName: 'record.pigstep', stopAllSounds: false, stopMusicLegacy: true }
    },
    {
        branch: 'when everything stops and the name is empty',
        bytes: Buffer.from('000100', 'hex'),
        payload: { soundName: '', stopAllSounds: true, stopMusicLegacy: false }
    }
];

describe('the declarative StopSound layout', () => {
    const layout = layoutAt(stopSoundPacket, 2193);

    for (const { branch, bytes, payload } of CASES) {
        it(`writes the bytes the hand-written encoder wrote ${branch}`, () => {
            const stream = new BinaryStream();
            layout.encode(stream, payload);

            expect(stream.getBuffer()).toEqual(bytes);
        });

        it(`reads those bytes back ${branch}`, () => {
            expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
        });
    }
});
