import { parseBlockDefinition } from '@jsprismarine/blocks';
import { describe, expect, it } from 'vitest';

import { FIRST_CUSTOM_BLOCK_ID, MOLANG_VERSION, buildBlockProperties } from './blockProperties';
import { nbtToPlain, readNetworkNbt } from './nbt';

import type { BlockDefinitionDocument } from '@jsprismarine/blocks';
import type { PlainNbt } from './nbt';

/** Parses one block file the way a pack load would, and fails loudly on a bad fixture. */
const document = (block: Record<string, unknown>): BlockDefinitionDocument => {
    const { document: parsed, diagnostics } = parseBlockDefinition(
        { format_version: '1.26.20', 'minecraft:block': block },
        { pack: 'test' }
    );

    expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    if (parsed === undefined) throw new Error('the fixture did not parse');
    return parsed;
};

const definitionOf = (block: Record<string, unknown>, options = {}): Record<string, PlainNbt> => {
    const { properties } = buildBlockProperties([document(block)], options);
    const plain = nbtToPlain(readNetworkNbt(properties[0]!.definition));
    if (typeof plain !== 'object' || plain === null || Array.isArray(plain)) throw new Error('not a compound');
    return plain;
};

const minimal = {
    description: { identifier: 'test:thing', menu_category: { category: 'construction' } },
    components: {}
};

describe('buildBlockProperties', () => {
    it('names the entry after the block and carries the definition as network NBT', () => {
        const { properties } = buildBlockProperties([document(minimal)]);

        expect(properties).toHaveLength(1);
        expect(properties[0]!.name).toBe('test:thing');
        // A compound tag with an empty name, which is what the packet expects.
        expect(properties[0]!.definition.subarray(0, 2)).toEqual(Buffer.from([0x0a, 0x00]));
    });

    it('writes the five keys the client needs on every block', () => {
        const definition = definitionOf(minimal);

        expect(Object.keys(definition)).toEqual(['components', 'menu_category', 'molangVersion', 'vanilla_block_data']);
        expect(definition.molangVersion).toBe(`int:${MOLANG_VERSION}`);
        expect(definition.menu_category).toEqual({
            category: 'string:construction',
            group: 'string:',
            is_hidden_in_commands: 'byte:0'
        });
    });

    it('allocates a block id above the vanilla range when the block declares none', () => {
        const { properties } = buildBlockProperties([document(minimal), document(minimal)]);
        const ids = properties.map((property) => {
            const plain = nbtToPlain(readNetworkNbt(property.definition));
            return (plain as Record<string, Record<string, PlainNbt>>).vanilla_block_data!.block_id;
        });

        expect(ids).toEqual([`int:${FIRST_CUSTOM_BLOCK_ID}`, `int:${FIRST_CUSTOM_BLOCK_ID + 1}`]);
    });

    it('keeps the block id and the archetype a vanilla file declares', () => {
        const definition = definitionOf({
            description: {
                identifier: 'minecraft:black_wool_slab',
                internal_vanilla_data: {
                    block_id: 1423,
                    material: 'solid',
                    translucency: 0.5,
                    can_dampen_vibrations: true,
                    block_archetype: { slab_block: { double_slab_block: 'minecraft:x', is_double: false } }
                },
                menu_category: { category: 'construction', group: 'minecraft:itemGroup.name.slab' }
            },
            components: {}
        });

        expect(definition.vanilla_block_data).toEqual({
            block_archetype: {
                double_slab_block: 'string:minecraft:x',
                is_double: 'byte:0',
                type: 'string:slab_block'
            },
            block_id: 'int:1423',
            can_dampen_vibrations: 'byte:1',
            material: 'string:solid',
            translucency: 'float:0.5'
        });
    });

    describe('component names', () => {
        it('turns seconds_to_destroy into a float called value', () => {
            const definition = definitionOf({
                ...minimal,
                components: { 'minecraft:destructible_by_mining': { seconds_to_destroy: 0.5 } }
            });

            expect(definition.components).toEqual({ 'minecraft:destructible_by_mining': { value: 'float:0.5' } });
        });

        it('writes light emission as an emission byte and light dampening as a lightLevel byte', () => {
            const definition = definitionOf({
                ...minimal,
                components: { 'minecraft:light_emission': 9, 'minecraft:light_dampening': 3 }
            });

            expect(definition.components).toEqual({
                'minecraft:light_emission': { emission: 'byte:9' },
                'minecraft:light_dampening': { lightLevel: 'byte:3' }
            });
        });

        it('writes friction as a float called value', () => {
            const definition = definitionOf({ ...minimal, components: { 'minecraft:friction': 0.5 } });

            expect(definition.components).toEqual({ 'minecraft:friction': { value: 'float:0.5' } });
        });

        it('splits material instances into mappings and materials with a packed_bools bitfield', () => {
            const definition = definitionOf({
                ...minimal,
                components: {
                    'minecraft:geometry': { identifier: 'minecraft:geometry.full_block' },
                    'minecraft:material_instances': {
                        '*': { texture: 'thing', render_method: 'alpha_test', ambient_occlusion: 0 },
                        up: '*'
                    }
                }
            });
            const instances = (definition.components as Record<string, Record<string, PlainNbt>>)[
                'minecraft:material_instances'
            ]!;

            expect(instances.mappings).toEqual({ up: 'string:*' });
            expect(instances.materials).toEqual({
                '*': {
                    ambient_occlusion: 'float:0',
                    // Face dimming on, isotropic off, texture variation on.
                    packed_bools: 'byte:5',
                    render_method: 'string:alpha_test',
                    texture: 'string:thing',
                    tint_method: 'string:none'
                }
            });
        });

        it('clears the isotropic bit of packed_bools when the instance turns it on', () => {
            const definition = definitionOf({
                ...minimal,
                components: {
                    'minecraft:material_instances': { '*': { texture: 't', isotropic: true, face_dimming: false } }
                }
            });
            const instances = (definition.components as Record<string, Record<string, Record<string, PlainNbt>>>)[
                'minecraft:material_instances'
            ]!;

            expect(instances.materials!['*']).toMatchObject({ packed_bools: 'byte:6' });
        });

        it('turns a collision box origin and size into two corners in sixteenths', () => {
            const definition = definitionOf({
                ...minimal,
                components: { 'minecraft:collision_box': { origin: [-5, 4, 1], size: [10, 7, 7] } }
            });

            expect(definition.components).toEqual({
                'minecraft:collision_box': {
                    enabled: 'byte:1',
                    boxes: [
                        {
                            maxX: 'float:13',
                            maxY: 'float:11',
                            maxZ: 'float:16',
                            minX: 'float:3',
                            minY: 'float:4',
                            minZ: 'float:9'
                        }
                    ]
                }
            });
        });

        it('keeps a selection box as an origin and a size', () => {
            const definition = definitionOf({
                ...minimal,
                components: { 'minecraft:selection_box': { origin: [-5, 8, 1], size: [10, 3, 7] } }
            });

            expect(definition.components).toEqual({
                'minecraft:selection_box': {
                    enabled: 'byte:1',
                    origin: ['float:-5', 'float:8', 'float:1'],
                    size: ['float:10', 'float:3', 'float:7']
                }
            });
        });

        it('turns a rotation in degrees into quarter turns', () => {
            const definition = definitionOf({
                ...minimal,
                components: {},
                permutations: [
                    {
                        condition: "query.block_state('x') == 1",
                        components: { 'minecraft:transformation': { rotation: [0, 270, 0] } }
                    }
                ]
            });
            const permutations = definition.permutations as Record<string, PlainNbt>[];

            expect(permutations).toHaveLength(1);
            expect(permutations[0]!.condition).toBe("string:query.block_state('x') == 1");
            expect(
                (permutations[0]!.components as Record<string, Record<string, PlainNbt>>)['minecraft:transformation']
            ).toMatchObject({ RX: 'int:0', RY: 'int:3', RZ: 'int:0', SX: 'float:1' });
        });

        it('renames the liquid detection rules and fills in the two fields the JSON never writes', () => {
            const definition = definitionOf({
                ...minimal,
                components: {
                    'minecraft:liquid_detection': {
                        detection_rules: [
                            { liquid_type: 'water', can_contain_liquid: true, on_liquid_touches: 'blocking' }
                        ]
                    }
                }
            });

            expect(definition.components).toEqual({
                'minecraft:liquid_detection': {
                    detectionRules: [
                        {
                            canContainLiquid: 'byte:1',
                            liquidType: 'string:water',
                            onLiquidTouches: 'string:blocking',
                            stopsLiquidFromDirection: 'byte:0',
                            use_liquid_clipping: 'byte:0'
                        }
                    ]
                }
            });
        });
    });

    describe('tags', () => {
        it('lifts minecraft:tags out of the components into a top level blockTags list', () => {
            const definition = definitionOf({
                ...minimal,
                components: { 'minecraft:tags': ['minecraft:is_shears_item_destructible'] }
            });

            expect(definition.blockTags).toEqual(['string:minecraft:is_shears_item_destructible']);
            expect(definition.components).toEqual({});
        });

        it('also writes one empty tag:<name> compound per tag when asked', () => {
            const definition = definitionOf(
                { ...minimal, components: { 'minecraft:tags': ['wood', 'plank'] } },
                { tagComponents: true }
            );

            expect(definition.components).toEqual({ 'tag:plank': {}, 'tag:wood': {} });
        });
    });

    describe('states, traits and permutations', () => {
        it('writes one properties entry per declared state, typed by its domain', () => {
            const definition = definitionOf({
                description: {
                    identifier: 'test:thing',
                    menu_category: { category: 'nature' },
                    states: { 'test:age': [0, 1, 2], 'test:lit': [false, true], 'test:kind': ['a', 'b'] }
                },
                components: {}
            });

            expect(definition.properties).toEqual([
                { enum: ['int:0', 'int:1', 'int:2'], name: 'string:test:age' },
                { enum: ['byte:0', 'byte:1'], name: 'string:test:lit' },
                { enum: ['string:a', 'string:b'], name: 'string:test:kind' }
            ]);
        });

        it('leaves out a state a trait supplied, which traits already describes', () => {
            const definition = definitionOf({
                description: {
                    identifier: 'test:thing',
                    menu_category: { category: 'nature' },
                    traits: {
                        'minecraft:placement_direction': {
                            enabled_states: ['minecraft:cardinal_direction'],
                            y_rotation_offset: 180
                        }
                    }
                },
                components: {}
            });

            expect(definition.properties).toBeUndefined();
            expect(definition.traits).toEqual([
                {
                    enabled_states: { cardinal_direction: 'byte:1' },
                    name: 'string:minecraft:placement_direction',
                    y_rotation_offset: 'int:180'
                }
            ]);
        });

        it('drops a permutation that only changed something the client never sees', () => {
            const definition = definitionOf({
                ...minimal,
                permutations: [
                    {
                        condition: "query.block_state('x') == 1",
                        components: { 'minecraft:loot': 'loot_tables/blocks/x.json' }
                    }
                ]
            });

            expect(definition.permutations).toBeUndefined();
        });
    });

    describe('what it refuses to guess', () => {
        it('reports a component it has no translation for instead of dropping it', () => {
            const { untranslated } = buildBlockProperties([
                document({ ...minimal, components: { 'test:homegrown': { anything: 1 } } })
            ]);

            expect(untranslated).toEqual([{ block: 'test:thing', component: 'test:homegrown', inPermutation: false }]);
        });

        it('says nothing about a component it knowingly keeps on the server', () => {
            const { untranslated } = buildBlockProperties([
                document({ ...minimal, components: { 'minecraft:loot': 'loot_tables/blocks/x.json' } })
            ]);

            expect(untranslated).toEqual([]);
        });
    });
});
