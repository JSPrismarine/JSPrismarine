import { describe, expect, it } from 'vitest';
import SetTimePacket from './SetTimePacket';

describe('network', () => {
    describe('packet', () => {
        describe('SetTimePacket', () => {
            it('encodes the header and the time as a ZigZag varint32', () => {
                const pk = new SetTimePacket();
                pk.time = 6000;
                pk.encode();

                // Header: packet id 10. Time: 6000 zigzags to 12000, LEB128 0xe0 0x5d.
                expect(pk.getBuffer()).toEqual(Buffer.from([0x0a, 0xe0, 0x5d]));
            });

            it('encodes a negative time through ZigZag', () => {
                const pk = new SetTimePacket();
                pk.time = -6000;
                pk.encode();

                // -6000 zigzags to 11999, LEB128 0xdf 0x5d.
                expect(pk.getBuffer()).toEqual(Buffer.from([0x0a, 0xdf, 0x5d]));
            });

            it('decodes the time and consumes the whole buffer', () => {
                const pk = new SetTimePacket(Buffer.from([0x0a, 0xe0, 0x5d]));
                pk.decode();

                expect(pk.time).toBe(6000);
                expect(pk.feof()).toBe(true);
            });
        });
    });
});
