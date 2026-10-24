import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import DeathInfoPacket from './DeathInfoPacket';

import type { DeathInfo } from './DeathInfoPacket';

const DATA: DeathInfo = {
    cause: 'death.attack.lava',
    messages: ['Steve']
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xbd, 0x01], // packet id 189 as a varuint32 header
    ...[0x11, ...Buffer.from('death.attack.lava', 'utf8')], // Death Cause Attack Name, 17 bytes
    0x01, // Death Cause Message List count, a varuint32
    ...[0x05, ...Buffer.from('Steve', 'utf8')] // the one message parameter
]);

/** A cause with no parameters: the header, the key, a zero count. */
const NO_PARAMETERS: DeathInfo = { cause: 'death.fell.accident.generic', messages: [] };

const NO_PARAMETERS_BYTES = Buffer.from([
    ...[0xbd, 0x01],
    ...[0x1b, ...Buffer.from('death.fell.accident.generic', 'utf8')],
    0x00
]);

describe('DeathInfoPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new DeathInfoPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new DeathInfoPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('writes a cause without parameters as the key and a zero count', () => {
        const buffer = new DeathInfoPacket(NO_PARAMETERS).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...NO_PARAMETERS_BYTES]);
    });

    it('reads a cause without parameters to the end of the buffer', () => {
        const stream = new NetworkBinaryStream(NO_PARAMETERS_BYTES);
        const data = new DeathInfoPacket().deserialize(stream);

        expect(data).toEqual(NO_PARAMETERS);
        expect(stream.feof()).toBe(true);
    });
});
