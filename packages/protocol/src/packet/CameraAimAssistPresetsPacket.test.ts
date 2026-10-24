import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import CameraAimAssistCategoryDefinition from '../structure/CameraAimAssistCategoryDefinition';
import CameraAimAssistCategoryPriorities from '../structure/CameraAimAssistCategoryPriorities';
import CameraAimAssistPresetDefinition from '../structure/CameraAimAssistPresetDefinition';
import CameraAimAssistPresetsPacket, { CameraAimAssistPresetsOperation } from './CameraAimAssistPresetsPacket';

import type { CameraAimAssistPresets } from './CameraAimAssistPresetsPacket';

/** One category "mobs" and one preset "ns:p" that uses it for an empty hand, replacing the registry. */
const DATA: CameraAimAssistPresets = {
    categories: [
        new CameraAimAssistCategoryDefinition(
            'mobs',
            new CameraAimAssistCategoryPriorities([{ identifier: 'minecraft:cow', priority: 10 }], [], [], [], 1)
        )
    ],
    presets: [
        new CameraAimAssistPresetDefinition(
            'ns:p',
            { blocks: ['minecraft:air'], entities: [], blockTags: [], entityTypeFamilies: [] },
            [],
            [{ item: 'minecraft:bow', category: 'mobs' }],
            undefined,
            'mobs'
        )
    ],
    operation: CameraAimAssistPresetsOperation.SET
};

/** `DATA` on the wire, header bytes included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xc0, 0x02], // packet id header: 320 as a varuint32
    0x01, // categories count, a varuint32
    ...[0x04, 0x6d, 0x6f, 0x62, 0x73], // name "mobs"
    0x01, // priorities.entities count
    ...[0x0d, ...Buffer.from('minecraft:cow', 'utf8')], // key "minecraft:cow"
    ...[0x0a, 0x00, 0x00, 0x00], // value 10, little-endian int32
    0x00, // priorities.blocks count
    0x00, // priorities.block_tags count
    0x00, // priorities.entity_type_families count
    0x01, // priorities.entity_default present
    ...[0x01, 0x00, 0x00, 0x00], // priorities.entity_default 1
    0x00, // priorities.block_default absent
    0x01, // presets count, a varuint32
    ...[0x04, 0x6e, 0x73, 0x3a, 0x70], // identifier "ns:p"
    0x01, // exclusion_settings.blocks count
    ...[0x0d, ...Buffer.from('minecraft:air', 'utf8')], // Block Reference "minecraft:air"
    0x00, // exclusion_settings.entities count
    0x00, // exclusion_settings.block_tags count
    0x00, // exclusion_settings.entity_type_families count
    0x00, // liquid_targeting_list count
    0x01, // item_settings count
    ...[0x0d, ...Buffer.from('minecraft:bow', 'utf8')], // key "minecraft:bow"
    ...[0x04, 0x6d, 0x6f, 0x62, 0x73], // value "mobs"
    0x00, // default_item_settings absent
    0x01, // hand_settings present
    ...[0x04, 0x6d, 0x6f, 0x62, 0x73], // hand_settings "mobs"
    0x00 // Operation: Set
]);

/** Add nothing to the existing registry: two empty lists and the AddToExisting operation. */
const EMPTY: CameraAimAssistPresets = {
    categories: [],
    presets: [],
    operation: CameraAimAssistPresetsOperation.ADD_TO_EXISTING
};

/** `EMPTY` on the wire: the header, two zero counts, the operation byte. */
const EMPTY_BYTES = Buffer.from([
    ...[0xc0, 0x02], // packet id header
    0x00, // categories count
    0x00, // presets count
    0x01 // Operation: AddToExisting
]);

describe('CameraAimAssistPresetsPacket', () => {
    it('writes categories before presets, then the operation', () => {
        const buffer = new CameraAimAssistPresetsPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new CameraAimAssistPresetsPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('writes empty lists as three payload bytes', () => {
        const buffer = new CameraAimAssistPresetsPacket(EMPTY).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...EMPTY_BYTES]);
    });

    it('reads empty lists to the end of the buffer', () => {
        const stream = new NetworkBinaryStream(EMPTY_BYTES);
        const data = new CameraAimAssistPresetsPacket().deserialize(stream);

        expect(data).toEqual(EMPTY);
        expect(stream.feof()).toBe(true);
    });

    it('round-trips several categories and presets with every optional set', () => {
        const input: CameraAimAssistPresets = {
            categories: [
                new CameraAimAssistCategoryDefinition('a', new CameraAimAssistCategoryPriorities([], [], [], [], 3, 4)),
                new CameraAimAssistCategoryDefinition('b')
            ],
            presets: [
                new CameraAimAssistPresetDefinition('ns:one', undefined, ['minecraft:bucket'], [], 'a', 'b'),
                new CameraAimAssistPresetDefinition('ns:two')
            ],
            operation: CameraAimAssistPresetsOperation.ADD_TO_EXISTING
        };
        const buffer = new CameraAimAssistPresetsPacket(input).serialize(new NetworkBinaryStream());
        const stream = new NetworkBinaryStream(buffer);

        expect(new CameraAimAssistPresetsPacket().deserialize(stream)).toEqual(input);
        expect(stream.feof()).toBe(true);
    });
});
