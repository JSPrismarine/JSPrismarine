import { Vector3 } from '@jsprismarine/math';
import { ActorEvent } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import Identifiers from '../Identifiers';
import ActorEventPacket from './ActorEventPacket';

describe('network', () => {
    describe('packet', () => {
        describe('ActorEventPacket', () => {
            it('writes the four fields in docs order, with an absent Fire At Position', () => {
                const packet = new ActorEventPacket();
                packet.runtimeEntityId = 300n;
                packet.event = ActorEvent.HURT_ANIMATION;
                packet.data = -1;
                packet.encode();

                expect([...packet.getBuffer()]).toEqual([
                    Identifiers.ActorEventPacket, // Header: id 27.
                    0xac,
                    0x02, // Target Runtime ID: 300 as a varuint64.
                    0x02, // Event ID: HURT_ANIMATION as a uint8.
                    0x01, // Data: -1 as a ZigZag varint32.
                    0x00 // Fire At Position: absent.
                ]);
            });

            it('writes a present Fire At Position as the presence byte then three LE floats', () => {
                const packet = new ActorEventPacket();
                packet.runtimeEntityId = 1n;
                packet.event = ActorEvent.DEATH_ANIMATION;
                packet.fireAtPosition = new Vector3(1, 2, 3);
                packet.encode();

                expect([...packet.getBuffer()]).toEqual([
                    Identifiers.ActorEventPacket,
                    0x01, // Target Runtime ID.
                    0x03, // Event ID: DEATH_ANIMATION.
                    0x00, // Data: 0.
                    0x01, // Fire At Position: present.
                    0x00,
                    0x00,
                    0x80,
                    0x3f, // X: 1.
                    0x00,
                    0x00,
                    0x00,
                    0x40, // Y: 2.
                    0x00,
                    0x00,
                    0x40,
                    0x40 // Z: 3.
                ]);
            });

            it('reads every field and stops at the end of the packet', () => {
                const bytes = Buffer.from([
                    Identifiers.ActorEventPacket,
                    0xac,
                    0x02, // Target Runtime ID: 300.
                    0x1d, // Event ID: DRINK_POTION, 29.
                    0x08, // Data: 4.
                    0x01, // Fire At Position: present.
                    0x00,
                    0x00,
                    0x80,
                    0xbf, // X: -1.
                    0x00,
                    0x00,
                    0x00,
                    0x00, // Y: 0.
                    0x00,
                    0x00,
                    0x80,
                    0x3f // Z: 1.
                ]);

                const packet = new ActorEventPacket(bytes);
                packet.decode();

                expect(packet.runtimeEntityId).toBe(300n);
                expect(packet.event).toBe(ActorEvent.DRINK_POTION);
                expect(packet.data).toBe(4);
                expect(packet.fireAtPosition?.getX()).toBe(-1);
                expect(packet.fireAtPosition?.getY()).toBe(0);
                expect(packet.fireAtPosition?.getZ()).toBe(1);
                expect(packet.feof()).toBe(true);
            });
        });
    });
});
