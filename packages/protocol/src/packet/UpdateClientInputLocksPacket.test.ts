import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import UpdateClientInputLocksPacket, { ClientInputLock } from './UpdateClientInputLocksPacket';

import type { UpdateClientInputLocks } from './UpdateClientInputLocksPacket';

const DATA: UpdateClientInputLocks = {
    locks: ClientInputLock.Camera | ClientInputLock.Jump | ClientInputLock.MoveLeft
};

/** `DATA` on the wire, header included: the bitmask 2 | 64 | 2048 = 2114 as a varuint32. */
const BYTES = Buffer.from([
    ...[0xc4, 0x01], // packet id header: 196 as a varuint32
    ...[0xc2, 0x10] // Input Lock ComponentData 2114, varuint32 in two bytes
]);

/** Every input unlocked: the header and a single zero byte. */
const UNLOCKED_BYTES = Buffer.from([0xc4, 0x01, 0x00]);

describe('UpdateClientInputLocksPacket', () => {
    it('writes the bitmask as one varuint32 after the header', () => {
        const buffer = new UpdateClientInputLocksPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new UpdateClientInputLocksPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('writes no locks as a single zero byte', () => {
        const buffer = new UpdateClientInputLocksPacket({ locks: ClientInputLock.None }).serialize(
            new NetworkBinaryStream()
        );

        expect([...buffer]).toEqual([...UNLOCKED_BYTES]);
    });

    it('round-trips every lock bit at once', () => {
        const all: UpdateClientInputLocks = {
            locks:
                ClientInputLock.Camera |
                ClientInputLock.Movement |
                ClientInputLock.LateralMovement |
                ClientInputLock.Sneak |
                ClientInputLock.Jump |
                ClientInputLock.Mount |
                ClientInputLock.Dismount |
                ClientInputLock.MoveForward |
                ClientInputLock.MoveBackward |
                ClientInputLock.MoveLeft |
                ClientInputLock.MoveRight
        };
        const buffer = new UpdateClientInputLocksPacket(all).serialize(new NetworkBinaryStream());
        const stream = new NetworkBinaryStream(buffer);

        expect(new UpdateClientInputLocksPacket().deserialize(stream)).toEqual(all);
        expect(stream.feof()).toBe(true);
    });
});
