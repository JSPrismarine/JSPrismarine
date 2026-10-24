import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import { PacketIdentifier } from '../PacketIdentifier';
import PlayerUpdateEntityOverridesPacket, { EntityOverrideUpdateType } from './PlayerUpdateEntityOverridesPacket';

import type { PlayerUpdateEntityOverrides } from './PlayerUpdateEntityOverridesPacket';

/** Header bytes: 325 as a varuint32, both subclient ids zero. */
const HEADER = [0xc5, 0x02];

/** `Target ID` 7 as a ZigZag varint64 (14), then `Property Index` 3 as a varuint32. */
const TARGET_AND_INDEX = [0x0e, 0x03];

const SET_INT: PlayerUpdateEntityOverrides = {
    targetId: 7n,
    propertyIndex: 3,
    update: { type: EntityOverrideUpdateType.SetIntOverride, value: -1 }
};

/** `SET_INT` on the wire, header included, written by hand in the order the docs list the fields. */
const SET_INT_BYTES = Buffer.from([
    ...HEADER,
    ...TARGET_AND_INDEX,
    0x02, // Update selector: IntOverride is alternative 2
    ...[0x0e, ...Buffer.from('setintoverride', 'utf8')], // Type, 14 bytes
    ...[0xff, 0xff, 0xff, 0xff] // Value -1, little-endian int32
]);

const SET_FLOAT: PlayerUpdateEntityOverrides = {
    targetId: 7n,
    propertyIndex: 3,
    update: { type: EntityOverrideUpdateType.SetFloatOverride, value: 1.5 }
};

const SET_FLOAT_BYTES = Buffer.from([
    ...HEADER,
    ...TARGET_AND_INDEX,
    0x03, // Update selector: FloatOverride is alternative 3
    ...[0x10, ...Buffer.from('setfloatoverride', 'utf8')], // Type, 16 bytes
    ...[0x00, 0x00, 0xc0, 0x3f] // Value 1.5, little-endian float
]);

const REMOVE: PlayerUpdateEntityOverrides = {
    targetId: 7n,
    propertyIndex: 3,
    update: { type: EntityOverrideUpdateType.RemoveOverride }
};

const REMOVE_BYTES = Buffer.from([
    ...HEADER,
    ...TARGET_AND_INDEX,
    0x01, // Update selector: RemoveOverride is alternative 1
    ...[0x0e, ...Buffer.from('removeoverride', 'utf8')] // Type, 14 bytes, and nothing after it
]);

const CLEAR: PlayerUpdateEntityOverrides = {
    targetId: -2n,
    propertyIndex: 0,
    update: { type: EntityOverrideUpdateType.ClearOverrides }
};

const CLEAR_BYTES = Buffer.from([
    ...HEADER,
    0x03, // Target ID -2, ZigZag varint64
    0x00, // Property Index 0
    0x00, // Update selector: ClearOverride is alternative 0
    ...[0x0e, ...Buffer.from('clearoverrides', 'utf8')] // Type, 14 bytes, and nothing after it
]);

const encode = (data: PlayerUpdateEntityOverrides) => [
    ...new PlayerUpdateEntityOverridesPacket(data).serialize(new NetworkBinaryStream())
];

const decode = (bytes: Buffer) => {
    const stream = new NetworkBinaryStream(bytes);
    const data = new PlayerUpdateEntityOverridesPacket().deserialize(stream);
    return { data, stream };
};

describe('PlayerUpdateEntityOverridesPacket', () => {
    it('uses packet id 325', () => {
        expect(new PlayerUpdateEntityOverridesPacket().id).toBe(PacketIdentifier.PLAYER_UPDATE_ENTITY_OVERRIDES);
        expect(new PlayerUpdateEntityOverridesPacket().id).toBe(325);
    });

    it.each([
        ['SetIntOverride', SET_INT, SET_INT_BYTES],
        ['SetFloatOverride', SET_FLOAT, SET_FLOAT_BYTES],
        ['RemoveOverride', REMOVE, REMOVE_BYTES],
        ['ClearOverrides', CLEAR, CLEAR_BYTES]
    ])('writes %s in the order protocol 2193 defines', (_name, data, bytes) => {
        expect(encode(data)).toEqual([...bytes]);
    });

    it.each([
        ['SetIntOverride', SET_INT, SET_INT_BYTES],
        ['SetFloatOverride', SET_FLOAT, SET_FLOAT_BYTES],
        ['RemoveOverride', REMOVE, REMOVE_BYTES],
        ['ClearOverrides', CLEAR, CLEAR_BYTES]
    ])('reads a hand-built %s buffer to its end', (_name, data, bytes) => {
        const { data: decoded, stream } = decode(bytes);

        expect(decoded).toEqual(data);
        expect(stream.feof()).toBe(true);
    });

    it('ignores the casing of Type, as the docs spell it differently', () => {
        const { data, stream } = decode(
            Buffer.from([...HEADER, ...TARGET_AND_INDEX, 0x01, 0x0e, ...Buffer.from('RemoveOverride', 'utf8')])
        );

        expect(data).toEqual(REMOVE);
        expect(stream.feof()).toBe(true);
    });

    it('rejects a selector past the four alternatives', () => {
        expect(() => decode(Buffer.from([...HEADER, ...TARGET_AND_INDEX, 0x04, 0x00]))).toThrow(
            'Unknown entity override update type 4'
        );
    });
});
