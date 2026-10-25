/**
 * `StartGamePacket.Block Properties`: the block definitions a client cannot
 * draw without.
 *
 * Since 1.26.50 this is not only a plugin's blocks. Mojang moved 98 of its
 * own into the vanilla behavior pack, and a client at that version or later
 * expects every one of them here. The reference this module is written
 * against is the capture of those 98 that `@jsprismarine/bedrock-data`
 * publishes as `block_definitions`, taken from a Bedrock Dedicated Server
 * 1.26.51.1.
 *
 * The component names in the NBT are not the component names in the JSON,
 * and the differences are not a pattern: `seconds_to_destroy` becomes
 * `value`, `detection_rules` becomes `detectionRules` while
 * `use_liquid_clipping` keeps its underscores, `minecraft:tags` leaves
 * `components` entirely and becomes a top-level `blockTags` list, and half
 * the components in a vanilla block file never reach the client at all. The
 * table in the README lists every one; {@link BLOCK_NBT_TRANSLATIONS} is the
 * code behind it.
 */
import type { BlockDefinitionDocument, BlockStateDefinition, BlockTrait, BlockType } from '@jsprismarine/blocks';
import type { ComponentEntry } from '@jsprismarine/content';
import type { NBTTagCompound } from '@jsprismarine/nbt';
// A deep import because `@jsprismarine/protocol` re-exports the packet class
// and its `StartGame` payload but not this member type.
import type { BlockProperty } from '@jsprismarine/protocol/packet/StartGamePacket';

import type { NbtValue } from './nbt';
import { nbtByte, nbtCompound, nbtFloat, nbtInt, nbtList, nbtString, writeNetworkNbt } from './nbt';

/**
 * The Molang dialect the permutation conditions are written in.
 *
 * 13 is `Latest` in the docs' `MolangVersion` enum and is what the captured
 * server sends on every one of its 98 blocks. Geyser and Allay send 1 and
 * PowerNukkitX sends 9; all three report that their blocks work, which is
 * why the research note lists the field's real effect as an open question.
 * The capture is the only primary source, so the capture wins.
 */
export const MOLANG_VERSION = 13;

/**
 * The first id handed to a block whose definition declares none.
 *
 * Mojang's own data-driven blocks carry `internal_vanilla_data.block_id`, so
 * only a pack's blocks need one allocated. Geyser and PowerNukkitX both
 * allocate from 10000 and the highest vanilla id in the capture is 1489, so
 * the two ranges cannot collide.
 */
export const FIRST_CUSTOM_BLOCK_ID = 10000;

/** The creative category a block with no `menu_category` is filed under. */
const DEFAULT_MENU_CATEGORY = 'none';

/**
 * Components a vanilla block file declares that never reach the client, with
 * the reason each stays on the server.
 *
 * Every name here was checked against the capture: a block whose JSON
 * declares one has no matching key in the NBT the server sent.
 */
export const BLOCK_SERVER_ONLY_COMPONENTS: Readonly<Record<string, string>> = {
    'minecraft:block_entity': 'The client has no block entity model; contents travel as a block actor.',
    'minecraft:chest_obstruction': 'The server decides whether a chest may open.',
    'minecraft:custom_components': 'Script hooks, which only the engine that runs the script can honor.',
    'minecraft:destructible_by_explosion': 'Blast resistance is resolved server side; the client never asks.',
    'minecraft:entity_fall_on': 'A server event.',
    'minecraft:explosion_resistance': 'The pre-1.19.40 name for destructible_by_explosion.',
    'minecraft:flammable': 'Fire spread is a server simulation.',
    'minecraft:instrument_sound': 'The note block instrument is chosen server side.',
    'minecraft:leashable': 'A server rule.',
    'minecraft:loot': 'Drops are rolled on the server.',
    'minecraft:map_color': 'Map colors come from the client’s own block table.',
    'minecraft:movable': 'Piston movement is resolved server side.',
    'minecraft:queued_ticking': 'A server scheduler.',
    'minecraft:random_ticking': 'A server scheduler.',
    'minecraft:redstone_consumer': 'Redstone is simulated on the server.',
    'minecraft:redstone_producer': 'Redstone is simulated on the server.',
    'minecraft:sound': 'The block sound group comes from the resource pack’s blocks.json.',
    'minecraft:tags': 'Promoted out of components into the definition’s top-level blockTags list.',
    'minecraft:tick': 'A server scheduler.'
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** A JSON scalar as the NBT tag the capture shows for it: a whole number is an int, the rest are floats. */
const scalar = (value: unknown): NbtValue | undefined => {
    if (typeof value === 'boolean') return nbtByte(value);
    if (typeof value === 'string') return nbtString(value);
    if (typeof value === 'number') return Number.isInteger(value) ? nbtInt(value) : nbtFloat(value);
    return undefined;
};

/** Three numbers out of a JSON `[x, y, z]`, or the fallback when it is not one. */
const triple = (value: unknown, fallback: readonly [number, number, number]): readonly [number, number, number] => {
    if (!Array.isArray(value) || value.length !== 3) return fallback;
    const [x, y, z] = value;
    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return fallback;
    return [x, y, z];
};

/** A `[x, y, z]` JSON vector as the list of three floats the NBT carries. */
const vector = (value: unknown, fallback: readonly [number, number, number]): Set<NbtValue> =>
    nbtList(triple(value, fallback).map(nbtFloat));

const numberAt = (source: Record<string, unknown>, key: string, fallback: number): number => {
    const value = source[key];
    return typeof value === 'number' ? value : fallback;
};

const stringAt = (source: Record<string, unknown>, key: string, fallback: string): string => {
    const value = source[key];
    return typeof value === 'string' ? value : fallback;
};

const booleanAt = (source: Record<string, unknown>, key: string, fallback: boolean): boolean => {
    const value = source[key];
    return typeof value === 'boolean' ? value : fallback;
};

/**
 * One bounding box as the client reads it: the two corners in sixteenths,
 * with the horizontal axes shifted so that an origin of -8 is 0.
 *
 * Verified against both captured boxes of `minecraft:shelf_mushroom`:
 * `origin [-5, 4, 1]` with `size [10, 7, 7]` is `min (3, 4, 9)` to
 * `max (13, 11, 16)`.
 */
const boundingBox = (box: Record<string, unknown>): NBTTagCompound => {
    const [originX, originY, originZ] = triple(box.origin, [-8, 0, -8]);
    const [sizeX, sizeY, sizeZ] = triple(box.size, [16, 16, 16]);
    const [minX, minY, minZ] = [originX + 8, originY, originZ + 8];

    return nbtCompound({
        minX: nbtFloat(minX),
        minY: nbtFloat(minY),
        minZ: nbtFloat(minZ),
        maxX: nbtFloat(minX + sizeX),
        maxY: nbtFloat(minY + sizeY),
        maxZ: nbtFloat(minZ + sizeZ)
    });
};

/** `minecraft:collision_box`, which is a boolean, one box or a list of boxes. */
const collisionBox = (value: unknown): NBTTagCompound => {
    if (value === false) return nbtCompound({ enabled: nbtByte(false), boxes: nbtList([]) });
    const boxes = Array.isArray(value) ? value : isRecord(value) ? [value] : [];

    return nbtCompound({
        enabled: nbtByte(true),
        boxes: nbtList(boxes.filter(isRecord).map(boundingBox))
    });
};

/** `minecraft:selection_box`, which keeps its origin and size rather than becoming two corners. */
const selectionBox = (value: unknown): NBTTagCompound => {
    if (value === false) return nbtCompound({ enabled: nbtByte(false) });
    const box = isRecord(value) ? value : {};

    return nbtCompound({
        enabled: nbtByte(true),
        origin: vector(box.origin, [-8, 0, -8]),
        size: vector(box.size, [16, 16, 16])
    });
};

/**
 * The three bits of a material instance's `packed_bools`.
 *
 * Bit 0 is face dimming and bit 1 is the isotropic flag, which Allay calls
 * random UV rotation. Bit 2 is set in both of the capture's two material
 * instances and nothing in either block's JSON turns it off; Allay names it
 * texture variation and Geyser writes only bit 0 with a TODO beside it. It
 * is emitted as set because that is what the capture shows, and the option
 * is here so a caller who learns otherwise does not have to fork the module.
 */
export interface MaterialInstanceBits {
    faceDimming: boolean;
    isotropic: boolean;
    textureVariation: boolean;
}

const packedBools = ({ faceDimming, isotropic, textureVariation }: MaterialInstanceBits): number =>
    (faceDimming ? 1 : 0) | (isotropic ? 2 : 0) | (textureVariation ? 4 : 0);

/**
 * `minecraft:material_instances`, which splits into the face-to-instance
 * `mappings` and the instance definitions in `materials`.
 *
 * A face key whose value is a string names another instance, which is what
 * `mappings` holds; everything else is an instance of its own.
 */
const materialInstances = (value: unknown): NBTTagCompound => {
    const source = isRecord(value) ? value : {};
    const mappings: Record<string, NbtValue> = {};
    const materials: Record<string, NbtValue> = {};

    for (const [face, instance] of Object.entries(source)) {
        if (typeof instance === 'string') {
            mappings[face] = nbtString(instance);
            continue;
        }
        if (!isRecord(instance)) continue;

        materials[face] = nbtCompound({
            // A byte here was accepted until 1.26.20 and is now rejected; the
            // capture writes a float and the schema's default is 1.
            ambient_occlusion: nbtFloat(numberAt(instance, 'ambient_occlusion', 1)),
            packed_bools: nbtByte(
                packedBools({
                    faceDimming: booleanAt(instance, 'face_dimming', true),
                    isotropic: booleanAt(instance, 'isotropic', false),
                    textureVariation: true
                })
            ),
            render_method: nbtString(stringAt(instance, 'render_method', 'opaque')),
            texture: nbtString(stringAt(instance, 'texture', '')),
            tint_method: nbtString(stringAt(instance, 'tint_method', 'none'))
        });
    }

    return nbtCompound({ mappings: nbtCompound(mappings), materials: nbtCompound(materials) });
};

/** `minecraft:geometry`, which is either the identifier on its own or the detailed form. */
const geometry = (value: unknown): NBTTagCompound => {
    const source = typeof value === 'string' ? { identifier: value } : isRecord(value) ? value : {};
    const boneVisibility: Record<string, NbtValue> = {};
    const declared = source.bone_visibility;
    if (isRecord(declared)) {
        for (const [bone, expression] of Object.entries(declared)) {
            boneVisibility[bone] = nbtCompound({
                expression: nbtString(typeof expression === 'boolean' ? String(expression) : String(expression)),
                version: nbtInt(MOLANG_VERSION)
            });
        }
    }

    return nbtCompound({
        bone_visibility: nbtCompound(boneVisibility),
        culling: nbtString(stringAt(source, 'culling', '')),
        culling_layer: nbtString(stringAt(source, 'culling_layer', 'minecraft:culling_layer.undefined')),
        culling_shape: nbtString(stringAt(source, 'culling_shape', '')),
        identifier: nbtString(stringAt(source, 'identifier', 'minecraft:geometry.full_block')),
        // Four engine-internal flags with no JSON spelling. Every one of them
        // is 0 on both captured geometries.
        ignoreGeometryForIsSolid: nbtByte(false),
        isV1Fullblock: nbtByte(false),
        needsLegacyTopRotation: nbtByte(false),
        useBlockTypeLightAbsorption: nbtByte(false),
        uv_lock: nbtByte(booleanAt(source, 'uv_lock', false))
    });
};

/** The six faces, in the bit order the client reads an `allowed_faces` mask in. */
const FACES = ['down', 'up', 'north', 'south', 'west', 'east'] as const;

const faceMask = (faces: unknown): number => {
    if (!Array.isArray(faces)) return 0b111111;
    if (faces.includes('all')) return 0b111111;
    if (faces.includes('none')) return 0;

    let mask = 0;
    for (const [bit, face] of FACES.entries()) if (faces.includes(face)) mask |= 1 << bit;
    if (faces.includes('side')) mask |= 0b111100;
    return mask;
};

/** `minecraft:placement_filter`, whose allowed faces pack into one byte. */
const placementFilter = (value: unknown): NBTTagCompound => {
    const source = isRecord(value) ? value : {};
    const conditions = Array.isArray(source.conditions) ? source.conditions : [];

    return nbtCompound({
        conditions: nbtList(
            conditions.filter(isRecord).map((condition) =>
                nbtCompound({
                    allowed_faces: nbtByte(faceMask(condition.allowed_faces)),
                    block_filter: nbtList(
                        (Array.isArray(condition.block_filter) ? condition.block_filter : []).map((filter) =>
                            typeof filter === 'string'
                                ? nbtCompound({ name: nbtString(filter) })
                                : nbtCompound({
                                      name: nbtString(isRecord(filter) ? stringAt(filter, 'name', '') : '')
                                  })
                        )
                    )
                })
            )
        )
    });
};

/** `minecraft:liquid_detection`: the rules are renamed, and two fields the JSON never writes are filled in. */
const liquidDetection = (value: unknown): NBTTagCompound => {
    const source = isRecord(value) ? value : {};
    const rules = Array.isArray(source.detection_rules) ? source.detection_rules : [];

    return nbtCompound({
        detectionRules: nbtList(
            rules.filter(isRecord).map((rule) =>
                nbtCompound({
                    canContainLiquid: nbtByte(booleanAt(rule, 'can_contain_liquid', false)),
                    liquidType: nbtString(stringAt(rule, 'liquid_type', 'water')),
                    onLiquidTouches: nbtString(stringAt(rule, 'on_liquid_touches', 'blocking')),
                    stopsLiquidFromDirection: nbtByte(faceMask(rule.stops_liquid_flowing_from_direction ?? ['none'])),
                    use_liquid_clipping: nbtByte(booleanAt(rule, 'use_liquid_clipping', false))
                })
            )
        )
    });
};

/** `minecraft:transformation`: degrees become quarter turns, and every pivot and scale is written out. */
const transformation = (value: unknown): NBTTagCompound => {
    const source = isRecord(value) ? value : {};
    const [rx, ry, rz] = triple(source.rotation, [0, 0, 0]);
    const [rpx, rpy, rpz] = triple(source.rotation_pivot, [0, 0, 0]);
    const [sx, sy, sz] = triple(source.scale, [1, 1, 1]);
    const [spx, spy, spz] = triple(source.scale_pivot, [0, 0, 0]);
    const [tx, ty, tz] = triple(source.translation, [0, 0, 0]);
    const turns = (degrees: number): number => ((Math.round(degrees / 90) % 4) + 4) % 4;

    return nbtCompound({
        RX: nbtInt(turns(rx)),
        RY: nbtInt(turns(ry)),
        RZ: nbtInt(turns(rz)),
        RXP: nbtFloat(rpx),
        RYP: nbtFloat(rpy),
        RZP: nbtFloat(rpz),
        SX: nbtFloat(sx),
        SY: nbtFloat(sy),
        SZ: nbtFloat(sz),
        SXP: nbtFloat(spx),
        SYP: nbtFloat(spy),
        SZP: nbtFloat(spz),
        TX: nbtFloat(tx),
        TY: nbtFloat(ty),
        TZ: nbtFloat(tz),
        hasJsonVersionBeforeValidation: nbtByte(false)
    });
};

/** Turns one component's JSON value into the compound the client reads, or undefined to leave it out. */
export type BlockComponentTranslation = (value: unknown) => NBTTagCompound | undefined;

/**
 * Every block component the client is told about, keyed by its JSON name.
 *
 * The eleven marked `capture` below appear in the 98 captured definitions and
 * their shapes are read off it. The rest appear in no vanilla data-driven
 * block, so their shapes come from the research note's reading of Allay's and
 * Geyser's encoders; the README says which is which.
 */
export const BLOCK_NBT_TRANSLATIONS: Readonly<Record<string, BlockComponentTranslation>> = {
    // Verified against the capture.
    'minecraft:collision_box': collisionBox,
    'minecraft:connection_rule': (value) => {
        const source = isRecord(value) ? value : {};
        const directions = Array.isArray(source.enabled_directions)
            ? source.enabled_directions
            : ['south', 'north', 'east', 'west'];

        return nbtCompound({
            accepts_connections_from: nbtString(stringAt(source, 'accepts_connections_from', 'all')),
            enabled_directions: nbtList(directions.map((direction) => nbtString(String(direction))))
        });
    },
    'minecraft:destructible_by_mining': (value) => {
        if (value === false) return nbtCompound({ value: nbtFloat(-1) });
        const seconds = isRecord(value) ? numberAt(value, 'seconds_to_destroy', 0) : 0;
        return nbtCompound({ value: nbtFloat(seconds) });
    },
    'minecraft:destruction_particles': (value) => {
        const source = isRecord(value) ? value : {};
        return nbtCompound({
            particle_count: nbtInt(numberAt(source, 'particle_count', 0)),
            texture: nbtString(stringAt(source, 'texture', '')),
            tint_method: nbtString(stringAt(source, 'tint_method', 'none'))
        });
    },
    'minecraft:geometry': geometry,
    'minecraft:liquid_detection': liquidDetection,
    'minecraft:material_instances': materialInstances,
    'minecraft:precipitation_interactions': (value) =>
        nbtCompound({
            precipitation_behavior: nbtString(stringAt(isRecord(value) ? value : {}, 'precipitation_behavior', 'none'))
        }),
    'minecraft:redstone_conductivity': (value) => {
        const source = isRecord(value) ? value : {};
        return nbtCompound({
            allowsWireToStepDown: nbtByte(booleanAt(source, 'allows_wire_to_step_down', true)),
            redstoneConductor: nbtByte(booleanAt(source, 'redstone_conductor', false))
        });
    },
    'minecraft:replaceable': () => nbtCompound({}),
    'minecraft:selection_box': selectionBox,
    'minecraft:support': (value) =>
        nbtCompound({ shape: nbtString(stringAt(isRecord(value) ? value : {}, 'shape', 'block')) }),
    'minecraft:transformation': transformation,

    // No vanilla data-driven block declares these, so the shapes are inferred.
    'minecraft:display_name': (value) => nbtCompound({ value: nbtString(String(value)) }),
    'minecraft:friction': (value) => nbtCompound({ value: nbtFloat(typeof value === 'number' ? value : 0.6) }),
    'minecraft:light_emission': (value) => nbtCompound({ emission: nbtByte(typeof value === 'number' ? value : 0) }),
    'minecraft:light_dampening': (value) =>
        nbtCompound({ lightLevel: nbtByte(typeof value === 'number' ? value : 15) }),
    'minecraft:placement_filter': placementFilter,

    // The four names Mojang replaced at 1.19.40, mapped onto their successors
    // so a 1.16.100 pack reaches the client the same way a current one does.
    'minecraft:destroy_time': (value) => nbtCompound({ value: nbtFloat(typeof value === 'number' ? value : 0) }),
    'minecraft:block_light_emission': (value) =>
        // The old component is a 0..1 fraction of the light scale, not a level.
        nbtCompound({ emission: nbtByte(Math.round((typeof value === 'number' ? value : 0) * 15)) }),
    'minecraft:block_light_absorption': (value) =>
        nbtCompound({ lightLevel: nbtByte(typeof value === 'number' ? value : 0) })
};

/** One component a block declared that this package neither sends nor knowingly drops. */
export interface UntranslatedComponent {
    readonly block: string;
    readonly component: string;
    /** Whether it sat inside a permutation rather than in the base component list. */
    readonly inPermutation: boolean;
}

/** Options for {@link buildBlockProperties}. */
export interface BlockPropertiesOptions {
    /** The Molang dialect declared on every definition; {@link MOLANG_VERSION} by default. */
    molangVersion?: number;
    /** Where allocation starts for a block with no `block_id`; {@link FIRST_CUSTOM_BLOCK_ID} by default. */
    firstCustomBlockId?: number;
    /**
     * Also write each tag as an empty `tag:<name>` compound inside
     * `components`, which is the form Geyser, Allay and PowerNukkitX use and
     * the form Geyser says Molang tag queries need. The captured server
     * writes only the top-level `blockTags` list, so that is the default.
     */
    tagComponents?: boolean;
}

/** What {@link buildBlockProperties} produced, and what it could not. */
export interface BlockPropertiesResult {
    /** One entry per block, ready for `StartGamePacket.blockProperties`, in input order. */
    readonly properties: readonly BlockProperty[];
    /** Components no translation covered, reported rather than dropped in silence. */
    readonly untranslated: readonly UntranslatedComponent[];
}

/** A resolved type or a parsed document; both carry the same definition. */
export type BlockPropertySource = BlockType | BlockDefinitionDocument;

const documentOf = (source: BlockPropertySource): BlockDefinitionDocument =>
    'definition' in source ? source.definition : source;

/**
 * The `properties` list: one entry per state the block declares itself.
 *
 * A state in the `minecraft:` namespace comes from a trait rather than from
 * the block, and `traits` already describes it, so it is left out. The list's
 * element type is the state's domain: byte for a flag, int for a number and
 * string for a name.
 */
const propertyEntry = (state: BlockStateDefinition): NBTTagCompound => {
    const values = state.values.map((value) => {
        if (typeof value === 'boolean') return nbtByte(value);
        if (typeof value === 'number') return nbtInt(value);
        return nbtString(String(value));
    });

    return nbtCompound({ enum: nbtList(values), name: nbtString(state.name) });
};

/**
 * The `traits` list.
 *
 * No captured definition carries one, because none of Mojang's 98 blocks
 * enables a trait in a file the server forwards. The shape is the research
 * note's: the trait name, a compound of the enabled states with their
 * `minecraft:` prefix dropped, and the trait's own parameters beside them.
 */
const traitEntry = (trait: BlockTrait): NBTTagCompound => {
    const enabled: Record<string, NbtValue> = {};
    for (const state of trait.enabledStates) enabled[state.replace(/^minecraft:/, '')] = nbtByte(true);

    const parameters: Record<string, NbtValue | undefined> = {};
    for (const [key, value] of Object.entries(trait.parameters)) parameters[key] = scalar(value);

    return nbtCompound({ ...parameters, enabled_states: nbtCompound(enabled), name: nbtString(trait.name) });
};

/** `vanilla_block_data`, which is `internal_vanilla_data` with its archetype flattened. */
const vanillaBlockData = (document: BlockDefinitionDocument, blockId: number): NBTTagCompound => {
    const internal = document.description.internalVanillaData;
    const entries: Record<string, NbtValue | undefined> = { block_id: nbtInt(blockId) };

    for (const [key, value] of Object.entries(internal?.raw ?? {})) {
        if (key === 'block_id') continue;
        if (key === 'block_archetype') continue;
        entries[key] = scalar(value);
    }

    if (internal?.blockArchetype !== undefined) {
        const archetype: Record<string, NbtValue | undefined> = { type: nbtString(internal.blockArchetype) };
        for (const [key, value] of Object.entries(internal.archetypeParameters)) archetype[key] = scalar(value);
        entries.block_archetype = nbtCompound(archetype);
    }

    return nbtCompound(entries);
};

interface TranslatedComponents {
    readonly compound: NBTTagCompound;
    readonly count: number;
}

const translateComponents = (
    entries: readonly ComponentEntry[],
    tags: string[],
    report: (component: string) => void,
    tagComponents: boolean
): TranslatedComponents => {
    const translated: Record<string, NbtValue> = {};

    for (const entry of entries) {
        if (entry.name === 'minecraft:tags') {
            const declared = Array.isArray(entry.value) ? entry.value : [];
            for (const tag of declared) if (typeof tag === 'string') tags.push(tag);
            if (tagComponents) for (const tag of tags) translated[`tag:${tag}`] = nbtCompound({});
            continue;
        }

        const translate = BLOCK_NBT_TRANSLATIONS[entry.name];
        if (translate !== undefined) {
            const compound = translate(entry.value);
            if (compound !== undefined) translated[entry.name] = compound;
            continue;
        }

        if (BLOCK_SERVER_ONLY_COMPONENTS[entry.name] === undefined) report(entry.name);
    }

    return { compound: nbtCompound(translated), count: Object.keys(translated).length };
};

/**
 * Builds the `Block Properties` entries for the blocks a client has to be
 * told about.
 *
 * The caller decides which blocks those are. Every block Mojang defines in
 * the vanilla behavior pack belongs here from 1.26.50 on, and so does every
 * block a pack adds; a block the client already has built in does not.
 *
 * @param blocks - Resolved types or parsed documents, in the order they
 *   should travel.
 * @returns The entries plus the components no translation covered.
 */
export const buildBlockProperties = (
    blocks: Iterable<BlockPropertySource>,
    options: BlockPropertiesOptions = {}
): BlockPropertiesResult => {
    const molangVersion = options.molangVersion ?? MOLANG_VERSION;
    const tagComponents = options.tagComponents ?? false;
    let nextBlockId = options.firstCustomBlockId ?? FIRST_CUSTOM_BLOCK_ID;

    const properties: BlockProperty[] = [];
    const untranslated: UntranslatedComponent[] = [];

    for (const source of blocks) {
        const document = documentOf(source);
        const name = document.description.identifier;
        const tags: string[] = [];

        const base = translateComponents(
            document.components,
            tags,
            (component) => untranslated.push({ block: name, component, inPermutation: false }),
            tagComponents
        );

        const permutations = document.permutations.flatMap((permutation) => {
            const components = translateComponents(
                permutation.components,
                [],
                (component) => untranslated.push({ block: name, component, inPermutation: true }),
                tagComponents
            );
            // A permutation that only changed a server-side component, such as
            // the two that pick a loot table, has nothing to say to the client.
            if (components.count === 0) return [];
            return [nbtCompound({ components: components.compound, condition: nbtString(permutation.condition) })];
        });

        const menu = document.description.menuCategory;
        const states = document.description.states.filter((state) => !state.name.startsWith('minecraft:'));
        const traits = document.description.traits;
        const blockId = document.description.internalVanillaData?.blockId ?? nextBlockId++;

        const definition = nbtCompound({
            blockTags: tags.length > 0 ? nbtList(tags.map(nbtString)) : undefined,
            components: base.compound,
            menu_category: nbtCompound({
                category: nbtString(menu?.category ?? DEFAULT_MENU_CATEGORY),
                group: nbtString(menu?.group ?? ''),
                is_hidden_in_commands: nbtByte(menu?.hiddenInCommands ?? false)
            }),
            molangVersion: nbtInt(molangVersion),
            permutations: permutations.length > 0 ? nbtList(permutations) : undefined,
            properties: states.length > 0 ? nbtList(states.map(propertyEntry)) : undefined,
            traits: traits.length > 0 ? nbtList(traits.map(traitEntry)) : undefined,
            vanilla_block_data: vanillaBlockData(document, blockId)
        });

        properties.push({ name, definition: writeNetworkNbt(definition) });
    }

    return { properties, untranslated };
};
