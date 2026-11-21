import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { layoutAt } from '../../wire/WireLayout';
import { setHealthPacket } from '../wire/definitions/worldStatus';
import SetHealthPacket from './SetHealthPacket';
import { capture } from '../../testing/evidence.test.helper';

describe('SetHealthPacket', () => {
    it('writes Health as a ZigZag varint32 and nothing else', () => {
        const packet = new SetHealthPacket({ health: 20 });
        packet.encode();

        expect([...packet.getBuffer()]).toEqual([0x2a, 0x28]);
    });

    it('zigzags a negative health rather than writing five bytes of ones', () => {
        const packet = new SetHealthPacket({ health: -1 });
        packet.encode();

        expect([...packet.getBuffer()]).toEqual([0x2a, 0x01]);
    });

    it('reads Health from a packet buffer', () => {
        const packet = new SetHealthPacket(Buffer.from([0x2a, 0x0c]));
        packet.decode();

        expect(packet.getPacketData()).toEqual({ health: 6 });
    });

    it.each([2193, 2225])('round-trips the Bedrock Dedicated Server capture at %i', (protocol) => {
        const captured = capture(protocol, 0x2a);
        const layout = layoutAt(setHealthPacket, protocol);

        const decoded = layout.decode(new BinaryStream(captured));
        expect(decoded).toEqual({ health: 20 });

        const stream = new BinaryStream();
        layout.encode(stream, decoded);
        expect(stream.getBuffer()).toEqual(captured);
    });
});
