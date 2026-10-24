import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import Identifiers from '../Identifiers';
import SetSpawnPositionPacket, { SpawnPositionType } from './SetSpawnPositionPacket';

/**
 * The packet under protocol 2193: header, Spawn Position Type, Block Position, Dimension type,
 * Spawn Block Pos. Every field is a ZigZag varint32, including both y coordinates. Built by
 * hand so the test pins the layout rather than trusting `encodePayload` to agree with
 * `decodePayload`.
 */
const wireBytes = (type: number, position: Vector3, dimension: number, blockPosition: Vector3): Buffer => {
    const out = new BinaryStream();
    out.writeUnsignedVarInt(Identifiers.SetSpawnPositionPacket);
    out.writeVarInt(type);
    out.writeVarInt(position.getX());
    out.writeVarInt(position.getY());
    out.writeVarInt(position.getZ());
    out.writeVarInt(dimension);
    out.writeVarInt(blockPosition.getX());
    out.writeVarInt(blockPosition.getY());
    out.writeVarInt(blockPosition.getZ());
    return out.getBuffer();
};

/**
 * The same packet as literal bytes, so a change to `BinaryStream` cannot hide a layout change.
 */
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

describe('network', () => {
    describe('packet', () => {
        describe('SetSpawnPositionPacket', () => {
            it('reads both block positions with a signed y, then stops at the end', () => {
                const buffer = wireBytes(
                    SpawnPositionType.WorldSpawn,
                    new Vector3(100, -40, -250),
                    1,
                    new Vector3(3, -64, 5)
                );
                expect([...buffer]).toEqual(expectedBytes);

                const packet = new SetSpawnPositionPacket(buffer);
                packet.decode();

                expect(packet.type).toBe(SpawnPositionType.WorldSpawn);
                expect(packet.position.getX()).toBe(100);
                expect(packet.position.getY()).toBe(-40);
                expect(packet.position.getZ()).toBe(-250);
                expect(packet.dimension).toBe(1);
                expect(packet.blockPosition.getX()).toBe(3);
                expect(packet.blockPosition.getY()).toBe(-64);
                expect(packet.blockPosition.getZ()).toBe(5);
                expect(packet.feof()).toBe(true);
            });

            it('writes type, both block positions and the dimension as signed varints', () => {
                const packet = new SetSpawnPositionPacket();
                packet.type = SpawnPositionType.WorldSpawn;
                packet.position = new Vector3(100, -40, -250);
                packet.dimension = 1;
                packet.blockPosition = new Vector3(3, -64, 5);
                packet.encode();

                expect([...packet.getBuffer()]).toEqual(expectedBytes);
            });
        });
    });
});
