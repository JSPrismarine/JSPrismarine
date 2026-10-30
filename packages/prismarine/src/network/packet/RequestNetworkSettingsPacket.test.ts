import { describe, expect, it } from 'vitest';
import { netIdFor } from '@jsprismarine/protocol/wire/versions/v2193';

import Identifiers from '../Identifiers';
import RequestNetworkSettingsPacket from './RequestNetworkSettingsPacket';

describe('network', () => {
    describe('packet', () => {
        describe('RequestNetworkSettingsPacket', () => {
            const HEADER = [0xc1, 0x01]; // 193 as LEB128

            it('writes ClientNetworkVersion as a big endian int32', () => {
                const pk = new RequestNetworkSettingsPacket();
                pk.protocolVersion = 2193;
                pk.encode();

                // 2193 is 0x00000891. Little endian would put the 0x91 first and the client
                // would read a protocol in the billions.
                expect([...pk.getBuffer()]).toEqual([...HEADER, 0x00, 0x00, 0x08, 0x91]);
            });

            it('reads a hand-built buffer to its end', () => {
                const pk = new RequestNetworkSettingsPacket();
                pk.setReadBuffer(Buffer.from([...HEADER, 0x00, 0x00, 0x08, 0x91]));
                pk.decode();

                expect(pk.protocolVersion).toBe(2193);
                expect(pk.feof()).toBe(true);
            });

            it('uses the network id the client expects', () => {
                expect(netIdFor('RequestNetworkSettingsPacket')).toBe(Identifiers.RequestNetworkSettingsPacket);
                expect(netIdFor('RequestNetworkSettingsPacket')).toBe(193);
            });
        });
    });
});
