import { readFileSync } from 'node:fs';

import BinaryStream from '@jsprismarine/binaryutils';
import { playStatusPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written serializer produced, recorded before the class moved to the
 * declarative layout. Signed fields carry negative values and strings a multi-byte character, so
 * a wrong signedness, varint form or length unit changes the bytes.
 */
const bytes = Buffer.from('fffffffe', 'hex');
const payload = { status: -2 };

const fixtureRoot = new URL('../../../bedrock-data/src/jsp/', import.meta.url);

describe.each([2193, 2225])('the declarative PlayStatus layout at protocol %i', (protocol) => {
    const layout = layoutAt(playStatusPacket, protocol);

    it('writes the bytes the hand-written serializer wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });

    it('round-trips the packet a real Bedrock Dedicated Server sent', () => {
        const captured = readFileSync(new URL(`v${protocol}/wire/0x02.bin`, fixtureRoot));
        const stream = new BinaryStream();
        layout.encode(stream, layout.decode(new BinaryStream(captured)));

        expect(stream.getBuffer()).toEqual(captured);
    });
});
