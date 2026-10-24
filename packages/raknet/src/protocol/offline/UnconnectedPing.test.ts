import { describe, expect, it } from 'vitest';

import { OFFLINE_MESSAGE_DATA_ID } from '../../Constants';
import { MessageIdentifiers } from '../MessageIdentifiers';
import UnconnectedPing from './UnconnectedPing';

const GUID = 0x0123_4567_89ab_cdefn;

const wire = Buffer.concat([
    Buffer.from([MessageIdentifiers.UNCONNECTED_PING]),
    Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0xd2]), // timestamp 1234
    OFFLINE_MESSAGE_DATA_ID,
    Buffer.from([0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef]) // client guid
]);

describe('UnconnectedPing', () => {
    it('writes the timestamp, the magic, then the client guid', () => {
        // The guid was never written, so a RakNet server read an unassigned guid off the
        // end of every ping this library sent.
        const ping = new UnconnectedPing();
        ping.timestamp = 1234n;
        ping.clientGUID = GUID;
        ping.encode();

        expect(ping.getBuffer()).toEqual(wire);
    });

    it('reads the client guid', () => {
        const ping = new UnconnectedPing(wire);
        ping.decode();

        expect(ping.timestamp).toBe(1234n);
        expect(ping.clientGUID).toBe(GUID);
    });

    it('still decodes a ping that stops after the magic, as RakNet does', () => {
        const ping = new UnconnectedPing(wire.subarray(0, 1 + 8 + OFFLINE_MESSAGE_DATA_ID.byteLength));
        ping.decode();

        expect(ping.timestamp).toBe(1234n);
        expect(ping.clientGUID).toBe(0n);
    });
});
