import { biome_definitions_network } from '@jsprismarine/bedrock-data';
import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import Identifiers from '../Identifiers';
import BiomeDefinitionListPacket from './BiomeDefinitionListPacket';

describe('network', () => {
    describe('packet', () => {
        describe('BiomeDefinitionListPacket', () => {
            it('writes the packet id as a varuint followed by the payload bytes', () => {
                const pk = new BiomeDefinitionListPacket();
                pk.encode();

                const buffer = pk.getBuffer();

                // 122 = 0x7a, which fits in one LEB128 byte.
                expect([...buffer.subarray(0, 1)]).toEqual([0x7a]);
                expect(buffer.subarray(1).equals(biome_definitions_network)).toBe(true);
            });

            it('starts with a biome count the client can use, not an NBT tag', () => {
                // At 2193 the payload is a varuint32 count of biome definitions followed by the
                // shared string table, which replaced the single NBT compound of protocol 748. A
                // compound would start with 0x0a, and a client reading that as a count would
                // expect ten definitions and then run off the end.
                const stream = new BinaryStream(biome_definitions_network);

                expect(stream.readUnsignedVarInt()).toBe(89);
            });

            it('reads a hand-built buffer to its end', () => {
                const pk = new BiomeDefinitionListPacket();
                pk.setReadBuffer(Buffer.from([0x7a, 0x00, 0x00]));
                pk.decode();

                expect([...pk.definitions]).toEqual([0x00, 0x00]);
                expect(pk.feof()).toBe(true);
            });

            it('uses the network id the client expects', () => {
                expect(BiomeDefinitionListPacket.NetID).toBe(Identifiers.BiomeDefinitionListPacket);
                expect(BiomeDefinitionListPacket.NetID).toBe(0x7a);
            });
        });
    });
});
