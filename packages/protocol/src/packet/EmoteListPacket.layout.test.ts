import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import { emoteListPacket } from '../wire/definitions/emoteList';
import { layoutAt } from '../wire/WireLayout';

const EMOTE_ID = '12345678-9abc-def0-1234-56789abcdef0';

// The runtime id above 2^32 as plain LEB128, a one-entry count, then the uuid's two uint64
// halves in little endian order. 1.26.50 and 1.26.60 print the same fields, so the bytes match.
const BYTES = Buffer.from('8180808010' + '01' + 'f0debc9a78563412f0debc9a78563412', 'hex');

describe.each([2193, 2225])('the declarative EmoteList layout at %i', (version) => {
    const layout = layoutAt(emoteListPacket, version);

    it('encodes the runtime id, the count and each uuid', () => {
        const stream = new BinaryStream();
        layout.encode(stream, { runtimeId: 0x1_0000_0001n, emoteIds: [UUID.fromString(EMOTE_ID)] });

        expect(stream.getBuffer()).toEqual(BYTES);
    });

    it('decodes the same bytes and consumes them all', () => {
        const stream = new BinaryStream(BYTES);
        const data = layout.decode(stream);

        expect(data.runtimeId).toBe(0x1_0000_0001n);
        expect(data.emoteIds.map((id) => id.toString())).toEqual([EMOTE_ID]);
        expect(stream.feof()).toBe(true);
    });
});
