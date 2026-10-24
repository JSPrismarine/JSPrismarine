import BinaryStream from '@jsprismarine/binaryutils';
import { LevelSoundEvent, LevelSoundEventName } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import LevelSoundEventPacket from './LevelSoundEventPacket';

/** A varuint length and the UTF-8 bytes. */
const text = (value: string): number[] => {
    const bytes = Buffer.from(value, 'utf8');

    return [bytes.byteLength, ...bytes];
};

/** Four bytes, little endian. */
const float = (value: number): number[] => {
    const stream = new BinaryStream();
    stream.writeFloatLE(value);

    return [...stream.getBuffer()];
};

describe('network', () => {
    describe('LevelSoundEventPacket', () => {
        it('writes the sound as a name, the actor id as a fixed int64, and no fire position', () => {
            // The sound has been a string since 1.21.130. Written as the number it used to be,
            // the client reads that number as a string length and eats the position after it.
            const packet = Object.assign(new LevelSoundEventPacket(), {
                sound: LevelSoundEvent.BREAK,
                positionX: 1,
                positionY: 2,
                positionZ: 3,
                extraData: -1,
                entityType: '',
                isBabyMob: false,
                disableRelativeVolume: false,
                entityUniqueId: -1n
            });
            packet.encode();

            expect([...packet.getBuffer()]).toEqual([
                LevelSoundEventPacket.NetID,
                ...text(LevelSoundEventName[LevelSoundEvent.BREAK]!), // Sound Event.
                ...float(1), // Position X.
                ...float(2), // Position Y.
                ...float(3), // Position Z.
                1, // Data, ZigZag -1.
                0, // Actor Identifier, an empty string.
                0, // Is Baby.
                0, // Is Global.
                255,
                255,
                255,
                255,
                255,
                255,
                255,
                255, // Actor Unique Id, -1 as an int64 LE.
                0 // Fire At Position, absent.
            ]);
        });

        it('reads a hand-built buffer, fire position included, and consumes all of it', () => {
            const stream = new BinaryStream();
            stream.writeUnsignedVarInt(LevelSoundEventPacket.NetID);
            stream.writeUnsignedVarInt(LevelSoundEventName[LevelSoundEvent.PLACE]!.length);
            stream.write(Buffer.from(LevelSoundEventName[LevelSoundEvent.PLACE]!, 'utf8'));
            stream.writeFloatLE(10);
            stream.writeFloatLE(64);
            stream.writeFloatLE(-5);
            stream.writeVarInt(7);
            stream.writeUnsignedVarInt(5);
            stream.write(Buffer.from('a:cow', 'utf8'));
            stream.writeBoolean(true);
            stream.writeBoolean(true);
            stream.writeLongLE(12n);
            stream.writeBoolean(true);
            stream.writeFloatLE(1);
            stream.writeFloatLE(2);
            stream.writeFloatLE(3);

            const packet = new LevelSoundEventPacket(stream.getBuffer());
            packet.decode();

            expect(packet.sound).toBe(LevelSoundEvent.PLACE);
            expect(packet.positionX).toBe(10);
            expect(packet.positionY).toBe(64);
            expect(packet.positionZ).toBe(-5);
            expect(packet.extraData).toBe(7);
            expect(packet.entityType).toBe('a:cow');
            expect(packet.isBabyMob).toBe(true);
            expect(packet.disableRelativeVolume).toBe(true);
            expect(packet.entityUniqueId).toBe(12n);
            expect(packet.feof()).toBe(true);
        });
    });
});
