import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import CorrectPlayerMovePredictionPacket, { RewindType } from './CorrectPlayerMovePredictionPacket';

// Packet id 161 as a varuint.
const HEADER = [0xa1, 0x01];

const f32 = (value: number): number[] => {
    const buffer = Buffer.alloc(4);
    buffer.writeFloatLE(value);
    return [...buffer];
};

const PLAYER_CORRECTION = [
    0x00, // PredictionType Player
    ...f32(1.5),
    ...f32(2.5),
    ...f32(3.5), // Pos
    ...f32(0),
    ...f32(-0.5),
    ...f32(0), // Pos Delta
    ...f32(0),
    ...f32(0), // Rotation, unused for a player correction but still written
    0x00, // VehicleAngularVelocity absent
    0x01, // On Ground
    0x0a // Tick
];

const VEHICLE_CORRECTION = [
    0x01, // PredictionType Vehicle
    ...f32(1.5),
    ...f32(2.5),
    ...f32(3.5), // Pos
    ...f32(0),
    ...f32(0),
    ...f32(0), // Pos Delta
    ...f32(45),
    ...f32(90), // Rotation
    0x01,
    ...f32(0.25), // VehicleAngularVelocity present
    0x00, // On Ground
    0xac,
    0x02 // Tick 300
];

describe('CorrectPlayerMovePredictionPacket', () => {
    it('writes a player correction with a presence byte and no angular velocity', () => {
        const packet = new CorrectPlayerMovePredictionPacket();
        packet.pos = new Vector3(1.5, 2.5, 3.5);
        packet.posDelta = new Vector3(0, -0.5, 0);
        packet.onGround = true;
        packet.tick = 10n;
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([...HEADER, ...PLAYER_CORRECTION]));
    });

    it('writes a vehicle correction with the rotation and the angular velocity', () => {
        const packet = new CorrectPlayerMovePredictionPacket();
        packet.predictionType = RewindType.Vehicle;
        packet.pos = new Vector3(1.5, 2.5, 3.5);
        packet.rotationX = 45;
        packet.rotationY = 90;
        packet.vehicleAngularVelocity = 0.25;
        packet.tick = 300n;
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([...HEADER, ...VEHICLE_CORRECTION]));
    });

    it('reads a player correction, leaving the angular velocity null, and consumes the whole buffer', () => {
        const packet = new CorrectPlayerMovePredictionPacket();
        packet.setReadBuffer(Buffer.from([...HEADER, ...PLAYER_CORRECTION]));
        packet.decode();

        expect(packet.predictionType).toBe(RewindType.Player);
        expect(packet.pos.getX()).toBe(1.5);
        expect(packet.pos.getY()).toBe(2.5);
        expect(packet.pos.getZ()).toBe(3.5);
        expect(packet.posDelta.getY()).toBe(-0.5);
        expect(packet.rotationX).toBe(0);
        expect(packet.rotationY).toBe(0);
        expect(packet.vehicleAngularVelocity).toBeNull();
        expect(packet.onGround).toBe(true);
        expect(packet.tick).toBe(10n);
        expect(packet.feof()).toBe(true);
    });

    it('reads a vehicle correction, including the angular velocity, and consumes the whole buffer', () => {
        const packet = new CorrectPlayerMovePredictionPacket();
        packet.setReadBuffer(Buffer.from([...HEADER, ...VEHICLE_CORRECTION]));
        packet.decode();

        expect(packet.predictionType).toBe(RewindType.Vehicle);
        expect(packet.rotationX).toBe(45);
        expect(packet.rotationY).toBe(90);
        expect(packet.vehicleAngularVelocity).toBe(0.25);
        expect(packet.onGround).toBe(false);
        expect(packet.tick).toBe(300n);
        expect(packet.feof()).toBe(true);
    });
});
