import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import SetLocalPlayerAsInitializedPacket from './SetLocalPlayerAsInitializedPacket';

import type { SetLocalPlayerAsInitialized } from './SetLocalPlayerAsInitializedPacket';

const DATA: SetLocalPlayerAsInitialized = { runtimeEntityId: 300n };

/** `DATA` on the wire, header byte included: id 113, then 300 as a varuint64. */
const BYTES = Buffer.from([0x71, 0xac, 0x02]);

/** A runtime id past the 32 bit range, 2^33, which takes five LEB128 bytes. */
const WIDE: SetLocalPlayerAsInitialized = { runtimeEntityId: 8589934592n };
const WIDE_BYTES = Buffer.from([0x71, 0x80, 0x80, 0x80, 0x80, 0x20]);

describe('SetLocalPlayerAsInitializedPacket', () => {
    it('writes the runtime id as a varuint64 after the header', () => {
        const buffer = new SetLocalPlayerAsInitializedPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new SetLocalPlayerAsInitializedPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('round-trips a runtime id wider than 32 bits', () => {
        const buffer = new SetLocalPlayerAsInitializedPacket(WIDE).serialize(new NetworkBinaryStream());
        expect([...buffer]).toEqual([...WIDE_BYTES]);

        const stream = new NetworkBinaryStream(WIDE_BYTES);
        expect(new SetLocalPlayerAsInitializedPacket().deserialize(stream)).toEqual(WIDE);
        expect(stream.feof()).toBe(true);
    });
});
