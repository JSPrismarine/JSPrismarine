import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import CameraPreset, { AimAssistTargetMode, CameraAudioListener, ControlScheme } from './CameraPreset';
import Vec2 from './Vec2';

import type { CameraPresetData } from './CameraPreset';

/** A root preset with no optional field: the two strings, then a 0 byte for everything else. */
const ROOT: CameraPresetData = { name: 'free', inheritFrom: '', applyInheritedStartingRotation: false };

/** `ROOT` on the wire. */
const ROOT_BYTES = Buffer.from([
    ...[0x04, 0x66, 0x72, 0x65, 0x65], // Name "free"
    0x00, // Inherit From ""
    ...Array.from({ length: 20 }, () => 0x00), // Pos X through Control Scheme, twenty absent optionals
    0x00, // Apply Inherited Starting Rotation
    0x00 // Starting Rotation absent
]);

/** A child preset with a handful of optionals, chosen so each wire type appears once. */
const CHILD: CameraPresetData = {
    name: 'orbit',
    inheritFrom: 'free',
    posY: 2,
    snapToTarget: true,
    viewOffset: new Vec2(0.5, 1.5),
    listener: CameraAudioListener.PLAYER,
    aimAssist: { targetMode: AimAssistTargetMode.ANGLE },
    controlScheme: ControlScheme.PLAYER_RELATIVE,
    applyInheritedStartingRotation: true
};

/** `CHILD` on the wire. */
const CHILD_BYTES = Buffer.from([
    ...[0x05, 0x6f, 0x72, 0x62, 0x69, 0x74], // Name "orbit"
    ...[0x04, 0x66, 0x72, 0x65, 0x65], // Inherit From "free"
    0x00, // Pos X absent
    ...[0x01, 0x00, 0x00, 0x00, 0x40], // Pos Y present, float LE 2.0
    0x00, // Pos Z absent
    0x00, // Rot X absent
    0x00, // Rot Y absent
    0x00, // Rotation Speed absent
    ...[0x01, 0x01], // Snap to Target present, true
    0x00, // Horizontal Rotation Limit absent
    0x00, // Vertical Rotation Limit absent
    0x00, // Continue Targeting absent
    0x00, // Block Listening Radius absent
    ...[0x01, 0x00, 0x00, 0x00, 0x3f, 0x00, 0x00, 0xc0, 0x3f], // View Offset present, Vec2 (0.5, 1.5)
    0x00, // Entity Offset absent
    0x00, // Radius absent
    0x00, // Yaw Limit Min absent
    0x00, // Yaw Limit Max absent
    ...[0x01, 0x01], // Listener present, Player
    0x00, // Player Effects absent
    0x01, // Aim Assist present
    0x00, // Preset Id absent
    ...[0x01, 0x00], // Target Mode present, angle
    0x00, // View Angle absent
    0x00, // Distance absent
    ...[0x01, 0x03], // Control Scheme present, player_relative
    0x01, // Apply Inherited Starting Rotation
    0x00 // Starting Rotation absent
]);

describe('CameraPreset', () => {
    it('writes a root preset as its two strings and 22 zero bytes', () => {
        const stream = new NetworkBinaryStream();
        new CameraPreset(ROOT).serialize(stream);

        expect(stream.getBuffer()).toEqual(ROOT_BYTES);
    });

    it('writes a presence byte before each optional field, in docs order', () => {
        const stream = new NetworkBinaryStream();
        new CameraPreset(CHILD).serialize(stream);

        expect(stream.getBuffer()).toEqual(CHILD_BYTES);
    });

    it('reads a hand-built preset and consumes exactly it', () => {
        const stream = new NetworkBinaryStream(CHILD_BYTES);
        const preset = CameraPreset.deserialize(stream);

        expect(preset.data).toEqual(CHILD);
        expect(stream.feof()).toBe(true);
    });

    it('leaves every absent optional undefined when reading a root preset', () => {
        const stream = new NetworkBinaryStream(ROOT_BYTES);
        const preset = CameraPreset.deserialize(stream);

        expect(preset.data).toEqual(ROOT);
        expect(preset.data.posX).toBeUndefined();
        expect(preset.data.aimAssist).toBeUndefined();
        expect(stream.feof()).toBe(true);
    });
});
