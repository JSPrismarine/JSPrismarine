import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { PacketIdentifier } from '../PacketIdentifier';
import SetSpawnPositionPacket, { SpawnPositionType } from './SetSpawnPositionPacket';
import type { SetSpawnPositionPayload } from './SetSpawnPositionPacket';

/** Builds the documented 2193 layout independently of the packet encoder. */
const wireBytes = (data: SetSpawnPositionPayload): Buffer => {
    const out = new BinaryStream();
    out.writeUnsignedVarInt(PacketIdentifier.SET_SPAWN_POSITION);
    out.writeVarInt(data.type);
    out.writeVarInt(data.position.x);
    out.writeVarInt(data.position.y);
    out.writeVarInt(data.position.z);
    out.writeVarInt(data.dimension);
    out.writeVarInt(data.blockPosition.x);
    out.writeVarInt(data.blockPosition.y);
    out.writeVarInt(data.blockPosition.z);
    return out.getBuffer();
};

const worldSpawn: SetSpawnPositionPayload = {
    type: SpawnPositionType.WorldSpawn,
    position: { x: 100, y: -40, z: -250 },
    dimension: 1,
    blockPosition: { x: 3, y: -64, z: 5 }
};

const expectedBytes = [
    0x2b, // Header: id 43, no subclient ids.
    0x02, // Spawn Position Type: WorldSpawn (1) as a ZigZag varint.
    0xc8,
    0x01, // Block Position X: 100
    0x4f, // Block Position Y: -40
    0xf3,
    0x03, // Block Position Z: -250
    0x02, // Dimension type: 1
    0x06, // Spawn Block Pos X: 3
    0x7f, // Spawn Block Pos Y: -64
    0x0a // Spawn Block Pos Z: 5
];

describe('SetSpawnPositionPacket', () => {
    it('decodes both block positions with signed coordinates', () => {
        const bytes = wireBytes(worldSpawn);
        expect([...bytes]).toEqual(expectedBytes);

        const packet = new SetSpawnPositionPacket(bytes);
        packet.decode();

        expect(packet.getPacketData()).toEqual(worldSpawn);
    });

    it('encodes type, both block positions, and dimension as signed varints', () => {
        const packet = new SetSpawnPositionPacket(worldSpawn);
        packet.encode();

        expect([...packet.getBuffer()]).toEqual(expectedBytes);
    });
});
