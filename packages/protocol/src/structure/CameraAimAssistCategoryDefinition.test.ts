import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import CameraAimAssistCategoryDefinition from './CameraAimAssistCategoryDefinition';
import CameraAimAssistCategoryPriorities from './CameraAimAssistCategoryPriorities';

/** A category named "mobs" that prefers cows and defaults every other entity to 1. */
const MOBS = new CameraAimAssistCategoryDefinition(
    'mobs',
    new CameraAimAssistCategoryPriorities([{ identifier: 'minecraft:cow', priority: 10 }], [], [], [], 1)
);

/** `MOBS` on the wire, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0x04, 0x6d, 0x6f, 0x62, 0x73], // name "mobs"
    0x01, // priorities.entities count, a varuint32
    ...[0x0d, ...Buffer.from('minecraft:cow', 'utf8')], // key "minecraft:cow"
    ...[0x0a, 0x00, 0x00, 0x00], // value 10, little-endian int32
    0x00, // priorities.blocks count
    0x00, // priorities.block_tags count
    0x00, // priorities.entity_type_families count
    0x01, // priorities.entity_default present
    ...[0x01, 0x00, 0x00, 0x00], // priorities.entity_default 1
    0x00 // priorities.block_default absent
]);

describe('CameraAimAssistCategoryDefinition', () => {
    it('writes the name then the priorities', () => {
        const stream = new NetworkBinaryStream();
        MOBS.serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const category = CameraAimAssistCategoryDefinition.deserialize(stream);

        expect(category).toEqual(MOBS);
        expect(stream.feof()).toBe(true);
    });

    it('constructs an empty category without arguments', () => {
        const category = new CameraAimAssistCategoryDefinition();

        expect(category.name).toBe('');
        expect(category.priorities).toEqual(new CameraAimAssistCategoryPriorities());
    });
});
