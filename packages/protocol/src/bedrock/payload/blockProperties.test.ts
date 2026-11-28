import { parseBlockDefinition } from '@jsprismarine/blocks';
import { describe, expect, it } from 'vitest';

import { FIRST_CUSTOM_BLOCK_ID, buildBlockProperties } from './blockProperties';
import { nbtToPlain, readNetworkNbt } from './nbt';

import type { BlockDefinitionDocument } from '@jsprismarine/blocks';
import type { PlainNbt } from './nbt';

/** Parses one block file the way a pack load would, and fails loudly on a bad fixture. */
const document = (
    block: Record<string, unknown>,
    formatVersion = '1.26.20',
    minEngineVersion?: readonly [number, number, number]
): BlockDefinitionDocument => {
    const { document: parsed, diagnostics } = parseBlockDefinition(
        { format_version: formatVersion, 'minecraft:block': block },
        { pack: 'test', ...(minEngineVersion === undefined ? {} : { minEngineVersion }) }
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

    it('writes the keys the client needs on every block, and components only when it has some', () => {
        const definition = definitionOf(minimal);

        expect(Object.keys(definition)).toEqual(['menu_category', 'molangVersion', 'vanilla_block_data']);
        expect(Object.keys(definitionOf({ ...minimal, components: { 'minecraft:light_emission': 15 } }))).toContain(
            'components'
        );
        // A pack with no min_engine_version gets the latest Molang version.
        expect(definition.molangVersion).toBe('int:13');
        expect(definition.menu_category).toEqual({
            category: 'string:construction',
            group: 'string:',
            is_hidden_in_commands: 'byte:0'
        });
    });

    it("declares the Molang version of the block's pack, as BDS does", () => {
        const plainOf = (minEngineVersion: readonly [number, number, number]) =>
            nbtToPlain(
                readNetworkNbt(
                    buildBlockProperties([document(minimal, '1.26.20', minEngineVersion)]).properties[0]!.definition
                )
            );

        expect(plainOf([1, 21, 0])).toMatchObject({ molangVersion: 'int:12' });
        expect(plainOf([1, 21, 100])).toMatchObject({ molangVersion: 'int:13' });
        expect(plainOf([1, 17, 0])).toMatchObject({ molangVersion: 'int:1' });
    });

    describe('the wire flags that follow format_version, as BDS 1.26.60.6 writes them', () => {
        const cross = {
            description: { identifier: 'test:cross', menu_category: { category: 'construction' } },
            components: {
                'minecraft:geometry': 'minecraft:geometry.cross',
                'minecraft:material_instances': { '*': { texture: 'stone', render_method: 'alpha_test' } }
            }
        };
        const full = {
            ...cross,
            components: { ...cross.components, 'minecraft:geometry': 'minecraft:geometry.full_block' }
        };
        const componentsAt = (block: Record<string, unknown>, formatVersion: string) => {
            const plain = nbtToPlain(
                readNetworkNbt(buildBlockProperties([document(block, formatVersion)]).properties[0]!.definition)
            );
            return (plain as Record<string, Record<string, Record<string, PlainNbt>>>).components!;
        };
        const packedBools = (block: Record<string, unknown>, formatVersion: string) =>
            (
                componentsAt(block, formatVersion)['minecraft:material_instances'] as Record<
                    string,
                    Record<string, Record<string, PlainNbt>>
                >
            ).materials!['*']!.packed_bools;

        it('sets ignoreGeometryForIsSolid below 1.21.90', () => {
            expect(componentsAt(cross, '1.21.80')['minecraft:geometry']).toMatchObject({
                ignoreGeometryForIsSolid: 'byte:1'
            });
            expect(componentsAt(cross, '1.21.90')['minecraft:geometry']).toMatchObject({
                ignoreGeometryForIsSolid: 'byte:0'
            });
        });

        it('sets the third packed_bools bit from 1.21.110', () => {
            expect(packedBools(cross, '1.21.100')).toBe('byte:1');
            expect(packedBools(cross, '1.21.110')).toBe('byte:5');
        });

        it('sends the full block as full_block_v1 below 1.26.0', () => {
            expect(componentsAt(full, '1.21.130')['minecraft:geometry']).toMatchObject({
                identifier: 'string:minecraft:geometry.full_block_v1',
                isV1Fullblock: 'byte:1'
            });
            expect(componentsAt(full, '1.26.0')['minecraft:geometry']).toMatchObject({
                identifier: 'string:minecraft:geometry.full_block',
                isV1Fullblock: 'byte:0'
            });
            expect(componentsAt(cross, '1.21.80')['minecraft:geometry']).toMatchObject({
                identifier: 'string:minecraft:geometry.cross',
                isV1Fullblock: 'byte:0'
            });
        });
    });

    it('writes bone visibility as strings, a boolean as the float the engine reads', () => {
        const definition = definitionOf({
            ...minimal,
            components: {
                'minecraft:geometry': {
                    identifier: 'geometry.probe',
                    // The Sift's pitcher plant writes "true" and "false" as strings.
                    bone_visibility: { a: false, b: true, c: "q.block_state('x') == 1", d: 'true', e: 'false' }
                },
                'minecraft:material_instances': { '*': { texture: 'stone' } }
            }
        });

        expect(
            (definition.components as Record<string, Record<string, PlainNbt>>)['minecraft:geometry']!.bone_visibility
        ).toEqual({
            a: 'string:0.000000',
            b: 'string:1.000000',
            c: "string:q.block_state('x') == 1",
            d: 'string:1.000000',
            e: 'string:0.000000'
        });
    });

    it('keeps the full block box on a disabled selection box, as BDS does', () => {
        const definition = definitionOf({ ...minimal, components: { 'minecraft:selection_box': false } });

        expect((definition.components as Record<string, PlainNbt>)['minecraft:selection_box']).toEqual({
            enabled: 'byte:0',
            origin: ['float:-8', 'float:0', 'float:-8'],
            size: ['float:16', 'float:16', 'float:16']
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

    it("ignores a pack block's internal_vanilla_data, as BDS does", () => {
        const declaring = {
            description: {
                identifier: 'test:declared',
                internal_vanilla_data: { block_id: 40_000, material: 'solid' },
                menu_category: { category: 'construction' }
            },
            components: {}
        };
        const { properties, blockIds } = buildBlockProperties([document(minimal), document(declaring)], {
            fromPacks: true
        });

        expect([...blockIds]).toEqual([
            ['test:thing', FIRST_CUSTOM_BLOCK_ID],
            ['test:declared', FIRST_CUSTOM_BLOCK_ID + 1]
        ]);
        expect(nbtToPlain(readNetworkNbt(properties[1]!.definition))).toMatchObject({
            vanilla_block_data: { block_id: `int:${FIRST_CUSTOM_BLOCK_ID + 1}`, material: 'string:dirt' }
        });
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

        it('writes an item visual as a geometry and material instances description, as BDS does', () => {
            // The Sift's fence, whose inventory model shows only its icon bone.
            const definition = definitionOf({
                ...minimal,
                components: {
                    'minecraft:item_visual': {
                        geometry: { identifier: 'geometry.fence', bone_visibility: { post: 'false', icon: 'true' } },
                        material_instances: { '*': { texture: 'planks', render_method: 'alpha_test' } }
                    }
                }
            });

            expect(definition.components).toEqual({
                'minecraft:item_visual': {
                    geometryDescription: {
                        bone_visibility: { icon: 'string:1.000000', post: 'string:0.000000' },
                        culling: 'string:',
                        culling_layer: 'string:minecraft:culling_layer.undefined',
                        culling_shape: 'string:',
                        identifier: 'string:geometry.fence',
                        ignoreGeometryForIsSolid: 'byte:0',
                        isV1Fullblock: 'byte:0',
                        needsLegacyTopRotation: 'byte:0',
                        useBlockTypeLightAbsorption: 'byte:0',
                        uv_lock: 'byte:0'
                    },
                    materialInstancesDescription: {
                        mappings: {},
                        materials: {
                            '*': {
                                ambient_occlusion: 'float:1',
                                packed_bools: 'byte:5',
                                render_method: 'string:alpha_test',
                                texture: 'string:planks',
                                tint_method: 'string:none'
                            }
                        }
                    }
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
            // Nothing is left for the client, so there is no compound, as BDS sends a tags-only block.
            expect(definition.components).toBeUndefined();
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
            // Every state of the trait, as BDS 1.26.60.6 sent The Sift's portal's.
            expect(definition.traits).toEqual([
                {
                    blocks_to_corner_with: [],
                    enabled_states: {
                        cardinal_direction: 'byte:1',
                        corner_and_cardinal_direction: 'byte:0',
                        facing_direction: 'byte:0',
                        sixteen_way_rotation: 'byte:0'
                    },
                    name: 'string:minecraft:placement_direction',
                    y_rotation_offset: 'float:180'
                }
            ]);
        });

        it("writes a stair's traits in the shapes BDS sent for The Sift's stairs", () => {
            const definition = definitionOf({
                description: {
                    identifier: 'test:stair',
                    menu_category: { category: 'construction' },
                    traits: {
                        'minecraft:placement_position': { enabled_states: ['minecraft:vertical_half'] },
                        'minecraft:connection': { enabled_states: ['minecraft:cardinal_connections'] }
                    }
                },
                components: {}
            });

            expect(definition.traits).toEqual([
                {
                    enabled_states: { block_face: 'byte:0', vertical_half: 'byte:1' },
                    name: 'string:minecraft:placement_position'
                },
                {
                    enabled_states: 'int:1',
                    name: 'string:minecraft:connection',
                    type: 'int:0',
                    update_flags: 'int:3'
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
