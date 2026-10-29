import { item_components as ItemComponents, item_table as ItemTable } from '@jsprismarine/bedrock-data';
import { item_table as ItemTable2225 } from '@jsprismarine/bedrock-data/v2225';
import { netIdFor } from '../codec/v2193';
import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTReader, NBTTagCompound, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import { reportProgress } from '../../../../../.test/reportProgress';

import { NetworkUtil } from '../NetworkUtil';
import Identifiers from '../Identifiers';
import ItemRegistryPacket from './ItemRegistryPacket';

import type { ItemRegistryEntry } from '@jsprismarine/protocol';

/** Packet id 162 as a varuint. */
const HEADER = [0xa2, 0x01];
/** The docs enum `ItemVersion`. */
const LEGACY = 0;
const DATA_DRIVEN = 1;
const NONE = 2;
/** An empty network NBT compound: TAG_Compound, empty name, TAG_End. */
const EMPTY_COMPOUND = [0x0a, 0x00, 0x00];

const varuint = (value: number): number[] => {
    const stream = new BinaryStream();
    stream.writeUnsignedVarInt(value);
    return [...stream.getBuffer()];
};

const zigzag = (value: number): number[] => varuint((value << 1) ^ (value >> 31));

/** One `ItemData` entry in docs order, built by hand. */
const entryBytes = (name: string, runtimeId: number, componentBased: boolean, version: number): number[] => {
    const utf8 = Buffer.from(name, 'utf-8');
    const id = Buffer.alloc(2);
    id.writeInt16LE(runtimeId);
    return [
        ...varuint(utf8.byteLength),
        ...utf8,
        ...id,
        componentBased ? 0x01 : 0x00,
        ...zigzag(version),
        ...EMPTY_COMPOUND
    ];
};

const encode = (): Buffer => {
    const pk = new ItemRegistryPacket();
    pk.encode();
    return pk.getBuffer();
};

interface DecodedEntry {
    name: string;
    runtimeId: number;
    componentBased: boolean;
    version: number;
    components: NBTTagCompound;
}

/** Reads the whole packet back the way a client would, and checks nothing is left over. */
const decode = (buffer: Buffer): DecodedEntry[] => {
    const stream = new BinaryStream(buffer);
    expect(stream.readUnsignedVarInt()).toBe(0xa2);

    const count = stream.readUnsignedVarInt();
    const entries: DecodedEntry[] = [];
    for (let i = 0; i < count; i++) {
        const name = NetworkUtil.readString(stream);
        const runtimeId = stream.readShortLE();
        const componentBased = stream.readBoolean();
        const version = stream.readVarInt();

        const reader = new NBTReader(stream, ByteOrder.LITTLE_ENDIAN);
        reader.setUseVarint(true);
        entries.push({ name, runtimeId, componentBased, version, components: reader.parse() });
    }

    expect(stream.feof()).toBe(true);
    return entries;
};

describe('network', () => {
    describe('packet', () => {
        describe('ItemRegistryPacket', () => {
            const entries = Object.entries(ItemTable);
            const buffer = encode();
            const decoded = decode(buffer);
            const byName = new Map(decoded.map((entry) => [entry.name, entry]));

            it('uses the network id the docs give ItemRegistryPacket', () => {
                expect(netIdFor('ItemRegistryPacket')).toBe(Identifiers.ItemRegistryPacket);
                expect([...buffer.subarray(0, 2)]).toEqual(HEADER);
            });

            it('writes the item table size as the Item Data count', () => {
                const count = varuint(entries.length);

                expect([...buffer.subarray(2, 2 + count.length)]).toEqual(count);
            });

            it('writes the first entry in docs order, version None, with an empty compound', () => {
                const [first] = entries;
                expect(first).toBeDefined();
                if (!first) return;

                const [name, entry] = first;
                expect(entry.version).toBe(NONE);
                const expected = entryBytes(name, entry.runtime_id, entry.component_based, entry.version);
                const start = HEADER.length + varuint(entries.length).length;

                expect([...buffer.subarray(start, start + expected.length)]).toEqual(expected);
            });

            it('writes every entry with the id, flag and version of the item table', () => {
                expect(decoded.map((entry) => entry.name)).toEqual(entries.map(([name]) => name));
                for (const [name, entry] of entries) {
                    expect(byName.get(name)).toMatchObject({
                        runtimeId: entry.runtime_id,
                        componentBased: entry.component_based,
                        version: entry.version
                    });
                }
            });

            it('sends the versions a Bedrock Dedicated Server sends, not one value for all', () => {
                const versions = new Set(decoded.map((entry) => entry.version));
                expect([...versions].sort()).toEqual([LEGACY, DATA_DRIVEN, NONE]);
                expect(byName.get('minecraft:bundle')?.version).toBe(DATA_DRIVEN);
                expect(byName.get('minecraft:arrow')?.version).toBe(NONE);
                expect(byName.get('minecraft:stick')?.version).toBe(NONE);
            });

            it('gives every DataDriven item the compound the client builds it from', () => {
                const dataDriven = decoded.filter((entry) => entry.version === DATA_DRIVEN);
                expect(dataDriven.length).toBeGreaterThan(0);
                reportProgress(`Item registry packet carries ${dataDriven.length} data-driven items.`);
                for (const entry of dataDriven) {
                    expect(entry.componentBased, entry.name).toBe(true);
                    expect(entry.components.getCompound('components', false)?.size(), entry.name).toBeGreaterThan(0);
                }
            });

            it('sends the component data of the apple as the dump holds it', () => {
                const apple = byName.get('minecraft:apple');
                expect(apple).toBeDefined();
                if (!apple) return;

                const food = apple.components.getCompound('components', false)?.getCompound('minecraft:food', false);
                expect(food?.getNumber('nutrition', 0)).toBe(4);
                expect(food?.getFloat('saturation_modifier', 0)).toBeCloseTo(0.3);
                expect(
                    apple.components
                        .getCompound('components', false)
                        ?.getCompound('item_properties', false)
                        ?.getNumber('max_stack_size', 0)
                ).toBe(64);
            });

            it('writes an empty compound for every item without components', () => {
                for (const entry of decoded) {
                    if (entry.name in ItemComponents) continue;
                    expect(entry.components.size(), entry.name).toBe(0);
                }
            });

            it('returns the same cached table on every encode', () => {
                expect(encode()).toEqual(buffer);
            });

            it('writes the entries it was given instead, when the content build supplies them', () => {
                const stick: ItemRegistryEntry = {
                    name: 'mypack:stick',
                    runtimeId: 10000,
                    componentBased: true,
                    version: DATA_DRIVEN
                };

                const pk = new ItemRegistryPacket();
                pk.entries = [stick];
                pk.encode();

                const written = decode(pk.getBuffer());
                expect(written).toHaveLength(1);
                expect(written[0]).toMatchObject({
                    name: 'mypack:stick',
                    runtimeId: 10000,
                    componentBased: true,
                    version: DATA_DRIVEN
                });
                // An entry with no components still writes the empty compound
                // the positional field requires.
                expect(written[0]?.components.size()).toBe(0);
            });

            it('writes the component compound of a registry entry that carries one', () => {
                const properties = new NBTTagCompound('item_properties');
                properties.addValue('damage', new Types.NumberVal(3));
                const components = new NBTTagCompound();
                components.addValue('item_properties', properties);

                const pk = new ItemRegistryPacket();
                pk.entries = [
                    {
                        name: 'mypack:sword',
                        runtimeId: 10001,
                        componentBased: true,
                        version: DATA_DRIVEN,
                        componentData: components
                    }
                ];
                pk.encode();

                const [written] = decode(pk.getBuffer());
                expect(written?.components.getCompound('item_properties', false)?.getNumber('damage', 0)).toBe(3);
            });

            it('round-trips registry entries through its own decoder', () => {
                const properties = new NBTTagCompound('item_properties');
                properties.addValue('damage', new Types.NumberVal(3));
                const components = new NBTTagCompound();
                components.addValue('item_properties', properties);

                const pk = new ItemRegistryPacket();
                pk.entries = [
                    {
                        name: 'mypack:sword',
                        runtimeId: 10001,
                        componentBased: true,
                        version: DATA_DRIVEN,
                        componentData: components
                    },
                    {
                        name: 'minecraft:stick',
                        runtimeId: -268,
                        componentBased: false,
                        version: 2,
                        componentData: new NBTTagCompound()
                    }
                ];
                pk.encode();

                const decoded = new ItemRegistryPacket(pk.getBuffer());
                decoded.decode();

                expect(decoded.entries).toHaveLength(2);
                const [sword, stick] = decoded.entries!;
                expect(sword!.name).toBe('mypack:sword');
                expect(sword!.runtimeId).toBe(10001);
                expect(sword!.componentBased).toBe(true);
                expect(sword!.version).toBe(DATA_DRIVEN);
                expect(sword!.componentData?.getCompound('item_properties', false)?.getNumber('damage', 0)).toBe(3);
                expect(stick!.name).toBe('minecraft:stick');
                expect(stick!.runtimeId).toBe(-268);
                expect(stick!.componentBased).toBe(false);
                expect(stick!.version).toBe(2);
            });

            /**
             * The captured table is picked by the codec that stamped the packet. The registry
             * is server-authoritative, so this is what decides whether a 1.26.60 session can
             * name the four items that version added and agrees about the 82 whose number it
             * moved. See docs/research/protocol-2225-delta.md.
             */
            describe('per protocol version', () => {
                const encodeAt = (protocol: number): Buffer => {
                    const pk = new ItemRegistryPacket();
                    pk.codecProtocol = protocol;
                    pk.encode();
                    return pk.getBuffer();
                };

                it('sends 2193 the bytes it sent before a version was selectable', () => {
                    expect(encodeAt(2193)).toEqual(buffer);
                });

                it('sends 2225 different bytes from 2193', () => {
                    expect(encodeAt(2225)).not.toEqual(buffer);
                });

                it('sends 2225 the four names 1.26.60 added, which 2193 cannot name at all', () => {
                    const added = [
                        'minecraft:disc_press',
                        'minecraft:frostbite_spawn_egg',
                        'minecraft:ice_crystal',
                        'minecraft:icicle'
                    ];
                    const at2225 = new Map(decode(encodeAt(2225)).map((entry) => [entry.name, entry]));

                    for (const name of added) {
                        expect(at2225.get(name), name).toBeDefined();
                        expect(byName.get(name), name).toBeUndefined();
                    }
                });

                it('numbers every item as its own version does, including the ones that moved', () => {
                    const at2225 = new Map(decode(encodeAt(2225)).map((entry) => [entry.name, entry.runtimeId]));
                    for (const [name, entry] of Object.entries(ItemTable2225)) {
                        expect(at2225.get(name), name).toBe(entry.runtime_id);
                    }

                    // Three of the 82 that moved, named so that the two tables are shown to be
                    // genuinely different here rather than only measured to be elsewhere.
                    expect(byName.get('minecraft:apple')?.runtimeId).toBe(882);
                    expect(at2225.get('minecraft:apple')).toBe(883);
                    expect(byName.get('minecraft:boat')?.runtimeId).toBe(845);
                    expect(at2225.get('minecraft:boat')).toBe(846);
                    expect(byName.get('minecraft:breeze_rod')?.runtimeId).toBe(878);
                    expect(at2225.get('minecraft:breeze_rod')).toBe(879);
                });

                it('falls back to 2193 for a version no table was captured for', () => {
                    expect(encodeAt(2048)).toEqual(buffer);
                });
            });
        });
    });
});
