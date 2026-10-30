import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import { FlagType, MAX_AIR_TICKS, Metadata, MetadataFlag } from '@jsprismarine/protocol/wire/structures/Metadata';
import { PacketIdentifier } from '../PacketIdentifier';
import SetActorDataPacket from './SetActorDataPacket';

/** One `DataItemEntry` as the independent reader below decodes it. */
interface DecodedItem {
    id: number;
    type: FlagType;
    value: unknown;
}

/** Reads one `Value` in the encoding the 1.26.51 docs give for its `DataItemType`. */
const readValue = (stream: BinaryStream, type: FlagType): unknown => {
    switch (type) {
        case FlagType.BYTE:
            return stream.readSignedByte();
        case FlagType.SHORT:
            return stream.readShortLE();
        case FlagType.INT:
            return stream.readVarInt();
        case FlagType.FLOAT:
            return stream.readFloatLE();
        case FlagType.STRING:
            return stream.read(stream.readUnsignedVarInt()).toString('utf8');
        case FlagType.POSITION:
            return [stream.readVarInt(), stream.readVarInt(), stream.readVarInt()];
        case FlagType.LONG:
            return stream.readVarLong();
        case FlagType.VECTOR:
            return [stream.readFloatLE(), stream.readFloatLE(), stream.readFloatLE()];
        default:
            throw new Error(`unknown DataItemType ${type}`);
    }
};

/**
 * Decodes an encoded packet the way the docs lay it out, sharing nothing with the writer:
 * the header, `Target Runtime ID` varuint64, `Actor Data` as a varuint32 count of `ID`
 * varuint32, the one-of selector varuint32, the alternative's `Type` uint8 (equal to the
 * selector) and `Value`, `Synched Properties` as two counted lists, `Tick` varuint64, and
 * nothing after that.
 */
const readPacket = (buffer: Buffer) => {
    const stream = new BinaryStream(buffer);
    expect(stream.readUnsignedVarInt()).toBe(PacketIdentifier.SET_ACTOR_DATA);
    const runtimeId = stream.readUnsignedVarLong();

    const items: DecodedItem[] = [];
    for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
        const id = stream.readUnsignedVarInt();
        const selector = stream.readUnsignedVarInt();
        const type: FlagType = stream.readByte();
        expect(type, `id ${id}`).toBe(selector);
        items.push({ id, type, value: readValue(stream, type) });
    }

    const intProps: Array<[number, number]> = [];
    for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
        intProps.push([stream.readUnsignedVarInt(), stream.readVarInt()]);
    }
    const floatProps: Array<[number, number]> = [];
    for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
        floatProps.push([stream.readUnsignedVarInt(), stream.readFloatLE()]);
    }

    const tick = stream.readUnsignedVarLong();
    expect(stream.feof()).toBe(true);
    return { runtimeId, items, intProps, floatProps, tick };
};

/** The `DataItemType` a 1.26.51 client expects for each `ActorDataID` this server sets. */
const vanillaTypes: Record<number, FlagType> = {
    [MetadataFlag.INDEX]: FlagType.LONG,
    [MetadataFlag.HEALTH]: FlagType.INT,
    [MetadataFlag.VARIANT]: FlagType.INT,
    [MetadataFlag.COLOR]: FlagType.BYTE,
    [MetadataFlag.NAMETAG]: FlagType.STRING,
    [MetadataFlag.OWNER_ENTITY_ID]: FlagType.LONG,
    [MetadataFlag.TARGET_ENTITY_ID]: FlagType.LONG,
    [MetadataFlag.AIR]: FlagType.SHORT,
    [MetadataFlag.HURT_TIME]: FlagType.INT,
    [MetadataFlag.HURT_DIRECTION]: FlagType.INT,
    [MetadataFlag.ENTITY_LEAD_HOLDER_ID]: FlagType.LONG,
    [MetadataFlag.SCALE]: FlagType.FLOAT,
    [MetadataFlag.MAX_AIR]: FlagType.SHORT,
    [MetadataFlag.BOUNDINGBOX_WIDTH]: FlagType.FLOAT,
    [MetadataFlag.BOUNDINGBOX_HEIGHT]: FlagType.FLOAT
};

/** A packet for runtime id 1 carrying exactly one data item, no properties, tick 0. */
const encodeOne = (build: (metadata: Metadata) => void): number[] => {
    const packet = new SetActorDataPacket();
    packet.runtimeEntityId = 1n;
    packet.metadata = new Metadata(false);
    build(packet.metadata);
    packet.encode();
    return [...packet.getBuffer()];
};

/**
 * One data item of each type, as hand-written bytes. Each packet is the header `0x27`, the
 * runtime id `0x01`, the count `0x01`, then `ID`, the one-of selector, the alternative's
 * `Type` byte (the same value again) and `Value`, then two empty property lists and a zero
 * tick. The ids are 2193 `ActorDataID` values.
 */
const vectors: Array<{ name: string; build: (metadata: Metadata) => void; entry: number[] }> = [
    {
        name: 'BYTE as int8',
        build: (m) => m.setPropertyValue(MetadataFlag.COLOR, FlagType.BYTE, -1),
        entry: [0x03, 0x00, 0x00, 0xff]
    },
    {
        name: 'SHORT as int16 LE',
        build: (m) => m.setShort(MetadataFlag.AIR, 300),
        entry: [0x07, 0x01, 0x01, 0x2c, 0x01]
    },
    {
        name: 'INT as ZigZag varint32',
        build: (m) => m.setInt(MetadataFlag.VARIANT, -2),
        entry: [0x02, 0x02, 0x02, 0x03]
    },
    {
        name: 'FLOAT as float LE',
        build: (m) => m.setFloat(MetadataFlag.SCALE, 1.5),
        entry: [0x26, 0x03, 0x03, 0x00, 0x00, 0xc0, 0x3f]
    },
    {
        name: 'STRING as varuint length and UTF-8',
        build: (m) => m.setString(MetadataFlag.NAMETAG, 'hi'),
        entry: [0x04, 0x04, 0x04, 0x02, 0x68, 0x69]
    },
    {
        name: 'POSITION as three ZigZag varint32',
        // 28 is `BedPosition`, the vanilla `Pos` item.
        build: (m) => m.setPropertyValue(28, FlagType.POSITION, new Vector3(1, -2, 3)),
        entry: [0x1c, 0x06, 0x06, 0x02, 0x03, 0x06]
    },
    {
        name: 'LONG as ZigZag varint64',
        build: (m) => m.setLong(MetadataFlag.TARGET_ENTITY_ID, -1n),
        entry: [0x06, 0x07, 0x07, 0x01]
    },
    {
        name: 'VECTOR as three floats LE',
        // 17 is `DisplayOffset`, the vanilla `Vec3` item.
        build: (m) => m.setPropertyValue(17, FlagType.VECTOR, new Vector3(0.5, 1.5, -2.5)),
        entry: [0x11, 0x08, 0x08, 0x00, 0x00, 0x00, 0x3f, 0x00, 0x00, 0xc0, 0x3f, 0x00, 0x00, 0x20, 0xc0]
    }
];

describe('network', () => {
    describe('packet', () => {
        describe('SetActorDataPacket', () => {
            it.each(vectors)('writes $name after the id, the selector and the type byte', ({ build, entry }) => {
                expect(encodeOne(build)).toEqual([0x27, 0x01, 0x01, ...entry, 0x00, 0x00, 0x00]);
            });

            it('writes each property as its index then its data, ints as ZigZag and floats as LE', () => {
                const packet = new SetActorDataPacket();
                packet.runtimeEntityId = 1n;
                packet.metadata = new Metadata(false);
                packet.syncedProperties.intProps.push({ index: 2, value: -1 });
                packet.syncedProperties.floatProps.push({ index: 5, value: 0.5 });
                packet.encode();

                const expected = [
                    0x27, // Header: id 39, no subclient ids.
                    0x01, // Target Runtime ID: 1.
                    0x00, // Actor Data: no entries.
                    0x01, // Int Entries List: one entry.
                    0x02, // Property Index: 2.
                    0x01, // Data: -1 as a ZigZag varint32.
                    0x01, // Float Entries List: one entry.
                    0x05, // Property Index: 5.
                    0x00,
                    0x00,
                    0x00,
                    0x3f, // Data: 0.5 as a little-endian float.
                    0x00 // Tick: 0.
                ];
                expect([...packet.getBuffer()]).toEqual(expected);
            });

            it('defaults the tick to zero and writes it as a single trailing byte', () => {
                const packet = new SetActorDataPacket();
                expect(packet.tick).toBe(0n);

                packet.runtimeEntityId = 1n;
                packet.metadata = new Metadata(false);
                packet.encode();

                const bytes = [...packet.getBuffer()];
                expect(bytes).toEqual([0x27, 0x01, 0x00, 0x00, 0x00, 0x00]);
                expect(bytes.at(-1)).toBe(0x00);
            });

            // The packet a joining player receives about itself. A retail client that reads one
            // byte too many or too few here never reports itself initialized, so the whole
            // buffer has to decode by the docs' rules to exactly its end, with every id one the
            // client knows and every type the one it expects for that id.
            it('sends a default player as 2193 ids with the type the client expects, decodable to EOF', () => {
                const packet = new SetActorDataPacket();
                packet.runtimeEntityId = 300n;
                packet.metadata = new Metadata();
                packet.metadata.setNameTag('Steve');
                packet.tick = 70_000n;
                packet.encode();

                const decoded = readPacket(packet.getBuffer());

                expect(decoded.runtimeId).toBe(300n);
                expect(decoded.tick).toBe(70_000n);
                expect(decoded.intProps).toEqual([]);
                expect(decoded.floatProps).toEqual([]);

                const ids = decoded.items.map((item) => item.id);
                expect(ids).toEqual([...ids].sort((left, right) => left - right));
                for (const item of decoded.items) {
                    expect(vanillaTypes[item.id], `id ${item.id}`).toBe(item.type);
                }

                const flags =
                    (1n << BigInt(MetadataFlag.BREATHING)) |
                    (1n << BigInt(MetadataFlag.HAS_COLLISION)) |
                    (1n << BigInt(MetadataFlag.AFFECTED_BY_GRAVITY));
                expect(decoded.items).toEqual([
                    { id: MetadataFlag.INDEX, type: FlagType.LONG, value: flags },
                    { id: MetadataFlag.NAMETAG, type: FlagType.STRING, value: 'Steve' },
                    { id: MetadataFlag.AIR, type: FlagType.SHORT, value: MAX_AIR_TICKS },
                    { id: MetadataFlag.ENTITY_LEAD_HOLDER_ID, type: FlagType.LONG, value: -1n },
                    { id: MetadataFlag.SCALE, type: FlagType.FLOAT, value: 1 },
                    { id: MetadataFlag.MAX_AIR, type: FlagType.SHORT, value: MAX_AIR_TICKS },
                    { id: MetadataFlag.BOUNDINGBOX_WIDTH, type: FlagType.FLOAT, value: 1 },
                    { id: MetadataFlag.BOUNDINGBOX_HEIGHT, type: FlagType.FLOAT, value: 1 }
                ]);
            });

            it('round-trips every data item type, the properties and the tick', () => {
                const packet = new SetActorDataPacket();
                packet.runtimeEntityId = 300n;
                packet.metadata = new Metadata(false);
                for (const { build } of vectors) build(packet.metadata);
                packet.syncedProperties.intProps.push({ index: 2, value: -1 });
                packet.syncedProperties.floatProps.push({ index: 5, value: 0.5 });
                packet.tick = 70_000n;
                packet.encode();

                const decoded = new SetActorDataPacket(packet.getBuffer());
                decoded.decode();

                expect(decoded.runtimeEntityId).toBe(300n);
                expect(decoded.metadata.getData()).toEqual(packet.metadata.getData());
                expect(decoded.syncedProperties.intProps).toEqual([{ index: 2, value: -1 }]);
                expect(decoded.syncedProperties.floatProps).toEqual([{ index: 5, value: 0.5 }]);
                expect(decoded.tick).toBe(70_000n);
                expect(decoded.feof()).toBe(true);
            });
        });
    });
});
