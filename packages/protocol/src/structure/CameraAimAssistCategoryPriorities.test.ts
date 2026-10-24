import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import CameraAimAssistCategoryPriorities from './CameraAimAssistCategoryPriorities';

/** One entry in every map and both defaults set. */
const FULL = new CameraAimAssistCategoryPriorities(
    [{ identifier: 'minecraft:cow', priority: 10 }],
    [{ identifier: 'minecraft:stone', priority: 5 }],
    [{ identifier: 'ore', priority: 3 }],
    [{ identifier: 'monster', priority: 20 }],
    1,
    2
);

/** `FULL` on the wire, written by hand in the order the docs list the fields. */
const FULL_BYTES = Buffer.from([
    0x01, // entities count, a varuint32
    ...[0x0d, ...Buffer.from('minecraft:cow', 'utf8')], // key "minecraft:cow", 13 bytes
    ...[0x0a, 0x00, 0x00, 0x00], // value 10, little-endian int32
    0x01, // blocks count
    ...[0x0f, ...Buffer.from('minecraft:stone', 'utf8')], // key "minecraft:stone", 15 bytes
    ...[0x05, 0x00, 0x00, 0x00], // value 5
    0x01, // block_tags count
    ...[0x03, 0x6f, 0x72, 0x65], // key "ore"
    ...[0x03, 0x00, 0x00, 0x00], // value 3
    0x01, // entity_type_families count
    ...[0x07, ...Buffer.from('monster', 'utf8')], // key "monster"
    ...[0x14, 0x00, 0x00, 0x00], // value 20
    0x01, // entity_default present
    ...[0x01, 0x00, 0x00, 0x00], // entity_default 1, little-endian int32
    0x01, // block_default present
    ...[0x02, 0x00, 0x00, 0x00] // block_default 2, little-endian int32
]);

/** Nothing set: four empty maps and both defaults absent. */
const EMPTY_BYTES = Buffer.from([
    0x00, // entities count
    0x00, // blocks count
    0x00, // block_tags count
    0x00, // entity_type_families count
    0x00, // entity_default absent
    0x00 // block_default absent
]);

describe('CameraAimAssistCategoryPriorities', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const stream = new NetworkBinaryStream();
        FULL.serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...FULL_BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(FULL_BYTES);
        const priorities = CameraAimAssistCategoryPriorities.deserialize(stream);

        expect(priorities).toEqual(FULL);
        expect(stream.feof()).toBe(true);
    });

    it('writes an empty set as six zero bytes', () => {
        const stream = new NetworkBinaryStream();
        new CameraAimAssistCategoryPriorities().serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...EMPTY_BYTES]);
    });

    it('reads absent defaults as undefined', () => {
        const stream = new NetworkBinaryStream(EMPTY_BYTES);
        const priorities = CameraAimAssistCategoryPriorities.deserialize(stream);

        expect(priorities).toEqual(new CameraAimAssistCategoryPriorities());
        expect(priorities.entityDefault).toBeUndefined();
        expect(priorities.blockDefault).toBeUndefined();
        expect(stream.feof()).toBe(true);
    });

    it('round-trips a negative priority through the signed int32', () => {
        const input = new CameraAimAssistCategoryPriorities([{ identifier: 'x', priority: -1 }], [], [], [], -100);
        const stream = new NetworkBinaryStream();
        input.serialize(stream);

        expect(CameraAimAssistCategoryPriorities.deserialize(new NetworkBinaryStream(stream.getBuffer()))).toEqual(
            input
        );
    });
});
