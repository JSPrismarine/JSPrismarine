import { describe, expect, it } from 'vitest';

import { Vector3 } from '@jsprismarine/math';
import MoveActorAbsolutePacket from './MoveActorAbsolutePacket';

/**
 * The wire format of an entity move.
 *
 * Worth pinning byte for byte, because everything about it is invisible when wrong: the three
 * rotations are the same type in a row, so putting them in the wrong order produces a packet the
 * client accepts and misinterprets. It read as a villager whose head was stuck at an angle and
 * never turned - the head was being set from the body and the body from the head.
 * @see https://apidoc-dev.pmmp.io/d1/d15/_move_actor_absolute_packet_8php_source.html
 */

/** The tail of the encoded packet: the three rotation bytes, in order. */
const rotationBytesOf = (packet: MoveActorAbsolutePacket): number[] => {
    packet.encode();
    const buffer = packet.getBuffer();

    return [...buffer.subarray(buffer.length - 3)];
};

const degreesToByte = (degrees: number) => Math.round(degrees / (360 / 256)) & 0xff;

const moveTo = (pitch: number, yaw: number, headYaw: number) => {
    const packet = new MoveActorAbsolutePacket();
    packet.runtimeEntityId = 42n;
    packet.position = new Vector3(1, 2, 3);
    packet.pitch = pitch;
    packet.yaw = yaw;
    packet.headYaw = headYaw;

    return packet;
};

describe('MoveActorAbsolutePacket', () => {
    it('writes the rotations as pitch, body yaw, head yaw', () => {
        // Three distinct values, so a swapped pair cannot pass.
        expect(rotationBytesOf(moveTo(10, 90, 180))).toEqual([
            degreesToByte(10),
            degreesToByte(90),
            degreesToByte(180)
        ]);
    });

    it('keeps the head separate from the body', () => {
        // The specific mistake: a mob facing north while looking east must not be sent as one
        // facing east. The two bytes have to differ.
        const [, yaw, headYaw] = rotationBytesOf(moveTo(0, 0, 90));

        expect(yaw).toBe(degreesToByte(0));
        expect(headYaw).toBe(degreesToByte(90));
        expect(yaw).not.toBe(headYaw);
    });

    it('wraps an angle that has wound past a full turn', () => {
        // Angles here accumulate freely: a mob that has turned right four times is at 400 degrees
        // and one that has turned left is negative. The raw division would hand `writeByte` a
        // fraction and a number outside 0-255.
        expect(rotationBytesOf(moveTo(0, 370, 0))[1]).toBe(rotationBytesOf(moveTo(0, 10, 0))[1]);
        expect(rotationBytesOf(moveTo(0, -90, 0))[1]).toBe(rotationBytesOf(moveTo(0, 270, 0))[1]);

        for (const angle of [-720, -181, 0, 179, 360, 1000]) {
            const [byte] = rotationBytesOf(moveTo(angle, 0, 0));
            expect(byte).toBeGreaterThanOrEqual(0);
            expect(byte).toBeLessThanOrEqual(255);
            expect(Number.isInteger(byte)).toBe(true);
        }
    });

    it('defaults to no flags, which is neither grounded nor a teleport', () => {
        const packet = moveTo(0, 0, 0);
        packet.encode();

        // Byte after the varint entity id. 42 fits in one byte, so the flags are at index 2:
        // one for the packet id, one for the id.
        expect(packet.getBuffer()[2]).toBe(0);
    });

    it('marks a grounded entity without marking it as teleported', () => {
        // A teleport makes the client snap rather than interpolate, so it must never be set on an
        // entity that is merely walking.
        const packet = moveTo(0, 0, 0);
        packet.flags = MoveActorAbsolutePacket.FLAG_ON_GROUND;
        packet.encode();

        expect(packet.getBuffer()[2]! & MoveActorAbsolutePacket.FLAG_TELEPORT).toBe(0);
        expect(packet.getBuffer()[2]! & MoveActorAbsolutePacket.FLAG_ON_GROUND).toBe(
            MoveActorAbsolutePacket.FLAG_ON_GROUND
        );
    });
});
