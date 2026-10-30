import BinaryStream from '@jsprismarine/binaryutils';
import { emotePacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/** The bytes the hand-written encoder produced, recorded before the class moved to the layout. */
const BYTES = Buffer.from('090361626314043132333402706303', 'hex');

const payload = {
    actorRuntimeId: 9n,
    emoteId: 'abc',
    emoteLengthTicks: 20,
    xuid: '1234',
    platformId: 'pc',
    flags: 3
};

describe('the declarative Emote layout', () => {
    const layout = layoutAt(emotePacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(BYTES);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(BYTES))).toEqual(payload);
    });
});
