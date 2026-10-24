import { DisconnectReason } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import Identifiers from '../Identifiers';
import DisconnectPacket from './DisconnectPacket';

describe('network', () => {
    describe('packet', () => {
        describe('DisconnectPacket', () => {
            const HEADER = 0x05;

            /** Reason `Kicked` (55, ZigZag 110), selector 0, `Message` "Bye", empty `Filtered Message`. */
            const KICKED_WITH_MESSAGE = [0x6e, 0x00, 0x03, 0x42, 0x79, 0x65, 0x00];
            /** Reason `Unknown`, selector 1, nothing after it. */
            const UNKNOWN_WITHOUT_MESSAGE = [0x00, 0x01];

            const encode = (mutate: (pk: DisconnectPacket) => void) => {
                const pk = new DisconnectPacket();
                mutate(pk);
                pk.encode();
                return [...pk.getBuffer().subarray(1)]; // drop the packet id header
            };

            const decode = (payload: number[]) => {
                const pk = new DisconnectPacket();
                pk.setReadBuffer(Buffer.from([HEADER, ...payload]));
                pk.decode();
                return pk;
            };

            it('writes the reason as a ZigZag varint and both strings after selector 0', () => {
                const payload = encode((pk) => {
                    pk.reason = DisconnectReason.KICKED;
                    pk.skipMessage = false;
                    pk.message = 'Bye';
                    pk.filteredMessage = '';
                });

                expect(payload).toEqual(KICKED_WITH_MESSAGE);
            });

            it('writes selector 1 and nothing after it when the message is skipped', () => {
                const payload = encode((pk) => {
                    pk.reason = DisconnectReason.UNKNOWN;
                    pk.skipMessage = true;
                });

                expect(payload).toEqual(UNKNOWN_WITHOUT_MESSAGE);
            });

            it('defaults to reason Unknown and two empty strings', () => {
                const payload = encode((pk) => {
                    pk.skipMessage = false;
                });

                expect(payload).toEqual([0x00, 0x00, 0x00, 0x00]);
            });

            it('reads a reason and both strings, and nothing past them', () => {
                const pk = decode(KICKED_WITH_MESSAGE);

                expect(pk.reason).toBe(DisconnectReason.KICKED);
                expect(pk.skipMessage).toBe(false);
                expect(pk.message).toBe('Bye');
                expect(pk.filteredMessage).toBe('');
                expect(pk.feof()).toBe(true);
            });

            it('reads selector 1 as a skipped message and stops there', () => {
                const pk = decode(UNKNOWN_WITHOUT_MESSAGE);

                expect(pk.reason).toBe(DisconnectReason.UNKNOWN);
                expect(pk.skipMessage).toBe(true);
                expect(pk.feof()).toBe(true);
            });

            it('uses the network id the client expects', () => {
                expect(DisconnectPacket.NetID).toBe(Identifiers.DisconnectPacket);
                expect(DisconnectPacket.NetID).toBe(HEADER);
            });
        });
    });
});
