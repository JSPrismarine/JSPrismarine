import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { ByteOrder } from './ByteOrder';
import NBTReader from './NBTReader';
import NBTTagCompound from './NBTTagCompound';
import NBTWriter from './NBTWriter';
import { ByteVal, DoubleVal, FloatVal, LongVal, NumberVal, ShortVal, StringVal } from './types/Types';

/**
 * The four encodings the codebase actually uses. Bedrock's disk format is little endian with
 * fixed width fields; its network format is little endian with varints; Java's is big endian.
 * The big endian + varint pair is not used by anything but is included so a change that only
 * happens to work for the combinations we ship still shows up.
 */
const MODES = [
    { name: 'big endian, fixed width', order: ByteOrder.BIG_ENDIAN, varints: false },
    { name: 'big endian, varints', order: ByteOrder.BIG_ENDIAN, varints: true },
    { name: 'little endian, fixed width', order: ByteOrder.LITTLE_ENDIAN, varints: false },
    { name: 'little endian, varints', order: ByteOrder.LITTLE_ENDIAN, varints: true }
] as const;

const write = (compound: NBTTagCompound, order: ByteOrder, varints: boolean): Buffer => {
    const stream = new BinaryStream();
    const writer = new NBTWriter(stream, order);
    writer.setUseVarint(varints);
    writer.writeCompound(compound);
    return stream.getBuffer();
};

/** Reads a compound back and reports how many bytes were left over, which is how a mis-sized
 *  read shows itself: the values can all still look right while the cursor has drifted. */
const read = (buffer: Buffer, order: ByteOrder, varints: boolean): { root: NBTTagCompound; unread: number } => {
    const stream = new BinaryStream(buffer);
    const reader = new NBTReader(stream, order);
    reader.setUseVarint(varints);
    const root = reader.parse();
    return { root, unread: buffer.byteLength - stream.getReadIndex() };
};

const roundTrip = (compound: NBTTagCompound, order: ByteOrder, varints: boolean) =>
    read(write(compound, order, varints), order, varints);

describe('nbt', () => {
    describe('round trip', () => {
        for (const { name, order, varints } of MODES) {
            describe(name, () => {
                it('carries every scalar tag type', () => {
                    const root = new NBTTagCompound('root');
                    root.addValue('byte', new ByteVal(7));
                    root.addValue('short', new ShortVal(1234));
                    root.addValue('int', new NumberVal(123456));
                    root.addValue('long', new LongVal(1234567890123n));
                    root.addValue('float', new FloatVal(0.5));
                    root.addValue('double', new DoubleVal(0.125));
                    root.addValue('string', new StringVal('hello'));

                    const { root: parsed, unread } = roundTrip(root, order, varints);

                    expect(unread).toBe(0);
                    expect(parsed.getName()).toBe('root');
                    expect(parsed.getByte('byte', 0)).toBe(7);
                    expect(parsed.getShort('short', 0)).toBe(1234);
                    expect(parsed.getNumber('int', 0)).toBe(123456);
                    expect(parsed.getLong('long', 0n)).toBe(1234567890123n);
                    expect(parsed.getFloat('float', 0)).toBe(0.5);
                    expect(parsed.getDouble('double', 0)).toBe(0.125);
                    expect(parsed.getString('string', '')).toBe('hello');
                });

                it('carries negative shorts and ints', () => {
                    // The whole reason this suite exists: the writer used to route these through
                    // unsigned writers, which assert on anything below zero. Every real Bedrock
                    // payload has negatives in it - `Fire: -20`, a block entity below y=0.
                    const root = new NBTTagCompound('root');
                    root.addValue('shortMin', new ShortVal(-32768));
                    root.addValue('shortOne', new ShortVal(-1));
                    root.addValue('intMin', new NumberVal(-2147483648));
                    root.addValue('intOne', new NumberVal(-1));

                    const { root: parsed, unread } = roundTrip(root, order, varints);

                    expect(unread).toBe(0);
                    expect(parsed.getShort('shortMin', 0)).toBe(-32768);
                    expect(parsed.getShort('shortOne', 0)).toBe(-1);
                    expect(parsed.getNumber('intMin', 0)).toBe(-2147483648);
                    expect(parsed.getNumber('intOne', 0)).toBe(-1);
                });

                it.skipIf(varints)('carries negative longs', () => {
                    // Only asserted for the fixed width encodings, which is what the disk format
                    // uses. The varint pair cannot round-trip a long at all, and not because of
                    // anything here: @jsprismarine/binaryutils@5.5.3 decodes with `raw >> 1n`
                    // instead of a zigzag shift, and its `writeUnsignedVarLong` never masks the
                    // continuation byte to 7 bits. Both are dependency-side.
                    const root = new NBTTagCompound('root');
                    root.addValue('longMin', new LongVal(-9223372036854775808n));
                    root.addValue('longOne', new LongVal(-1n));

                    const { root: parsed, unread } = roundTrip(root, order, varints);

                    expect(unread).toBe(0);
                    expect(parsed.getLong('longMin', 0n)).toBe(-9223372036854775808n);
                    expect(parsed.getLong('longOne', 0n)).toBe(-1n);
                });

                it('carries nested compounds', () => {
                    const root = new NBTTagCompound('root');
                    const child = new NBTTagCompound('states');
                    child.addValue('pillar_axis', new StringVal('y'));
                    child.addValue('depth', new NumberVal(-3));
                    root.addChild(child);
                    root.addValue('name', new StringVal('minecraft:oak_log'));

                    const { root: parsed, unread } = roundTrip(root, order, varints);

                    expect(unread).toBe(0);
                    const states = parsed.getCompound('states', false);
                    expect(states?.getString('pillar_axis', '')).toBe('y');
                    expect(states?.getNumber('depth', 0)).toBe(-3);
                });

                it('carries a byte array', () => {
                    const root = new NBTTagCompound('root');
                    root.addValue('bytes', Buffer.from([0, 1, 254, 255]));

                    const { root: parsed, unread } = roundTrip(root, order, varints);

                    expect(unread).toBe(0);
                    expect(parsed.children.get('bytes')).toEqual(Buffer.from([0, 1, 254, 255]));
                });

                it('carries an int array', () => {
                    // The writer used to hand the array itself to the scalar int writer here.
                    const root = new NBTTagCompound('root');
                    root.addValue('ints', [1, -2, 3, -2147483648]);

                    const { root: parsed, unread } = roundTrip(root, order, varints);

                    expect(unread).toBe(0);
                    expect(parsed.children.get('ints')).toEqual([1, -2, 3, -2147483648]);
                });

                it('carries a list of bytes without drifting the cursor', () => {
                    // The reader used to read each of these as a short. That leaves the values
                    // wrong *and* the cursor two bytes ahead per element, so assert both.
                    const root = new NBTTagCompound('root');
                    root.addValue('flags', new Set([new ByteVal(1), new ByteVal(2), new ByteVal(3)]));

                    const { root: parsed, unread } = roundTrip(root, order, varints);

                    expect(unread).toBe(0);
                    expect([...(parsed.getList('flags', false) ?? [])].map((v) => v.getValue())).toEqual([1, 2, 3]);
                });

                it('carries a list of compounds', () => {
                    const root = new NBTTagCompound('root');
                    const first = new NBTTagCompound();
                    first.addValue('id', new StringVal('minecraft:stone'));
                    const second = new NBTTagCompound();
                    second.addValue('id', new StringVal('minecraft:dirt'));
                    root.addValue('palette', new Set([first, second]));

                    const { root: parsed, unread } = roundTrip(root, order, varints);

                    expect(unread).toBe(0);
                    const entries = [...(parsed.getList('palette', false) ?? [])];
                    expect(entries.map((entry) => entry.getString('id', ''))).toEqual([
                        'minecraft:stone',
                        'minecraft:dirt'
                    ]);
                });

                it('carries a list of byte arrays', () => {
                    // Byte arrays inside a list used to be written as doubles.
                    const root = new NBTTagCompound('root');
                    root.addValue('chunks', new Set([Buffer.from([1, 2]), Buffer.from([3, 4, 5])]));

                    const { root: parsed, unread } = roundTrip(root, order, varints);

                    expect(unread).toBe(0);
                    expect([...(parsed.getList('chunks', false) ?? [])]).toEqual([
                        Buffer.from([1, 2]),
                        Buffer.from([3, 4, 5])
                    ]);
                });

                it('carries an empty compound', () => {
                    const { root: parsed, unread } = roundTrip(new NBTTagCompound('root'), order, varints);

                    expect(unread).toBe(0);
                    expect(parsed.size()).toBe(0);
                });

                it('carries an empty list', () => {
                    const root = new NBTTagCompound('root');
                    root.addValue('nothing', new Set());

                    const { root: parsed, unread } = roundTrip(root, order, varints);

                    expect(unread).toBe(0);
                    expect(parsed.getList('nothing', false)?.size).toBe(0);
                });

                it('carries a string that needs more than one byte per character', () => {
                    const root = new NBTTagCompound('root');
                    root.addValue('motd', new StringVal('§eJSPrismarine — ünïcödé'));

                    const { root: parsed, unread } = roundTrip(root, order, varints);

                    expect(unread).toBe(0);
                    expect(parsed.getString('motd', '')).toBe('§eJSPrismarine — ünïcödé');
                });
            });
        }
    });

    describe('little endian, fixed width', () => {
        // This is Bedrock's disk encoding, so pin the bytes rather than only the round trip.
        it('writes the layout the disk format expects', () => {
            const root = new NBTTagCompound('');
            root.addValue('n', new NumberVal(-20));

            expect(write(root, ByteOrder.LITTLE_ENDIAN, false)).toEqual(
                Buffer.from([
                    0x0a,
                    0x00,
                    0x00, // TAG_Compound, name length 0
                    0x03,
                    0x01,
                    0x00,
                    0x6e, // TAG_Int, name length 1, 'n'
                    0xec,
                    0xff,
                    0xff,
                    0xff, // -20
                    0x00 // TAG_End
                ])
            );
        });

        it('rejects a truncated payload rather than reading past the end', () => {
            const complete = write(
                (() => {
                    const root = new NBTTagCompound('root');
                    root.addValue('long', new LongVal(1n));
                    return root;
                })(),
                ByteOrder.LITTLE_ENDIAN,
                false
            );

            expect(() => read(complete.subarray(0, complete.byteLength - 3), ByteOrder.LITTLE_ENDIAN, false)).toThrow(
                /Invalid NBT Data/
            );
        });
    });
});
