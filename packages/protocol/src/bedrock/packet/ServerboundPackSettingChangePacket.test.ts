import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../../NetworkBinaryStream';
import { PacketIdentifier } from '../PacketIdentifier';
import UUID from '../wire/structures/UUID';
import ServerboundPackSettingChangePacket, { PackSettingValueType } from './ServerboundPackSettingChangePacket';

const PACK_ID = UUID.fromString('12345678-1234-1234-1234-123456789abc');

const body = (value: readonly number[]): Buffer => {
    const stream = new NetworkBinaryStream();
    PACK_ID.networkSerialize(stream);
    stream.writeString('s');
    stream.write(Buffer.from(value));
    return stream.getBuffer();
};
const packet = (value: readonly number[]): Buffer => Buffer.concat([Buffer.from([0xc9, 0x02]), body(value)]);

describe('ServerboundPackSettingChangePacket', () => {
    it('decodes a float value', () => {
        const stream = new NetworkBinaryStream(packet([PackSettingValueType.Float, 0x00, 0x00, 0xc0, 0x3f]));
        const data = new ServerboundPackSettingChangePacket().deserialize(stream);

        expect(data.packId.toString()).toBe(PACK_ID.toString());
        expect(data.packSettingName).toBe('s');
        expect(data.packSettingValue).toBe(1.5);
        expect(stream.feof()).toBe(true);
    });

    it('decodes a boolean, string, and string list alternative', () => {
        const boolean = new NetworkBinaryStream(packet([PackSettingValueType.Bool, 1]));
        const string = new NetworkBinaryStream(packet([PackSettingValueType.String, 2, 0x68, 0x69]));
        const list = new NetworkBinaryStream(packet([PackSettingValueType.StringList, 2, 1, 0x61, 1, 0x62]));

        expect(new ServerboundPackSettingChangePacket().deserialize(boolean).packSettingValue).toBe(true);
        expect(new ServerboundPackSettingChangePacket().deserialize(string).packSettingValue).toBe('hi');
        expect(new ServerboundPackSettingChangePacket().deserialize(list).packSettingValue).toEqual(['a', 'b']);
        expect(boolean.feof()).toBe(true);
        expect(string.feof()).toBe(true);
        expect(list.feof()).toBe(true);
    });

    it('rejects unknown alternatives', () => {
        expect(() =>
            new ServerboundPackSettingChangePacket().deserialize(new NetworkBinaryStream(packet([4])))
        ).toThrow(/alternative 4/);
    });

    it('writes a string list and its selector', () => {
        const data = { packId: PACK_ID, packSettingName: 's', packSettingValue: ['a', 'b'] };
        const stream = new NetworkBinaryStream();

        expect(new ServerboundPackSettingChangePacket(data).serialize(stream)).toEqual(
            packet([PackSettingValueType.StringList, 2, 1, 0x61, 1, 0x62])
        );
    });

    it('uses the protocol 2193 packet id', () => {
        expect(new ServerboundPackSettingChangePacket().getId()).toBe(PacketIdentifier.SERVERBOUND_PACK_SETTING_CHANGE);
    });

    it.each([2193, 2225])('writes the same layout at protocol %i', (protocol) => {
        // mce::UUID: most significant uint64 little-endian, then least significant uint64 little-endian.
        const uuidBytes = [
            0x34, 0x12, 0x34, 0x12, 0x78, 0x56, 0x34, 0x12, 0xbc, 0x9a, 0x78, 0x56, 0x34, 0x12, 0x34, 0x12
        ];
        const expected = Buffer.concat([
            Buffer.from([0xc9, 0x02]),
            Buffer.from(uuidBytes),
            Buffer.from([1, 0x73, PackSettingValueType.StringList, 1, 1, 0x61])
        ]);
        const data = { packId: PACK_ID, packSettingName: 's', packSettingValue: ['a'] };

        const writer = new ServerboundPackSettingChangePacket(data);
        writer.codecProtocol = protocol;
        const bytes = writer.serialize(new NetworkBinaryStream());
        expect(bytes).toEqual(expected);

        const reader = new ServerboundPackSettingChangePacket();
        reader.codecProtocol = protocol;
        const decoded = reader.deserialize(new NetworkBinaryStream(bytes));
        expect(decoded.packId.toString()).toBe(PACK_ID.toString());
        expect(decoded.packSettingValue).toEqual(['a']);
    });
});
