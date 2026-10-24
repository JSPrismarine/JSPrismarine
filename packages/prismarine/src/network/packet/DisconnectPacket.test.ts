import { DisconnectReason } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import Identifiers from '../Identifiers';
import DisconnectPacket from './DisconnectPacket';

describe('network', () => {
    describe('packet', () => {
        describe('DisconnectPacket', () => {
            const HEADER = [0x05];

            it('writes the reason as a ZigZag varint, then both strings after a false Skip Message', () => {
                const pk = new DisconnectPacket();
                pk.reason = DisconnectReason.KICKED;
                pk.skipMessage = false;
                pk.message = 'Bye';
                pk.encode();

                expect([...pk.getBuffer()]).toEqual([
                    ...HEADER,
                    0x6e, // Reason Kicked, 55 as ZigZag 110
                    0x00, // Skip Message
                    ...[0x03, 0x42, 0x79, 0x65], // Message "Bye"
                    0x00 // Filtered Message ""
                ]);
            });

            it('writes a true Skip Message and nothing after it', () => {
                const pk = new DisconnectPacket();
                pk.reason = DisconnectReason.OUTDATED_CLIENT;
                pk.skipMessage = true;
                pk.message = 'ignored';
                pk.encode();

                expect([...pk.getBuffer()]).toEqual([...HEADER, 0x46, 0x01]); // 35 as ZigZag 70
            });

            it('spreads a reason past 63 over two varint bytes', () => {
                const pk = new DisconnectPacket();
                pk.reason = DisconnectReason.UNSUPPORTED_TRANSPORT;
                pk.skipMessage = true;
                pk.encode();

                expect([...pk.getBuffer()]).toEqual([...HEADER, 0xaa, 0x02, 0x01]); // 149 as ZigZag 298
            });

            it('defaults to reason Unknown, Skip Message false and two empty strings', () => {
                const pk = new DisconnectPacket();
                pk.encode();

                expect([...pk.getBuffer()]).toEqual([...HEADER, 0x00, 0x00, 0x00, 0x00]);
            });

            it('reads a hand-built buffer with both strings to its end', () => {
                const pk = new DisconnectPacket();
                pk.setReadBuffer(Buffer.from([...HEADER, 0x56, 0x00, 0x03, 0x42, 0x79, 0x65, 0x02, 0x42, 0x2a]));
                pk.decode();

                expect(pk.reason).toBe(DisconnectReason.LOGGED_IN_OTHER_LOCATION); // 43 as ZigZag 86
                expect(pk.skipMessage).toBe(false);
                expect(pk.message).toBe('Bye');
                expect(pk.filteredMessage).toBe('B*');
                expect(pk.feof()).toBe(true);
            });

            it('reads any non-zero Skip Message byte as skipped and stops there', () => {
                // The byte used to be read as a varuint compared against 1, so 2 meant "strings follow".
                const pk = new DisconnectPacket();
                pk.setReadBuffer(Buffer.from([...HEADER, 0x00, 0x02]));
                pk.decode();

                expect(pk.reason).toBe(DisconnectReason.UNKNOWN);
                expect(pk.skipMessage).toBe(true);
                expect(pk.feof()).toBe(true);
            });

            it('uses the network id the client expects', () => {
                expect(DisconnectPacket.NetID).toBe(Identifiers.DisconnectPacket);
                expect(DisconnectPacket.NetID).toBe(5);
            });
        });
    });
});
