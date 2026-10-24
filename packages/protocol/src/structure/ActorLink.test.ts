import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import ActorLink from './ActorLink';

// One group per docs field, in wire order.
const wire = Buffer.from([
    0x02, // Target A: varint64 ZigZag 1
    0x04, // Target B: varint64 ZigZag 2
    0x01, // Type: uint8 Riding
    0x00, // Immediate
    0x01, // Passenger Initiated
    0x00,
    0x00,
    0x00,
    0x3f // Vehicle Angular Velocity: float LE 0.5
]);

describe('ActorLink', () => {
    it('serializes the six fields in docs order', () => {
        const stream = new NetworkBinaryStream();
        new ActorLink(1n, 2n, 1, false, true, 0.5).serialize(stream);

        expect(stream.getBuffer()).toEqual(wire);
    });

    it('deserializes a hand-built buffer and consumes it all', () => {
        const stream = new NetworkBinaryStream(wire);
        const link = ActorLink.deserialize(stream);

        expect(link.actorAUniqueID).toBe(1n);
        expect(link.actorBUniqueID).toBe(2n);
        expect(link.type).toBe(1);
        expect(link.immediate).toBe(false);
        expect(link.riderInitiated).toBe(true);
        expect(link.vehicleAngularVelocity).toBe(0.5);
        expect(stream.feof()).toBe(true);
    });
});
