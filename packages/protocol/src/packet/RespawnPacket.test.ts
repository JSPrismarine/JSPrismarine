import { PlayerRespawnState } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import { PacketIdentifier } from '../PacketIdentifier';
import RespawnPacket from './RespawnPacket';
import type { RespawnPayload } from './RespawnPacket';

const payload: RespawnPayload = {
    position: { x: 1.5, y: 64.25, z: -3.75 },
    state: PlayerRespawnState.READY_TO_SPAWN,
    runtimeEntityId: 7n
};

/** Header, Position, State, Player Runtime Id. */
const wire = [
    0x2d, // Header: id 45, no subclient ids.
    0x00,
    0x00,
    0xc0,
    0x3f, // Position X: 1.5
    0x00,
    0x80,
    0x80,
    0x42, // Position Y: 64.25
    0x00,
    0x00,
    0x70,
    0xc0, // Position Z: -3.75
    0x01, // State: ReadyToSpawn, a plain uint8
    0x07 // Player Runtime Id: 7 as a varuint64
];

describe('RespawnPacket', () => {
    it('encodes Position, State, and Player Runtime Id in docs order', () => {
        const packet = new RespawnPacket(payload);
        packet.encode();

        expect([...packet.getBuffer()]).toEqual(wire);
    });

    it('writes the origin when given an origin position', () => {
        const packet = new RespawnPacket({
            position: { x: 0, y: 0, z: 0 },
            state: PlayerRespawnState.SEARCHING_FOR_SPAWN,
            runtimeEntityId: 0n
        });
        packet.encode();

        expect([...packet.getBuffer()]).toEqual([0x2d, ...new Array<number>(12).fill(0), 0x00, 0x00]);
    });

    it('decodes a packet buffer', () => {
        const packet = new RespawnPacket(Buffer.from(wire));
        packet.decode();

        expect(packet.getPacketData()).toEqual(payload);
    });

    it('uses the expected network identifier', () => {
        expect(new RespawnPacket(payload).getId()).toBe(PacketIdentifier.RESPAWN);
    });

    it('numbers the states the way the docs do', () => {
        expect(PlayerRespawnState.SEARCHING_FOR_SPAWN).toBe(0);
        expect(PlayerRespawnState.READY_TO_SPAWN).toBe(1);
        expect(PlayerRespawnState.CLIENT_READY_TO_SPAWN).toBe(2);
    });
});
