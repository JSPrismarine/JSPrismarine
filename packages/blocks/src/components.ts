/**
 * The Bedrock block components, each a `ComponentFactory` for
 * `@jsprismarine/content`'s `ComponentRegistry`.
 *
 * The parameter schemas follow Mojang's own
 * `metadata/json_schemas/server/block/1.26.20/*.json` from `bedrock-samples`
 * v1.26.50.4, including the defaults those schemas declare, so an absent field
 * reads as the engine reads it rather than as `undefined`.
 *
 * No factory returns a handler. A component says what a block is and which
 * hooks its parameters can reach; a behavior registered in the
 * `BehaviorRegistry` says what the block does. The `hooks` list on a factory
 * is how the server finds out which blocks can ever reach `onTick`,
 * `onRandomTick`, `onEntityFallOn` or `onRedstoneUpdate` without running
 * anything.
 */
import type { ComponentFactory } from '@jsprismarine/content';
import { accepted, ComponentRegistry, rejected } from '@jsprismarine/content';

import type { BlockHooks } from './hooks';
import type { Schema } from './schema';
import {
    boolean,
    decimal,
    either,
    field,
    integer,
    list,
    oneOf,
    passThrough,
    requiredField,
    shape,
    table,
    text,
    vector3
} from './schema';

/** Accepts the `#RRGGBB` or `#RRGGBBAA` string a map color is written as. */
const hexColor: Schema<string> = (value) =>
    typeof value === 'string' && /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)
        ? accepted(value)
        : rejected('expected a #RRGGBB color');

/** A block component factory, with this package's hook map already applied. */
export type BlockComponentFactory<P> = ComponentFactory<BlockHooks, P>;

const define = <P>(
    name: string,
    schema: Schema<P>,
    hooks: readonly (keyof BlockHooks & string)[] = []
): BlockComponentFactory<P> => ({ name, hooks, schema, create: () => ({}) });

/** The six faces, as `client_server/block/1.20.60/Facing.json` names them. */
const FACES = ['down', 'up', 'north', 'south', 'west', 'east'] as const;

/** The four horizontal directions a connection rule can enable. */
const DIRECTIONS = ['south', 'west', 'north', 'east'] as const;

/** `Tint Method.json`. */
const TINT_METHODS = [
    'none',
    'default_foliage',
    'birch_foliage',
    'evergreen_foliage',
    'dry_foliage',
    'grass',
    'water'
] as const;

/** `Block Render Layer.json`. */
const RENDER_METHODS = [
    'double_sided',
    'blend',
    'blend_to_opaque',
    'opaque',
    'alpha_test_to_opaque',
    'alpha_test',
    'alpha_test_single_sided',
    'alpha_test_single_sided_to_opaque'
] as const;

/** `Instrument.json`: the note block sounds a block can be tuned to. */
const INSTRUMENTS = [
    'note.harp',
    'note.bd',
    'note.snare',
    'note.hat',
    'note.bassattack',
    'note.flute',
    'note.bell',
    'note.guitar',
    'note.chime',
    'note.xylophone',
    'note.iron_xylophone',
    'note.cow_bell',
    'note.didgeridoo',
    'note.bit',
    'note.banjo',
    'note.pling',
    'note.trumpet',
    'note.trumpet_exposed',
    'note.trumpet_weathered',
    'note.trumpet_oxidized',
    'note.zombie',
    'note.skeleton',
    'note.creeper',
    'note.enderdragon',
    'note.witherskeleton',
    'note.piglin',
    'note.none'
] as const;

/** `Bounding Box Data.json`: a box in sixteenths of a block, origin at the block center's floor. */
const boundingBox = shape({
    origin: field('origin', vector3, [-8, 0, -8] as const),
    size: field('size', vector3, [16, 16, 16] as const)
});

/** `Material Instance.json`: one face's texture and how the client draws it. */
const materialInstance = either(
    text(),
    shape({
        texture: field('texture', text(), ''),
        renderMethod: field('render_method', oneOf(RENDER_METHODS), 'opaque'),
        ambientOcclusion: field('ambient_occlusion', decimal(0, 10), 1),
        faceDimming: field('face_dimming', boolean, true),
        isotropic: field('isotropic', boolean, false),
        alphaMaskedTint: field('alpha_masked_tint', boolean, false),
        tintMethod: field('tint_method', oneOf(TINT_METHODS), 'none')
    })
);

/** `Material Instances Component.json`: face name or `*` to a material instance. */
const materialInstances = table(materialInstance, 64);

/** `Geometry.json`: a model name, or the detailed form with culling and bone visibility. */
const geometry = either(
    text(),
    shape({
        identifier: requiredField('identifier', text()),
        boneVisibility: field('bone_visibility', table(passThrough, 64), {}),
        culling: field('culling', text(), ''),
        cullingLayer: field('culling_layer', text(), ''),
        cullingShape: field('culling_shape', text(), ''),
        uvLock: field('uv_lock', either(boolean, list(text(), { max: 64 })), false),
        nWayVisualRotation: field(
            'n_way_visual_rotation',
            shape({
                x: field('x', text(), ''),
                y: field('y', text(), ''),
                z: field('z', text(), '')
            }),
            { x: '', y: '', z: '' }
        )
    })
);

/** `Range And Steps.json`, used by `minecraft:random_offset`. */
const rangeAndSteps = shape({
    range: requiredField(
        'range',
        shape({ min: requiredField('min', decimal()), max: requiredField('max', decimal()) })
    ),
    steps: field('steps', integer(0), 0)
});

const noOffset = { range: { min: 0, max: 0 }, steps: 0 } as const;

/** `minecraft:destructible_by_mining`, `Detailed Mining Speed.json`. */
export const destructibleByMining = define(
    'minecraft:destructible_by_mining',
    either(
        boolean,
        shape({
            secondsToDestroy: requiredField('seconds_to_destroy', decimal()),
            itemSpecificSpeeds: field(
                'item_specific_speeds',
                list(
                    shape({
                        item: requiredField('item', passThrough),
                        destroySpeed: requiredField('destroy_speed', decimal())
                    })
                ),
                []
            )
        })
    )
);

/** `minecraft:destructible_by_explosion`, `Detailed Resistance.json`. */
export const destructibleByExplosion = define(
    'minecraft:destructible_by_explosion',
    either(boolean, shape({ explosionResistance: requiredField('explosion_resistance', decimal(0)) }))
);

/**
 * `minecraft:friction`. Mojang's schema caps this at 0.9, which is why the
 * server's own friction table is a separate, Java-sourced column: blue ice is
 * 0.989 and does not fit here.
 */
export const friction = define('minecraft:friction', decimal(0, 0.9));

/** `minecraft:light_emission`, 0 to 15. */
export const lightEmission = define('minecraft:light_emission', integer(0, 15));

/** `minecraft:light_dampening`, how much light the block swallows, 0 to 15. */
export const lightDampening = define('minecraft:light_dampening', integer(0, 15));

/** `minecraft:flammable`, `Detailed Flammable.json`. */
export const flammable = define(
    'minecraft:flammable',
    either(
        boolean,
        shape({
            catchChanceModifier: field('catch_chance_modifier', integer(0), 5),
            destroyChanceModifier: field('destroy_chance_modifier', integer(0), 20),
            lavaFlammable: field('lava_flammable', oneOf(['always', 'never'] as const), 'never')
        })
    )
);

/** `minecraft:map_color`, a `#RRGGBB` string or a color with a tint method. */
export const mapColor = define(
    'minecraft:map_color',
    either(
        hexColor,
        shape({
            color: requiredField('color', hexColor),
            tintMethod: field('tint_method', oneOf(TINT_METHODS), 'none')
        })
    )
);

/** `minecraft:geometry`, the model the client draws. */
export const geometryComponent = define('minecraft:geometry', geometry);

/** `minecraft:material_instances`, the textures per face. */
export const materialInstancesComponent = define('minecraft:material_instances', materialInstances);

/** `minecraft:collision_box`: off, one box, or up to sixteen. */
export const collisionBox = define(
    'minecraft:collision_box',
    either(boolean, either(boundingBox, list(boundingBox, { max: 16 })))
);

/** `minecraft:selection_box`: off, or one box. */
export const selectionBox = define('minecraft:selection_box', either(boolean, boundingBox));

/** `minecraft:loot`, the pack-relative path of the block's loot table. */
export const loot = define('minecraft:loot', text());

/** `minecraft:display_name`, the localization key shown in the inventory. */
export const displayName = define('minecraft:display_name', text());

/** `minecraft:crafting_table`, which turns the block into a crafting station. */
export const craftingTable = define(
    'minecraft:crafting_table',
    shape({
        craftingTags: requiredField('crafting_tags', list(text(64), { max: 64 })),
        tableName: field('table_name', text(), '')
    })
);

/** `minecraft:placement_filter`, the faces and neighbors a placement needs. */
export const placementFilter = define(
    'minecraft:placement_filter',
    shape({
        conditions: field(
            'conditions',
            list(
                shape({
                    allowedFaces: field('allowed_faces', list(oneOf(FACES)), FACES),
                    blockFilter: field('block_filter', list(passThrough, { max: 64 }), [])
                }),
                { max: 64 }
            ),
            []
        )
    })
);

/** `minecraft:transformation`, the visual rotation, scale and translation. */
export const transformation = define(
    'minecraft:transformation',
    shape({
        rotation: field('rotation', vector3, [0, 0, 0] as const),
        rotationPivot: field('rotation_pivot', vector3, [0, 0, 0] as const),
        scale: field('scale', vector3, [1, 1, 1] as const),
        scalePivot: field('scale_pivot', vector3, [0, 0, 0] as const),
        translation: field('translation', vector3, [0, 0, 0] as const)
    })
);

/**
 * `minecraft:tick`. The parameters say when the block ticks; the behavior
 * attached to the block implements `onTick`.
 */
export const tick = define(
    'minecraft:tick',
    shape({
        intervalRange: requiredField('interval_range', list(integer(0), { min: 2, max: 2 })),
        looping: field('looping', boolean, true)
    }),
    ['onTick']
);

/**
 * `minecraft:random_ticking`. Internal, and `Blocks.json` forbids it at the
 * top level of a 1.26.20 file, so only an older file reaches this factory. It
 * marks the block as reaching `onRandomTick`.
 */
export const randomTicking = define('minecraft:random_ticking', shape({}), ['onRandomTick']);

/** `minecraft:entity_fall_on`, the fall distance that reaches `onEntityFallOn`. */
export const entityFallOn = define(
    'minecraft:entity_fall_on',
    shape({ minFallDistance: field('min_fall_distance', decimal(0), 0) }),
    ['onEntityFallOn']
);

/** `minecraft:redstone_conductivity`, whether wire powers through and steps down onto the block. */
export const redstoneConductivity = define(
    'minecraft:redstone_conductivity',
    shape({
        redstoneConductor: field('redstone_conductor', boolean, false),
        allowsWireToStepDown: field('allows_wire_to_step_down', boolean, true)
    })
);

/** `minecraft:redstone_consumer`, which reaches `onRedstoneUpdate`. */
export const redstoneConsumer = define(
    'minecraft:redstone_consumer',
    shape({
        minPower: field('min_power', integer(0, 15), 1),
        propagatesPower: field('propagates_power', boolean, false)
    }),
    ['onRedstoneUpdate']
);

/** `minecraft:redstone_producer`, the power the block emits and where. */
export const redstoneProducer = define(
    'minecraft:redstone_producer',
    shape({
        power: requiredField('power', integer(0, 15)),
        connectedFaces: field('connected_faces', list(oneOf(FACES)), FACES),
        stronglyPoweredFace: field('strongly_powered_face', oneOf(FACES), undefined),
        transformRelative: field('transform_relative', boolean, true)
    })
);

/**
 * `minecraft:custom_components`, the names a pack binds script components
 * under. The runtime reads them as behavior names, because Mojang marked the
 * script hook deprecated while its version 2 still needs two experimental
 * toggles.
 */
export const customComponents = define('minecraft:custom_components', list(text()));

/** `minecraft:item_visual`, the model shown in the inventory when it differs. */
export const itemVisual = define(
    'minecraft:item_visual',
    shape({
        geometry: requiredField('geometry', geometry),
        materialInstances: requiredField('material_instances', materialInstances)
    })
);

/** `minecraft:embedded_visual`, the model shown inside a flower pot. */
export const embeddedVisual = define(
    'minecraft:embedded_visual',
    shape({
        geometry: requiredField('geometry', geometry),
        materialInstances: requiredField('material_instances', materialInstances)
    })
);

/** `minecraft:liquid_detection`, one rule per liquid type. */
export const liquidDetection = define(
    'minecraft:liquid_detection',
    shape({
        detectionRules: requiredField(
            'detection_rules',
            list(
                shape({
                    liquidType: field('liquid_type', oneOf(['water'] as const), 'water'),
                    canContainLiquid: field('can_contain_liquid', boolean, false),
                    onLiquidTouches: field(
                        'on_liquid_touches',
                        oneOf(['broken', 'popped', 'blocking', 'no_reaction'] as const),
                        'blocking'
                    ),
                    stopsLiquidFlowingFromDirection: field(
                        'stops_liquid_flowing_from_direction',
                        list(oneOf(FACES)),
                        []
                    ),
                    useLiquidClipping: field('use_liquid_clipping', boolean, false)
                }),
                { min: 1, max: 1 }
            )
        )
    })
);

/**
 * `minecraft:breathability`. Internal, and `Blocks.json` forbids it at the top
 * level of a 1.26.20 file. Mojang's schema declares it as an empty object, so
 * the parameters are whatever the file wrote.
 */
export const breathability = define('minecraft:breathability', passThrough);

/** `minecraft:block_entity`, the container and dynamic property storage a block keeps. */
export const blockEntity = define(
    'minecraft:block_entity',
    shape({
        container: field('container', shape({ slotCount: requiredField('slot_count', integer(1, 54)) }), undefined),
        dynamicProperties: field('dynamic_properties', boolean, false)
    })
);

/** `minecraft:tags`, the block tags the engine and recipes filter on. */
export const tags = define('minecraft:tags', list(text()));

/** `minecraft:destruction_particles`, the texture the break effect uses. */
export const destructionParticles = define(
    'minecraft:destruction_particles',
    shape({
        texture: field('texture', text(), ''),
        tintMethod: field('tint_method', oneOf(TINT_METHODS), 'none'),
        particleCount: field('particle_count', integer(0, 255), 100)
    })
);

/** `minecraft:instrument_sound`, the note block sound for the face played. */
export const instrumentSound = define(
    'minecraft:instrument_sound',
    shape({
        up: field('up', oneOf(INSTRUMENTS), undefined),
        down: field('down', oneOf(INSTRUMENTS), undefined)
    })
);

/** `minecraft:chest_obstruction`, whether a chest beneath the block can open. */
export const chestObstruction = define(
    'minecraft:chest_obstruction',
    shape({ obstructionRule: requiredField('obstruction_rule', oneOf(['always', 'never', 'shape'] as const)) })
);

/** `minecraft:support`, the shape attached blocks treat the block as. */
export const support = define(
    'minecraft:support',
    shape({ shape: requiredField('shape', oneOf(['fence', 'stair'] as const)) })
);

/** `minecraft:connection_rule`, which fences, walls, bars and panes connect to the block. */
export const connectionRule = define(
    'minecraft:connection_rule',
    shape({
        acceptsConnectionsFrom: field(
            'accepts_connections_from',
            oneOf(['none', 'only_fences', 'all'] as const),
            'all'
        ),
        enabledDirections: field('enabled_directions', list(oneOf(DIRECTIONS)), DIRECTIONS)
    })
);

/** `minecraft:movable`, how a piston treats the block. */
export const movable = define(
    'minecraft:movable',
    shape({
        movementType: requiredField('movement_type', oneOf(['push_pull', 'push', 'popped', 'immovable'] as const)),
        sticky: field('sticky', oneOf(['none', 'same'] as const), 'none')
    })
);

/** `minecraft:precipitation_interactions`, how rain and snow treat the block. */
export const precipitationInteractions = define(
    'minecraft:precipitation_interactions',
    shape({
        precipitationBehavior: requiredField(
            'precipitation_behavior',
            oneOf(['none', 'obstruct_rain', 'obstruct_rain_accumulate_snow', 'snowlogging'] as const)
        )
    })
);

/** `minecraft:replaceable`, which lets another block be placed in the same position. */
export const replaceable = define('minecraft:replaceable', shape({}));

/** `minecraft:flower_pottable`, which lets the block go in a flower pot. */
export const flowerPottable = define('minecraft:flower_pottable', shape({}));

/** `minecraft:unit_cube`, internal, which draws the block as a plain full cube. */
export const unitCube = define('minecraft:unit_cube', passThrough);

/** `minecraft:random_offset`, the visual jitter applied per position. */
export const randomOffset = define(
    'minecraft:random_offset',
    shape({
        x: field('x', rangeAndSteps, noOffset),
        y: field('y', rangeAndSteps, noOffset),
        z: field('z', rangeAndSteps, noOffset)
    })
);

/** `minecraft:sound`, the sound group the block uses. */
export const sound = define('minecraft:sound', shape({ sound: field('sound', text(), '') }));

/** `minecraft:leashable`, where a lead attaches to the block. */
export const leashable = define(
    'minecraft:leashable',
    shape({ offset: field('offset', vector3, [0, 0.25, 0] as const) })
);

/**
 * `minecraft:queued_ticking`. Internal and forbidden at the top level of a
 * 1.26.20 file; it marks the block as reaching `onTick` in an older file.
 */
export const queuedTicking = define('minecraft:queued_ticking', passThrough, ['onTick']);

/** One of the seven legacy `minecraft:on_*` event components, with the hook it reaches. */
const legacyEvent = (name: string, hooks: readonly (keyof BlockHooks & string)[]) =>
    define(`minecraft:${name}`, passThrough, hooks);

/** `minecraft:on_interact`, the pre-script spelling of `onPlayerInteract`. */
export const onInteract = legacyEvent('on_interact', ['onPlayerInteract']);

/** `minecraft:on_placed`, the pre-script spelling of `onPlace`. */
export const onPlaced = legacyEvent('on_placed', ['onPlace']);

/** `minecraft:on_player_destroyed`, the pre-script spelling of `onBreak`. */
export const onPlayerDestroyed = legacyEvent('on_player_destroyed', ['onBreak']);

/** `minecraft:on_player_placing`, which ran before a placement was committed. */
export const onPlayerPlacing = legacyEvent('on_player_placing', ['onPlace']);

/** `minecraft:on_fall_on`, the pre-script spelling of `onEntityFallOn`. */
export const onFallOn = legacyEvent('on_fall_on', ['onEntityFallOn']);

/** `minecraft:on_step_on`, the pre-script spelling of `onStepOn`. */
export const onStepOn = legacyEvent('on_step_on', ['onStepOn']);

/** `minecraft:on_step_off`, which has no script replacement in this hook map. */
export const onStepOff = legacyEvent('on_step_off', []);

/** `minecraft:destroy_time`, the pre-1.19.40 spelling of the mining time, in seconds. */
export const destroyTime = define('minecraft:destroy_time', decimal());

/** `minecraft:explosion_resistance`, the pre-1.19.40 spelling of the blast resistance. */
export const explosionResistance = define('minecraft:explosion_resistance', decimal(0));

/** `minecraft:block_light_emission`, the pre-1.19.40 light output as a 0 to 1 fraction of 15. */
export const blockLightEmission = define('minecraft:block_light_emission', decimal(0, 1));

/** `minecraft:block_light_absorption`, the pre-1.19.40 spelling of the light dampening. */
export const blockLightAbsorption = define('minecraft:block_light_absorption', integer(0, 15));

/**
 * `jsprismarine:block_properties`, this project's own component for the
 * per-state facts Bedrock's grammar cannot hold.
 *
 * The overlay pack writes it from `@jsprismarine/mapping`'s Java-sourced
 * table. Friction is here at full precision because Mojang's
 * `minecraft:friction` caps at 0.9 and Java's blue ice is 0.989, and random
 * ticking is here because `minecraft:random_ticking` is an internal component
 * `Blocks.json` forbids at the top level of a current file.
 */
export const blockProperties = define(
    'jsprismarine:block_properties',
    shape({
        friction: field('friction', decimal(0, 1), 0.6),
        randomTick: field('random_tick', boolean, false),
        requiresCorrectTool: field('requires_correct_tool', boolean, false),
        pushReaction: field('push_reaction', oneOf(['push_pull', 'push', 'popped', 'immovable'] as const), 'push_pull'),
        source: field('source', oneOf(['java', 'fallback'] as const), 'java')
    })
);

/**
 * `jsprismarine:behavior`, the behavior family the overlay assigns a block.
 *
 * It is the same idea as `minecraft:custom_components` and exists beside it so
 * a pack can keep the Mojang key for a script component while the overlay
 * names an engine family.
 */
export const behavior = define('jsprismarine:behavior', text());

/**
 * Every component this package implements, in the order the registry takes
 * them. The 49 names in Mojang's `Components.json`, the four property
 * components Mojang renamed at 1.19.40, `minecraft:custom_components`, and
 * this project's two overlay components.
 */
export const BLOCK_COMPONENTS: readonly BlockComponentFactory<unknown>[] = [
    blockEntity,
    breathability,
    chestObstruction,
    collisionBox,
    connectionRule,
    craftingTable,
    destructibleByExplosion,
    destructibleByMining,
    destructionParticles,
    displayName,
    embeddedVisual,
    entityFallOn,
    flammable,
    flowerPottable,
    friction,
    geometryComponent,
    instrumentSound,
    itemVisual,
    leashable,
    lightDampening,
    lightEmission,
    liquidDetection,
    loot,
    mapColor,
    materialInstancesComponent,
    movable,
    onFallOn,
    onInteract,
    onPlaced,
    onPlayerDestroyed,
    onPlayerPlacing,
    onStepOff,
    onStepOn,
    placementFilter,
    precipitationInteractions,
    queuedTicking,
    randomOffset,
    randomTicking,
    redstoneConductivity,
    redstoneConsumer,
    redstoneProducer,
    replaceable,
    selectionBox,
    sound,
    support,
    tags,
    tick,
    transformation,
    unitCube,
    customComponents,
    destroyTime,
    explosionResistance,
    blockLightEmission,
    blockLightAbsorption,
    behavior,
    blockProperties
];

/** Every component name this package implements, in registration order. */
export const BLOCK_COMPONENT_NAMES: readonly string[] = BLOCK_COMPONENTS.map((component) => component.name);

/**
 * A registry holding every component in {@link BLOCK_COMPONENTS}.
 *
 * Build one per content load and register a plugin's own components on it
 * before resolving, since a name may only be registered once.
 */
export const createBlockComponentRegistry = (): ComponentRegistry<BlockHooks> => {
    const registry = new ComponentRegistry<BlockHooks>();
    for (const component of BLOCK_COMPONENTS) registry.register(component);
    return registry;
};
