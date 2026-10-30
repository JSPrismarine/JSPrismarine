import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import Vec3 from '../structure/Vec3';
import CorrectPlayerMovePredictionPacket, { RewindType } from './CorrectPlayerMovePredictionPacket';

const f32 = (value: number): number[] => {
    const buffer = Buffer.alloc(4);
    buffer.writeFloatLE(value);
    return [...buffer];
};

const PLAYER_CORRECTION = Buffer.from([
    0xa1,
    0x01,
    0x00,
    ...f32(1.5),
    ...f32(2.5),
    ...f32(3.5),
    ...f32(0),
    ...f32(-0.5),
    ...f32(0),
    ...f32(0),
    ...f32(0),
    0x00,
    0x01,
    0x0a
]);

const VEHICLE_CORRECTION = Buffer.from([
    0xa1,
    0x01,
    0x01,
    ...f32(1.5),
    ...f32(2.5),
    ...f32(3.5),
    ...f32(0),
    ...f32(0),
    ...f32(0),
    ...f32(45),
    ...f32(90),
    0x01,
    ...f32(0.25),
    0x00,
    0xac,
    0x02
]);

const playerData = {
    predictionType: RewindType.Player,
    pos: new Vec3(1.5, 2.5, 3.5),
    posDelta: new Vec3(0, -0.5, 0),
    rotationX: 0,
    rotationY: 0,
    vehicleAngularVelocity: null,
    onGround: true,
    tick: 10n
};

const vehicleData = {
    predictionType: RewindType.Vehicle,
    pos: new Vec3(1.5, 2.5, 3.5),
    posDelta: new Vec3(0, 0, 0),
    rotationX: 45,
    rotationY: 90,
    vehicleAngularVelocity: 0.25,
    onGround: false,
    tick: 300n
};

describe('CorrectPlayerMovePredictionPacket', () => {
    it('writes a player correction with the absent angular-velocity flag', () => {
        expect(new CorrectPlayerMovePredictionPacket(playerData).serialize(new NetworkBinaryStream())).toEqual(
            PLAYER_CORRECTION
        );
    });

    it('writes a vehicle correction with rotation and angular velocity', () => {
        expect(new CorrectPlayerMovePredictionPacket(vehicleData).serialize(new NetworkBinaryStream())).toEqual(
            VEHICLE_CORRECTION
        );
    });

    it('reads a player correction and consumes the whole buffer', () => {
        const stream = new NetworkBinaryStream(PLAYER_CORRECTION);
        const decoded = new CorrectPlayerMovePredictionPacket().deserialize(stream);

        expect(decoded).toEqual(playerData);
        expect(stream.feof()).toBe(true);
    });

    it('reads the vehicle correction and consumes the whole buffer', () => {
        const stream = new NetworkBinaryStream(VEHICLE_CORRECTION);
        const decoded = new CorrectPlayerMovePredictionPacket().deserialize(stream);

        expect(decoded).toEqual(vehicleData);
        expect(stream.feof()).toBe(true);
    });
});
