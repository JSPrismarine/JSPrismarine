import { jigsaw_structure_data } from '@jsprismarine/bedrock-data';
import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTReader } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import Identifiers from '../Identifiers';
import JigsawStructureDataPacket from './JigsawStructureDataPacket';

describe('network', () => {
    describe('packet', () => {
        describe('JigsawStructureDataPacket', () => {
            it('writes the packet id as a varuint followed by the payload bytes', () => {
                const pk = new JigsawStructureDataPacket();
                pk.encode();

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

                expect([...pk.structureData]).toEqual([0x0a, 0x00, 0x00]);
                expect(pk.feof()).toBe(true);
            });

            it('uses the network id the client expects', () => {
                expect(JigsawStructureDataPacket.NetID).toBe(Identifiers.JigsawStructureDataPacket);
                expect(JigsawStructureDataPacket.NetID).toBe(0x139);
            });
        });
    });
});
