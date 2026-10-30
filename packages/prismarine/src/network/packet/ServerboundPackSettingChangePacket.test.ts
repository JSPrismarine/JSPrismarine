import { describe, expect, it } from 'vitest';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import ServerboundPackSettingChangePacket from './ServerboundPackSettingChangePacket';

describe('ServerboundPackSettingChangePacket', () => {
    // Header: id 329 as LEB128 is 0xc9 0x02. The UUID is 16 bytes in the server's `mce::UUID` order.
    const uuid = UUID.fromString('12345678-1234-1234-1234-123456789abc');
    const uuidBytes = (): Buffer => {
        const packet = new ServerboundPackSettingChangePacket();
        uuid.networkSerialize(packet);
        return packet.getBuffer();
    };
    const head = (): Buffer => Buffer.concat([Buffer.from([0xc9, 0x02]), uuidBytes(), Buffer.from([0x01, 0x73])]);

    it('decodes a float value under selector 0, consuming the whole buffer', () => {
        // 1.5f is 0x3fc00000.
        const packet = new ServerboundPackSettingChangePacket(
            Buffer.concat([head(), Buffer.from([0x00, 0x00, 0x00, 0xc0, 0x3f])])
        );
        packet.decode();

        expect(packet.packId.toString()).toBe(uuid.toString());
        expect(packet.packSettingName).toBe('s');
        expect(packet.packSettingValue).toBe(1.5);
        expect(packet.feof()).toBe(true);
    });

    it('decodes a boolean under selector 1', () => {
        const packet = new ServerboundPackSettingChangePacket(Buffer.concat([head(), Buffer.from([0x01, 0x01])]));
        packet.decode();

        expect(packet.packSettingValue).toBe(true);
        expect(packet.feof()).toBe(true);
    });

    it('decodes a string under selector 2', () => {
        const packet = new ServerboundPackSettingChangePacket(
            Buffer.concat([head(), Buffer.from([0x02, 0x02, 0x68, 0x69])])
        );
        packet.decode();

        expect(packet.packSettingValue).toBe('hi');
        expect(packet.feof()).toBe(true);
    });

    it('decodes a string list under selector 3', () => {
        const packet = new ServerboundPackSettingChangePacket(
            Buffer.concat([head(), Buffer.from([0x03, 0x02, 0x01, 0x61, 0x01, 0x62])])
        );
        packet.decode();

        expect(packet.packSettingValue).toEqual(['a', 'b']);
        expect(packet.feof()).toBe(true);
    });

    it('rejects an unknown alternative', () => {
        const packet = new ServerboundPackSettingChangePacket(Buffer.concat([head(), Buffer.from([0x04])]));

        expect(() => packet.decode()).toThrow(/alternative 4/);
    });

    it('encodes a list with selector 3', () => {
        const packet = new ServerboundPackSettingChangePacket();
        packet.packId = uuid;
        packet.packSettingName = 's';
        packet.packSettingValue = ['a', 'b'];
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.concat([head(), Buffer.from([0x03, 0x02, 0x01, 0x61, 0x01, 0x62])]));
    });
});
