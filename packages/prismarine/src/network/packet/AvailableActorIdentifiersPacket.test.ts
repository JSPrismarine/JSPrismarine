import { entity_identifiers } from '@jsprismarine/bedrock-data';
import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTReader } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import Identifiers from '../Identifiers';
import AvailableActorIdentifiersPacket from './AvailableActorIdentifiersPacket';

describe('network', () => {
    describe('packet', () => {
        describe('AvailableActorIdentifiersPacket', () => {
            it('writes the packet id as a varuint followed by the payload bytes', () => {
                const pk = new AvailableActorIdentifiersPacket();
                pk.encode();

                const buffer = pk.getBuffer();

                // 119 = 0x77, which fits in one LEB128 byte.
                expect([...buffer.subarray(0, 1)]).toEqual([0x77]);
                expect(buffer.subarray(1).equals(entity_identifiers)).toBe(true);
            });

            it('ships exactly one network NBT compound as the default payload', () => {
                // A compound tag with an empty name.
                expect([...entity_identifiers.subarray(0, 2)]).toEqual([0x0a, 0x00]);

                const stream = new BinaryStream(entity_identifiers);
                const reader = new NBTReader(stream, ByteOrder.LITTLE_ENDIAN);
                reader.setUseVarint(true);
                const root = reader.parse();

                expect(stream.feof()).toBe(true);
                expect(root.has('idlist')).toBe(true);
                expect(root.getList('idlist', false)?.size).toBeGreaterThan(0);
            });

            it('reads a hand-built buffer to its end', () => {
                const pk = new AvailableActorIdentifiersPacket();
                pk.setReadBuffer(Buffer.from([0x77, 0x0a, 0x00, 0x00]));
                pk.decode();

                expect([...pk.identifiers]).toEqual([0x0a, 0x00, 0x00]);
                expect(pk.feof()).toBe(true);
            });

            it('uses the network id the client expects', () => {
                expect(AvailableActorIdentifiersPacket.NetID).toBe(Identifiers.AvailableActorIdentifiersPacket);
                expect(AvailableActorIdentifiersPacket.NetID).toBe(0x77);
            });
        });
    });
});
