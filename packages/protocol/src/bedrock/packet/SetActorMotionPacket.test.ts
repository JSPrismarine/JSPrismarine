import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import { PacketIdentifier } from '../PacketIdentifier';
import SetActorMotionPacket from './SetActorMotionPacket';

describe('network', () => {
    describe('packet', () => {
        describe('SetActorMotionPacket', () => {
            it('writes target, motion and tick in docs order', () => {
                const packet = new SetActorMotionPacket();
                packet.runtimeEntityId = 300n;
                packet.motion = new Vector3(0.5, -1, 0);
                packet.tick = 128n;
                packet.encode();

                expect([...packet.getBuffer()]).toEqual([
                    PacketIdentifier.SET_ACTOR_MOTION, // Header: id 40.
                    0xac,
                    0x02, // Target Runtime ID: 300 as a varuint64.
                    0x00,
                    0x00,
                    0x00,
                    0x3f, // Motion X: 0.5.
                    0x00,
                    0x00,
                    0x80,
                    0xbf, // Motion Y: -1.
                    0x00,
                    0x00,
                    0x00,
                    0x00, // Motion Z: 0.
                    0x80,
                    0x01 // Tick: 128 as a varuint64.
                ]);
            });

            it('defaults the tick to zero, so the packet ends in a single zero byte', () => {
                const packet = new SetActorMotionPacket();
                expect(packet.tick).toBe(0n);

                packet.runtimeEntityId = 1n;
                packet.motion = new Vector3(0, 0, 0);
                packet.encode();

                expect(packet.getBuffer().byteLength).toBe(1 + 1 + 12 + 1);
                expect(packet.getBuffer().at(-1)).toBe(0x00);
            });

            it('reads back every field and consumes the whole buffer', () => {
                const written = new SetActorMotionPacket();
                written.runtimeEntityId = 7n;
                written.motion = new Vector3(1, 2, 3);
                written.tick = 9n;
                written.encode();

                const packet = new SetActorMotionPacket(written.getBuffer());
                packet.decode();

                expect(packet.runtimeEntityId).toBe(7n);
                expect(packet.motion.getX()).toBe(1);
                expect(packet.motion.getY()).toBe(2);
                expect(packet.motion.getZ()).toBe(3);
                expect(packet.tick).toBe(9n);
                expect(packet.feof()).toBe(true);
            });
        });
    });
});
