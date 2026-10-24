import { describe, expect, expectTypeOf, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import CameraInstruction, { EasingType, isEasingFunction } from './CameraInstruction';
import Vec3 from './Vec3';

import type { CameraInstructionData, EasingFunction } from './CameraInstruction';

/** A bare preset switch: `Set` with no inner optional, then `Clear`. */
const SWITCH: CameraInstructionData = {
    set: { preset: 3, removeIgnoreStartingValuesComponent: true },
    clear: false
};

/** `SWITCH` on the wire. */
const SWITCH_BYTES = Buffer.from([
    0x01, // Set present
    ...[0x03, 0x00, 0x00, 0x00], // preset 3, uint32 LE
    0x00, // ease absent
    0x00, // pos absent
    0x00, // rot absent
    0x00, // facing absent
    0x00, // view_offset absent
    0x00, // entity_offset absent
    0x00, // default absent
    0x01, // removeIgnoreStartingValuesComponent
    ...[0x01, 0x00], // Clear present, false
    0x00, // Fade absent
    0x00, // Target absent
    0x00, // RemoveTarget absent
    0x00, // FieldOfView absent
    0x00, // Spline absent
    0x00, // AttachToEntity absent
    0x00 // DetachFromEntity absent
]);

/** A spline with one control point and no key frame, the optionals at its end absent. */
const SPLINE: CameraInstructionData = {
    spline: { totalTime: 10, type: 1, curve: [new Vec3(1, 2, 3)], progressKeyFrames: [], rotationKeyFrames: [] }
};

/** `SPLINE` on the wire. */
const SPLINE_BYTES = Buffer.from([
    0x00, // Set absent
    0x00, // Clear absent
    0x00, // Fade absent
    0x00, // Target absent
    0x00, // RemoveTarget absent
    0x00, // FieldOfView absent
    0x01, // Spline present
    ...[0x00, 0x00, 0x20, 0x41], // totalTime, float LE 10.0
    0x01, // type
    0x01, // curve count, a varuint32
    ...[0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x40, 0x40], // one Vec3 (1, 2, 3)
    0x00, // progressKeyFrames count
    0x00, // rotationOption count
    0x00, // splineIdentifier absent
    0x00, // loadFromJson absent
    0x00, // AttachToEntity absent
    0x00 // DetachFromEntity absent
]);

describe('CameraInstruction', () => {
    it('writes nine zero bytes when it has no part', () => {
        const stream = new NetworkBinaryStream();
        new CameraInstruction().serialize(stream);

        expect(stream.getBuffer()).toEqual(Buffer.alloc(9));
    });

    it('writes a presence byte before each part and each inner optional', () => {
        const stream = new NetworkBinaryStream();
        new CameraInstruction(SWITCH).serialize(stream);

        expect(stream.getBuffer()).toEqual(SWITCH_BYTES);
    });

    it('writes a spline with varuint32 counts before each list', () => {
        const stream = new NetworkBinaryStream();
        new CameraInstruction(SPLINE).serialize(stream);

        expect(stream.getBuffer()).toEqual(SPLINE_BYTES);
    });

    it('reads a hand-built instruction and consumes exactly it', () => {
        const stream = new NetworkBinaryStream(SWITCH_BYTES);
        const instruction = CameraInstruction.deserialize(stream);

        expect(instruction.data).toEqual(SWITCH);
        expect(stream.feof()).toBe(true);
    });

    it('reads a spline back with its lists', () => {
        const stream = new NetworkBinaryStream(SPLINE_BYTES);
        const instruction = CameraInstruction.deserialize(stream);

        expect(instruction.data).toEqual(SPLINE);
        expect(stream.feof()).toBe(true);
    });

    it('rejects an easing_function string the docs do not list', () => {
        const stream = new NetworkBinaryStream();
        stream.write(Buffer.alloc(5)); // Set through RemoveTarget absent
        stream.writeBoolean(true); // FieldOfView present
        stream.writeFloatLE(70);
        stream.writeFloatLE(1);
        stream.writeString('inverse_lerp');
        stream.writeBoolean(false);

        expect(() => CameraInstruction.deserialize(new NetworkBinaryStream(stream.getBuffer()))).toThrow(
            'Unknown easing_function "inverse_lerp"'
        );
    });
});

describe('isEasingFunction', () => {
    it('accepts the lowercase name of every EasingType member', () => {
        expect(isEasingFunction('linear')).toBe(true);
        expect(isEasingFunction('in_out_elastic')).toBe(true);
        expect(EasingType.IN_OUT_ELASTIC).toBe(31);
    });

    it('rejects numbers, the empty string and unknown names', () => {
        expect(isEasingFunction('4')).toBe(false);
        expect(isEasingFunction('')).toBe(false);
        expect(isEasingFunction('inverse_lerp')).toBe(false);
    });

    it('derives the names from the enum members', () => {
        expectTypeOf<'in_out_quad'>().toMatchTypeOf<EasingFunction>();
    });
});
