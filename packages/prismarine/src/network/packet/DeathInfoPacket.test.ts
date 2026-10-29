import { describe, expect, it } from 'vitest';
import { netIdFor } from '../codec/v2193';

import Identifiers from '../Identifiers';
import DeathInfoPacket from './DeathInfoPacket';

/** Steve died in lava, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xbd, 0x01], // packet id 189 as a varuint32 header
    ...[0x11, ...Buffer.from('death.attack.lava', 'utf8')], // Death Cause Attack Name, 17 bytes
    0x01, // Death Cause Message List count, a varuint32
    ...[0x05, ...Buffer.from('Steve', 'utf8')] // the one parameter
]);

/** A cause with no parameters: the header, the key, a zero count. */
const NO_PARAMETERS_BYTES = Buffer.from([
    ...[0xbd, 0x01],
    ...[0x1b, ...Buffer.from('death.fell.accident.generic', 'utf8')],
    0x00
]);

describe('DeathInfoPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const packet = new DeathInfoPacket();
        packet.cause = 'death.attack.lava';
        packet.messages = ['Steve'];
        packet.encode();

        expect([...packet.getBuffer()]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const packet = new DeathInfoPacket(BYTES);
        packet.decode();

        expect(packet.cause).toBe('death.attack.lava');
        expect(packet.messages).toEqual(['Steve']);
        expect(packet.feof()).toBe(true);
    });

    it('writes a cause without parameters as the key and a zero count', () => {
        const packet = new DeathInfoPacket();
        packet.cause = 'death.fell.accident.generic';
        packet.encode();

        expect([...packet.getBuffer()]).toEqual([...NO_PARAMETERS_BYTES]);
    });

    it('reads a cause without parameters to the end of the buffer', () => {
        const packet = new DeathInfoPacket(NO_PARAMETERS_BYTES);
        packet.decode();

        expect(packet.cause).toBe('death.fell.accident.generic');
        expect(packet.messages).toEqual([]);
        expect(packet.feof()).toBe(true);
    });

    it('uses the network id the client expects', () => {
        expect(netIdFor('DeathInfoPacket')).toBe(Identifiers.DeathInfoPacket);
        expect(netIdFor('DeathInfoPacket')).toBe(0xbd);
    });
});
