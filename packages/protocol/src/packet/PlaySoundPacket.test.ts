import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { netIdFor } from '@jsprismarine/protocol/wire/versions/v2193';
import { describe, expect, it } from 'vitest';

import PlaySoundPacket from './PlaySoundPacket';

/** A varuint length and the UTF-8 bytes, which is how the docs encode a string. */
const text = (value: string): number[] => {
    const bytes = Buffer.from(value, 'utf8');

    return [bytes.byteLength, ...bytes];
};

/** Four bytes, little endian, which is how the docs encode a float. */
const float = (value: number): number[] => {
    const stream = new BinaryStream();
    stream.writeFloatLE(value);

    return [...stream.getBuffer()];
};

describe('network', () => {
    describe('PlaySoundPacket', () => {
        it('writes the position in eighths of a block and both new optionals as absent', () => {
            const packet = Object.assign(new PlaySoundPacket(), {
                name: 'random.pop',
                position: new Vector3(1, 2, -1),
                volume: 1,
                pitch: 1
            });
            packet.encode();

            expect([...packet.getBuffer()]).toEqual([
                netIdFor('PlaySoundPacket'),
                ...text('random.pop'), // Name.
                16, // X, ZigZag of 1 * 8.
                32, // Y, ZigZag of 2 * 8.
                15, // Z, ZigZag of -1 * 8.
                ...float(1), // Volume.
                ...float(1), // Pitch.
                1, // Loop Count, ZigZag -1.
                0, // Bypass Listener Range Check.
                0, // Server Sound Handle, absent.
                0 // Playback Position Seconds, absent.
            ]);
        });

        it('writes the two optionals as a presence byte and a value when it has them', () => {
            const packet = Object.assign(new PlaySoundPacket(), {
                name: 'x',
                position: new Vector3(0, 0, 0),
                loopCount: 3,
                bypassListenerRangeCheck: true,
                soundHandle: 42n,
                playbackPositionSeconds: 0.5
            });
            packet.encode();

            const stream = new BinaryStream(packet.getBuffer());
            stream.readUnsignedVarInt(); // Header.
            stream.read(2); // Name.
            stream.read(3); // Position.
            stream.readFloatLE(); // Volume.
            stream.readFloatLE(); // Pitch.

            expect(stream.readVarInt()).toBe(3);
            expect(stream.readBoolean()).toBe(true);
            expect(stream.readBoolean()).toBe(true);
            expect(stream.readUnsignedLongLE()).toBe(42n);
            expect(stream.readBoolean()).toBe(true);
            expect(stream.readFloatLE()).toBeCloseTo(0.5);
            expect(stream.feof()).toBe(true);
        });

        it('reads a hand-built buffer back to the block it names', () => {
            const stream = new BinaryStream();
            stream.writeUnsignedVarInt(netIdFor('PlaySoundPacket')!);
            stream.writeUnsignedVarInt(1);
            stream.write(Buffer.from('x', 'utf8'));
            stream.writeVarInt(5 * 8);
            stream.writeVarInt(64 * 8);
            stream.writeVarInt(-7 * 8);
            stream.writeFloatLE(0.25);
            stream.writeFloatLE(2);
            stream.writeVarInt(0);
            stream.writeBoolean(true);
            stream.writeBoolean(false);
            stream.writeBoolean(false);

            const packet = new PlaySoundPacket(stream.getBuffer());
            packet.decode();

            expect(packet.name).toBe('x');
            expect(packet.position?.getX()).toBe(5);
            expect(packet.position?.getY()).toBe(64);
            expect(packet.position?.getZ()).toBe(-7);
            expect(packet.volume).toBeCloseTo(0.25);
            expect(packet.pitch).toBeCloseTo(2);
            expect(packet.loopCount).toBe(0);
            expect(packet.bypassListenerRangeCheck).toBe(true);
            expect(packet.soundHandle).toBeNull();
            expect(packet.playbackPositionSeconds).toBeNull();
            expect(packet.feof()).toBe(true);
        });
    });
});
