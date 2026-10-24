import { DisconnectReason } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import DisconnectPacket from './DisconnectPacket';

import type { Disconnect } from './DisconnectPacket';

const HEADER = 0x05;

/** Reason `Kicked` (55, ZigZag 110), `Skip Message` false, `Message` "Bye", empty `Filtered Message`. */
const KICKED_WITH_MESSAGE = [0x6e, 0x00, 0x03, 0x42, 0x79, 0x65, 0x00];
/** Reason `Unknown`, `Skip Message` true, nothing after it. */
const UNKNOWN_WITHOUT_MESSAGE = [0x00, 0x01];
/** Reason `UnsupportedTransport` (149, ZigZag 298), the last member at 2193, takes two varint bytes. */
const UNSUPPORTED_TRANSPORT_WITHOUT_MESSAGE = [0xaa, 0x02, 0x01];

const encode = (data: Disconnect) => [...new DisconnectPacket(data).serialize(new NetworkBinaryStream()).subarray(1)];

describe('DisconnectPacket', () => {
    it('writes the reason as a ZigZag varint and both strings after a false Skip Message', () => {
        const payload = encode({
            reason: DisconnectReason.KICKED,
            skipMessage: false,
            message: 'Bye',
            filteredMessage: ''
        });

        expect(payload).toEqual(KICKED_WITH_MESSAGE);
    });

    it('writes a true Skip Message and nothing after it', () => {
        const payload = encode({ reason: DisconnectReason.UNKNOWN, skipMessage: true });

        expect(payload).toEqual(UNKNOWN_WITHOUT_MESSAGE);
    });

    it('spreads a reason past 63 over two varint bytes', () => {
        const payload = encode({ reason: DisconnectReason.UNSUPPORTED_TRANSPORT, skipMessage: true });

        expect(payload).toEqual(UNSUPPORTED_TRANSPORT_WITHOUT_MESSAGE);
    });

    it('writes empty strings for messages that were left out', () => {
        const payload = encode({ reason: DisconnectReason.UNKNOWN, skipMessage: false });

        expect(payload).toEqual([0x00, 0x00, 0x00, 0x00]);
    });

    it('reads a reason and both strings, and nothing past them', () => {
        const stream = new NetworkBinaryStream(Buffer.from([HEADER, ...KICKED_WITH_MESSAGE]));
        const data = new DisconnectPacket().deserialize(stream);

        expect(data).toEqual({
            reason: DisconnectReason.KICKED,
            skipMessage: false,
            message: 'Bye',
            filteredMessage: ''
        });
        expect(stream.feof()).toBe(true);
    });

    it('reads a true Skip Message as a skipped message and stops there', () => {
        const stream = new NetworkBinaryStream(Buffer.from([HEADER, ...UNSUPPORTED_TRANSPORT_WITHOUT_MESSAGE]));
        const data = new DisconnectPacket().deserialize(stream);

        expect(data).toEqual({ reason: DisconnectReason.UNSUPPORTED_TRANSPORT, skipMessage: true });
        expect(stream.feof()).toBe(true);
    });

    it('reads any non-zero Skip Message byte as skipped, the way a bool is read', () => {
        // A varuint reader compared the byte against 1 and took 2 as "strings follow".
        const stream = new NetworkBinaryStream(Buffer.from([HEADER, 0x46, 0x02]));
        const data = new DisconnectPacket().deserialize(stream);

        expect(data).toEqual({ reason: DisconnectReason.OUTDATED_CLIENT, skipMessage: true });
        expect(stream.feof()).toBe(true);
    });
});
