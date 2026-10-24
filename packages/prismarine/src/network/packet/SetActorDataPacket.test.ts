import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { FlagType, Metadata, MetadataFlag } from '../../entity/Metadata';
import Identifiers from '../Identifiers';
import SetActorDataPacket from './SetActorDataPacket';

/** Header followed by Target Runtime ID, written by hand so the test pins the 2193 layout. */
const headerAndTarget = (runtimeId: bigint): BinaryStream => {
    const out = new BinaryStream();
    out.writeUnsignedVarInt(Identifiers.SetActorDataPacket);
    out.writeUnsignedVarLong(runtimeId);
    return out;
};

/** A metadata map holding only the SCALE float, so the Actor Data list has exactly one entry. */
const scaleOnly = (scale: number): Metadata => {
    const metadata = new Metadata(false);
    metadata.setFloat(MetadataFlag.SCALE, scale);
    return metadata;
};

describe('network', () => {
    describe('packet', () => {
        describe('SetActorDataPacket', () => {
            it('writes target, one float data item, empty properties and the tick in docs order', () => {
                const packet = new SetActorDataPacket();
                packet.runtimeEntityId = 42n;
                packet.metadata = scaleOnly(1.5);
                packet.tick = 7n;
                packet.encode();

                const expected = headerAndTarget(42n);
                expected.writeUnsignedVarInt(1); // Actor Data: one entry.
                expected.writeUnsignedVarInt(MetadataFlag.SCALE); // ID.
                expected.writeUnsignedVarInt(FlagType.FLOAT); // Payload selector.
                expected.writeByte(FlagType.FLOAT); // Type, again, as a uint8.
                expected.writeFloatLE(1.5); // Value.
                expected.writeUnsignedVarInt(0); // Int Entries List: empty.
                expected.writeUnsignedVarInt(0); // Float Entries List: empty.
                expected.writeUnsignedVarLong(7n); // Tick.

                expect([...packet.getBuffer()]).toEqual([...expected.getBuffer()]);
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
        });
    });
});
