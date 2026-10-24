import { DisconnectReason } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import DisconnectPacket from './DisconnectPacket';

import type { Disconnect } from './DisconnectPacket';

const HEADER = 0x05;

/** Reason `Kicked` (55, ZigZag 110), selector 0, `Message` "Bye", empty `Filtered Message`. */
const KICKED_WITH_MESSAGE = [0x6e, 0x00, 0x03, 0x42, 0x79, 0x65, 0x00];
/** Reason `Unknown`, selector 1, nothing after it. */
const UNKNOWN_WITHOUT_MESSAGE = [0x00, 0x01];

const encode = (data: Disconnect) => [...new DisconnectPacket(data).serialize(new NetworkBinaryStream()).subarray(1)];

describe('DisconnectPacket', () => {
    it('writes the reason as a ZigZag varint and both strings after selector 0', () => {
        const payload = encode({
            reason: DisconnectReason.KICKED,
            skipMessage: false,
            message: 'Bye',
            filteredMessage: ''
        });

        expect(payload).toEqual(KICKED_WITH_MESSAGE);
    });

    it('writes selector 1 and nothing after it when the message is skipped', () => {
        const payload = encode({ reason: DisconnectReason.UNKNOWN, skipMessage: true });

        expect(payload).toEqual(UNKNOWN_WITHOUT_MESSAGE);
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

    it('reads selector 1 as a skipped message and stops there', () => {
        const stream = new NetworkBinaryStream(Buffer.from([HEADER, ...UNKNOWN_WITHOUT_MESSAGE]));
        const data = new DisconnectPacket().deserialize(stream);

        expect(data).toEqual({ reason: DisconnectReason.UNKNOWN, skipMessage: true });
        expect(stream.feof()).toBe(true);
    });
});
