import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import GraphicsOverrideParameterPacket, { GraphicsOverrideParameterType } from './GraphicsOverrideParameterPacket';

import type { GraphicsOverrideParameter } from './GraphicsOverrideParameterPacket';

/** The packet id 331 as a varuint32 header, no subclient ids. */
const HEADER = [0xcb, 0x02];

/** 1.5 as a little-endian float. */
const F_1_5 = [0x00, 0x00, 0xc0, 0x3f];
/** 0.25 as a little-endian float. */
const F_0_25 = [0x00, 0x00, 0x80, 0x3e];
/** -2 as a little-endian float. */
const F_NEG_2 = [0x00, 0x00, 0x00, 0xc0];
/** 0 as a little-endian float. */
const F_0 = [0x00, 0x00, 0x00, 0x00];
/** 1 as a little-endian float. */
const F_1 = [0x00, 0x00, 0x80, 0x3f];

/** "minecraft:plains" as a string: varuint32 length then UTF-8. */
const PLAINS = [0x10, ...Buffer.from('minecraft:plains', 'utf8')];

/** A keyframed sky zenith color for one player: two keyframes, no single values. */
const KEYFRAMED: GraphicsOverrideParameter = {
    keyframeValues: [
        { time: 0, value: { x: 1.5, y: 0.25, z: -2 } },
        { time: 1, value: { x: 0, y: 1, z: 0 } }
    ],
    biomeIdentifier: 'minecraft:plains',
    playerIdentifier: 'Steve',
    parameter: GraphicsOverrideParameterType.SKY_ZENITH_COLOR,
    resetParameter: false
};

/** `KEYFRAMED` on the wire, header bytes included, written by hand in the order the docs list the fields. */
const KEYFRAMED_BYTES = Buffer.from([
    ...HEADER, // packet id header
    0x02, // Parameter Keyframe Values count, a varuint32
    ...F_0, // keyframe 0 time
    ...F_1_5, // keyframe 0 value X
    ...F_0_25, // keyframe 0 value Y
    ...F_NEG_2, // keyframe 0 value Z
    ...F_1, // keyframe 1 time
    ...F_0, // keyframe 1 value X
    ...F_1, // keyframe 1 value Y
    ...F_0, // keyframe 1 value Z
    0x00, // Float Value absent
    0x00, // Vec3 Value absent
    ...PLAINS, // Biome Identifier "minecraft:plains"
    0x01, // Player Identifier present
    ...[0x05, 0x53, 0x74, 0x65, 0x76, 0x65], // Player Identifier "Steve"
    0x00, // Identifier for Parameter: SkyZenithColor (0), a uint8
    0x00 // Reset Parameter false
]);

/** A single float override for every player, with no keyframes. */
const SINGLE_FLOAT: GraphicsOverrideParameter = {
    keyframeValues: [],
    floatValue: 1.5,
    biomeIdentifier: 'minecraft:plains',
    parameter: GraphicsOverrideParameterType.RAYLEIGH_STRENGTH,
    resetParameter: false
};

const SINGLE_FLOAT_BYTES = Buffer.from([
    ...HEADER, // packet id header
    0x00, // Parameter Keyframe Values count
    0x01, // Float Value present
    ...F_1_5, // Float Value 1.5
    0x00, // Vec3 Value absent
    ...PLAINS, // Biome Identifier "minecraft:plains"
    0x00, // Player Identifier absent
    0x06, // Identifier for Parameter: RayleighStrength (6)
    0x00 // Reset Parameter false
]);

/** A single Vec3 override. */
const SINGLE_VEC3: GraphicsOverrideParameter = {
    keyframeValues: [],
    vec3Value: { x: 1.5, y: 0.25, z: -2 },
    biomeIdentifier: 'minecraft:plains',
    parameter: GraphicsOverrideParameterType.SUN_COLOR,
    resetParameter: false
};

const SINGLE_VEC3_BYTES = Buffer.from([
    ...HEADER, // packet id header
    0x00, // Parameter Keyframe Values count
    0x00, // Float Value absent
    0x01, // Vec3 Value present
    ...F_1_5, // Vec3 Value X
    ...F_0_25, // Vec3 Value Y
    ...F_NEG_2, // Vec3 Value Z
    ...PLAINS, // Biome Identifier "minecraft:plains"
    0x00, // Player Identifier absent
    0x29, // Identifier for Parameter: SunColor (41)
    0x00 // Reset Parameter false
]);

/** A reset: no values at all, the highest parameter number, the reset flag on. */
const RESET: GraphicsOverrideParameter = {
    keyframeValues: [],
    biomeIdentifier: 'minecraft:plains',
    parameter: GraphicsOverrideParameterType.ORBITAL_OFFSET_DEGREES,
    resetParameter: true
};

const RESET_BYTES = Buffer.from([
    ...HEADER, // packet id header
    0x00, // Parameter Keyframe Values count
    0x00, // Float Value absent
    0x00, // Vec3 Value absent
    ...PLAINS, // Biome Identifier "minecraft:plains"
    0x00, // Player Identifier absent
    0x33, // Identifier for Parameter: OrbitalOffsetDegrees (51)
    0x01 // Reset Parameter true
]);

const encode = (data: GraphicsOverrideParameter): Buffer =>
    new GraphicsOverrideParameterPacket(data).serialize(new NetworkBinaryStream());

const decode = (bytes: Buffer): GraphicsOverrideParameter => {
    const stream = new NetworkBinaryStream(bytes);
    const data = new GraphicsOverrideParameterPacket().deserialize(stream);
    expect(stream.feof()).toBe(true);
    return data;
};

const vectors: Array<{ name: string; data: GraphicsOverrideParameter; bytes: Buffer }> = [
    { name: 'a keyframed per-player override', data: KEYFRAMED, bytes: KEYFRAMED_BYTES },
    { name: 'a single float override', data: SINGLE_FLOAT, bytes: SINGLE_FLOAT_BYTES },
    { name: 'a single Vec3 override', data: SINGLE_VEC3, bytes: SINGLE_VEC3_BYTES },
    { name: 'a reset', data: RESET, bytes: RESET_BYTES }
];

describe('GraphicsOverrideParameterPacket', () => {
    for (const { name, data, bytes } of vectors) {
        it(`writes ${name} in the order protocol 2193 defines`, () => {
            expect([...encode(data)]).toEqual([...bytes]);
        });

        it(`reads ${name} to the end of the buffer without inventing absent values`, () => {
            expect(decode(bytes)).toStrictEqual(data);
        });
    }

    it('numbers the parameter enum as the docs do', () => {
        expect(GraphicsOverrideParameterType.SKY_ZENITH_COLOR).toBe(0);
        expect(GraphicsOverrideParameterType.CHLOROPHYLL).toBe(10);
        expect(GraphicsOverrideParameterType.MIDTONES_CONTRAST).toBe(23);
        expect(GraphicsOverrideParameterType.SUN_COLOR).toBe(41);
        expect(GraphicsOverrideParameterType.ORBITAL_OFFSET_DEGREES).toBe(51);
    });
});
