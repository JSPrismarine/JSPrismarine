import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { layoutAt, setActorMotionPacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import SetActorMotionPacket from './SetActorMotionPacket';

/** The layout must write the bytes the hand-written encoder wrote, and read them back whole. */
describe('the declarative SetActorMotion layout', () => {
    const fill = (): SetActorMotionPacket => {
        const packet = new SetActorMotionPacket();
        packet.runtimeEntityId = 5n;
        packet.motion = new Vector3(0.25, 0.5, -0.75);
        packet.tick = 42n;
        return packet;
    };

    const payloadOf = (packet: SetActorMotionPacket) => ({
        runtimeEntityId: packet.runtimeEntityId,
        motion: packet.motion,
        tick: packet.tick
    });

    it('matches the bytes the class wrote', () => {
        const packet = fill();

        const expected = new BinaryStream();
        expected.writeUnsignedVarLong(packet.runtimeEntityId);
        expected.writeFloatLE(packet.motion.getX());
        expected.writeFloatLE(packet.motion.getY());
        expected.writeFloatLE(packet.motion.getZ());
        expected.writeUnsignedVarLong(packet.tick);

        const stream = new BinaryStream();
        layoutAt(setActorMotionPacket, 2193).encode(stream, payloadOf(packet));

        expect(stream.getBuffer()).toEqual(expected.getBuffer());
    });

    it('round-trips through the packet class and consumes the payload', () => {
        const sent = fill();
        sent.encodePayload();

        const received = new SetActorMotionPacket(sent.getBuffer());
        received.decodePayload();

        expect(payloadOf(received)).toEqual(payloadOf(sent));
        expect(received.feof()).toBe(true);
    });
});
