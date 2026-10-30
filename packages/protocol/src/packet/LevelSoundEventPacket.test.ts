import { Vector3 } from '@jsprismarine/math';
import { LevelSoundEvent } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import LevelSoundEventPacket from './LevelSoundEventPacket';

describe('LevelSoundEventPacket', () => {
    // One Buffer per docs field, in wire order.
    const encoded = Buffer.concat([
        Buffer.from([0x7b]), // Header, packet 123
        Buffer.from([0x05]),
        Buffer.from('place'), // Sound Event, the enum member as its name
        Buffer.from([0x00, 0x00, 0x20, 0x41]), // Position X 10
        Buffer.from([0x00, 0x00, 0x80, 0x42]), // Position Y 64
        Buffer.from([0x00, 0x00, 0xa0, 0xc0]), // Position Z -5
        Buffer.from([0x0e]), // Data 7, ZigZag
        Buffer.from([0x05]),
        Buffer.from('a:cow'), // Actor Identifier
        Buffer.from([0x01]), // Is Baby
        Buffer.from([0x01]), // Is Global
        Buffer.from([0x0c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), // Actor Unique Id 12, int64 LE
        Buffer.from([0x01]), // Fire At Position present
        Buffer.from([0x00, 0x00, 0x80, 0x3f]), // Fire At Position X 1
        Buffer.from([0x00, 0x00, 0x00, 0x40]), // Fire At Position Y 2
        Buffer.from([0x00, 0x00, 0x40, 0x40]) // Fire At Position Z 3
    ]);

    it('decodes every field and consumes the whole buffer', () => {
        const packet = new LevelSoundEventPacket(encoded);
        packet.decode();

        expect(packet.sound).toBe(LevelSoundEvent.PLACE);
        expect([packet.positionX, packet.positionY, packet.positionZ]).toEqual([10, 64, -5]);
        expect(packet.extraData).toBe(7);
        expect(packet.entityType).toBe('a:cow');
        expect(packet.isBabyMob).toBe(true);
        expect(packet.disableRelativeVolume).toBe(true);
        expect(packet.entityUniqueId).toBe(12n);
        expect(packet.fireAtPosition).toEqual(new Vector3(1, 2, 3));
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes back', () => {
        const packet = Object.assign(new LevelSoundEventPacket(), {
            sound: LevelSoundEvent.PLACE,
            positionX: 10,
            positionY: 64,
            positionZ: -5,
            extraData: 7,
            entityType: 'a:cow',
            isBabyMob: true,
            disableRelativeVolume: true,
            entityUniqueId: 12n,
            fireAtPosition: new Vector3(1, 2, 3)
        });
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });

    it('writes the world sound a block break sends: no actor, -1 as a fixed int64, no fire position', () => {
        // The sound has been a string since 1.21.130. Written as the number it used to be, the
        // client reads that number as a string length and eats the position after it.
        const packet = Object.assign(new LevelSoundEventPacket(), {
            sound: LevelSoundEvent.BREAK,
            positionX: 1,
            positionY: 2,
            positionZ: 3,
            extraData: -1,
            entityType: '',
            isBabyMob: false,
            disableRelativeVolume: false
        });
        packet.encode();

        expect(packet.getBuffer()).toEqual(
            Buffer.concat([
                Buffer.from([0x7b, 0x05]),
                Buffer.from('break'),
                Buffer.from([0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x40, 0x40]),
                Buffer.from([0x01, 0x00, 0x00, 0x00]), // Data -1, empty Actor Identifier, Is Baby, Is Global
                Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), // Actor Unique Id -1
                Buffer.from([0x00]) // Fire At Position absent
            ])
        );
    });

    it('reads a sound name outside the enum as -1 and still consumes the whole buffer', () => {
        const packet = new LevelSoundEventPacket(
            Buffer.concat([
                Buffer.from([0x7b, 0x0a]),
                Buffer.from('custom.hum'),
                Buffer.alloc(12), // Position
                Buffer.from([0x00, 0x00, 0x00, 0x00]), // Data, Actor Identifier, Is Baby, Is Global
                Buffer.alloc(8), // Actor Unique Id 0
                Buffer.from([0x00]) // Fire At Position absent
            ])
        );
        packet.decode();

        expect(packet.sound).toBe(-1);
        expect(packet.entityUniqueId).toBe(0n);
        expect(packet.fireAtPosition).toBeNull();
        expect(packet.feof()).toBe(true);
    });
});
