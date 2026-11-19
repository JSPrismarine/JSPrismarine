/**
 * The entity components of `@minecraft/server` that read an entity's definition: every
 * `Entity*Component` class with a `componentId` but the attribute, inventory and equippable ones
 * `serverComponents.ts` owns, `PlayerCursorInventoryComponent`, `Entity.getComponents`, and the
 * plain classes they return: `Seat`, `FeedItem`, `FeedItemEffect` and `EntityDefinitionFeedItem`.
 *
 * An entity has a component when its active component set, as {@link ScriptEntitySystems.components}
 * reads it from its definition, names the component's id. A component's fields read that JSON,
 * with the defaults BDS reports for a field the JSON leaves out, as the `entity-values` scenario
 * recorded on the pinned Bedrock Dedicated Server. A few components are not in the JSON but in
 * the entity's state: `minecraft:onfire` while it burns, `minecraft:riding` while it rides,
 * `minecraft:item` on a dropped stack, and a player's cursor and ender chest.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { ScriptApiError } from '../../errors';
import { SCRIPT_MODULE_HISTORIES } from '../../generated/scriptModules';
import { isRecord } from '../../isRecord';
import type { ScriptApiImplementations, ScriptCall, ScriptOwnerName } from '../../shape/implementations';
import type { ScriptValue } from '../../values';
import { ScriptHandle } from '../../values';
import type { PackHost } from '../minecraftServer';
import { entityComponent } from '../serverComponents';
import type { EntityKey } from '../serverObjects';
import { COMMON, entityKeyOf, itemState, PLAYER, plainError, SERVER, TAG, withNamespace } from '../serverObjects';
import type { ScriptItem } from '../world';
import type { ScriptEntityStatus, ScriptEntitySystems } from './world';

/** The tags of the objects this module makes, clear of `TAG`'s and the signals'. */
export const ENTITY_AREA_TAG = {
    /** An entity component; its state is a {@link ComponentKey}. */
    component: 1001,
    /** A `Seat`, `FeedItem`, `FeedItemEffect` or `EntityDefinitionFeedItem`; its state is the object's fields as JSON. */
    plain: 1002,
    /** A `Trigger`; its state is the event's name. */
    trigger: 1003,
    /** A player's `Camera`; its state is the player's entity key. */
    camera: 1004,
    /** A player's `ClientSystemInfo`; its state is the player's entity key. */
    clientSystemInfo: 1005,
    /** A player's `InputInfo`; its state is the player's entity key. */
    inputInfo: 1006,
    /** A player's `PlayerInputPermissions`; its state is the player's entity key. */
    inputPermissions: 1007,
    /** A player's `PlayerAimAssist`; its state is the player's entity key. */
    playerAimAssist: 1008,
    /** A player's `FogSettings`; its state is the player's entity key. */
    fogSettings: 1009,
    /** A player's `LocatorBar`; its state is the player's entity key. */
    locatorBar: 1010,
    /** `world.getAimAssist()`. */
    aimAssistRegistry: 1011,
    /** A registered `AimAssistCategory`; its state is its identifier. */
    aimAssistCategory: 1012,
    /** A registered `AimAssistPreset`; its state is its identifier. */
    aimAssistPreset: 1013
} as const;

/** A script array of the objects the host made, which the caller returns. */
export const scriptArray = (host: PackHost, items: readonly ScriptHandle[]): ScriptHandle => {
    const list = host.engine.evaluate('[]');
    if (!(list instanceof ScriptHandle)) throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'array' });
    items.forEach((item, index) => host.engine.set(list, String(index), item));
    return host.engine.release(list);
};

/** A class of `@minecraft/server`. */
type ServerClass = ScriptOwnerName<typeof SERVER>;

/** What a component object carries: its entity and the component's id. */
interface ComponentKey extends EntityKey {
    readonly component: string;
}

const componentKeyOf = (state: string): ComponentKey => {
    // The host wrote the state with JSON.stringify.
    const parsed: unknown = JSON.parse(state);
    const { id, typeId } = entityKeyOf(state);
    if (!isRecord(parsed) || typeof parsed.component !== 'string')
        throw new ScriptHostErrors.ObjectCarriesNoState({ what: 'entity component' });
    return { id, typeId, component: parsed.component };
};

/** The components `serverComponents.ts` answers for itself. */
const OWNED_ELSEWHERE: ReadonlySet<string> = new Set(['minecraft:inventory', 'minecraft:equippable']);

/** Whether a class's bases reach `base`, by the shape's class segments. */
const extendsClass = (name: string, base: string): boolean => {
    const declarations = SCRIPT_MODULE_HISTORIES[SERVER]?.declarations ?? {};
    for (let current: string | undefined = name; current !== undefined;) {
        if (current === base) return true;
        const segment: { readonly kind: string; readonly base?: unknown } | undefined =
            declarations[current]?.segments.at(-1);
        current = segment?.kind === 'class' && typeof segment.base === 'string' ? segment.base : undefined;
    }
    return false;
};

/**
 * The entity component classes, by component id, as the shape gives each class a `componentId`
 * constant: every one whose bases reach `EntityComponent`, the attribute components included.
 */
export const ENTITY_COMPONENT_CLASSES: ReadonlyMap<string, string> = (() => {
    const found = new Map<string, string>();
    for (const [name, history] of Object.entries(SCRIPT_MODULE_HISTORIES[SERVER]?.declarations ?? {})) {
        const id = history.members?.componentId?.find((member) => member.kind === 'constant');
        if (id?.kind === 'constant' && typeof id.value === 'string' && extendsClass(name, 'EntityComponent')) {
            found.set(id.value, name);
        }
    }
    return found;
})();

/** The attribute components, which the world's attributes answer rather than the definition. */
const isAttribute = (id: string): boolean => {
    const name = ENTITY_COMPONENT_CLASSES.get(id);
    return name !== undefined && extendsClass(name, 'EntityAttributeComponent');
};

const record = (value: unknown): Readonly<Record<string, unknown>> => (isRecord(value) ? value : {});
const numberOr = (value: unknown, fallback: number): number => (typeof value === 'number' ? value : fallback);
const booleanOr = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);
const stringOr = (value: unknown, fallback: string): string => (typeof value === 'string' ? value : fallback);
const strings = (value: unknown): string[] =>
    (Array.isArray(value) ? value : value === undefined ? [] : [value]).filter((each) => typeof each === 'string');
const vectorOf = (value: unknown): { x: number; y: number; z: number } => {
    const [x, y, z] = Array.isArray(value) ? value : [];
    return { x: numberOr(x, 0), y: numberOr(y, 0), z: numberOr(z, 0) };
};

/** A stack the world put in a component's JSON, such as a dropped item's, read back. */
const itemOfJson = (value: unknown): ScriptItem | undefined => {
    if (!isRecord(value) || typeof value.typeId !== 'string' || typeof value.amount !== 'number') return undefined;
    const lore = strings(value.lore);
    return {
        typeId: value.typeId,
        amount: value.amount,
        ...(typeof value.nameTag === 'string' ? { nameTag: value.nameTag } : {}),
        ...(lore.length > 0 ? { lore } : {}),
        ...(typeof value.damage === 'number' && value.damage > 0 ? { damage: value.damage } : {})
    };
};

/**
 * The value a leash's distances default to, as BDS reported them for a pig whose
 * `minecraft:leashable` is empty.
 */
const LEASH = { hard: 7, soft: 4, max: 12 } as const;

/** A leash's settings: the last preset with no filter, over the component's own fields. */
const leashSettings = (json: Readonly<Record<string, unknown>>) => {
    const presets = Array.isArray(json.presets) ? json.presets.map(record) : [];
    const preset = presets.filter((each) => each.filter === undefined).at(-1) ?? {};
    const pick = (key: string, fallback: number) => numberOr(preset[key], numberOr(json[key], fallback));
    return {
        hardDistance: pick('hard_distance', LEASH.hard),
        softDistance: pick('soft_distance', LEASH.soft),
        maxDistance: pick('max_distance', LEASH.max),
        canBeStolen: booleanOr(json.can_be_stolen, true)
    };
};

/** A rideable's seats, as `Seat` reads each. A seat's rotation written in Molang reads as 0. */
const seatsOf = (json: Readonly<Record<string, unknown>>) => {
    const seatCount = numberOr(json.seat_count, 1);
    const seats = Array.isArray(json.seats) ? json.seats : json.seats === undefined ? [] : [json.seats];
    return seats.map(record).map((seat) => ({
        lockRiderRotation: numberOr(seat.lock_rider_rotation, 181),
        maxRiderCount: numberOr(seat.max_rider_count, seatCount),
        minRiderCount: numberOr(seat.min_rider_count, 0),
        position: vectorOf(seat.position),
        seatRotation: numberOr(seat.rotate_rider_by, 0)
    }));
};

/** What one feed item of `minecraft:healable` reads as a `FeedItem`. */
const feedItemOf = (entry: unknown) => {
    const item = record(entry);
    return {
        item: stringOr(item.item, ''),
        healAmount: numberOr(item.heal_amount, 0),
        ...(typeof item.result_item === 'string' ? { resultItem: item.result_item } : {}),
        effects: (Array.isArray(item.effects) ? item.effects : []).map(record).map((effect) => ({
            amplifier: numberOr(effect.amplifier, 0),
            chance: numberOr(effect.chance, 1),
            duration: numberOr(effect.duration, 0),
            name: stringOr(effect.name, '')
        }))
    };
};

/** What one feed item of `minecraft:ageable` reads as an `EntityDefinitionFeedItem`. */
const ageableFeedItemOf = (entry: unknown) => {
    if (typeof entry === 'string') return { item: entry, growth: 0.1 };
    const item = record(entry);
    return {
        item: stringOr(item.item, ''),
        growth: numberOr(item.growth, 0.1),
        ...(typeof item.result_item === 'string' ? { resultItem: item.result_item } : {})
    };
};

/**
 * Whether BDS reads an item name in a file of this format version as written. From 1.26.60 it
 * does; an older file's name without a namespace gets `minecraft:`, as the `entity-values`
 * scenario recorded for a horse's healable items (1.26.60) and a wolf's (1.26.50).
 */
const namesAsWritten = (formatVersion: string | undefined): boolean => {
    const [major = 0, minor = 0, patch = 0] = (formatVersion ?? '').split('.').map(Number);
    return major > 1 || (major === 1 && (minor > 26 || (minor === 26 && patch >= 60)));
};

/** BDS's defaults for a navigation component's fields, by the JSON key each reads. */
const NAVIGATION_FIELDS = {
    avoidDamageBlocks: ['avoid_damage_blocks', false],
    avoidPortals: ['avoid_portals', false],
    avoidSun: ['avoid_sun', false],
    avoidWater: ['avoid_water', false],
    canBreach: ['can_breach', false],
    canBreakDoors: ['can_break_doors', false],
    canFloat: ['can_float', false],
    canJump: ['can_jump', true],
    canOpenDoors: ['can_open_doors', false],
    canOpenIronDoors: ['can_open_iron_doors', false],
    canPassDoors: ['can_pass_doors', true],
    canPathFromAir: ['can_path_from_air', false],
    canPathOverLava: ['can_path_over_lava', false],
    // BDS reads `canPathOverWater` from `can_walk_in_lava`, as the `entity-values` scenario recorded
    // for a strider (true) and a pig whose navigation paths over water (false).
    canPathOverWater: ['can_walk_in_lava', false],
    canSink: ['can_sink', true],
    canSwim: ['can_swim', false],
    canWalk: ['can_walk', true],
    canWalkInLava: ['can_walk_in_lava', false],
    isAmphibious: ['is_amphibious', false]
} as const;

/** The value a breathable entity's air supply holds, or BDS's full supply when the world keeps none. */
const AIR_FIELD = 'jsp:air_supply';

/**
 * Registers the entity components that read an entity's definition.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime and the world.
 */
export const implementEntityComponents = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const systems = (): ScriptEntitySystems | undefined => host.world.entitySystems;
    const plainObject = (className: string, fields: unknown): ScriptHandle =>
        host.engine.release(host.create(className, ENTITY_AREA_TAG.plain, JSON.stringify(fields)));
    const array = (items: readonly ScriptHandle[]): ScriptHandle => scriptArray(host, items);
    /** The component's JSON and its entity's state, or BDS's error once either is gone. */
    const read = (call: ScriptCall, member: string, access: 'get' | 'call' = 'get') => {
        const key = componentKeyOf(call.state);
        const json = componentJson(host, key);
        if (json === undefined) {
            throw plainError(`Failed to ${access === 'get' ? 'get property' : 'call function'} '${member}'.`);
        }
        return {
            key,
            json: record(json),
            status: systems()?.status(key.id),
            all: systems()?.components(key.id) ?? new Map<string, unknown>(),
            formatVersion: systems()?.formatVersion(key.id)
        };
    };
    const field = (
        className: ServerClass,
        member: string,
        value: (
            json: Readonly<Record<string, unknown>>,
            status: ScriptEntityStatus | undefined,
            key: ComponentKey,
            all: ReadonlyMap<string, unknown>
        ) => ScriptValue | undefined
    ): void => {
        // Each table row names a member of its class, which the generated types cannot check through the loop.
        implementations.implement(
            SERVER,
            className,
            member as never,
            {
                get: (call: ScriptCall) => {
                    const { json, status, key, all } = read(call, member);
                    return value(json, status, key, all);
                }
            } as never
        );
    };
    const entityOrUndefined = (id: string | undefined): ScriptHandle | undefined => {
        if (id === undefined) return undefined;
        const entity = host.world.entity(id);
        return entity === undefined ? undefined : host.entity(entity);
    };
    const playerArgument = (call: ScriptCall, index: number): string | undefined => {
        const value = call.args[index];
        if (!(value instanceof ScriptHandle)) return undefined;
        const state = call.stateOf(value);
        return state === '' ? undefined : entityKeyOf(state).id;
    };
    const setField = (call: ScriptCall, member: string, value: unknown): void => {
        const { key } = read(call, member, 'get');
        systems()?.setComponentField(key.id, key.component, member, value);
    };

    implementations
        .implement(SERVER, 'Entity', 'getComponents', (call) => {
            const key = entityKeyOf(call.state);
            if (host.world.entity(key.id) === undefined) {
                throw new ScriptApiError(
                    SERVER,
                    'InvalidEntityError',
                    "Failed to call function 'getComponents' due to Entity being invalid (has the Entity been removed?).",
                    { id: key.id, type: key.typeId }
                );
            }
            return array(
                presentComponents(host, key).flatMap((id) => {
                    const component = entityComponent(host, key, id);
                    return component === undefined ? [] : [component];
                })
            );
        })
        .implement(SERVER, 'EntityComponent', 'entity', {
            get: (call) => {
                const { id, typeId } = entityKeyOf(call.state);
                return host.entity({ id, typeId });
            }
        });

    // The plain objects a component returns.
    const plainField = (className: ServerClass, member: string) =>
        implementations.implement(
            SERVER,
            className,
            member as never,
            {
                get: (call: ScriptCall) => {
                    const value = record(JSON.parse(call.state))[member];
                    return isRecord(value) ? JSON.stringify(value) : (value as ScriptValue | undefined);
                }
            } as never
        );
    for (const member of ['lockRiderRotation', 'maxRiderCount', 'minRiderCount', 'position', 'seatRotation'])
        plainField('Seat', member);
    for (const member of ['healAmount', 'item', 'resultItem']) plainField('FeedItem', member);
    for (const member of ['amplifier', 'chance', 'duration', 'name']) plainField('FeedItemEffect', member);
    for (const member of ['growth', 'item', 'resultItem']) plainField('EntityDefinitionFeedItem', member);
    implementations.implement(SERVER, 'FeedItem', 'getEffects', (call) => {
        const effects = record(JSON.parse(call.state)).effects;
        return array((Array.isArray(effects) ? effects : []).map((effect) => plainObject('FeedItemEffect', effect)));
    });

    field('EntityAddRiderComponent', 'entityType', (json) => stringOr(json.entity_type, ''));
    field('EntityAddRiderComponent', 'spawnEvent', (json) => stringOr(json.spawn_event, ''));

    field('EntityAgeableComponent', 'duration', (json) => numberOr(json.duration, 1200));
    field('EntityAgeableComponent', 'transformToItem', (json) => stringOr(json.transform_to_item, ''));
    field('EntityAgeableComponent', 'growUp', (json) =>
        host.engine.release(host.create('Trigger', ENTITY_AREA_TAG.trigger, stringOr(record(json.grow_up).event, '')))
    );
    implementations
        .implement(SERVER, 'EntityAgeableComponent', 'getDropItems', (call) =>
            JSON.stringify(strings(read(call, 'getDropItems', 'call').json.drop_items))
        )
        .implement(SERVER, 'EntityAgeableComponent', 'getFeedItems', (call) => {
            const { json } = read(call, 'getFeedItems', 'call');
            const items = Array.isArray(json.feed_items)
                ? json.feed_items
                : json.feed_items === undefined
                  ? []
                  : [json.feed_items];
            return array(
                items.map((item) => {
                    const fed = ageableFeedItemOf(item);
                    // BDS names an ageable's food with its namespace, as the `entity-values` scenario recorded.
                    return plainObject('EntityDefinitionFeedItem', { ...fed, item: withNamespace(fed.item) });
                })
            );
        });

    const maxTurn = (json: Readonly<Record<string, unknown>>) => numberOr(json.max_turn, 30);
    field('EntityBaseMovementComponent', 'maxTurn', maxTurn);
    field('EntityMovementGlideComponent', 'startSpeed', (json) => numberOr(json.start_speed, 0.1));
    field('EntityMovementGlideComponent', 'speedWhenTurning', (json) => numberOr(json.speed_when_turning, 0.2));
    field('EntityMovementSwayComponent', 'swayAmplitude', (json) => numberOr(json.sway_amplitude, 0.05));
    field('EntityMovementSwayComponent', 'swayFrequency', (json) => numberOr(json.sway_frequency, 0.5));

    const totalSupply = (json: Readonly<Record<string, unknown>>) => numberOr(json.total_supply, 15);
    const breathes = {
        breathesAir: (json: Readonly<Record<string, unknown>>) => booleanOr(json.breathes_air, true),
        breathesWater: (json: Readonly<Record<string, unknown>>) => booleanOr(json.breathes_water, false),
        breathesLava: (json: Readonly<Record<string, unknown>>) => booleanOr(json.breathes_lava, true),
        breathesSolids: (json: Readonly<Record<string, unknown>>) => booleanOr(json.breathes_solids, false)
    };
    for (const [member, value] of Object.entries(breathes)) field('EntityBreathableComponent', member, value);
    field('EntityBreathableComponent', 'generatesBubbles', (json) => booleanOr(json.generates_bubbles, true));
    field('EntityBreathableComponent', 'inhaleTime', (json) => numberOr(json.inhale_time, 0));
    field('EntityBreathableComponent', 'suffocateTime', (json) => numberOr(json.suffocate_time, -20));
    field('EntityBreathableComponent', 'totalSupply', totalSupply);
    field('EntityBreathableComponent', 'canBreathe', (json, status) =>
        status?.inWater === true ? breathes.breathesWater(json) : breathes.breathesAir(json)
    );
    const blockList = (call: ScriptCall, member: string, key: string) =>
        array(
            strings(read(call, member, 'call').json[key]).flatMap((block) => {
                const permutation = host.world.resolveBlock(withNamespace(block), {});
                return permutation === undefined
                    ? []
                    : [
                          host.engine.release(
                              host.create('BlockPermutation', TAG.permutation, JSON.stringify(permutation))
                          )
                      ];
            })
        );
    implementations
        .implement(SERVER, 'EntityBreathableComponent', 'getBreatheBlocks', (call) =>
            blockList(call, 'getBreatheBlocks', 'breathe_blocks')
        )
        .implement(SERVER, 'EntityBreathableComponent', 'getNonBreatheBlocks', (call) =>
            blockList(call, 'getNonBreatheBlocks', 'non_breathe_blocks')
        )
        .implement(SERVER, 'EntityBreathableComponent', 'airSupply', {
            get: (call) => {
                const { json } = read(call, 'airSupply');
                return numberOr(json[AIR_FIELD], totalSupply(json));
            },
            set: (call) => {
                const { json } = read(call, 'airSupply');
                const most = totalSupply(json);
                const value = Math.trunc(Number(call.args[0]));
                if (!(value >= 0 && value <= most)) {
                    throw new ScriptApiError(
                        COMMON,
                        'PropertyOutOfBoundsError',
                        `Unsupported or out of bounds value set on Property: airSupply, Value: ${value}, Property bounds: [0, ${most}]`,
                        { value, minValue: 0, maxValue: most }
                    );
                }
                setField(call, AIR_FIELD, value);
            }
        });

    const value = (fallback: number) => (json: Readonly<Record<string, unknown>>) => numberOr(json.value, fallback);
    field('EntityColor2Component', 'value', value(0));
    field('EntityFrictionModifierComponent', 'value', value(1));
    field('EntityMarkVariantComponent', 'value', value(0));
    field('EntityVariantComponent', 'value', value(0));
    field('EntitySkinIdComponent', 'value', value(0));
    field('EntityScaleComponent', 'value', value(1));
    field('EntityPushThroughComponent', 'value', value(0));
    field('EntityStrengthComponent', 'value', value(1));
    field('EntityStrengthComponent', 'max', (json) => numberOr(json.max, 5));
    for (const [className, fallback] of [
        ['EntityColorComponent', 0],
        ['EntityFlyingSpeedComponent', 0.02]
    ] as const) {
        implementations.implement(SERVER, className, 'value', {
            get: (call) => numberOr(read(call, 'value').json.value, fallback),
            set: (call) =>
                setField(
                    call,
                    'value',
                    className === 'EntityColorComponent' ? Math.trunc(Number(call.args[0])) : Number(call.args[0])
                )
        });
    }

    field('EntityHealableComponent', 'forceUse', (json) => booleanOr(json.force_use, false));
    implementations.implement(SERVER, 'EntityHealableComponent', 'getFeedItems', (call) => {
        const { json, formatVersion } = read(call, 'getFeedItems', 'call');
        const named = namesAsWritten(formatVersion);
        return array(
            (Array.isArray(json.items) ? json.items : []).map((item) => {
                const fed = feedItemOf(item);
                return plainObject('FeedItem', named ? fed : { ...fed, item: withNamespace(fed.item).toLowerCase() });
            })
        );
    });

    const inventory = (key: ComponentKey, json: Readonly<Record<string, unknown>>) =>
        key.typeId === PLAYER
            ? { containerType: 'inventory', inventorySize: 36, private: false, restrictToOwner: true }
            : {
                  containerType: stringOr(json.container_type, 'none'),
                  inventorySize: numberOr(json.inventory_size, 5),
                  private: booleanOr(json.private, false),
                  restrictToOwner: booleanOr(json.restrict_to_owner, false)
              };
    const inventoryField = (
        member: string,
        pick: (json: Readonly<Record<string, unknown>>, key: ComponentKey) => ScriptValue
    ) =>
        implementations.implement(
            SERVER,
            'EntityInventoryComponent',
            member as never,
            {
                get: (call: ScriptCall) => {
                    const key: ComponentKey = { ...entityKeyOf(call.state), component: 'minecraft:inventory' };
                    // A player's inventory is not in its definition; its fields are fixed.
                    const json =
                        key.typeId === PLAYER && host.world.entity(key.id) !== undefined
                            ? {}
                            : componentJson(host, key);
                    if (json === undefined) throw plainError(`Failed to get property '${member}'.`);
                    return pick(record(json), key);
                }
            } as never
        );
    inventoryField('additionalSlotsPerStrength', (json) => numberOr(json.additional_slots_per_strength, 0));
    inventoryField('canBeSiphonedFrom', (json) => booleanOr(json.can_be_siphoned_from, false));
    inventoryField('containerType', (json, key) => inventory(key, json).containerType);
    inventoryField('inventorySize', (json, key) => inventory(key, json).inventorySize);
    inventoryField('private', (json, key) => inventory(key, json).private);
    inventoryField('restrictToOwner', (json, key) => inventory(key, json).restrictToOwner);

    field('EntityIsTamedComponent', 'tamedToPlayerId', (_json, status) => status?.owner);
    field('EntityIsTamedComponent', 'tamedToPlayer', (_json, status) => entityOrUndefined(status?.owner));

    implementations.implement(SERVER, 'EntityItemComponent', 'itemStack', {
        get: (call) => {
            const { json } = read(call, 'itemStack');
            const item = itemOfJson(json.item);
            if (item === undefined) throw plainError("Failed to get property 'itemStack'.");
            return host.engine.release(host.create('ItemStack', TAG.itemStack, itemState(item)));
        }
    });

    for (const member of ['canBeStolen', 'hardDistance', 'maxDistance', 'softDistance'] as const)
        field('EntityLeashableComponent', member, (json) => leashSettings(json)[member]);
    field('EntityLeashableComponent', 'isLeashed', (_json, status) => status?.leashHolder !== undefined);
    field('EntityLeashableComponent', 'leashHolder', (_json, status) => entityOrUndefined(status?.leashHolder));
    // BDS reads the holder's id as undefined while the leash is tied, as the `entity-values` scenario recorded.
    field('EntityLeashableComponent', 'leashHolderEntityId', () => undefined);
    implementations
        .implement(SERVER, 'EntityLeashableComponent', 'leashTo', (call) => {
            const { key } = read(call, 'leashTo', 'call');
            const holder = playerArgument(call, 0);
            if (holder !== undefined) systems()?.leash(key.id, holder);
            return undefined;
        })
        .implement(SERVER, 'EntityLeashableComponent', 'unleash', (call) => {
            systems()?.leash(read(call, 'unleash', 'call').key.id, undefined);
            return undefined;
        });

    for (const [member, [jsonKey, fallback]] of Object.entries(NAVIGATION_FIELDS)) {
        field('EntityNavigationComponent', member, (json, _status, _key, all) =>
            // A navigation that names no `can_float` floats with a float goal, or when it both swims and
            // is amphibious, as BDS reported a pig's and an axolotl's, and not a zombie's or a cod's.
            member === 'canFloat' &&
            json[jsonKey] === undefined &&
            (all.has('minecraft:behavior.float') || (json.is_amphibious === true && json.can_swim === true))
                ? true
                : booleanOr(json[jsonKey], fallback)
        );
    }

    const npc = { name: 'NPC', skinIndex: -1, defaultScene: '' } as const;
    for (const member of ['name', 'skinIndex', 'defaultScene'] as const) {
        implementations.implement(SERVER, 'EntityNpcComponent', member, {
            get: (call) => {
                const found = read(call, member).json[member];
                return typeof found === typeof npc[member] ? (found as ScriptValue) : npc[member];
            },
            set: (call) =>
                setField(call, member, member === 'skinIndex' ? Math.trunc(Number(call.args[0])) : String(call.args[0]))
        });
    }

    field('EntityOnFireComponent', 'onFireTicksRemaining', (_json, status) => status?.fireTicks ?? 0);

    const projectileNumbers = {
        airInertia: ['air_inertia', 0.99],
        gravity: ['gravity', 0.05],
        liquidInertia: ['liquid_inertia', 0.6],
        onFireTime: ['on_fire_time', 5]
    } as const;
    const projectileBooleans = {
        catchFireOnHurt: ['catch_fire', false],
        critParticlesOnProjectileHurt: ['crit_particle_on_hurt', false],
        destroyOnProjectileHurt: ['destroy_on_hurt', false],
        lightningStrikeOnHit: ['lightning', false],
        stopOnHit: ['stop_on_hurt', false]
    } as const;
    /** A field a script set, which the world keeps in the component's JSON under the member's name. */
    const overridden = (json: Readonly<Record<string, unknown>>, member: string): unknown => json[member];
    for (const [member, [jsonKey, fallback]] of Object.entries(projectileNumbers)) {
        implementations.implement(
            SERVER,
            'EntityProjectileComponent',
            member as never,
            {
                get: (call: ScriptCall) => {
                    const { json } = read(call, member);
                    return numberOr(overridden(json, member), numberOr(json[jsonKey], fallback));
                },
                set: (call: ScriptCall) => setField(call, member, Number(call.args[0]))
            } as never
        );
    }
    for (const [member, [jsonKey, fallback]] of Object.entries(projectileBooleans)) {
        implementations.implement(
            SERVER,
            'EntityProjectileComponent',
            member as never,
            {
                get: (call: ScriptCall) => {
                    const { json } = read(call, member);
                    return booleanOr(overridden(json, member), booleanOr(json[jsonKey], fallback));
                },
                set: (call: ScriptCall) => setField(call, member, call.args[0] === true)
            } as never
        );
    }
    implementations.implement(SERVER, 'EntityProjectileComponent', 'shouldBounceOnHit', {
        get: (call) => {
            const { json } = read(call, 'shouldBounceOnHit');
            const set = overridden(json, 'shouldBounceOnHit');
            // `if_no_damage_dealt` is a bounce, as BDS reported an arrow's.
            return typeof set === 'boolean'
                ? set
                : json.should_bounce === true || json.should_bounce === 'if_no_damage_dealt';
        },
        set: (call) => setField(call, 'shouldBounceOnHit', call.args[0] === true)
    });
    const projectileText = (
        member: 'hitEntitySound' | 'hitGroundSound' | 'hitParticle',
        pick: (json: Readonly<Record<string, unknown>>) => string | undefined
    ) =>
        implementations.implement(SERVER, 'EntityProjectileComponent', member, {
            get: (call) => {
                const { json } = read(call, member);
                return member in json ? (typeof json[member] === 'string' ? json[member] : undefined) : pick(json);
            },
            set: (call) => setField(call, member, typeof call.args[0] === 'string' ? call.args[0] : null)
        });
    projectileText('hitEntitySound', (json) => (typeof json.hit_sound === 'string' ? json.hit_sound : undefined));
    // A projectile with no ground sound uses its hit sound, as BDS reported an arrow's.
    projectileText('hitGroundSound', (json) =>
        typeof json.hit_ground_sound === 'string'
            ? json.hit_ground_sound
            : typeof json.hit_sound === 'string'
              ? json.hit_sound
              : undefined
    );
    projectileText('hitParticle', (json) => stringOr(json.particle, 'iconcrack'));
    implementations
        .implement(SERVER, 'EntityProjectileComponent', 'owner', {
            get: (call) => {
                const { json } = read(call, 'owner');
                const owner = overridden(json, 'owner');
                return entityOrUndefined(typeof owner === 'string' ? owner : undefined);
            },
            set: (call) => setField(call, 'owner', playerArgument(call, 0) ?? null)
        })
        .implement(SERVER, 'EntityProjectileComponent', 'shoot', (call) => {
            const { key } = read(call, 'shoot', 'call');
            const json = call.stringify(call.args[0]);
            // The engine wrote the string with JSON.stringify, and the binding checked it is a Vector3.
            const velocity = record(json === undefined ? undefined : JSON.parse(json));
            systems()?.clearVelocity(key.id);
            systems()?.applyImpulse(key.id, {
                x: numberOr(velocity.x, 0),
                y: numberOr(velocity.y, 0),
                z: numberOr(velocity.z, 0)
            });
            return undefined;
        });

    const rideable = {
        controllingSeat: (json: Readonly<Record<string, unknown>>) => numberOr(json.controlling_seat, 0),
        crouchingSkipInteract: (json: Readonly<Record<string, unknown>>) =>
            booleanOr(json.crouching_skip_interact, true),
        interactText: (json: Readonly<Record<string, unknown>>) => stringOr(json.interact_text, ''),
        passengerMaxWidth: (json: Readonly<Record<string, unknown>>) => numberOr(json.passenger_max_width, 0),
        pullInEntities: (json: Readonly<Record<string, unknown>>) => booleanOr(json.pull_in_entities, false),
        riderCanInteract: (json: Readonly<Record<string, unknown>>) => booleanOr(json.rider_can_interact, false),
        seatCount: (json: Readonly<Record<string, unknown>>) => numberOr(json.seat_count, 1)
    };
    for (const [member, pick] of Object.entries(rideable)) field('EntityRideableComponent', member, pick);
    implementations
        .implement(SERVER, 'EntityRideableComponent', 'getFamilyTypes', (call) =>
            JSON.stringify(strings(read(call, 'getFamilyTypes', 'call').json.family_types))
        )
        .implement(SERVER, 'EntityRideableComponent', 'getSeats', (call) =>
            array(seatsOf(read(call, 'getSeats', 'call').json).map((seat) => plainObject('Seat', seat)))
        )
        .implement(SERVER, 'EntityRideableComponent', 'getRiders', (call) => {
            const { status } = read(call, 'getRiders', 'call');
            return array(
                (status?.riders ?? []).flatMap((id) => {
                    const rider = entityOrUndefined(id);
                    return rider === undefined ? [] : [rider];
                })
            );
        })
        .implement(SERVER, 'EntityRideableComponent', 'addRider', (call) => {
            const { key } = read(call, 'addRider', 'call');
            const rider = playerArgument(call, 0);
            return rider !== undefined && (systems()?.ride(rider, key.id) ?? false);
        })
        .implement(SERVER, 'EntityRideableComponent', 'ejectRider', (call) => {
            const { status } = read(call, 'ejectRider', 'call');
            const rider = playerArgument(call, 0);
            if (rider !== undefined && status?.riders.includes(rider) === true) systems()?.dismount(rider);
            return undefined;
        })
        .implement(SERVER, 'EntityRideableComponent', 'ejectRiders', (call) => {
            const { status } = read(call, 'ejectRiders', 'call');
            for (const rider of status?.riders ?? []) systems()?.dismount(rider);
            return undefined;
        });
    field('EntityRidingComponent', 'entityRidingOn', (_json, status) => entityOrUndefined(status?.vehicle));

    const tamed = (status: ScriptEntityStatus | undefined) => status?.tamed === true;
    field('EntityTameMountComponent', 'isTamed', (_json, status) => tamed(status));
    field('EntityTameMountComponent', 'isTamedToPlayer', (_json, status) => status?.owner !== undefined);
    field('EntityTameMountComponent', 'tamedToPlayerId', (_json, status) => status?.owner);
    field('EntityTameMountComponent', 'tamedToPlayer', (_json, status) => entityOrUndefined(status?.owner));
    field('EntityTameableComponent', 'isTamed', (_json, status) => tamed(status));
    field('EntityTameableComponent', 'probability', (json) => numberOr(json.probability, 1));
    field('EntityTameableComponent', 'tamedToPlayerId', (_json, status) => status?.owner);
    field('EntityTameableComponent', 'tamedToPlayer', (_json, status) => entityOrUndefined(status?.owner));
    field('EntityTameableComponent', 'getTameItems', (json) =>
        array(
            strings(json.tame_items).map((item) =>
                host.engine.release(
                    host.create(
                        'ItemStack',
                        TAG.itemStack,
                        itemState({
                            typeId: systems()?.itemIdentifier(withNamespace(item)) ?? withNamespace(item),
                            amount: 1
                        })
                    )
                )
            )
        )
    );
    implementations
        .implement(SERVER, 'EntityTameMountComponent', 'tame', (call) => {
            systems()?.tame(read(call, 'tame', 'call').key.id, undefined);
            return undefined;
        })
        .implement(SERVER, 'EntityTameMountComponent', 'tameToPlayer', (call) => {
            const { key } = read(call, 'tameToPlayer', 'call');
            const player = playerArgument(call, 1);
            return player !== undefined && (systems()?.tame(key.id, player) ?? false);
        })
        .implement(SERVER, 'EntityTameableComponent', 'tame', (call) => {
            const { key } = read(call, 'tame', 'call');
            const player = playerArgument(call, 0);
            return player !== undefined && (systems()?.tame(key.id, player) ?? false);
        });

    implementations
        .implement(SERVER, 'EntityTypeFamilyComponent', 'getTypeFamilies', (call) =>
            JSON.stringify(strings(read(call, 'getTypeFamilies', 'call').json.family))
        )
        .implement(SERVER, 'EntityTypeFamilyComponent', 'hasTypeFamily', (call) =>
            strings(read(call, 'hasTypeFamily', 'call').json.family).includes(String(call.args[0]))
        );

    implementations
        .implement(SERVER, 'PlayerCursorInventoryComponent', 'item', {
            get: (call) => {
                const item = itemOfJson(read(call, 'item').json.item);
                return item === undefined
                    ? undefined
                    : host.engine.release(host.create('ItemStack', TAG.itemStack, itemState(item)));
            }
        })
        .implement(SERVER, 'PlayerCursorInventoryComponent', 'clear', (call) => {
            setField(call, 'item', null);
            return undefined;
        })
        .implement(SERVER, 'EntityEnderInventoryComponent', 'container', {
            get: (call) => {
                const { key } = read(call, 'container');
                return host.engine.release(
                    host.create(
                        'Container',
                        TAG.container,
                        JSON.stringify({ id: key.id, typeId: key.typeId, ender: true })
                    )
                );
            }
        });
};

/**
 * The JSON of an entity's component as the world has it now, or undefined when the entity lacks
 * it or is gone. The components the world keeps in state rather than in the definition read as
 * their state.
 */
const componentJson = (host: PackHost, key: ComponentKey): unknown => {
    const systems = host.world.entitySystems;
    if (systems === undefined) return undefined;
    const components = systems.components(key.id);
    if (components === undefined) return undefined;
    return components.get(key.component);
};

/** The ids of the components an entity has, in the order its definition activated them. */
export const presentComponents = (host: PackHost, key: EntityKey): readonly string[] => {
    const { world } = host;
    const found: string[] = [];
    for (const id of world.entitySystems?.components(key.id)?.keys() ?? []) {
        if (ENTITY_COMPONENT_CLASSES.has(id) && !isAttribute(id) && !OWNED_ELSEWHERE.has(id)) found.push(id);
    }
    if (world.entity(key.id)?.inventorySize !== undefined) found.push('minecraft:inventory');
    if (world.equipment?.(key.id) !== undefined) found.push('minecraft:equippable');
    for (const id of ENTITY_COMPONENT_CLASSES.keys()) {
        if (isAttribute(id) && world.attribute?.(key.id, id) !== undefined) found.push(id);
    }
    return found;
};

/**
 * The component object an entity has under an id, for the components this module owns, or
 * undefined when the entity lacks it. `serverComponents.ts`'s `entityComponent` asks this last.
 */
export const areaComponent = (host: PackHost, key: EntityKey, component: string): ScriptHandle | undefined => {
    const className = ENTITY_COMPONENT_CLASSES.get(component);
    if (className === undefined || isAttribute(component) || OWNED_ELSEWHERE.has(component)) return undefined;
    if (componentJson(host, { ...key, component }) === undefined) return undefined;
    return host.engine.release(
        host.create(className, ENTITY_AREA_TAG.component, JSON.stringify({ ...key, component }))
    );
};

/** Whether a container's state names a player's ender chest, as `EntityEnderInventoryComponent.container` writes it. */
export const namesEnderChest = (state: string): boolean => {
    // The host wrote the state with JSON.stringify.
    const parsed: unknown = state === '' ? undefined : JSON.parse(state);
    return isRecord(parsed) && parsed.ender === true;
};

/** The id and validity of a component object this module made, or undefined for any other. */
export const areaComponentFacts = (
    host: PackHost,
    tag: number,
    state: string
): { readonly typeId: string; readonly isValid: boolean } | undefined => {
    if (tag !== ENTITY_AREA_TAG.component) return undefined;
    const key = componentKeyOf(state);
    return { typeId: key.component, isValid: componentJson(host, key) !== undefined };
};
