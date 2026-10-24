import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import { AimAssistTargetMode, CameraAudioListener, ControlScheme } from '../structure/CameraPreset';
import Vec2 from '../structure/Vec2';
import Vec3 from '../structure/Vec3';
import CameraPresetsPacket from './CameraPresetsPacket';

import type { CameraPresetsPayload } from './CameraPresetsPacket';

/** One preset with every optional field present. */
const FULL: CameraPresetsPayload = {
    cameraPresets: [
        {
            name: 'orbit',
            inheritFrom: 'free',
            posX: 1,
            posY: 2,
            posZ: 3,
            rotX: 45,
            rotY: 90,
            rotationSpeed: 0.5,
            snapToTarget: true,
            horizontalRotationLimit: new Vec2(-90, 90),
            verticalRotationLimit: new Vec2(0, 180),
            continueTargeting: false,
            blockListeningRadius: 8,
            viewOffset: new Vec2(0.5, 1.5),
            entityOffset: new Vec3(0, 1, 0),
            radius: 4,
            yawLimitMin: -45,
            yawLimitMax: 45,
            listener: CameraAudioListener.PLAYER,
            playerEffects: true,
            aimAssist: {
                presetId: 'aim',
                targetMode: AimAssistTargetMode.DISTANCE,
                viewAngle: new Vec2(10, 20),
                distance: 6
            },
            controlScheme: ControlScheme.CAMERA_RELATIVE_STRAFE,
            applyInheritedStartingRotation: true,
            startingRotation: new Vec2(30, 0)
        }
    ]
};

/** `FULL` on the wire, header included, written by hand in the order the docs list the fields. */
const FULL_BYTES = Buffer.from([
    ...[0xc6, 0x01], // packet id 198 as a varuint32 header
    0x01, // Camera Presets count, a varuint32
    ...[0x05, 0x6f, 0x72, 0x62, 0x69, 0x74], // Name "orbit"
    ...[0x04, 0x66, 0x72, 0x65, 0x65], // Inherit From "free"
    ...[0x01, 0x00, 0x00, 0x80, 0x3f], // Pos X present, float LE 1.0
    ...[0x01, 0x00, 0x00, 0x00, 0x40], // Pos Y present, 2.0
    ...[0x01, 0x00, 0x00, 0x40, 0x40], // Pos Z present, 3.0
    ...[0x01, 0x00, 0x00, 0x34, 0x42], // Rot X present, 45.0
    ...[0x01, 0x00, 0x00, 0xb4, 0x42], // Rot Y present, 90.0
    ...[0x01, 0x00, 0x00, 0x00, 0x3f], // Rotation Speed present, 0.5
    ...[0x01, 0x01], // Snap to Target present, true
    ...[0x01, 0x00, 0x00, 0xb4, 0xc2, 0x00, 0x00, 0xb4, 0x42], // Horizontal Rotation Limit present, Vec2 (-90, 90)
    ...[0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x34, 0x43], // Vertical Rotation Limit present, Vec2 (0, 180)
    ...[0x01, 0x00], // Continue Targeting present, false
    ...[0x01, 0x00, 0x00, 0x00, 0x41], // Block Listening Radius present, 8.0
    ...[0x01, 0x00, 0x00, 0x00, 0x3f, 0x00, 0x00, 0xc0, 0x3f], // View Offset present, Vec2 (0.5, 1.5)
    ...[0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x00, 0x00], // Entity Offset present, Vec3 (0, 1, 0)
    ...[0x01, 0x00, 0x00, 0x80, 0x40], // Radius present, 4.0
    ...[0x01, 0x00, 0x00, 0x34, 0xc2], // Yaw Limit Min present, -45.0
    ...[0x01, 0x00, 0x00, 0x34, 0x42], // Yaw Limit Max present, 45.0
    ...[0x01, 0x01], // Listener present, Player
    ...[0x01, 0x01], // Player Effects present, true
    0x01, // Aim Assist present
    ...[0x01, 0x03, 0x61, 0x69, 0x6d], // Preset Id present, "aim"
    ...[0x01, 0x01], // Target Mode present, distance
    ...[0x01, 0x00, 0x00, 0x20, 0x41, 0x00, 0x00, 0xa0, 0x41], // View Angle present, Vec2 (10, 20)
    ...[0x01, 0x00, 0x00, 0xc0, 0x40], // Distance present, 6.0
    ...[0x01, 0x02], // Control Scheme present, camera_relative_strafe
    0x01, // Apply Inherited Starting Rotation, no presence byte
    ...[0x01, 0x00, 0x00, 0xf0, 0x41, 0x00, 0x00, 0x00, 0x00] // Starting Rotation present, Vec2 (30, 0)
]);

/** One root preset with every optional field absent. */
const BARE: CameraPresetsPayload = {
    cameraPresets: [{ name: 'free', inheritFrom: '', applyInheritedStartingRotation: false }]
};

/** `BARE` on the wire: the header, the count, two strings, then one 0 byte per remaining field. */
const BARE_BYTES = Buffer.from([
    ...[0xc6, 0x01], // packet id 198 as a varuint32 header
    0x01, // Camera Presets count
    ...[0x04, 0x66, 0x72, 0x65, 0x65], // Name "free"
    0x00, // Inherit From ""
    ...Array.from({ length: 20 }, () => 0x00), // Pos X through Control Scheme absent
    0x00, // Apply Inherited Starting Rotation
    0x00 // Starting Rotation absent
]);

describe('CameraPresetsPacket', () => {
    it('writes an empty list as the header and a zero count', () => {
        const buffer = new CameraPresetsPacket({ cameraPresets: [] }).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([0xc6, 0x01, 0x00]);
    });

    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new CameraPresetsPacket(FULL).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...FULL_BYTES]);
    });

    it('writes a presence byte of 0 for each absent optional', () => {
        const buffer = new CameraPresetsPacket(BARE).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BARE_BYTES]);
    });

    it('reads a hand-built buffer with every optional to its end', () => {
        const stream = new NetworkBinaryStream(FULL_BYTES);
        const data = new CameraPresetsPacket().deserialize(stream);

        expect(data).toEqual(FULL);
        expect(stream.feof()).toBe(true);
    });

    it('reads a hand-built buffer with no optional to its end', () => {
        const stream = new NetworkBinaryStream(BARE_BYTES);
        const data = new CameraPresetsPacket().deserialize(stream);

        expect(data).toEqual(BARE);
        expect(stream.feof()).toBe(true);
    });
});
