import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import CameraAimAssistPresetDefinition from './CameraAimAssistPresetDefinition';

/** Every list populated and both optional category references present. */
const FULL = new CameraAimAssistPresetDefinition(
    'ns:p',
    {
        blocks: ['minecraft:air'],
        entities: ['minecraft:bat'],
        blockTags: ['dirt'],
        entityTypeFamilies: ['undead']
    },
    ['minecraft:bucket'],
    [{ item: 'minecraft:bow', category: 'mobs' }],
    'blocks',
    'hand'
);

/** `FULL` on the wire, written by hand in the order the docs list the fields. */
const FULL_BYTES = Buffer.from([
    ...[0x04, 0x6e, 0x73, 0x3a, 0x70], // identifier "ns:p"
    0x01, // exclusion_settings.blocks count, a varuint32
    ...[0x0d, ...Buffer.from('minecraft:air', 'utf8')], // Block Reference "minecraft:air"
    0x01, // exclusion_settings.entities count
    ...[0x0d, ...Buffer.from('minecraft:bat', 'utf8')], // Entity Reference "minecraft:bat"
    0x01, // exclusion_settings.block_tags count
    ...[0x04, 0x64, 0x69, 0x72, 0x74], // block tag "dirt"
    0x01, // exclusion_settings.entity_type_families count
    ...[0x06, ...Buffer.from('undead', 'utf8')], // entity type family "undead"
    0x01, // liquid_targeting_list count
    ...[0x10, ...Buffer.from('minecraft:bucket', 'utf8')], // Item Reference "minecraft:bucket", 16 bytes
    0x01, // item_settings count
    ...[0x0d, ...Buffer.from('minecraft:bow', 'utf8')], // key "minecraft:bow"
    ...[0x04, 0x6d, 0x6f, 0x62, 0x73], // value "mobs"
    0x01, // default_item_settings present
    ...[0x06, ...Buffer.from('blocks', 'utf8')], // default_item_settings "blocks"
    0x01, // hand_settings present
    ...[0x04, 0x68, 0x61, 0x6e, 0x64] // hand_settings "hand"
]);

/** Only the identifier: every list empty and both optional references absent. */
const BARE = new CameraAimAssistPresetDefinition('ns:p');

/** `BARE` on the wire. */
const BARE_BYTES = Buffer.from([
    ...[0x04, 0x6e, 0x73, 0x3a, 0x70], // identifier "ns:p"
    0x00, // exclusion_settings.blocks count
    0x00, // exclusion_settings.entities count
    0x00, // exclusion_settings.block_tags count
    0x00, // exclusion_settings.entity_type_families count
    0x00, // liquid_targeting_list count
    0x00, // item_settings count
    0x00, // default_item_settings absent
    0x00 // hand_settings absent
]);

describe('CameraAimAssistPresetDefinition', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const stream = new NetworkBinaryStream();
        FULL.serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...FULL_BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(FULL_BYTES);
        const preset = CameraAimAssistPresetDefinition.deserialize(stream);

        expect(preset).toEqual(FULL);
        expect(stream.feof()).toBe(true);
    });

    it('writes a preset with only an identifier as the identifier and eight zero bytes', () => {
        const stream = new NetworkBinaryStream();
        BARE.serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...BARE_BYTES]);
    });

    it('reads absent category references as undefined', () => {
        const stream = new NetworkBinaryStream(BARE_BYTES);
        const preset = CameraAimAssistPresetDefinition.deserialize(stream);

        expect(preset).toEqual(BARE);
        expect(preset.defaultItemSettings).toBeUndefined();
        expect(preset.handSettings).toBeUndefined();
        expect(stream.feof()).toBe(true);
    });
});
