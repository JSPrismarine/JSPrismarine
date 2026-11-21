import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../../NetworkBinaryStream';
import PresenceConfig from '../structure/PresenceConfig';
import ServerPresenceInfoPacket from './ServerPresenceInfoPacket';

import type { ServerPresenceInfo } from './ServerPresenceInfoPacket';

const DATA: ServerPresenceInfo = {
    presenceConfiguration: new PresenceConfig('lobby')
};

/** `DATA` on the wire, header bytes included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xdb, 0x02], // packet id header: 347 as a varuint32
    0x01, // presence_configuration is present
    0x01, // richPresenceId is present
    ...[0x05, ...Buffer.from('lobby', 'utf8')] // richPresenceId
]);

/** A configuration with no id: the client keeps driving its own rich presence. */
const NO_ID: ServerPresenceInfo = { presenceConfiguration: new PresenceConfig() };
const NO_ID_BYTES = Buffer.from([0xdb, 0x02, 0x01, 0x00]);

/** No configuration at all: the header and one absent byte. */
const NO_CONFIGURATION: ServerPresenceInfo = { presenceConfiguration: undefined };
const NO_CONFIGURATION_BYTES = Buffer.from([0xdb, 0x02, 0x00]);

/** Both versions carry the same layout: 1.26.60's "is now optional" row corrects the docs. */
const VERSIONS = [2193, 2225] as const;

describe.each(VERSIONS)('ServerPresenceInfoPacket at protocol %i', (protocolVersion) => {
    const context = { protocolVersion };

    it('writes every field in the order the docs define', () => {
        const buffer = new ServerPresenceInfoPacket(DATA).serialize(new NetworkBinaryStream(), context);

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new ServerPresenceInfoPacket().deserialize(stream, context);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('writes a configuration without an id as two presence bytes', () => {
        const buffer = new ServerPresenceInfoPacket(NO_ID).serialize(new NetworkBinaryStream(), context);

        expect([...buffer]).toEqual([...NO_ID_BYTES]);
    });

    it('reads a configuration without an id to the end of the buffer', () => {
        const stream = new NetworkBinaryStream(NO_ID_BYTES);
        const data = new ServerPresenceInfoPacket().deserialize(stream, context);

        expect(data.presenceConfiguration?.richPresenceId).toBeUndefined();
        expect(stream.feof()).toBe(true);
    });

    it('writes an absent configuration as a single zero byte after the header', () => {
        const buffer = new ServerPresenceInfoPacket(NO_CONFIGURATION).serialize(new NetworkBinaryStream(), context);

        expect([...buffer]).toEqual([...NO_CONFIGURATION_BYTES]);
    });

    it('reads an absent configuration to the end of the buffer', () => {
        const stream = new NetworkBinaryStream(NO_CONFIGURATION_BYTES);
        const data = new ServerPresenceInfoPacket().deserialize(stream, context);

        expect(data.presenceConfiguration).toBeUndefined();
        expect(stream.feof()).toBe(true);
    });

    it('round-trips a populated packet', () => {
        const buffer = new ServerPresenceInfoPacket(DATA).serialize(new NetworkBinaryStream(), context);
        const data = new ServerPresenceInfoPacket().deserialize(new NetworkBinaryStream(buffer), context);

        expect(data).toEqual(DATA);
    });
});
