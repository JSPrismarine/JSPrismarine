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

            it('numbers the statuses as the protocol 2193 docs list them', () => {
                expect(PlayStatusType.LoginSuccess).toBe(0);
                expect(PlayStatusType.LoginFailedClient).toBe(1);
                expect(PlayStatusType.LoginFailedServer).toBe(2);
                expect(PlayStatusType.PlayerSpawn).toBe(3);
                expect(PlayStatusType.LoginFailedInvalidTenant).toBe(4);
                expect(PlayStatusType.LoginFailedVanillaEdu).toBe(5);
                expect(PlayStatusType.LoginFailedEduVanilla).toBe(6);
                expect(PlayStatusType.LoginFailedServerFull).toBe(7);
                expect(PlayStatusType.LoginFailedEditorVanilla).toBe(8);
                expect(PlayStatusType.LoginFailedVanillaEditor).toBe(9);
            });

            it('uses the network id the client expects', () => {
                expect(PlayStatusPacket.NetID).toBe(Identifiers.PlayStatusPacket);
                expect(PlayStatusPacket.NetID).toBe(0x02);
            });
        });
    });
});
