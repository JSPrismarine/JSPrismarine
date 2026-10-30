import { PlayerPermissionLevel } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';
import RequestPermissionsPacket from './RequestPermissionsPacket';

describe('RequestPermissionsPacket', () => {
    // Header: id 185 as LEB128 is 0xb9 0x01.
    it('decodes the fixed int64 target, the level, and the flags, consuming the whole buffer', () => {
        // Target -2 as int64 LE. Level 2 (Operator) zigzags to 4. Flags 0x0102 LE.
        const packet = new RequestPermissionsPacket(
            Buffer.from([0xb9, 0x01, 0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x04, 0x02, 0x01])
        );
        packet.decode();

        expect(packet.targetPlayerUniqueId).toBe(-2n);
        expect(packet.playerPermissionLevel).toBe(PlayerPermissionLevel.OPERATOR);
        expect(packet.customPermissionFlags).toBe(0x0102);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes', () => {
        const packet = new RequestPermissionsPacket();
        packet.targetPlayerUniqueId = 1n;
        packet.playerPermissionLevel = PlayerPermissionLevel.MEMBER;
        packet.customPermissionFlags = 3;
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([0xb9, 0x01, 0x01, 0, 0, 0, 0, 0, 0, 0, 0x02, 0x03, 0x00]));
    });
});
