import { describe, expect, it } from 'vitest';
import { netIdFor } from '@jsprismarine/protocol/wire/versions/v2193';

import Identifiers from '../Identifiers';
import PlayStatus from '../type/PlayStatus';
import PlayStatusPacket from './PlayStatusPacket';

describe('network', () => {
    describe('packet', () => {
        describe('PlayStatusPacket', () => {
            it('writes the status as a big-endian int32 and nothing else', () => {
                const pk = new PlayStatusPacket();
                pk.status = PlayStatus.PlayerSpawn;
                pk.encode();

                const payload = pk.getBuffer().subarray(1); // drop the packet id header

                expect([...payload]).toEqual([0x00, 0x00, 0x00, 0x03]);
            });

            it('reads a hand-built buffer to its end', () => {
                const pk = new PlayStatusPacket();
                pk.setReadBuffer(Buffer.from([0x02, 0x00, 0x00, 0x00, 0x07]));
                pk.decode();

                expect(pk.status).toBe(PlayStatus.LoginFailed_ServerFullSubClient);
                expect(pk.feof()).toBe(true);
            });

            it('numbers the statuses as the protocol 2193 docs list them', () => {
                expect(PlayStatus.LoginSuccess).toBe(0);
                expect(PlayStatus.LoginFailed_ClientOld).toBe(1);
                expect(PlayStatus.LoginFailed_ServerOld).toBe(2);
                expect(PlayStatus.PlayerSpawn).toBe(3);
                expect(PlayStatus.LoginFailed_InvalidTenant).toBe(4);
                expect(PlayStatus.LoginFailed_EditionMismatchEduToVanilla).toBe(5);
                expect(PlayStatus.LoginFailed_EditionMismatchVanillaToEdu).toBe(6);
                expect(PlayStatus.LoginFailed_ServerFullSubClient).toBe(7);
                expect(PlayStatus.LoginFailed_EditorMismatchEditorToVanilla).toBe(8);
                expect(PlayStatus.LoginFailed_EditorMismatchVanillaToEditor).toBe(9);
            });

            it('uses the network id the client expects', () => {
                expect(netIdFor('PlayStatusPacket')).toBe(Identifiers.PlayStatusPacket);
                expect(netIdFor('PlayStatusPacket')).toBe(0x02);
            });
        });
    });
});
