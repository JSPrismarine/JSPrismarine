import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, setTitlePacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. A negative duration is in there because the durations are ZigZag
 * varints, which a plain varint would get wrong.
 */
const BYTES = Buffer.from('040568656c6c6f14273c043235333503706964026869', 'hex');

const payload = {
    titleType: 2,
    titleText: 'hello',
    fadeInTime: 10,
    stayTime: -20,
    fadeOutTime: 30,
    xuid: '2535',
    platformOnlineId: 'pid',
    filteredTitleMessage: 'hi'
};

describe('the declarative SetTitle layout', () => {
    const layout = layoutAt(setTitlePacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(BYTES);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(BYTES))).toEqual(payload);
    });
});
