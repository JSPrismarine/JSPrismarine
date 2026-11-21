import { describe, expect, it } from 'vitest';
import { ActorLinkType } from '../wire/definitions/addActor';
import SetActorLinkPacket from './SetActorLinkPacket';

describe('SetActorLinkPacket', () => {
    // Header 0x29. Target A 1 zigzags to 2 and target B -2 to 3, the type is Riding,
    // immediate is set, the passenger did not start it, and the angular velocity is 0.5.
    const encoded = Buffer.from([0x29, 0x02, 0x03, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x3f]);

    it('decodes the link, consuming the whole buffer', () => {
        const packet = new SetActorLinkPacket(encoded);
        packet.decode();

        expect(packet.link).toEqual({
            targetA: 1n,
            targetB: -2n,
            type: ActorLinkType.Riding,
            immediate: true,
            passengerInitiated: false,
            vehicleAngularVelocity: 0.5
        });
        expect(packet.feof()).toBe(true);
    });

    it('rejects a link type the protocol does not define', () => {
        const packet = new SetActorLinkPacket(
            Buffer.from([0x29, 0x02, 0x03, 0x07, 0x01, 0x00, 0x00, 0x00, 0x00, 0x3f])
        );

        expect(() => packet.decode()).toThrow(/unknown link type 7/);
    });

    it('encodes the link back to the same bytes', () => {
        const packet = new SetActorLinkPacket();
        packet.link = {
            targetA: 1n,
            targetB: -2n,
            type: ActorLinkType.Riding,
            immediate: true,
            passengerInitiated: false,
            vehicleAngularVelocity: 0.5
        };
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });
});
