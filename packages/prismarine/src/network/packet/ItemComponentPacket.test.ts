import { item_table as ItemTable } from '@jsprismarine/bedrock-data';
import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTReader } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import { NetworkUtil } from '../NetworkUtil';
import Identifiers from '../Identifiers';
import ItemComponentPacket from './ItemComponentPacket';

/** Packet id 162 as a varuint. */
const HEADER = [0xa2, 0x01];
/** `Item Version` DataDriven (1) as a ZigZag varint. */
const DATA_DRIVEN = 0x02;
/** An empty network NBT compound: TAG_Compound, empty name, TAG_End. */
const EMPTY_COMPOUND = [0x0a, 0x00, 0x00];

const varuint = (value: number): number[] => {
    const stream = new BinaryStream();
    stream.writeUnsignedVarInt(value);
    return [...stream.getBuffer()];
};

/** One `ItemData` entry in docs order, built by hand. */
const entryBytes = (name: string, runtimeId: number, componentBased: boolean): number[] => {
    const utf8 = Buffer.from(name, 'utf-8');
    const id = Buffer.alloc(2);
    id.writeInt16LE(runtimeId);
    return [...varuint(utf8.byteLength), ...utf8, ...id, componentBased ? 0x01 : 0x00, DATA_DRIVEN, ...EMPTY_COMPOUND];
};

const encode = (): Buffer => {
    const pk = new ItemComponentPacket();
    pk.encode();
    return pk.getBuffer();
};

describe('network', () => {
    describe('packet', () => {
        describe('ItemComponentPacket', () => {
            const entries = Object.entries(ItemTable);
            const buffer = encode();

            it('uses the network id the docs give ItemRegistryPacket', () => {
                expect(ItemComponentPacket.NetID).toBe(Identifiers.ItemComponentPacket);
                expect([...buffer.subarray(0, 2)]).toEqual(HEADER);
            });

            it('writes the item table size as the Item Data count', () => {
                const count = varuint(entries.length);

                expect([...buffer.subarray(2, 2 + count.length)]).toEqual(count);
            });

            it('writes the first entry in docs order with an empty component compound', () => {
                const [first] = entries;
                expect(first).toBeDefined();
                if (!first) return;

                const [name, entry] = first;
                const expected = entryBytes(name, entry.runtime_id, entry.component_based);
                const start = HEADER.length + varuint(entries.length).length;

                expect([...buffer.subarray(start, start + expected.length)]).toEqual(expected);
            });

            it('writes every entry so a reader lands exactly at the end', () => {
                const stream = new BinaryStream(buffer);
                expect(stream.readUnsignedVarInt()).toBe(0xa2);

                const count = stream.readUnsignedVarInt();
                expect(count).toBe(entries.length);

                let lastName = '';
                for (let i = 0; i < count; i++) {
                    lastName = NetworkUtil.readString(stream);
                    stream.readShortLE();
                    stream.readBoolean();
                    expect(stream.readVarInt()).toBe(1);

                    const reader = new NBTReader(stream, ByteOrder.LITTLE_ENDIAN);
                    reader.setUseVarint(true);
                    reader.parse();
                }

                expect(stream.feof()).toBe(true);
                expect(lastName).toBe(entries[entries.length - 1]?.[0]);
            });

            it('returns the same cached table on every encode', () => {
                expect(encode()).toEqual(buffer);
            });
        });
    });
});
