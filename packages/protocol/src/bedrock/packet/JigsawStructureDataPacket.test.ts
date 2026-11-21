import { jigsaw_structure_data } from '@jsprismarine/bedrock-data';
import { netIdFor } from '@jsprismarine/protocol/bedrock/wire/versions/v2193';

import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTReader } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import { PacketIdentifier } from '../PacketIdentifier';
import JigsawStructureDataPacket from './JigsawStructureDataPacket';
import { capture } from '../../testing/evidence.test.helper';

/** A payload a real Bedrock Dedicated Server sent at `protocolVersion`, without the packet id. */
const captured = (protocolVersion: number): Buffer => capture(protocolVersion, 0x139);

describe('network', () => {
    describe('packet', () => {
        describe('JigsawStructureDataPacket', () => {
            it('writes the packet id as a varuint followed by the payload bytes', () => {
                const pk = new JigsawStructureDataPacket();
                pk.encode({ protocolVersion: 2193, jigsawStructureData: jigsaw_structure_data });

                const buffer = pk.getBuffer();

                // 313 = 0x139 in LEB128: the low seven bits with the continuation bit, then 0x02.
                expect([...buffer.subarray(0, 2)]).toEqual([0xb9, 0x02]);
                expect(buffer.subarray(2).equals(jigsaw_structure_data)).toBe(true);
            });

            it('ships exactly one network NBT compound as the default payload', () => {
                // A compound tag with an empty name.
                expect([...jigsaw_structure_data.subarray(0, 2)]).toEqual([0x0a, 0x00]);

                const stream = new BinaryStream(jigsaw_structure_data);
                const reader = new NBTReader(stream, ByteOrder.LITTLE_ENDIAN);
                reader.setUseVarint(true);
                const root = reader.parse();

                expect(stream.feof()).toBe(true);
                expect(stream.getReadIndex()).toBe(jigsaw_structure_data.length);
                expect(root.has('jigsaws')).toBe(true);
                expect(root.getList('jigsaws', false)?.size).toBeGreaterThan(0);
            });

            it('reads a hand-built buffer to its end', () => {
                const pk = new JigsawStructureDataPacket();
                pk.setReadBuffer(Buffer.from([0xb9, 0x02, 0x0a, 0x00, 0x00]));
                pk.decode();

                expect(pk.structureData).toEqual(Buffer.from([0x0a, 0x00, 0x00]));
                expect(pk.feof()).toBe(true);
            });

            it.each([2193, 2225])(
                'round-trips the payload a real server sent at protocol %i byte for byte',
                (protocolVersion) => {
                    const payload = captured(protocolVersion);

                    // The captured compound is one network NBT value that ends at the last byte.
                    const stream = new BinaryStream(payload);
                    const reader = new NBTReader(stream, ByteOrder.LITTLE_ENDIAN);
                    reader.setUseVarint(true);
                    reader.parse();
                    expect(stream.feof()).toBe(true);

                    const received = new JigsawStructureDataPacket(Buffer.concat([Buffer.from([0xb9, 0x02]), payload]));
                    received.decode({ protocolVersion });
                    expect(received.structureData?.equals(payload)).toBe(true);

                    const sent = new JigsawStructureDataPacket();
                    sent.structureData = received.structureData;
                    sent.encode({ protocolVersion });
                    expect(sent.getBuffer().subarray(2).equals(payload)).toBe(true);
                }
            );

            it('uses the network id the client expects', () => {
                expect(netIdFor('JigsawStructureDataPacket')).toBe(PacketIdentifier.JIGSAW_STRUCTURE_DATA);
                expect(netIdFor('JigsawStructureDataPacket')).toBe(0x139);
            });
        });
    });
});
