import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import { PacketIdentifier } from '../PacketIdentifier';
import { netIdFor } from '../wire/versions/v2193';
import UpdateSoftEnumPacket, { SoftEnumUpdateType } from './UpdateSoftEnumPacket';

const DATA = { enumName: 'players', values: ['alice', 'bob'], type: SoftEnumUpdateType.REPLACE } as const;
const EMPTY = { enumName: 'x', values: [], type: SoftEnumUpdateType.REMOVE } as const;
const BYTES = Buffer.from([
    0x72,
    0x07,
    ...Buffer.from('players'),
    0x02,
    0x05,
    ...Buffer.from('alice'),
    0x03,
    ...Buffer.from('bob'),
    0x02
]);
const EMPTY_BYTES = Buffer.from([0x72, 0x01, 0x78, 0x00, 0x01]);

describe('UpdateSoftEnumPacket', () => {
    it('writes the name, values, and update type in schema order', () => {
        expect(new UpdateSoftEnumPacket(DATA).serialize(new NetworkBinaryStream())).toEqual(BYTES);
    });

    it('writes an empty value list as a zero count before the update type', () => {
        expect(new UpdateSoftEnumPacket(EMPTY).serialize(new NetworkBinaryStream())).toEqual(EMPTY_BYTES);
    });

    it('reads the name, values, and type to the end of the packet', () => {
        const stream = new NetworkBinaryStream(BYTES);

        expect(new UpdateSoftEnumPacket().deserialize(stream)).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('uses the protocol 2193 packet id', () => {
        expect(netIdFor('UpdateSoftEnumPacket')).toBe(PacketIdentifier.UPDATE_SOFT_ENUM);
    });
});
