import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, setActorLinkPacket } from '@jsprismarine/protocol';
import { ActorLinkType } from '@jsprismarine/protocol/wire/definitions/addActor';
import { describe, expect, it } from 'vitest';

/** The bytes the hand-written encoder produced, recorded before the class moved to the layout. */
const BYTES = Buffer.from('02030101000000003f', 'hex');

const payload = {
    link: {
        targetA: 1n,
        targetB: -2n,
        type: ActorLinkType.Riding,
        immediate: true,
        passengerInitiated: false,
        vehicleAngularVelocity: 0.5
    }
};

describe('the declarative SetActorLink layout', () => {
    const layout = layoutAt(setActorLinkPacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(BYTES);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(BYTES))).toEqual(payload);
    });

    it('rejects a link type the protocol does not define', () => {
        expect(() => layout.decode(new BinaryStream(Buffer.from('02030701000000003f', 'hex')))).toThrow(
            /unknown link type 7/
        );
    });
});
