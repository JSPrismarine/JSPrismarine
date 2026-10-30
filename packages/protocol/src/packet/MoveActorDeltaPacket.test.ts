import { describe, expect, it } from 'vitest';
import MoveActorDeltaPacket from './MoveActorDeltaPacket';

const ENCODED = Buffer.concat([
    Buffer.from([0x6f]), // Header: id 111 as LEB128.
    Buffer.from([0x0a]), // Actor Runtime ID 10 as a varuint64.
    Buffer.from([0x01, 0x00, 0x00, 0xc0, 0x3f]), // New Position X present, 1.5.
    Buffer.from([0x00]), // New Position Y absent.
    Buffer.from([0x01, 0x00, 0x00, 0x00, 0xc0]), // New Position Z present, -2.
    Buffer.from([0x00]), // Rotation X absent.
    Buffer.from([0x01, 0x40]), // Rotation Y present, 90 degrees as a packed byte.
    Buffer.from([0x00]), // Rotation Y Head absent.
    Buffer.from([0x01]), // Is On Ground.
    Buffer.from([0x00]), // Force Move.
    Buffer.from([0x00]), // Force Move Local Entity.
    Buffer.from([0x01]), // Force Completion.
    Buffer.from([0x03]) // Ticks as a varuint64.
]);

describe('MoveActorDeltaPacket', () => {
    it('writes a presence byte per component and only the components that are set', () => {
        const packet = Object.assign(new MoveActorDeltaPacket(), {
            runtimeEntityId: 10n,
            positionX: 1.5,
            positionZ: -2,
            yaw: 90,
            isOnGround: true,
            forceCompletion: true,
            ticks: 3n
        });
        packet.encode();

        expect(packet.getBuffer()).toEqual(ENCODED);
    });

    it('decodes only the announced components and consumes the whole buffer', () => {
        const packet = new MoveActorDeltaPacket(ENCODED);
        packet.decode();

        expect(packet.runtimeEntityId).toBe(10n);
        expect(packet.positionX).toBe(1.5);
        expect(packet.positionY).toBeUndefined();
        expect(packet.positionZ).toBe(-2);
        expect(packet.pitch).toBeUndefined();
        expect(packet.yaw).toBe(90);
        expect(packet.headYaw).toBeUndefined();
        expect(packet.isOnGround).toBe(true);
        expect(packet.forceMove).toBe(false);
        expect(packet.forceMoveLocalEntity).toBe(false);
        expect(packet.forceCompletion).toBe(true);
        expect(packet.ticks).toBe(3n);
        expect(packet.feof()).toBe(true);
    });

    it('encodes an empty packet as six absent components', () => {
        const packet = new MoveActorDeltaPacket();
        packet.encode();

        expect(packet.getBuffer()).toEqual(
            Buffer.from([0x6f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
        );
    });
});
