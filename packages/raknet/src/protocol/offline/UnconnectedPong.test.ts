import { describe, expect, it } from 'vitest';

import { OFFLINE_MESSAGE_DATA_ID } from '../../Constants';
import { MessageIdentifiers } from '../MessageIdentifiers';
import UnconnectedPong from './UnconnectedPong';

/**
 * A guid with its top bit set. Half of all random guids look like this, and a Bedrock
 * Dedicated Server prints such a guid unsigned in the MOTD line, so the header and the
 * line only agree if the header is read unsigned too.
 */
const GUID = 0xffff_ffff_ffff_fffen;

const wire = Buffer.concat([
    Buffer.from([MessageIdentifiers.UNCONNECTED_PONG]),
    Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0xd2]), // timestamp 1234
    Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xfe]), // server guid
    OFFLINE_MESSAGE_DATA_ID,
    Buffer.from([0x00, 0x04]), // string length
    Buffer.from('MCPE', 'ascii')
]);

describe('UnconnectedPong', () => {
    it('writes the timestamp, the guid, the magic, then the MOTD string', () => {
        const pong = new UnconnectedPong();
        pong.timestamp = 1234n;
        pong.serverGuid = GUID;
        pong.serverName = 'MCPE';
        pong.encode();

        expect(pong.getBuffer()).toEqual(wire);
    });

    it('reads the guid back unsigned', () => {
        const pong = new UnconnectedPong(wire);
        pong.decode();

        // Read signed, these bytes were -2n.
        expect(pong.serverGuid).toBe(GUID);
        expect(pong.timestamp).toBe(1234n);
        expect(pong.serverName).toBe('MCPE');
    });
});
