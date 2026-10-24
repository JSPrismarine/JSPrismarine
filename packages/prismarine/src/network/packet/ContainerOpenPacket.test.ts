import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import ContainerOpenPacket from './ContainerOpenPacket';

describe('network', () => {
    describe('ContainerOpenPacket', () => {
        it('writes the position as a signed BlockPos, not an unsigned one', () => {
            // All three coordinates are varint32s. Writing Y unsigned, as protocol 924 did,
            // turned a y of 64 into 32 on the client and named a block holding no container.
            const packet = Object.assign(new ContainerOpenPacket(), {
                windowId: 2,
                containerType: 0,
                containerPos: new Vector3(1, 64, -3),
                containerEntityId: -1n
            });
            packet.encode();

            expect([...packet.getBuffer()]).toEqual([
                ContainerOpenPacket.NetID,
                2, // Container Id.
                0, // Container Type.
                2, // X, ZigZag 1.
                128,
                1, // Y, ZigZag 64.
                5, // Z, ZigZag -3.
                1 // Target Actor ID, ZigZag -1.
            ]);
        });

        it('reads a hand-built buffer and consumes all of it', () => {
            const stream = new BinaryStream();
            stream.writeUnsignedVarInt(ContainerOpenPacket.NetID);
            stream.writeByte(5);
            stream.writeByte(1);
            stream.writeVarInt(-10);
            stream.writeVarInt(70);
            stream.writeVarInt(12);
            stream.writeVarLong(9n);

            const packet = new ContainerOpenPacket(stream.getBuffer());
            packet.decode();

            expect(packet.windowId).toBe(5);
            expect(packet.containerType).toBe(1);
            expect(packet.containerPos.getX()).toBe(-10);
            expect(packet.containerPos.getY()).toBe(70);
            expect(packet.containerPos.getZ()).toBe(12);
            expect(packet.containerEntityId).toBe(9n);
            expect(packet.feof()).toBe(true);
        });
    });
});
