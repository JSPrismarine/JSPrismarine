import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import PresenceConfig from '../structure/PresenceConfig';
import ServerPresenceInfoPacket from './ServerPresenceInfoPacket';

import type { ServerPresenceInfo } from './ServerPresenceInfoPacket';

const DATA: ServerPresenceInfo = {
    presenceConfiguration: new PresenceConfig('lobby')
};

/** `DATA` on the wire, header bytes included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xdb, 0x02], // packet id header: 347 as a varuint32
    0x01, // richPresenceId is present
    ...[0x05, ...Buffer.from('lobby', 'utf8')] // richPresenceId
]);

/** A server that stops overriding the presence: the header and one absent-id byte. */
const NO_OVERRIDE: ServerPresenceInfo = { presenceConfiguration: new PresenceConfig() };
const NO_OVERRIDE_BYTES = Buffer.from([0xdb, 0x02, 0x00]);

describe('ServerPresenceInfoPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new ServerPresenceInfoPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new ServerPresenceInfoPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('writes an unset id as a single zero byte after the header', () => {
        const buffer = new ServerPresenceInfoPacket(NO_OVERRIDE).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...NO_OVERRIDE_BYTES]);
    });

    it('reads an unset id to the end of the buffer', () => {
        const stream = new NetworkBinaryStream(NO_OVERRIDE_BYTES);
        const data = new ServerPresenceInfoPacket().deserialize(stream);

        expect(data.presenceConfiguration.richPresenceId).toBeUndefined();
        expect(stream.feof()).toBe(true);
    });

    it('round-trips a populated packet', () => {
        const buffer = new ServerPresenceInfoPacket(DATA).serialize(new NetworkBinaryStream());
        const data = new ServerPresenceInfoPacket().deserialize(new NetworkBinaryStream(buffer));

        expect(data).toEqual(DATA);
    });
});
