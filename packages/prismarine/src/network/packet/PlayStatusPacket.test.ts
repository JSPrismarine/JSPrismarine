import { describe, expect, it } from 'vitest';

import Identifiers from '../Identifiers';
import PlayStatusType from '../type/PlayStatusType';
import PlayStatusPacket from './PlayStatusPacket';

describe('network', () => {
    describe('packet', () => {
        describe('PlayStatusPacket', () => {
            it('writes the status as a big-endian int32 and nothing else', () => {
                const pk = new PlayStatusPacket();
                pk.status = PlayStatusType.PlayerSpawn;
                pk.encode();

                const payload = pk.getBuffer().subarray(1); // drop the packet id header

                expect([...payload]).toEqual([0x00, 0x00, 0x00, 0x03]);
            });

            it('reads a hand-built buffer to its end', () => {
                const pk = new PlayStatusPacket();
                pk.setReadBuffer(Buffer.from([0x02, 0x00, 0x00, 0x00, 0x07]));
                pk.decode();

                expect(pk.status).toBe(PlayStatusType.LoginFailedServerFull);
                expect(pk.feof()).toBe(true);
            });

            it('uses the network id the client expects', () => {
                expect(PlayStatusPacket.NetID).toBe(Identifiers.PlayStatusPacket);
                expect(PlayStatusPacket.NetID).toBe(0x02);
            });
        });
    });
});
