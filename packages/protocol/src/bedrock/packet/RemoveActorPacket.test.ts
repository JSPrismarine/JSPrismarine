import { describe, expect, it } from 'vitest';
import RemoveActorPacket from './RemoveActorPacket';

describe('network', () => {
    describe('packet', () => {
        describe('RemoveActorPacket', () => {
            it('encodes the header and the Target Actor ID as a ZigZag varint64', () => {
                const pk = new RemoveActorPacket();
                pk.uniqueEntityId = 1234n;
                pk.encode();

                // Header: packet id 14. 1234 zigzags to 2468, LEB128 0xa4 0x13.
                expect(pk.getBuffer()).toEqual(Buffer.from([0x0e, 0xa4, 0x13]));
            });

            it('encodes a negative id through ZigZag', () => {
                const pk = new RemoveActorPacket();
                pk.uniqueEntityId = -2n;
                pk.encode();

                expect(pk.getBuffer()).toEqual(Buffer.from([0x0e, 0x03]));
            });

            it('decodes the Target Actor ID and consumes the whole buffer', () => {
                const pk = new RemoveActorPacket(Buffer.from([0x0e, 0xa4, 0x13]));
                pk.decode();

                expect(pk.uniqueEntityId).toBe(1234n);
                expect(pk.feof()).toBe(true);
            });
        });
    });
});
